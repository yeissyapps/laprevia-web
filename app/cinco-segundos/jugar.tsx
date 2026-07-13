// 5 Segundos · Juego — máquina de estados: inicial → corriendo → validar → resultado.
// Temporizador con sonido sintético (verde/naranja/rojo) y validación del grupo.

import { LinearGradient } from 'expo-linear-gradient';
import { useKeepAwake } from 'expo-keep-awake';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Confetti } from '@/components/Confetti';
import { RulesButton } from '@/components/GameRules';
import { Overline } from '@/components/Overline';
import { PressableScale } from '@/components/PressableScale';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SessionMenu, SessionMenuButton } from '@/components/SessionMenu';
import { TimerRing } from '@/components/TimerRing';
import { useSession } from '@/context/SessionContext';
import {
  DURACION_CINCO,
  mazoCinco,
  zonaTimer,
  type CategoriaCinco,
  type SeleccionCinco,
} from '@/data/cincoSegundos';
import { alarma, detenerTick, iniciarTick, resultadoSonido, setSonidoHabilitado, tic } from '@/utils/sonido';
import { bebeN, emoji, verbo } from '@/utils/textoTono';
import { colors, fonts, gradientAngle, gradients, type } from '@/theme/theme';

type Fase = 'inicial' | 'corriendo' | 'validar' | 'resultado';
type ResultadoCinco = 'si' | 'no';

function KeepAwake() {
  useKeepAwake();
  return null;
}

