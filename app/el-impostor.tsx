// El Impostor — identidad "detective". Reparto privado (pasando el móvil),
// ronda de pistas habladas, votación gestionada por un jugador y resultado.
// Competición: 5 partidas seguidas, los tragos se registran con sumarTragos.

import { useKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Confetti } from '@/components/Confetti';
import { RulesButton } from '@/components/GameRules';
import { Overline } from '@/components/Overline';
import { PressableScale } from '@/components/PressableScale';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SecondaryButton } from '@/components/SecondaryButton';
import { SessionMenu, SessionMenuButton } from '@/components/SessionMenu';
import { useSession } from '@/context/SessionContext';
import { bebeN, emoji, pick } from '@/utils/textoTono';
import {
  MIN_JUGADORES_IMPOSTOR,
  PARTIDAS_COMPETICION_IMPOSTOR,
  TRAGOS_IMPOSTOR,
  cartaAleatoria,
  jugadorAleatorio,
  type CartaImpostor,
} from '@/data/elImpostor';
import { colors, fonts } from '@/theme/theme';

type Fase = 'reparto' | 'empezar' | 'pistas' | 'votacion' | 'resultado';

function KeepAwake() {
  useKeepAwake();
  return null;
}

export default function ElImpostorScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, sumarTragos, registrarPartida } = useSession();

  const jugadores = session.jugadores.length > 0 ? session.jugadores : ['Jugador 1', 'Jugador 2'];
  const enCompeticion = session.modo === 'competicion' || session.modo === 'escalada';

  const [carta, setCarta] = useState<CartaImpostor>(() => cartaAleatoria());
  const [impostorIdx, setImpostorIdx] = useState(() => jugadorAleatorio(jugadores.length));
  const [starterIdx, setStarterIdx] = useState(() => jugadorAleatorio(jugadores.length));
  const [fase, setFase] = useState<Fase>('reparto');
  const [revelIdx, setRevelIdx] = useState(0);
  const [votado, setVotado] = useState<number | null>(null);
  const [partidaNum, setPartidaNum] = useState(1);
  const [menuVisible, setMenuVisible] = useState(false);

  const acierto = votado !== null && votado === impostorIdx;

  const nuevaRonda = () => {
    setCarta(cartaAleatoria());
    setImpostorIdx(jugadorAleatorio(jugadores.length));
    setStarterIdx(jugadorAleatorio(jugadores.length));
    setRevelIdx(0);
    setVotado(null);
    setFase('reparto');
  };

  const reiniciarJuego = () => {
    setPartidaNum(1);
    nuevaRonda();
  };

  const siguienteReparto = () => {
    if (revelIdx + 1 >= jugadores.length) {
      setFase('empezar');
      return;
    }
    setRevelIdx((i) => i + 1);
  };

  const votar = (idx: number) => {
    setVotado(idx);
    if (idx === impostorIdx) {
      sumarTragos(impostorIdx, TRAGOS_IMPOSTOR);
    } else {
      jugadores.forEach((_, i) => {
        if (i !== impostorIdx) sumarTragos(i, TRAGOS_IMPOSTOR);
      });
    }
    setFase('resultado');
  };

  const siguientePartidaComp = () => {
    setPartidaNum((n) => n + 1);
    nuevaRonda();
  };

  const salirAlMenu = () => {
    registrarPartida();
    router.replace('/juegos');
  };

  const numJugadores = jugadores.length;
  const prevNum = useRef(numJugadores);
  useEffect(() => {
    if (prevNum.current !== numJugadores) {
      prevNum.current = numJugadores;
      nuevaRonda();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numJugadores]);

  // ——— Guarda de mínimo de jugadores ———
  if (jugadores.length < MIN_JUGADORES_IMPOSTOR) {
    return (
      <View style={styles.screen}>
        <View style={[styles.centro, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
          <Text style={styles.bigEmoji}>🕵️</Text>
          <Text style={styles.titulo}>Faltan jugadores</Text>
          <Text style={styles.sub}>El Impostor necesita al menos {MIN_JUGADORES_IMPOSTOR} jugadores.</Text>
          <View style={styles.btnStretch}>
            <PrimaryButton title="Volver al menú" onPress={() => router.replace('/juegos')} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {Platform.OS !== 'web' && <KeepAwake />}
      {fase === 'resultado' && acierto && <Confetti cantidad={28} />}

      {/* Cabecera: contador de partida (Competición) + reglas + menú */}
      <View style={[styles.top, { paddingTop: insets.top + 10 }]}>
        {enCompeticion ? (
          <View style={styles.compPill}>
            <Text style={styles.compPillText}>
              🕵️ {Math.min(partidaNum, PARTIDAS_COMPETICION_IMPOSTOR)}/{PARTIDAS_COMPETICION_IMPOSTOR}
            </Text>
          </View>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        <RulesButton juegoId="el-impostor" />
        <SessionMenuButton onPress={() => setMenuVisible(true)} />
      </View>

      {/* ——— REPARTO (privado, pasando el móvil) ——— */}
      {fase === 'reparto' && (
        <CartaReparto
          key={revelIdx}
          nombre={jugadores[revelIdx]}
          posicion={revelIdx + 1}
          total={jugadores.length}
          categoria={carta.categoria}
          palabra={revelIdx === impostorIdx ? pick(carta.palabra_impostor, carta.palabra_impostor_chill, session.tono) : pick(carta.palabra_real, carta.palabra_real_chill, session.tono)}
          esUltimo={revelIdx + 1 >= jugadores.length}
          insetsBottom={insets.bottom}
          onListo={siguienteReparto}
        />
      )}

      {/* ——— EMPEZAR ——— */}
      {fase === 'empezar' && (
        <Animated.View entering={FadeIn.duration(260)} style={styles.centro}>
          <Text style={styles.bigEmoji}>🕵️</Text>
          <Overline>¡EMPEZAMOS!</Overline>
          <Text style={styles.titulo}>Le toca empezar a</Text>
          <Text style={styles.nombreGrande} numberOfLines={2} adjustsFontSizeToFit>
            {jugadores[starterIdx]}
          </Text>
          <Text style={styles.sub}>
            En orden, cada uno dirá una palabra, ni muy obvia, ni muy alejada de la que le ha salido en su carta.
          </Text>
          <View style={[styles.btnStretch, { paddingBottom: insets.bottom + 14 }]}>
            <PrimaryButton title="Comenzar" onPress={() => setFase('pistas')} />
          </View>
        </Animated.View>
      )}

      {/* ——— PISTAS ——— */}
      {fase === 'pistas' && (
        <Animated.View entering={FadeIn.duration(260)} style={styles.centro}>
          <Text style={styles.bigEmoji}>💬</Text>
          <Overline>RONDA DE PISTAS</Overline>
          <Text style={styles.pistasTexto}>
            Cada uno dice una pista relacionada con su palabra, sin decirla. Cuando hayáis terminado, votad.
          </Text>
          <View style={[styles.btnStretch, { paddingBottom: insets.bottom + 14 }]}>
            <PrimaryButton title="Empezar votación" onPress={() => setFase('votacion')} />
          </View>
        </Animated.View>
      )}

      {/* ——— VOTACIÓN ——— */}
      {fase === 'votacion' && (
        <View style={styles.votacionWrap}>
          <View style={styles.votacionHead}>
            <Overline>VOTACIÓN</Overline>
            <Text style={styles.titulo}>¿Quién es el impostor?</Text>
            <Text style={styles.sub}>
              {`Entre todos, acusad al que creéis que es el impostor. Si acertáis, él ${bebeN(session.tono, TRAGOS_IMPOSTOR, false)}; si no, el resto ${bebeN(session.tono, TRAGOS_IMPOSTOR, false)}. ¿A quién acusáis?`}
            </Text>
          </View>
          <View style={styles.votacionLista}>
            {jugadores.map((nombre, i) => (
              <PressableScale key={i} onPress={() => votar(i)} scaleTo={0.97} style={styles.votoChip}>
                <Text style={styles.votoNombre} numberOfLines={1}>
                  {nombre}
                </Text>
              </PressableScale>
            ))}
          </View>
          <View style={{ height: insets.bottom + 14 }} />
        </View>
      )}

      {/* ——— RESULTADO ——— */}
      {fase === 'resultado' && (
        <Animated.View entering={FadeIn.duration(280)} style={styles.centro}>
          <Text style={styles.bigEmoji}>{acierto ? '🎉' : '🕵️'}</Text>
          <Overline color={acierto ? colors.green : colors.coral}>
            {acierto ? '¡ACERTASTEIS!' : '¡OS HA ENGAÑADO!'}
          </Overline>
          <Text style={styles.resultadoTitulo} numberOfLines={2} adjustsFontSizeToFit>
            {jugadores[impostorIdx]} era el impostor
          </Text>

          <View style={styles.revelaBox}>
            <View style={styles.revelaFila}>
              <Text style={styles.revelaLabel}>PALABRA REAL</Text>
              <Text style={styles.revelaPalabra}>{pick(carta.palabra_real, carta.palabra_real_chill, session.tono)}</Text>
            </View>
            <View style={styles.revelaSep} />
            <View style={styles.revelaFila}>
              <Text style={[styles.revelaLabel, { color: colors.coral }]}>DEL IMPOSTOR</Text>
              <Text style={[styles.revelaPalabra, { color: colors.coral }]}>{pick(carta.palabra_impostor, carta.palabra_impostor_chill, session.tono)}</Text>
            </View>
          </View>

          <View style={[styles.tragosPill, acierto ? styles.tragosOk : styles.tragosBad]}>
            <Text style={styles.tragosText}>
              {acierto
                ? `¡El impostor ${bebeN(session.tono, TRAGOS_IMPOSTOR, false)}! ${emoji(session.tono)}`
                : `¡El resto del grupo ${bebeN(session.tono, TRAGOS_IMPOSTOR, false)}! ${emoji(session.tono)}`}
            </Text>
          </View>

          <View style={[styles.btnStretch, { paddingBottom: insets.bottom + 14 }]}>
            {enCompeticion ? (
              partidaNum < PARTIDAS_COMPETICION_IMPOSTOR ? (
                <PrimaryButton
                  title={`Siguiente partida (${partidaNum}/${PARTIDAS_COMPETICION_IMPOSTOR})`}
                  onPress={siguientePartidaComp}
                />
              ) : (
                <PrimaryButton title="Continuar" onPress={() => router.replace('/fin-juego')} />
              )
            ) : (
              <>
                <PrimaryButton title="Nueva ronda  🕵️" onPress={nuevaRonda} />
                <SecondaryButton title="Cambiar de juego" variant="soft" onPress={salirAlMenu} />
              </>
            )}
          </View>
        </Animated.View>
      )}

      <SessionMenu
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        onReiniciar={reiniciarJuego}
        validarEliminar={() =>
          jugadores.length <= MIN_JUGADORES_IMPOSTOR
            ? `El Impostor necesita al menos ${MIN_JUGADORES_IMPOSTOR} jugadores.`
            : null
        }
      />
    </View>
  );
}

// ——— Carta de reparto con flip (una por jugador; key reinicia su estado) ———

function CartaReparto({
  nombre,
  posicion,
  total,
  categoria,
  palabra,
  esUltimo,
  insetsBottom,
  onListo,
}: {
  nombre: string;
  posicion: number;
  total: number;
  categoria: string;
  palabra: string;
  esUltimo: boolean;
  insetsBottom: number;
  onListo: () => void;
}) {
  const [revelada, setRevelada] = useState(false);
  const flip = useSharedValue(0);
  const ocupado = useRef(false);
  const flipStyle = useAnimatedStyle(() => ({
    // Flip 2D con scaleX (no rotateY): el rotateY creaba una capa 3D que corrompía
    // el render en iOS (media pantalla en blanco). scaleX = cos(ángulo) comprime la
    // carta a una línea a 90° y vuelve. `flip` sigue yendo 0→90→0.
    transform: [{ scaleX: Math.cos((flip.value * Math.PI) / 180) }],
  }));

  // Función JS (no worklet): pasar un closure creado dentro del worklet a
  // runOnJS crashea en iOS. Por eso se nombran fuera.
  const liberarFlip = () => { ocupado.current = false; };

  const voltear = () => {
    if (revelada || ocupado.current) return;
    ocupado.current = true;
    // Dos tramos encadenados: a 90° (canto) se revela la palabra; la vuelta a 0°
    // la deja visible. Sincroniza el swap sin setTimeout que desincroniza en iOS.
    flip.value = withSequence(
      withTiming(90, { duration: 170, easing: Easing.in(Easing.quad) }, (finished) => {
        if (finished) runOnJS(setRevelada)(true);
      }),
      withTiming(0, { duration: 170, easing: Easing.out(Easing.quad) }, (finished) => {
        if (finished) runOnJS(liberarFlip)();
      })
    );
  };

  return (
    <View style={styles.repartoOuter}>
      {/* TOP: nombre del jugador */}
      <View style={styles.repartoTop}>
        <Overline>
          {revelada ? 'TU PALABRA' : `PÁSALE EL MÓVIL A · ${posicion}/${total}`}
        </Overline>
        <Text style={styles.repartoNombre} numberOfLines={1} adjustsFontSizeToFit>
          {nombre}
        </Text>
      </View>

      {/* CENTRO: carta animada */}
      <View style={styles.repartoCardArea}>
        <PressableScale onPress={voltear} disabled={revelada} scaleTo={0.97}>
          <Animated.View style={[styles.cartaImp, flipStyle]}>
            {revelada ? (
              <View style={styles.cartaCara}>
                <Text style={styles.cartaCat}>{categoria}</Text>
                <Text style={styles.cartaPalabra} numberOfLines={2} adjustsFontSizeToFit>
                  {palabra}
                </Text>
                <Text style={styles.cartaHint}>No la digas. Da una pista.</Text>
              </View>
            ) : (
              <View style={[styles.cartaCara, styles.cartaDorso]}>
                <Text style={styles.cartaOjo}>🕵️</Text>
                <Text style={styles.cartaDorsoText}>Toca para ver tu palabra</Text>
              </View>
            )}
          </Animated.View>
        </PressableScale>
      </View>

      {/* BOTTOM: aviso (antes de revelar) o botón (después) */}
      <View style={[styles.repartoBottom, { paddingBottom: insetsBottom + 14 }]}>
        {revelada ? (
          <PrimaryButton
            title={esUltimo ? 'Listo, ¡a jugar!' : 'Listo, siguiente'}
            onPress={onListo}
          />
        ) : (
          <Text style={styles.repartoAviso}>Que nadie más mire la pantalla 👀</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 26,
    paddingBottom: 4,
  },
  compPill: { flex: 1 },
  compPillText: {
    alignSelf: 'flex-start',
    fontFamily: fonts.bodyX,
    fontSize: 13,
    color: colors.purple,
    backgroundColor: colors.lav50,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  // contenedor genérico centrado para las fases que lo usan
  centro: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 8,
  },
  btnStretch: { alignSelf: 'stretch', gap: 10, marginTop: 8 },
  bigEmoji: { fontSize: 64, marginBottom: 2 },
  titulo: {
    fontFamily: fonts.display,
    fontSize: 26,
    letterSpacing: -0.8,
    color: colors.ink,
    textAlign: 'center',
  },
  nombreGrande: {
    fontFamily: fonts.display,
    fontSize: 46,
    letterSpacing: -1.8,
    color: colors.purple,
    textAlign: 'center',
  },
  sub: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.gray,
    textAlign: 'center',
    maxWidth: 320,
  },
  // reparto
  repartoOuter: { flex: 1, paddingHorizontal: 26 },
  repartoTop: { alignItems: 'center', paddingTop: 18, gap: 4 },
  repartoNombre: {
    fontFamily: fonts.display,
    fontSize: 38,
    letterSpacing: -1.4,
    color: colors.ink,
    textAlign: 'center',
    marginTop: 4,
  },
  repartoCardArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  repartoBottom: { alignItems: 'center', paddingTop: 12 },
  cartaImp: {
    width: 260,
    height: 320,
    borderRadius: 28,
    overflow: 'hidden',
  },
  cartaCara: {
    flex: 1,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
    gap: 14,
  },
  cartaCat: {
    fontFamily: fonts.bodyX,
    fontSize: 12,
    letterSpacing: 2,
    color: colors.purple,
    textAlign: 'center',
  },
  cartaPalabra: {
    fontFamily: fonts.display,
    fontSize: 36,
    letterSpacing: -1.2,
    color: colors.ink,
    textAlign: 'center',
  },
  cartaHint: {
    fontFamily: fonts.bodyBold,
    fontSize: 12.5,
    color: colors.grayLt,
    textAlign: 'center',
  },
  cartaDorso: {
    backgroundColor: '#2C2542',
    borderWidth: 2,
    borderColor: 'rgba(196,181,253,0.35)',
  },
  cartaOjo: { fontSize: 86 },
  cartaDorsoText: {
    fontFamily: fonts.bodyX,
    fontSize: 15,
    color: '#C4B5FD',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  repartoAviso: {
    fontFamily: fonts.bodyBold,
    fontSize: 13.5,
    color: colors.gray,
    textAlign: 'center',
  },
  // pistas
  pistasTexto: {
    fontFamily: fonts.body,
    fontSize: 17,
    lineHeight: 25,
    color: colors.ink,
    textAlign: 'center',
    maxWidth: 320,
    marginTop: 6,
  },
  // votación
  votacionWrap: { flex: 1, paddingHorizontal: 26 },
  votacionHead: { alignItems: 'center', marginTop: 8, marginBottom: 18, gap: 4 },
  votacionLista: { flex: 1, gap: 10 },
  votoChip: {
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  votoNombre: {
    fontFamily: fonts.display,
    fontSize: 20,
    color: colors.ink,
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  // resultado
  resultadoTitulo: {
    fontFamily: fonts.display,
    fontSize: 30,
    letterSpacing: -1,
    color: colors.ink,
    textAlign: 'center',
  },
  revelaBox: {
    alignSelf: 'stretch',
    backgroundColor: colors.ghost,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 16,
    marginTop: 4,
    gap: 10,
  },
  revelaFila: { alignItems: 'center', gap: 3 },
  revelaLabel: {
    fontFamily: fonts.bodyX,
    fontSize: 11,
    letterSpacing: 2,
    color: colors.purple,
  },
  revelaPalabra: {
    fontFamily: fonts.display,
    fontSize: 24,
    letterSpacing: -0.6,
    color: colors.ink,
  },
  revelaSep: { height: 1, backgroundColor: colors.border },
  tragosPill: {
    borderRadius: 30,
    paddingHorizontal: 20,
    paddingVertical: 11,
    marginTop: 4,
  },
  tragosOk: { backgroundColor: colors.greenBg, borderWidth: 1, borderColor: colors.green },
  tragosBad: { backgroundColor: colors.redBg, borderWidth: 1, borderColor: colors.red },
  tragosText: {
    fontFamily: fonts.bodyX,
    fontSize: 15,
    color: colors.ink,
    textAlign: 'center',
  },
});
