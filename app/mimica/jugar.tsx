// Mímica · Juego — por equipos. Anuncio → ver palabra (privado) → actuar 60 s
// con marcador en vivo → resumen del turno. Sonido solo a los 10 s y al final.

import { useKeepAwake } from 'expo-keep-awake';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
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
import {
  CATEGORIAS_MIMICA,
  DURACION_MIMICA,
  RONDAS_DEFAULT,
  mazoMimica,
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
import { LinearGradient } from 'expo-linear-gradient';

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

export default function MimicaJugarScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { session, sumarTragos, registrarPartida } = useSession();
  const params = useLocalSearchParams<{ ea?: string; eb?: string; cats?: string; modo?: string; rondas?: string }>();

  const jugadores = session.jugadores.length > 0 ? session.jugadores : ['Jugador 1', 'Jugador 2'];
  // Estado (no memo): puede remapearse si se elimina un jugador a mitad de partida.
  const [equipos, setEquipos] = useState<Equipos>(() => ({ a: parseIdx(params.ea), b: parseIdx(params.eb) }));
  const cats = useMemo(() => (params.cats ?? '').split('-').filter(Boolean), [params.cats]);
  // En Competición se juegan siempre 5 rondas (turnos); ignora la config del menú.
  const enCompeticionJuego = session.modo === 'competicion' || session.modo === 'escalada';
  const modo: ModoPuntuacion = enCompeticionJuego ? 'rondas' : params.modo === 'rondas' ? 'rondas' : 'libre';
  const rondas = enCompeticionJuego ? 5 : Math.max(2, Number(params.rondas) || RONDAS_DEFAULT);

  const [nonce, setNonce] = useState(0);
  const mazo = useMemo(() => mazoMimica(cats), [cats, nonce]);

  const [fase, setFase] = useState<Fase>('anuncio');
  const [turnoGlobal, setTurnoGlobal] = useState(0);
  const [mazoIdx, setMazoIdx] = useState(0);
  const [puntos, setPuntos] = useState({ a: 0, b: 0 });
  const [ptosRonda, setPtosRonda] = useState({ a: 0, b: 0 });
  const [aciertosTurno, setAciertosTurno] = useState(0);
  const [seg, setSeg] = useState(DURACION_MIMICA);
  const [enCurso, setEnCurso] = useState(false); // el crono del turno ya arrancó (pausa entre palabras)
  const [menuVisible, setMenuVisible] = useState(false);
  const [pausado, setPausado] = useState(false);

  const { equipo, jugadorIdx } = turnoMimica(turnoGlobal, equipos);
  const jugadorActual = jugadores[jugadorIdx] ?? 'Jugador';
  const palabra = mazo[mazoIdx % Math.max(1, mazo.length)];
  const categoriaNombre = CATEGORIAS_MIMICA.find((c) => c.id === palabra?.categoria)?.nombre ?? '';
  const teamColor = colorEquipo(equipo);
  const landscape = width > height;

  useEffect(() => {
    setSonidoHabilitado(session.sonidoActivado);
  }, [session.sonidoActivado]);

  // MP3 tick: arranca al entrar en 'corriendo' con los segundos restantes,
  // para cuando sale de corriendo o se pausa.
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
    // Vibración de cuenta atrás del 10 al 0 (suave, intensa los últimos 3 s).
    if (seg <= 10) vibracionCuentaAtras(seg);
    const t = setTimeout(() => setSeg((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [fase, seg, pausado]);

  const verPalabra = () => setFase('palabra');

  // Arranca (palabra nueva del turno) o reanuda (tras un acierto) el cronómetro.
  const comenzar = () => {
    desbloquearAudio();
    if (!enCurso) {
      setAciertosTurno(0);
      setSeg(DURACION_MIMICA);
      setEnCurso(true);
    }
    setFase('corriendo'); // reanudar conserva el seg actual
  };

  // Acierto: suma punto, PAUSA el crono y muestra la siguiente palabra en privado.
  const acertar = () => {
    setPuntos((p) => ({ ...p, [equipo]: p[equipo] + 1 }));
    setAciertosTurno((a) => a + 1);
    setPtosRonda((pr) => ({ ...pr, [equipo]: pr[equipo] + 1 }));
    setMazoIdx((i) => i + 1);
    setFase('palabra'); // el crono se congela (el efecto solo corre en 'corriendo')
  };

  const irAFinal = () => {
    // Aplica los tragos de la ronda parcial o completa pendiente
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
    setEnCurso(false);
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
    setSeg(DURACION_MIMICA);
    setEnCurso(false);
    setFase('anuncio');
  };

  const reiniciarJuego = jugarOtraVez;

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

      {/* Cabecera: reglas + menú */}
      <View style={styles.top}>
        {modo === 'rondas' ? (
          <Text style={styles.rondaInfo}>
            Turno {Math.min(turnoGlobal + 1, rondas)} de {rondas}
          </Text>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        <RulesButton juegoId="mimica" />
        <SessionMenuButton onPress={abrirMenu} />
      </View>

      {/* Marcador grande y centrado */}
      <Marcador puntos={puntos} equipoActual={fase === 'resumen' ? null : equipo} />

      {/* ——— ANUNCIO ——— */}
      {fase === 'anuncio' && (
        <Animated.View key={`an-${turnoGlobal}`} entering={FadeIn.duration(220)} style={styles.centro}>
          <View style={[styles.teamChip, { backgroundColor: teamColor }]}>
            <Text style={styles.teamChipText}>{nombreEquipo(equipo).toUpperCase()}</Text>
          </View>
          <Text style={styles.anuncioLabel}>le toca actuar a</Text>
          <Text style={[styles.anuncioNombre, { color: teamColor }]} numberOfLines={2} adjustsFontSizeToFit>
            {jugadorActual}
          </Text>
          <Text style={styles.anuncioSub}>Coge el móvil tú solo y no lo enseñes a nadie</Text>
        </Animated.View>
      )}

      {/* ——— PALABRA (privada) ——— */}
      {fase === 'palabra' && (
        <Animated.View key={`pal-${mazoIdx}`} entering={FadeIn.duration(180)} style={styles.centro}>
          {enCurso && (
            <View style={[styles.resumePill, { borderColor: teamColor }]}>
              <Text style={[styles.resumeText, { color: teamColor }]}>⏱ Quedan {Math.max(0, seg)} s</Text>
            </View>
          )}
          {!!categoriaNombre && <Text style={styles.catLabel}>{categoriaNombre.toUpperCase()}</Text>}
          <View style={[styles.palabraCard, shadows.purpleSoft]}>
            <Text style={styles.palabraTexto} adjustsFontSizeToFit numberOfLines={3}>
              {palabra ? pick(palabra.texto, palabra.textoChill, session.tono) : ''}
            </Text>
          </View>
          <Text style={styles.palabraHint}>
            {enCurso ? 'Pulsa Seguir y el crono continúa donde lo dejasteis' : 'Actúala sin hablar ni hacer sonidos 🤫'}
          </Text>
        </Animated.View>
      )}

      {/* ——— CORRIENDO ——— */}
      {fase === 'corriendo' && (
        <View style={styles.centro}>
          <Text style={[styles.timerNum, { color: segColor }, landscape && styles.timerNumLand]}>{Math.max(0, seg)}</Text>
          <Text style={styles.timerSub}>SEGUNDOS</Text>
          <View style={styles.timerTrack}>
            <View
              style={[styles.timerFill, { width: `${(Math.max(0, seg) / DURACION_MIMICA) * 100}%`, backgroundColor: segColor }]}
            />
          </View>
          <View style={[styles.aciertosPill, { borderColor: teamColor }]}>
            <Text style={[styles.aciertosText, { color: teamColor }]}>
              {nombreEquipo(equipo)} · {aciertosTurno} ✓
            </Text>
          </View>
          <Text style={styles.rotaHint}>📱 Dejad el móvil a la vista de todos para ver el tiempo</Text>
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
            {modo === 'libre' && (
              <SecondaryButton title="Terminar juego" variant="ghost" onPress={irAFinal} />
            )}
          </>
        )}

        {fase === 'palabra' && <PrimaryButton title={enCurso ? '▶ Seguir' : '▶ Comenzar'} onPress={comenzar} />}

        {fase === 'corriendo' && (
          <PressableScale onPress={acertar} scaleTo={0.96} style={{ alignSelf: 'stretch' }}>
            <LinearGradient
              colors={gradients.purple.colors}
              locations={gradients.purple.locations}
              start={gradientAngle.start}
              end={gradientAngle.end}
              style={[styles.acertarBtn, { shadowColor: colors.purple }]}>
              <Text style={styles.acertarText}>¡Acertado!</Text>
              <Text style={styles.acertarSub}>pausa y siguiente palabra</Text>
            </LinearGradient>
          </PressableScale>
        )}

        {fase === 'resumen' && (
          <>
            <PrimaryButton
              title={esUltimaRonda ? 'Ver resultado' : rondaCompleta ? 'Siguiente ronda' : 'Siguiente turno'}
              onPress={siguienteTurno}
            />
            {modo === 'libre' && (
              <SecondaryButton title="Terminar juego" variant="ghost" onPress={irAFinal} />
            )}
          </>
        )}
      </View>

      <SessionMenu
        visible={menuVisible}
        onClose={cerrarMenu}
        onReiniciar={reiniciarJuego}
        validarEliminar={(idx) => validarEliminarEquipo(equipos, idx)}
        onJugadorEliminado={(idx) => setEquipos((prev) => remapEquiposTrasEliminar(prev, idx))}
      />
    </View>
  );
}

// ——— Marcador A vs B ————————————————————————————————————————————

function Marcador({ puntos, equipoActual }: { puntos: { a: number; b: number }; equipoActual: 'a' | 'b' | null }) {
  return (
    <View style={styles.marcador}>
      <View
        style={[
          styles.mEquipo,
          { borderColor: EQUIPO_A },
          equipoActual === 'a' && { backgroundColor: 'rgba(124,58,237,0.10)' },
        ]}>
        <Text style={[styles.mTeam, { color: EQUIPO_A }]} numberOfLines={1} adjustsFontSizeToFit>
          {nombreEquipo('a').toUpperCase()}
        </Text>
        <Text style={[styles.mPts, { color: EQUIPO_A }]}>{puntos.a}</Text>
      </View>
      <Text style={styles.mVs}>–</Text>
      <View
        style={[
          styles.mEquipo,
          { borderColor: EQUIPO_B },
          equipoActual === 'b' && { backgroundColor: 'rgba(255,111,97,0.12)' },
        ]}>
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
  rondaInfo: { flex: 1, fontFamily: fonts.bodyX, fontSize: 12.5, color: colors.gray },
  // marcador (grande y centrado)
  marcador: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    marginTop: 14,
  },
  mEquipo: {
    alignItems: 'center',
    borderWidth: 2,
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 22,
    minWidth: 116,
  },
  mTeam: { fontFamily: fonts.bodyX, fontSize: 12, letterSpacing: 1 },
  mPts: { fontFamily: fonts.display, fontSize: 44, letterSpacing: -2, includeFontPadding: false, lineHeight: 48 },
  mVs: { fontFamily: fonts.display, fontSize: 24, color: colors.grayLt },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  // anuncio
  teamChip: { borderRadius: 30, paddingHorizontal: 16, paddingVertical: 7, marginBottom: 18 },
  teamChipText: { fontFamily: fonts.bodyX, fontSize: 13, color: colors.white, letterSpacing: 1.5 },
  anuncioLabel: { fontFamily: fonts.bodyX, fontSize: 13, letterSpacing: 2, color: colors.grayLt },
  anuncioNombre: { fontFamily: fonts.display, fontSize: 54, letterSpacing: -2, textAlign: 'center', marginTop: 6 },
  anuncioSub: { fontFamily: fonts.body, fontSize: 14, color: colors.gray, marginTop: 16, textAlign: 'center', maxWidth: 270 },
  // palabra
  catLabel: { fontFamily: fonts.bodyX, fontSize: 12, letterSpacing: 2.5, color: colors.purple, marginBottom: 14 },
  palabraCard: {
    alignSelf: 'stretch',
    backgroundColor: colors.white,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: '#E9E1FB',
    paddingVertical: 44,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
  },
  palabraTexto: {
    fontFamily: fonts.display,
    fontSize: 40,
    letterSpacing: -1.2,
    color: colors.ink,
    textAlign: 'center',
  },
  palabraHint: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.gray, marginTop: 22, textAlign: 'center', maxWidth: 300 },
  resumePill: {
    borderWidth: 2,
    borderRadius: 30,
    paddingHorizontal: 16,
    paddingVertical: 7,
    marginBottom: 16,
  },
  resumeText: { fontFamily: fonts.bodyX, fontSize: 14 },
  // corriendo
  timerNum: { fontFamily: fonts.display, fontSize: 150, letterSpacing: -6, includeFontPadding: false, lineHeight: 158 },
  timerNumLand: { fontSize: 104, lineHeight: 112 },
  timerSub: { fontFamily: fonts.bodyX, fontSize: 13, letterSpacing: 3, color: colors.grayLt, marginTop: -6 },
  timerTrack: {
    width: 200,
    height: 8,
    borderRadius: 5,
    backgroundColor: colors.lav100,
    overflow: 'hidden',
    marginTop: 16,
  },
  timerFill: { height: 8, borderRadius: 5 },
  aciertosPill: {
    borderWidth: 2,
    borderRadius: 30,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginTop: 16,
  },
  aciertosText: { fontFamily: fonts.bodyX, fontSize: 13 },
  rotaHint: { fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.grayLt, marginTop: 22, textAlign: 'center', maxWidth: 280, lineHeight: 18 },
  acertarBtn: {
    height: 120,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    shadowOpacity: 0.3,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  acertarText: { fontFamily: fonts.display, fontSize: 40, color: colors.white, letterSpacing: -0.8, textAlign: 'center' },
  acertarSub: { fontFamily: fonts.bodyBold, fontSize: 13, color: 'rgba(255,255,255,0.8)', textAlign: 'center' },
  // resumen
  resumenEmoji: { fontSize: 60 },
  resumenNum: { fontFamily: fonts.display, fontSize: 96, letterSpacing: -4, includeFontPadding: false, lineHeight: 102 },
  resumenTexto: {
    fontFamily: fonts.body,
    fontSize: 17,
    color: colors.gray,
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 280,
    marginTop: 4,
  },
  resumenRonda: { marginTop: 18, alignItems: 'center', gap: 5 },
  resumenRondaLabel: { fontFamily: fonts.bodyX, fontSize: 11, letterSpacing: 2, color: colors.grayLt },
  resumenRondaScores: { fontFamily: fonts.display, fontSize: 34, letterSpacing: -1.5 },
  resumenRondaResult: { fontFamily: fonts.bodyBold, fontSize: 15, textAlign: 'center', maxWidth: 240 },
  // final
  finalCentro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  finalHead: { alignItems: 'center', marginBottom: 22 },
  finalTitulo: { fontFamily: fonts.display, fontSize: 34, letterSpacing: -1.4, color: colors.ink, marginTop: 6, textAlign: 'center' },
  finalMarcador: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 },
  finalVs: { fontFamily: fonts.display, fontSize: 40, color: colors.grayLt },
  ftCard: {
    width: 130,
    borderWidth: 2.5,
    borderRadius: 24,
    paddingVertical: 24,
    alignItems: 'center',
    backgroundColor: colors.white,
  },
  ftCrown: { fontSize: 26, position: 'absolute', top: -16 },
  ftTeam: { fontFamily: fonts.bodyX, fontSize: 13, letterSpacing: 1 },
  ftPts: { fontFamily: fonts.display, fontSize: 64, letterSpacing: -3, includeFontPadding: false, marginTop: 2 },
  finalCastigo: { alignItems: 'center', marginTop: 30, paddingHorizontal: 20, gap: 2 },
  finalBebe: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.ink, textAlign: 'center', lineHeight: 24 },
  finalBebeBig: { fontFamily: fonts.display, fontSize: 26, color: colors.ink, textAlign: 'center', letterSpacing: -0.8 },
  finalBebeNum: { fontFamily: fonts.display, fontSize: 30, color: colors.coral },
  // pie
  footer: { paddingTop: 12 },
  verBtn: {
    height: 96,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.purple,
  },
  verText: { fontFamily: fonts.display, fontSize: 30, color: colors.white, letterSpacing: -0.5 },
});