export default function CincoSegundosJugarScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, sumarTragos } = useSession();
  const params = useLocalSearchParams<{ seleccion?: string }>();

  const seleccion = (params.seleccion ?? 'neutro') as SeleccionCinco;
  const jugadores = session.jugadores.length > 0 ? session.jugadores : ['Jugador 1', 'Jugador 2'];

  const [nonce, setNonce] = useState(0);
  // En Competición se juegan como máximo 30 categorías en total.
  const mazo = useMemo(() => {
    const m = mazoCinco(seleccion);
    return (session.modo === 'competicion' || session.modo === 'escalada') ? m.slice(0, 30) : m;
  }, [seleccion, nonce, session.modo]);

  const [idx, setIdx] = useState(0);
  const [turno, setTurno] = useState(0);
  const [fase, setFase] = useState<Fase>('inicial');
  const [seg, setSeg] = useState(DURACION_CINCO);
  const [resultado, setResultado] = useState<ResultadoCinco | null>(null);
  const [pre, setPre] = useState(3); // pre-cuenta de la fase inicial
  const [menuVisible, setMenuVisible] = useState(false);
  const [pausado, setPausado] = useState(false);

  const jugadorIdx = turno % jugadores.length;
  const categoria: CategoriaCinco = mazo[idx];
  const total = mazo.length;

  // Sincroniza la preferencia de sonido con el motor de audio
  useEffect(() => {
    setSonidoHabilitado(session.sonidoActivado);
  }, [session.sonidoActivado]);

  // MP3 tick: arranca al entrar en 'corriendo' (5 s → offset 55 s), para en cualquier otro estado
  useEffect(() => {
    if (fase === 'corriendo' && !pausado) iniciarTick(DURACION_CINCO);
    else detenerTick();
  }, [fase, pausado]);

  // Cuenta atrás + sonidos (tic() solo emite hápticos en nativo cuando MP3 activo)
  useEffect(() => {
    if (fase !== 'corriendo' || pausado) return;
    if (seg <= 0) {
      alarma();
      const t = setTimeout(() => setFase('validar'), 450);
      return () => clearTimeout(t);
    }
    tic(zonaTimer(seg));
    const t = setTimeout(() => setSeg((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [fase, seg, pausado]);

  // Entrada del número grande (spring) en la fase inicial + reinicio de pre-cuenta
  const pop = useSharedValue(0);
  useEffect(() => {
    if (fase === 'inicial') {
      pop.value = 0;
      pop.value = withSpring(1, { damping: 9, stiffness: 140, mass: 0.7 });
    }
  }, [fase, idx, pop]);
  const popStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.4 + pop.value * 0.6 }, { translateY: (1 - pop.value) * -30 }],
  }));

  // Pre-cuenta: 3s para leer/pensar la categoría y arranca el temporizador solo
  useEffect(() => {
    if (fase !== 'inicial' || pausado) return;
    if (pre <= 0) {
      setSeg(DURACION_CINCO);
      setFase('corriendo');
      return;
    }
    const t = setTimeout(() => setPre((p) => p - 1), 1000);
    return () => clearTimeout(t);
  }, [fase, pre, pausado]);

  const abrirMenu = () => {
    if (fase === 'corriendo' || fase === 'inicial') setPausado(true);
    setMenuVisible(true);
  };
  const cerrarMenu = () => {
    setMenuVisible(false);
    setPausado(false);
  };

  const validar = (r: ResultadoCinco) => {
    setResultado(r);
    resultadoSonido(r === 'si');
    if (r === 'no') sumarTragos(jugadorIdx, 1);
    setFase('resultado');
  };

  const siguiente = () => {
    if (idx + 1 >= total) {
      router.replace('/fin-juego');
      return;
    }
    setIdx((i) => i + 1);
    setTurno((t) => t + 1);
    setResultado(null);
    setSeg(DURACION_CINCO);
    setPre(3); // reinicia la pre-cuenta junto al cambio de fase (mismo render)
    setFase('inicial');
  };

  const reiniciarJuego = () => {
    setNonce((n) => n + 1);
    setIdx(0);
    setTurno(0);
    setResultado(null);
    setSeg(DURACION_CINCO);
    setPre(3);
    setFase('inicial');
  };

  const zona = zonaTimer(seg);
  const tinteRojo = fase === 'corriendo' && zona === 'rojo';
  // Solo "No lo consiguió" es full-bleed (coral); el resto se queda en la
  // estética clara de la app.
  const fullBleed = fase === 'resultado' && resultado === 'no';
  // En 'inicial' el nombre ya va en la frase "{jugador} nombra…", así que no
  // repetimos la cabecera "LE TOCA A" para que la frase personal sea lo primero.
  const mostrarJugador =
    fase === 'corriendo' || (fase === 'resultado' && resultado === 'si');

  // Fondo según fase
  const fondo: readonly [string, string, ...string[]] = fullBleed
    ? gradients.coral.colors
    : tinteRojo
      ? ['#FFF1F1', '#FFE4E4']
      : [colors.surface, colors.surface];

  return (
    <LinearGradient colors={fondo} style={styles.screen}>
      {Platform.OS !== 'web' && <KeepAwake />}
      {tinteRojo && <BordeRojo />}
      {fase === 'resultado' && resultado === 'si' && <Confetti cantidad={26} />}

      {/* Cabecera: menú siempre accesible; progreso y reglas solo en fondo claro */}
      <View style={[styles.top, { paddingTop: insets.top + 10 }]}>
        {!fullBleed ? (
          <View style={styles.progresoWrap}>
            <View style={styles.progresoTrack}>
              <View style={[styles.progresoFill, { width: `${(idx / total) * 100}%` }]} />
            </View>
            <Text style={styles.contador}>
              {idx + 1}/{total}
            </Text>
          </View>
        ) : (
          <View style={styles.progresoWrap} />
        )}
        {!fullBleed && <RulesButton juegoId="cinco-segundos" />}
        <SessionMenuButton onPress={abrirMenu} onColor={fullBleed} />
      </View>

      {/* Jugador (inicial / corriendo / acierto) */}
      {mostrarJugador && (
        <View style={styles.playerBlock}>
          <Overline color={colors.grayLt}>LE TOCA A</Overline>
          <Text style={styles.playerName} numberOfLines={1} adjustsFontSizeToFit>
            {jugadores[jugadorIdx]}
          </Text>
        </View>
      )}

      {/* ——— Centro según fase ——— */}
      <View style={styles.centro}>
        {fase === 'inicial' && (
          <View style={styles.inicialCentro}>
            <Text style={styles.nombra}>
              {jugadores[jugadorIdx]} nombra
            </Text>
            <Animated.Text style={[styles.cantidad, popStyle]}>{categoria.cantidad}</Animated.Text>
            <Text style={styles.categoria}>{categoria.etiqueta}</Text>
            <Text style={styles.instruccion}>
              Lee la categoría y prepárate: tienes{' '}
              <Text style={styles.instruccionFuerte}>5 segundos</Text> para decirlas.
            </Text>
          </View>
        )}

        {fase === 'corriendo' && (
          <View style={styles.corriendoCentro}>
            <Text style={[styles.corriendoCat, tinteRojo && { color: '#B91C1C' }]}>
              {categoria.cantidad} {categoria.etiqueta}
            </Text>
            <TimerRing seg={seg} total={DURACION_CINCO} />
          </View>
        )}

        {fase === 'validar' && (
          <View style={styles.validarCentro}>
            <View style={styles.validarIcono}>
              <Text style={styles.validarEmoji}>⏱️</Text>
            </View>
            <Text style={styles.validarOverline}>EL MOMENTO DE LA VERDAD</Text>
            <Text style={styles.validarTitulo}>¿Lo ha conseguido?</Text>
            <Text style={styles.validarDesc}>
              El resto de jugadores decide si la respuesta de{' '}
              <Text style={styles.validarNombre}>{jugadores[jugadorIdx]}</Text> es válida o no.
            </Text>
            <View style={styles.validarChip}>
              <Text style={styles.validarChipText}>
                {categoria.cantidad} {categoria.etiqueta}
              </Text>
            </View>
          </View>
        )}

        {fase === 'resultado' && resultado === 'si' && (
          <Animated.View entering={FadeIn.duration(220)} style={styles.resultadoCentro}>
            <PopCircle colores={['#22C55E', '#16A34A']}>
              <Text style={styles.resultadoIcono}>✓</Text>
            </PopCircle>
            <Text style={[styles.resultadoTitulo, { color: '#16A34A' }]}>¡Bien hecho!</Text>
            <Text style={styles.resultadoSub}>Se libra</Text>
          </Animated.View>
        )}

        {fase === 'resultado' && resultado === 'no' && (
          <Animated.View entering={FadeIn.duration(260)} style={styles.resultadoCentro}>
            <View style={styles.haloNo} />
            <View style={styles.haloNo2} />
            <PopJarra />
            <Text style={styles.bebeOverline}>SE ACABÓ EL TIEMPO</Text>
            <Text style={styles.bebeTitulo}>{`¡A ${verbo(session.tono, 'beber')}!`}</Text>
            <View style={styles.bebePill}>
              <Text style={styles.bebePillText}>{jugadores[jugadorIdx]} {bebeN(session.tono, 1, false)}</Text>
            </View>
          </Animated.View>
        )}
      </View>

      {/* ——— Pie según fase ——— */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
        {/* Inicial: sin botón, arranca solo tras una pre-cuenta de 3s */}
        {fase === 'inicial' && (
          <View style={styles.preWrap}>
            <Text style={styles.preText}>Empieza en {pre}…</Text>
          </View>
        )}

        {/* Corriendo: sin botón, son solo 5 segundos */}

        {fase === 'validar' && (
          <View style={styles.validarBtns}>
            {/* SÍ: blanco con borde morado */}
            <PressableScale onPress={() => validar('si')} style={styles.siBtn}>
              <Text style={styles.siIcono}>✓</Text>
              <Text style={styles.siLabel}>SÍ</Text>
            </PressableScale>
            {/* NO: morado relleno (al contrario) */}
            <PressableScale onPress={() => validar('no')} style={styles.noWrap}>
              <LinearGradient
                colors={gradients.purple.colors}
                locations={gradients.purple.locations}
                start={gradientAngle.start}
                end={gradientAngle.end}
                style={styles.noBtn}>
                <Text style={styles.noIcono}>✕</Text>
                <Text style={styles.noLabel}>NO</Text>
              </LinearGradient>
            </PressableScale>
          </View>
        )}

        {fase === 'resultado' && resultado === 'si' && (
          <PrimaryButton title="Siguiente" onPress={siguiente} />
        )}
        {fase === 'resultado' && resultado === 'no' && (
          <PressableScale onPress={siguiente} style={styles.blancoBtn}>
            <Text style={styles.blancoText}>Siguiente</Text>
          </PressableScale>
        )}
      </View>

      <SessionMenu visible={menuVisible} onClose={cerrarMenu} onReiniciar={reiniciarJuego} />
    </LinearGradient>
  );
}

