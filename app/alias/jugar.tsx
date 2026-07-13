// Alias · Juego — por equipos. El jugador VE la palabra y la describe (puede
// hablar) sin decir la principal ni las 3 prohibidas. Acierto o "dijo prohibida"
// pasan a la siguiente sin parar el crono. Sonido solo a los 10 s y al final.

import { useKeepAwake } from 'expo-keep-awake';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Confetti } from '@/components/Confetti';
import { RulesButton } from '@/components/GameRules';
import { Overline } from '@/components/Overline';
import { PressableScale } from '@/components/PressableScale';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SecondaryButton } from '@/components/SecondaryButton';
import { SessionMenu, SessionMenuButton } from '@/components/SessionMenu';
import { useSession } from '@/context/SessionContext';
import { CATEGORIAS_ALIAS, DURACION_ALIAS, PICANTE_ID, RONDAS_DEFAULT_ALIAS, mazoAlias } from '@/data/alias';
import {
  nombreEquipo,
  remapEquiposTrasEliminar,
  turnoMimica,
  validarEliminarEquipo,
  type Equipos,
  type ModoPuntuacion,
} from '@/data/mimica';
import { alarma, aviso10s, desbloquearAudio, detenerTick, iniciarTick, setSonidoHabilitado, vibracionCuentaAtras } from '@/utils/sonido';
import { bebenN, emoji, pick, verbo } from '@/utils/textoTono';
import { colors, fonts, gradientAngle, gradients, shadows } from '@/theme/theme';

type Fase = 'anuncio' | 'palabra' | 'corriendo' | 'resumen' | 'final';

const EQUIPO_A = colors.purple;
const EQUIPO_B = colors.coral;
const colorEquipo = (e: 'a' | 'b') => (e === 'a' ? EQUIPO_A : EQUIPO_B);

function KeepAwake() {
  useKeepAwake();
  return null;
}

const parseIdx = (s?: string) =>
  (s ?? '')
    .split('-')
    .filter(Boolean)
    .map(Number)
    .filter((x) => !Number.isNaN(x));

const nombreCategoria = (id?: string) =>
  id === PICANTE_ID ? '+18 🔥' : CATEGORIAS_ALIAS.find((c) => c.id === id)?.nombre ?? '';