// ——— Sub-componentes ————————————————————————————————————————————

// Jarra de "no consiguió": entra con pop y luego late suavemente (dramático)
function PopJarra() {
  const { session } = useSession();
  const s = useSharedValue(0);
  const pulse = useSharedValue(1);
  useEffect(() => {
    s.value = withSpring(1, { damping: 7, stiffness: 130, mass: 0.6 });
    pulse.value = withRepeat(
      withSequence(withTiming(1.06, { duration: 700 }), withTiming(1, { duration: 700 })),
      -1,
      true
    );
  }, [s, pulse]);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: (0.4 + s.value * 0.6) * pulse.value }],
  }));
  return (
    <Animated.View style={[styles.jarraCirculo, style]}>
      <Text style={styles.jarra}>{emoji(session.tono)}</Text>
    </Animated.View>
  );
}

function PopCircle({ colores, children }: {
  colores: readonly [string, string, ...string[]];
  children: React.ReactNode;
}) {
  const s = useSharedValue(0);
  useEffect(() => {
    s.value = withSpring(1, { damping: 8, stiffness: 150, mass: 0.6 });
  }, [s]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 0.4 + s.value * 0.6 }] }));
  return (
    <Animated.View style={style}>
      <LinearGradient colors={colores} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={styles.popCircle}>
        {children}
      </LinearGradient>
    </Animated.View>
  );
}