export default function AliasJugarScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, sumarTragos, registrarPartida } = useSession();
  const params = useLocalSearchParams<{ ea?: string; eb?: string; cats?: string; modo?: string; rondas?: string }>();

  const jugadores = session.jugadores.length > 0 ? session.jugadores : ['Jugador 1', 'Jugador 2'];
  // Estado (no memo): puede remapearse si se elimina un jugador a mitad de partida.
  const [equipos, setEquipos] = useState<Equipos>(() => ({ a: parseIdx(params.ea), b: parseIdx(params.eb) }));
  const cats = useMemo(() => (params.cats ?? '').split('-').filter(Boolean), [params.cats]);
  // En Competición se juegan siempre 5 rondas (turnos); ignora la config del menú.
  const enCompeticionJuego = session.modo === 'competicion' || session.modo === 'escalada';
  const modo: ModoPuntuacion = enCompeticionJuego ? 'rondas' : params.modo === 'rondas' ? 'rondas' : 'libre';
  const rondas = enCompeticionJuego ? 5 : Math.max(2, Number(params.rondas) || RONDAS_DEFAULT_ALIAS);

  const [nonce, setNonce] = useState(0);
  const mazo = useMemo(() => mazoAlias(cats), [cats, nonce]);

  const [fase, setFase] = useState<Fase>('anuncio');
  const [turnoGlobal, setTurnoGlobal] = useState(0);
  const [mazoIdx, setMazoIdx] = useState(0);
  const [puntos, setPuntos] = useState({ a: 0, b: 0 });
  const [ptosRonda, setPtosRonda] = useState({ a: 0, b: 0 });
  const [aciertosTurno, setAciertosTurno] = useState(0);
  const [seg, setSeg] = useState(DURACION_ALIAS);
  const [menuVisible, setMenuVisible] = useState(false);
  const [pausado, setPausado] = useState(false);

  const { equipo, jugadorIdx } = turnoMimica(turnoGlobal, equipos);
  const jugadorActual = jugadores[jugadorIdx] ?? 'Jugador';
  const carta = mazo[mazoIdx % Math.max(1, mazo.length)];
  const teamColor = colorEquipo(equipo);

  useEffect(() => {
    setSonidoHabilitado(session.sonidoActivado);
  }, [session.sonidoActivado]);

  // MP3 tick: arranca al entrar en 'corriendo' con los segundos restantes (60 s la primera vez,
  // el seg actual al reanudar), para cuando sale de corriendo o se pausa.
  useEffect(() => {
    if (fase === 'corriendo' && !pausado) iniciarTick(seg);
    else detenerTick();
  }, [fase, pausado]); // eslint-disable-line react-hooks/exhaustive-deps

  // Temporizador: SIN tic continuo. Solo aviso a los 10 s y alarma al llegar a 0.
  useEffect(() => {
    if (fase !== 'corriendo' || pausado) return;
    if (seg <= 0) {
      alarma();
      const t = setTimeout(() => setFase('resumen'), 350);
      return () => clearTimeout(t);
    }
    if (seg === 10) aviso10s();
    if (seg <= 10) vibracionCuentaAtras(seg);
    const t = setTimeout(() => setSeg((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [fase, seg, pausado]);

  const verPalabra = () => setFase('palabra');

  const comenzar = () => {
    desbloquearAudio();
    setAciertosTurno(0);
    setSeg(DURACION_ALIAS);
    setFase('corriendo');
  };

  // Acierto: +1 punto y siguiente palabra, sin parar el crono.
  const acertar = () => {
    setPuntos((p) => ({ ...p, [equipo]: p[equipo] + 1 }));
    setAciertosTurno((a) => a + 1);
    setPtosRonda((pr) => ({ ...pr, [equipo]: pr[equipo] + 1 }));
    setMazoIdx((i) => i + 1);
  };

  // Dijo una prohibida: se pierde la palabra (sin punto) y pasa a la siguiente.
  const prohibida = () => {
    setMazoIdx((i) => i + 1);
  };

  const irAFinal = () => {
    const diff = Math.abs(ptosRonda.a - ptosRonda.b);
    const perdedor = ptosRonda.a < ptosRonda.b ? 'a' : ptosRonda.b < ptosRonda.a ? 'b' : null;
    if (perdedor && diff > 0) equipos[perdedor].forEach((i) => sumarTragos(i, diff));
    // En Libre cuenta como juego completado (en Competición ya cuenta fin-juego).
    if (session.modo !== 'competicion') registrarPartida();
    setFase('final');
  };

  const siguienteTurno = () => {
    if (modo === 'rondas' && turnoGlobal + 1 >= rondas) {
      irAFinal();
      return;
    }
    if (rondaCompleta) {
      const diff = Math.abs(ptosRonda.a - ptosRonda.b);
      const perdedor = ptosRonda.a < ptosRonda.b ? 'a' : ptosRonda.b < ptosRonda.a ? 'b' : null;
      if (perdedor && diff > 0) equipos[perdedor].forEach((i) => sumarTragos(i, diff));
      setPtosRonda({ a: 0, b: 0 });
    }
    setTurnoGlobal((t) => t + 1);
    setFase('anuncio');
  };

  const jugarOtraVez = () => {
    setNonce((n) => n + 1);
    setTurnoGlobal(0);
    setMazoIdx(0);
    setPuntos({ a: 0, b: 0 });
    setPtosRonda({ a: 0, b: 0 });
    setAciertosTurno(0);
    setSeg(DURACION_ALIAS);
    setFase('anuncio');
  };

  const abrirMenu = () => {
    if (fase === 'corriendo') setPausado(true);
    setMenuVisible(true);
  };
  const cerrarMenu = () => {
    setMenuVisible(false);
    setPausado(false);
  };

  const esUltimaRonda = modo === 'rondas' && turnoGlobal + 1 >= rondas;
  const rondaCompleta = (turnoGlobal + 1) % 2 === 0;
  const rdiff = rondaCompleta ? Math.abs(ptosRonda.a - ptosRonda.b) : 0;
  const rperdedor: 'a' | 'b' | null = rondaCompleta
    ? ptosRonda.a < ptosRonda.b ? 'a' : ptosRonda.b < ptosRonda.a ? 'b' : null
    : null;
  const segColor = seg > 20 ? colors.purple : seg > 10 ? colors.coral : colors.red;

  // ——— FINAL ———
  if (fase === 'final') {
    const ganador = puntos.a > puntos.b ? 'a' : puntos.b > puntos.a ? 'b' : null;
    const diff = Math.abs(puntos.a - puntos.b);
    const perdedor = ganador === 'a' ? 'b' : ganador === 'b' ? 'a' : null;
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 16 }]}>
        {Platform.OS !== 'web' && <KeepAwake />}
        {ganador && <Confetti cantidad={32} />}

        <View style={styles.finalCentro}>
          <View style={styles.finalHead}>
            <Overline color={ganador ? colorEquipo(ganador) : colors.grayLt}>
              {ganador ? '🏆 GANADOR' : '🤝 EMPATE'}
            </Overline>
            <Text style={styles.finalTitulo}>{ganador ? `¡Ganan los ${nombreEquipo(ganador)}!` : '¡Empate!'}</Text>
          </View>

          <View style={styles.finalMarcador}>
            <FinalTeam nombre={nombreEquipo('a')} color={EQUIPO_A} pts={puntos.a} gana={ganador === 'a'} />
            <Text style={styles.finalVs}>–</Text>
            <FinalTeam nombre={nombreEquipo('b')} color={EQUIPO_B} pts={puntos.b} gana={ganador === 'b'} />
          </View>

          <View style={styles.finalCastigo}>
            <Text style={styles.finalBebe}>{session.tono === 'chill' ? 'Los puntos' : 'Las bebidas'} se repartieron a lo largo de la partida {emoji(session.tono)}</Text>
          </View>
        </View>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 14, gap: 9 }]}>
          {(session.modo === 'competicion' || session.modo === 'escalada') ? (
            <PrimaryButton title="Continuar" onPress={() => router.replace('/fin-juego')} />
          ) : (
            <>
              <PrimaryButton title="Jugar otra vez" onPress={jugarOtraVez} />
              <SecondaryButton title="Cambiar de juego" variant="ghost" onPress={() => router.replace('/juegos')} />
            </>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
      {Platform.OS !== 'web' && <KeepAwake />}

      {/* Cabecera: solo reglas + menú (el marcador va centrado, debajo) */}
      <View style={styles.top}>
        <View style={{ flex: 1 }} />
        <RulesButton juegoId="alias" />
        <SessionMenuButton onPress={abrirMenu} />
      </View>

      {modo === 'rondas' && (
        <Text style={styles.rondaInfo}>
          Turno {Math.min(turnoGlobal + 1, rondas)} de {rondas}
        </Text>
      )}

      {/* Marcador A vs B centrado, encima de la carta */}
      <Marcador puntos={puntos} equipoActual={fase === 'resumen' ? null : equipo} />

      {/* ——— ANUNCIO ——— */}
      {fase === 'anuncio' && (
        <Animated.View key={`an-${turnoGlobal}`} entering={FadeIn.duration(220)} style={styles.centro}>
          <View style={[styles.teamChip, { backgroundColor: teamColor }]}>
            <Text style={styles.teamChipText}>{nombreEquipo(equipo).toUpperCase()}</Text>
          </View>
          <Text style={styles.anuncioLabel}>describe la palabra</Text>
          <Text style={[styles.anuncioNombre, { color: teamColor }]} numberOfLines={2} adjustsFontSizeToFit>
            {jugadorActual}
          </Text>
          <Text style={styles.anuncioSub}>Coge el móvil tú solo: verás la palabra y sus prohibidas</Text>
        </Animated.View>
      )}

      {/* ——— PALABRA (preview, privada) ——— */}
      {fase === 'palabra' && (
        <Animated.View key={`pal-${mazoIdx}`} entering={FadeIn.duration(180)} style={styles.centroTop}>
          <CartaPalabra carta={carta} />
          <Text style={styles.palabraHint}>Descríbela con otras palabras. ¡No digas la principal ni las prohibidas!</Text>
        </Animated.View>
      )}

      {/* ——— CORRIENDO ——— */}
      {fase === 'corriendo' && (
        <View style={styles.corriendoWrap}>
          <View style={styles.timerRow}>
            <Text style={[styles.timerNum, { color: segColor }]}>{Math.max(0, seg)}</Text>
            <Text style={styles.timerUnit}>s</Text>
            <View style={styles.timerTrack}>
              <View
                style={[styles.timerFill, { width: `${(Math.max(0, seg) / DURACION_ALIAS) * 100}%`, backgroundColor: segColor }]}
              />
            </View>
            <View style={[styles.aciertosPill, { borderColor: teamColor }]}>
              <Text style={[styles.aciertosText, { color: teamColor }]}>{aciertosTurno} ✓</Text>
            </View>
          </View>

          <View style={styles.centroTop}>
            <CartaPalabra carta={carta} />
          </View>
        </View>
      )}

      {/* ——— RESUMEN ——— */}
      {fase === 'resumen' && (
        <Animated.View key={`res-${turnoGlobal}`} entering={FadeIn.duration(220)} style={styles.centro}>
          <Text style={styles.resumenEmoji}>{aciertosTurno > 0 ? '🎉' : '😅'}</Text>
          <Text style={[styles.resumenNum, { color: teamColor }]}>{aciertosTurno}</Text>
          <Text style={styles.resumenTexto}>
            palabra{aciertosTurno === 1 ? '' : 's'} acertada{aciertosTurno === 1 ? '' : 's'} por los{' '}
            <Text style={{ color: teamColor, fontFamily: fonts.bodyX }}>{nombreEquipo(equipo)}</Text>
          </Text>
          {rondaCompleta && (
            <View style={styles.resumenRonda}>
              <Text style={styles.resumenRondaLabel}>RESULTADO DE LA RONDA</Text>
              <Text style={styles.resumenRondaScores}>
                <Text style={{ color: EQUIPO_A }}>{ptosRonda.a}</Text>
                {'  –  '}
                <Text style={{ color: EQUIPO_B }}>{ptosRonda.b}</Text>
              </Text>
              <Text style={[styles.resumenRondaResult, { color: rperdedor ? colors.coral : colors.grayLt }]}>
                {rperdedor
                  ? `Los ${nombreEquipo(rperdedor)} ${bebenN(session.tono, rdiff)} ${emoji(session.tono)}`
                  : `Empate · Nadie ${verbo(session.tono, 'bebe')} esta ronda`}
              </Text>
            </View>
          )}
        </Animated.View>
      )}

      {/* ——— PIE ——— */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 14, gap: 10 }]}>
        {fase === 'anuncio' && (
          <>
            <PressableScale onPress={verPalabra} scaleTo={0.97}>
              <LinearGradient
                colors={gradients.purple.colors}
                locations={gradients.purple.locations}
                start={gradientAngle.start}
                end={gradientAngle.end}
                style={styles.verBtn}>
                <Text style={styles.verText}>👀 Ver mi palabra</Text>
              </LinearGradient>
            </PressableScale>
            {modo === 'libre' && <SecondaryButton title="Terminar juego" variant="ghost" onPress={irAFinal} />}
          </>
        )}

        {fase === 'palabra' && <PrimaryButton title="▶ Comenzar" onPress={comenzar} />}

        {fase === 'corriendo' && (
          <View style={styles.accionesRow}>
            <PressableScale onPress={prohibida} scaleTo={0.96} style={styles.prohibidaBtn}>
              <Text style={styles.prohibidaText}>🚫 Dijo una prohibida</Text>
            </PressableScale>
            <PressableScale onPress={acertar} scaleTo={0.96} style={styles.acertarWrap}>
              <LinearGradient
                colors={gradients.purple.colors}
                locations={gradients.purple.locations}
                start={gradientAngle.start}
                end={gradientAngle.end}
                style={styles.acertarBtn}>
                <Text style={styles.acertarText}>✓ ¡Acertado!</Text>
              </LinearGradient>
            </PressableScale>
          </View>
        )}

        {fase === 'resumen' && (
          <>
            <PrimaryButton
              title={esUltimaRonda ? 'Ver resultado' : rondaCompleta ? 'Siguiente ronda' : 'Siguiente turno'}
              onPress={siguienteTurno}
            />
            {modo === 'libre' && <SecondaryButton title="Terminar juego" variant="ghost" onPress={irAFinal} />}
          </>
        )}
      </View>

      <SessionMenu
        visible={menuVisible}
        onClose={cerrarMenu}
        onReiniciar={jugarOtraVez}
        validarEliminar={(idx) => validarEliminarEquipo(equipos, idx)}
        onJugadorEliminado={(idx) => setEquipos((prev) => remapEquiposTrasEliminar(prev, idx))}
      />
    </View>
  );
}

// ——— Carta de palabra: principal + 3 prohibidas ————————————————————

function CartaPalabra({
  carta,
}: {
  carta?: { palabra: string; prohibidas: string[]; palabra_chill?: string; prohibidas_chill?: string[]; categoria: string };
}) {
  const { session } = useSession();
  if (!carta) return null;
  const palabra = pick(carta.palabra, carta.palabra_chill, session.tono);
  const prohibidas =
    session.tono === 'chill' && carta.prohibidas_chill ? carta.prohibidas_chill : carta.prohibidas;
  return (
    <View style={styles.cartaWrap}>
      <Text style={styles.catLabel}>{nombreCategoria(carta.categoria).toUpperCase()}</Text>
      <View style={[styles.palabraCard, shadows.purpleSoft]}>
        <Text style={styles.palabraTexto} adjustsFontSizeToFit numberOfLines={2}>
          {palabra}
        </Text>
        <View style={styles.divisor}>
          <View style={styles.divisorLinea} />
          <Text style={styles.divisorTexto}>NO PUEDES DECIR</Text>
          <View style={styles.divisorLinea} />
        </View>
        <View style={styles.prohibidasLista}>
          {prohibidas.map((p, i) => (
            <View key={i} style={styles.prohibidaFila}>
              <Text style={styles.prohibidaIcono}>🚫</Text>
              <Text style={styles.prohibidaPalabra}>{p}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

// ——— Marcador compacto A vs B ————————————————————————————————————

function Marcador({ puntos, equipoActual }: { puntos: { a: number; b: number }; equipoActual: 'a' | 'b' | null }) {
  return (
    <View style={styles.marcador}>
      <View style={[styles.mEquipo, { borderColor: EQUIPO_A }, equipoActual === 'a' && { backgroundColor: 'rgba(124,58,237,0.10)' }]}>
        <Text style={[styles.mTeam, { color: EQUIPO_A }]} numberOfLines={1} adjustsFontSizeToFit>
          {nombreEquipo('a').toUpperCase()}
        </Text>
        <Text style={[styles.mPts, { color: EQUIPO_A }]}>{puntos.a}</Text>
      </View>
      <Text style={styles.mVs}>vs</Text>
      <View style={[styles.mEquipo, { borderColor: EQUIPO_B }, equipoActual === 'b' && { backgroundColor: 'rgba(255,111,97,0.12)' }]}>
        <Text style={[styles.mTeam, { color: EQUIPO_B }]} numberOfLines={1} adjustsFontSizeToFit>
          {nombreEquipo('b').toUpperCase()}
        </Text>
        <Text style={[styles.mPts, { color: EQUIPO_B }]}>{puntos.b}</Text>
      </View>
    </View>
  );
}

function FinalTeam({ nombre, color, pts, gana }: { nombre: string; color: string; pts: number; gana: boolean }) {
  return (
    <View style={[styles.ftCard, { borderColor: color }, gana && { backgroundColor: color }]}>
      {gana && <Text style={styles.ftCrown}>👑</Text>}
      <Text style={[styles.ftTeam, { color: gana ? colors.white : color }]} numberOfLines={1} adjustsFontSizeToFit>
        {nombre.toUpperCase()}
      </Text>
      <Text style={[styles.ftPts, { color: gana ? colors.white : color }]}>{pts}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: 26 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // marcador compacto (centrado, encima de la carta)
  marcador: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 12 },
  mEquipo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 2,
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  mTeam: { fontFamily: fonts.bodyX, fontSize: 11, letterSpacing: 0.3, maxWidth: 64 },
  mPts: { fontFamily: fonts.display, fontSize: 22, letterSpacing: -1, includeFontPadding: false },
  mVs: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.grayLt },
  rondaInfo: { fontFamily: fonts.bodyX, fontSize: 12, color: colors.grayLt, marginTop: 10, textAlign: 'center' },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  centroTop: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // anuncio
  teamChip: { borderRadius: 30, paddingHorizontal: 16, paddingVertical: 7, marginBottom: 18 },
  teamChipText: { fontFamily: fonts.bodyX, fontSize: 13, color: colors.white, letterSpacing: 1.5 },
  anuncioLabel: { fontFamily: fonts.bodyX, fontSize: 13, letterSpacing: 2, color: colors.grayLt },
  anuncioNombre: { fontFamily: fonts.display, fontSize: 54, letterSpacing: -2, textAlign: 'center', marginTop: 6 },
  anuncioSub: { fontFamily: fonts.body, fontSize: 14, color: colors.gray, marginTop: 16, textAlign: 'center', maxWidth: 280 },
  // carta palabra
  cartaWrap: { alignSelf: 'stretch', alignItems: 'center' },
  catLabel: { fontFamily: fonts.bodyX, fontSize: 12, letterSpacing: 2.5, color: colors.purple, marginBottom: 12 },
  palabraCard: {
    alignSelf: 'stretch',
    backgroundColor: colors.white,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: '#E9E1FB',
    paddingVertical: 28,
    paddingHorizontal: 22,
    alignItems: 'center',
  },
  palabraTexto: { fontFamily: fonts.display, fontSize: 44, letterSpacing: -1.4, color: colors.ink, textAlign: 'center' },
  divisor: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'stretch', marginTop: 20, marginBottom: 14 },
  divisorLinea: { flex: 1, height: 1.5, backgroundColor: colors.border },
  divisorTexto: { fontFamily: fonts.bodyX, fontSize: 10.5, letterSpacing: 1.5, color: colors.red },
  prohibidasLista: { alignSelf: 'stretch', gap: 9 },
  prohibidaFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFF5F4',
    borderWidth: 1.5,
    borderColor: '#F6C9C2',
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  prohibidaIcono: { fontSize: 17 },
  prohibidaPalabra: { fontFamily: fonts.display, fontSize: 21, color: '#B91C1C', letterSpacing: -0.4 },
  palabraHint: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.gray, marginTop: 16, textAlign: 'center', maxWidth: 320 },
  // corriendo
  corriendoWrap: { flex: 1 },
  timerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  timerNum: { fontFamily: fonts.display, fontSize: 46, letterSpacing: -2, includeFontPadding: false },
  timerUnit: { fontFamily: fonts.bodyX, fontSize: 16, color: colors.grayLt, marginLeft: -4 },
  timerTrack: { flex: 1, height: 8, borderRadius: 5, backgroundColor: colors.lav100, overflow: 'hidden' },
  timerFill: { height: 8, borderRadius: 5 },
  aciertosPill: { borderWidth: 2, borderRadius: 30, paddingHorizontal: 12, paddingVertical: 5 },
  aciertosText: { fontFamily: fonts.bodyX, fontSize: 14 },
  // resumen
  resumenEmoji: { fontSize: 60 },
  resumenNum: { fontFamily: fonts.display, fontSize: 110, letterSpacing: -5, includeFontPadding: false, lineHeight: 116 },
  resumenTexto: {
    fontFamily: fonts.body,
    fontSize: 17,
    color: colors.gray,
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 280,
    marginTop: 4,
  },
  // final
  finalCentro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  finalHead: { alignItems: 'center', marginBottom: 22 },
  finalTitulo: { fontFamily: fonts.display, fontSize: 34, letterSpacing: -1.4, color: colors.ink, marginTop: 6, textAlign: 'center' },
  finalMarcador: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 },
  finalVs: { fontFamily: fonts.display, fontSize: 40, color: colors.grayLt },
  ftCard: { width: 130, borderWidth: 2.5, borderRadius: 24, paddingVertical: 24, alignItems: 'center', backgroundColor: colors.white },
  ftCrown: { fontSize: 26, position: 'absolute', top: -16 },
  ftTeam: { fontFamily: fonts.bodyX, fontSize: 13, letterSpacing: 1 },
  ftPts: { fontFamily: fonts.display, fontSize: 64, letterSpacing: -3, includeFontPadding: false, marginTop: 2 },
  finalCastigo: { alignItems: 'center', marginTop: 30, paddingHorizontal: 20, gap: 2 },
  finalBebe: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.ink, textAlign: 'center', lineHeight: 24 },
  finalBebeBig: { fontFamily: fonts.display, fontSize: 26, color: colors.ink, textAlign: 'center', letterSpacing: -0.8 },
  finalBebeNum: { fontFamily: fonts.display, fontSize: 30, color: colors.coral },
  // pie
  footer: { paddingTop: 12 },
  verBtn: { height: 96, borderRadius: 26, alignItems: 'center', justifyContent: 'center', ...shadows.purple },
  verText: { fontFamily: fonts.display, fontSize: 30, color: colors.white, letterSpacing: -0.5 },
  accionesRow: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  prohibidaBtn: {
    flex: 1,
    borderRadius: 22,
    backgroundColor: colors.redBg,
    borderWidth: 1.5,
    borderColor: '#F6C9C2',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  prohibidaText: { fontFamily: fonts.bodyX, fontSize: 18, color: colors.red, textAlign: 'center' },
  acertarWrap: { flex: 1.3 },
  acertarBtn: {
    height: 84,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.purple,
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 7,
  },
  acertarText: { fontFamily: fonts.display, fontSize: 22, color: colors.white, letterSpacing: -0.4, textAlign: 'center' },
  // resumen ronda
  resumenRonda: { marginTop: 18, alignItems: 'center', gap: 5 },
  resumenRondaLabel: { fontFamily: fonts.bodyX, fontSize: 11, letterSpacing: 2, color: colors.grayLt },
  resumenRondaScores: { fontFamily: fonts.display, fontSize: 34, letterSpacing: -1.5 },
  resumenRondaResult: { fontFamily: fonts.bodyBold, fontSize: 15, textAlign: 'center', maxWidth: 240 },
});