function BordeRojo() {
  const op = useSharedValue(0.15);
  useEffect(() => {
    op.value = withRepeat(withTiming(1, { duration: 350, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => cancelAnimation(op);
  }, [op]);
  const style = useAnimatedStyle(() => ({ opacity: op.value }));
  return <Animated.View pointerEvents="none" style={[styles.bordeRojo, style]} />;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 26,
    marginBottom: 6,
  },
  progresoWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  progresoTrack: {
    flex: 1,
    height: 6,
    borderRadius: 4,
    backgroundColor: colors.lav100,
    overflow: 'hidden',
  },
  progresoFill: {
    height: 6,
    borderRadius: 4,
    backgroundColor: colors.purple,
  },
  contador: {
    fontFamily: fonts.bodyX,
    fontSize: 11,
    color: colors.grayLt,
    minWidth: 50,
    textAlign: 'right',
  },
  playerBlock: {
    paddingHorizontal: 28,
    marginTop: 8,
    gap: 4,
  },
  playerName: {
    fontFamily: fonts.display,
    fontSize: 44,
    letterSpacing: -1.5,
    color: colors.ink,
  },
  centro: {
    flex: 1,
    justifyContent: 'center',
  },
  // inicial
  inicialCentro: {
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  nombra: {
    fontFamily: fonts.display,
    fontSize: 24,
    letterSpacing: -0.6,
    color: colors.purple,
    textAlign: 'center',
    marginBottom: 6,
    paddingHorizontal: 10,
  },
  cantidad: {
    fontFamily: fonts.display,
    fontSize: 120,
    color: colors.purple,
    letterSpacing: -6,
    lineHeight: 122,
    includeFontPadding: false,
  },
  categoria: {
    fontFamily: fonts.display,
    fontSize: 32,
    color: colors.ink,
    letterSpacing: -1,
    marginTop: 10,
    textAlign: 'center',
  },
  instruccion: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.gray,
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 260,
    marginTop: 18,
  },
  instruccionFuerte: {
    color: colors.purple,
    fontFamily: fonts.bodyX,
  },
  // corriendo
  corriendoCentro: {
    alignItems: 'center',
    gap: 28,
  },
  corriendoCat: {
    fontFamily: fonts.display,
    fontSize: 22,
    color: colors.ink,
    letterSpacing: -0.6,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  // validar (estética clara de la app)
  validarCentro: {
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  validarIcono: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.lav100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  validarEmoji: {
    fontSize: 36,
  },
  validarOverline: {
    fontFamily: fonts.bodyX,
    fontSize: 12,
    letterSpacing: 3,
    color: colors.purple,
    marginBottom: 12,
  },
  validarTitulo: {
    fontFamily: fonts.display,
    fontSize: 34,
    color: colors.ink,
    letterSpacing: -1.2,
    textAlign: 'center',
  },
  validarDesc: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
    color: colors.gray,
    marginTop: 12,
    textAlign: 'center',
    maxWidth: 290,
  },
  validarNombre: {
    fontFamily: fonts.bodyX,
    color: colors.purple,
  },
  validarChip: {
    backgroundColor: colors.lav100,
    borderRadius: 30,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginTop: 16,
  },
  validarChipText: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.purpleDeep,
    textAlign: 'center',
  },
  // resultado
  resultadoCentro: {
    alignItems: 'center',
    gap: 16,
  },
  resultadoIcono: {
    fontFamily: fonts.display,
    fontSize: 58,
    color: colors.white,
  },
  resultadoTitulo: {
    fontFamily: fonts.display,
    fontSize: 38,
    letterSpacing: -1.2,
  },
  resultadoSub: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.grayLt,
  },
  haloNo: {
    position: 'absolute',
    width: 460,
    height: 460,
    borderRadius: 230,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  haloNo2: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  jarraCirculo: {
    width: 168,
    height: 168,
    borderRadius: 84,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 2.5,
    borderColor: 'rgba(255,255,255,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  jarra: {
    fontSize: 88,
  },
  bebeOverline: {
    fontFamily: fonts.bodyX,
    fontSize: 12,
    letterSpacing: 3,
    color: 'rgba(255,255,255,0.85)',
  },
  bebeTitulo: {
    fontFamily: fonts.display,
    fontSize: 64,
    color: colors.white,
    letterSpacing: -2,
    marginTop: -2,
  },
  bebePill: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: 30,
    paddingHorizontal: 18,
    paddingVertical: 9,
    marginTop: 4,
  },
  bebePillText: {
    fontFamily: fonts.bodyX,
    fontSize: 14,
    color: colors.white,
  },
  // footer
  footer: {
    paddingHorizontal: 26,
    paddingTop: 8,
  },
  preWrap: {
    height: 70,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.lav100,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  preText: {
    fontFamily: fonts.display,
    fontSize: 21,
    letterSpacing: -0.3,
    color: colors.purple,
  },
  validarBtns: {
    flexDirection: 'row',
    gap: 12,
  },
  siBtn: {
    flex: 1,
    height: 104,
    borderRadius: 24,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.purple,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  siIcono: {
    fontSize: 30,
    color: colors.purple,
  },
  siLabel: {
    fontFamily: fonts.display,
    fontSize: 27,
    color: colors.purple,
    letterSpacing: -0.3,
  },
  noWrap: {
    flex: 1,
  },
  noBtn: {
    height: 104,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  noIcono: {
    fontSize: 30,
    color: colors.white,
  },
  noLabel: {
    fontFamily: fonts.display,
    fontSize: 27,
    color: colors.white,
    letterSpacing: -0.3,
  },
  blancoBtn: {
    height: 70,
    borderRadius: 20,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blancoText: {
    fontFamily: fonts.display,
    fontSize: 23,
    letterSpacing: -0.3,
    color: '#E11D48',
  },
  popCircle: {
    width: 118,
    height: 118,
    borderRadius: 59,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bordeRojo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 6,
    borderColor: '#DC2626',
    zIndex: 5,
  },
});
