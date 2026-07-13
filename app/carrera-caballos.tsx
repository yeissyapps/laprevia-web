// Carrera de Caballos — apuestas por jugador, carrera animada (ganador oculto
// hasta el final) y reparto de tragos. Sin contenido JSON: 100% mecánico.

import { LinearGradient } from 'expo-linear-gradient';
import { useKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
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
import {
  CABALLOS,
  CHUPITOS_MAX,
  CHUPITOS_MIN,
  LISTA_CABALLOS,
  caballoGanadorAleatorio,
  calcularReparto,
  lanzarCarrera,
  type Apuesta,
  type Caballo,
  type ResultadoJugador,
} from '@/data/carrera';
import { casco, desbloquearAudio, detenerGalopeo, fanfarriaVictoria, iniciarGalopeo, relinche, setSonidoHabilitado } from '@/utils/sonido';
import { cap, emoji, unidad, verbo } from '@/utils/textoTono';
import { colors, fonts, gradientAngle, gradients, shadows, type } from '@/theme/theme';

type Fase = 'apuestas' | 'carrera' | 'reparto' | 'resultado';

const TOTAL_MS = 10000;

function KeepAwake() {
  useKeepAwake();
  return null;
}

// 🐎 mira a la izquierda por defecto → scaleX:-1 para correr hacia la meta
function Caballito({ size = 34 }: { size?: number }) {
  return <Text style={{ fontSize: size, transform: [{ scaleX: -1 }] }}>🐎</Text>;
}

function Dorsal({ caballo, size = 22 }: { caballo: Caballo; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: caballo.color,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Text style={{ fontFamily: fonts.display, fontSize: size * 0.5, color: colors.white }}>{caballo.n}</Text>
    </View>
  );
}

export default function CarreraCaballosScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, sumarTragos, registrarPartida } = useSession();

  const jugadores = session.jugadores.length > 0 ? session.jugadores : ['Jugador 1', 'Jugador 2'];
  const enCompeticion = session.modo === 'competicion' || session.modo === 'escalada';

  const [fase, setFase] = useState<Fase>('apuestas');
  const [apuestas, setApuestas] = useState<Apuesta[]>(() =>
    jugadores.map(() => ({ caballo: null, chupitos: 2 }))
  );
  const [ganador, setGanador] = useState<number | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  // Reparto: a quién mandó beber cada acertante (índice receptor → tragos)
  const [recibidos, setRecibidos] = useState<Record<number, number>>({});
  const [repartoIdx, setRepartoIdx] = useState(0);
  // En Competición se corren 5 carreras antes de pasar al siguiente juego.
  const TOTAL_CARRERAS_COMP = 5;
  const [carreraNum, setCarreraNum] = useState(1);

  const posSV = [useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0)];
  const racePct = useSharedValue(0);
  // Nº del caballo en cabeza en cada momento (para resaltar su carril en vivo).
  const liderSV = useSharedValue(0);
  const stopRef = useRef<(() => void) | null>(null);
  const lastHoofRef = useRef(0);
  const apuestasRef = useRef(apuestas);
  apuestasRef.current = apuestas;

  useEffect(() => {
    setSonidoHabilitado(session.sonidoActivado);
  }, [session.sonidoActivado]);

  // Orientación: la pantalla de carrera es el ÚNICO momento horizontal de la
  // app. Bloquea landscape al entrar a 'carrera' y vuelve a portrait al salir.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    ScreenOrientation.lockAsync(
      fase === 'carrera'
        ? ScreenOrientation.OrientationLock.LANDSCAPE
        : ScreenOrientation.OrientationLock.PORTRAIT_UP
    ).catch(() => {});
  }, [fase]);

  // Al desmontar (p. ej. salir a /fin-juego), restaura siempre vertical.
  useEffect(
    () => () => {
      if (Platform.OS !== 'web')
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    },
    []
  );

  // La sesión hidrata async de AsyncStorage (primer render = 2 jugadores
  // fallback). Resincroniza las apuestas al nº real de jugadores, conservando lo
  // ya elegido, para no indexar fuera de rango en carga directa/deep-link.
  useEffect(() => {
    setApuestas((prev) => {
      if (prev.length === jugadores.length) return prev;
      return jugadores.map((_, i) => prev[i] ?? { caballo: null, chupitos: 2 });
    });
  }, [jugadores.length]);

  useEffect(() => () => { stopRef.current?.(); detenerGalopeo(); }, []);

  const todosEligieron = apuestas.every((a) => a.caballo !== null);

  const setCaballo = (i: number, n: number) => {
    setApuestas((prev) => prev.map((a, idx) => (idx === i ? { ...a, caballo: n } : a)));
  };
  const setChupitos = (i: number, delta: number) => {
    setApuestas((prev) =>
      prev.map((a, idx) =>
        idx === i ? { ...a, chupitos: Math.max(CHUPITOS_MIN, Math.min(CHUPITOS_MAX, a.chupitos + delta)) } : a
      )
    );
  };

  const empezar = () => {
    if (!todosEligieron) return;
    desbloquearAudio();
    iniciarGalopeo();
    const gana = caballoGanadorAleatorio();
    setGanador(null);
    posSV.forEach((sv) => (sv.value = 0));
    liderSV.value = 0;
    racePct.value = 0;
    racePct.value = withTiming(1, { duration: TOTAL_MS, easing: Easing.linear });
    lastHoofRef.current = 0;
    setFase('carrera');

    stopRef.current = lanzarCarrera({
      totalMs: TOTAL_MS,
      ganador: gana,
      onTick: (pos, t) => {
        posSV.forEach((sv, idx) => (sv.value = pos[idx + 1]));
        // Caballo en cabeza → resalta su carril en vivo
        let lider = 0;
        let best = -1;
        [1, 2, 3, 4].forEach((n) => {
          if (pos[n] > best) {
            best = pos[n];
            lider = n;
          }
        });
        liderSV.value = lider;
        // Cascos que aceleran (gap 260ms → 90ms)
        const now = Date.now();
        const gap = 260 - 170 * t;
        if (now - lastHoofRef.current >= gap) {
          lastHoofRef.current = now;
          casco();
        }
      },
      onFinish: () => {
        // Cada perdedor bebe sus chupitos; los acertantes reparten después
        const reparto = calcularReparto(jugadores, apuestasRef.current, gana);
        reparto.perdedores.forEach((p) => sumarTragos(p.index, p.chupitos));
        detenerGalopeo();
        relinche();
        fanfarriaVictoria();
        setGanador(gana);
        setRecibidos({});
        setRepartoIdx(0);
        setTimeout(
          () => setFase(reparto.ganadores.length > 0 ? 'reparto' : 'resultado'),
          1600
        );
      },
    });
  };

  // Confirma el reparto de un acertante (lista de receptores, 1 trago c/u).
  // Al terminar el último acertante, aplica los tragos a quien los recibió.
  const confirmarReparto = (objetivos: number[], ganadores: { index: number }[]) => {
    const acumulado = { ...recibidos };
    objetivos.forEach((t) => {
      acumulado[t] = (acumulado[t] ?? 0) + 1;
    });
    if (repartoIdx >= ganadores.length - 1) {
      setRecibidos(acumulado);
      Object.entries(acumulado).forEach(([idx, n]) => sumarTragos(Number(idx), n));
      setFase('resultado');
    } else {
      setRecibidos(acumulado);
      setRepartoIdx((i) => i + 1);
    }
  };

  const nuevaCarrera = () => {
    setGanador(null);
    setRecibidos({});
    setRepartoIdx(0);
    setApuestas(jugadores.map(() => ({ caballo: null, chupitos: 2 })));
    setFase('apuestas');
  };

  // Competición: pasa a la siguiente de las 5 carreras.
  const siguienteCarreraComp = () => {
    setCarreraNum((n) => n + 1);
    nuevaCarrera();
  };

  const reiniciarJuego = () => {
    stopRef.current?.();
    setCarreraNum(1);
    nuevaCarrera();
  };

  return (
    <View style={styles.screen}>
      {Platform.OS !== 'web' && <KeepAwake />}

      {/* Cabecera con menú (no durante la carrera, que es "solo ver") */}
      {fase !== 'carrera' && (
        <View style={[styles.top, { paddingTop: insets.top + 10 }]}>
          <View style={styles.topSpacer} />
          <RulesButton juegoId="carrera-caballos" />
          <SessionMenuButton onPress={() => setMenuVisible(true)} />
        </View>
      )}

      {/* ——— APUESTAS ——— */}
      {fase === 'apuestas' && (
        <>
          <View style={styles.apHead}>
            <Overline>{enCompeticion ? `CARRERA ${Math.min(carreraNum, TOTAL_CARRERAS_COMP)} DE ${TOTAL_CARRERAS_COMP}` : 'HAZ TU APUESTA'}</Overline>
            <Text style={styles.apTitle}>¿Quién gana?</Text>
            <Text style={styles.apSub}>Cada uno elige su caballo y cuántos {unidad(session.tono, 2, 'chupito')} se juega.</Text>
          </View>
          <ScrollView contentContainerStyle={styles.apLista} showsVerticalScrollIndicator={false}>
            {jugadores.map((nombre, i) => {
              const ap = apuestas[i] ?? { caballo: null, chupitos: 2 };
              return (
              <View key={i} style={styles.betCard}>
                <View style={styles.betTop}>
                  <Text style={styles.betNombre} numberOfLines={1}>
                    {nombre}
                  </Text>
                  <View style={styles.stepper}>
                    <PressableScale
                      onPress={() => setChupitos(i, -1)}
                      disabled={ap.chupitos <= CHUPITOS_MIN}
                      style={[styles.stepBtn, ap.chupitos <= CHUPITOS_MIN && styles.stepOff]}
                      hitSlop={6}>
                      <Text style={styles.stepMinus}>−</Text>
                    </PressableScale>
                    <Text style={styles.stepNum}>{ap.chupitos}</Text>
                    <PressableScale
                      onPress={() => setChupitos(i, 1)}
                      disabled={ap.chupitos >= CHUPITOS_MAX}
                      style={[styles.stepBtnPlus, ap.chupitos >= CHUPITOS_MAX && styles.stepOff]}
                      hitSlop={6}>
                      <Text style={styles.stepPlus}>+</Text>
                    </PressableScale>
                    <Text style={styles.stepLabel}>{emoji(session.tono, '🥃')}</Text>
                  </View>
                </View>
                <View style={styles.horseRow}>
                  {LISTA_CABALLOS.map((h) => {
                    const sel = ap.caballo === h.n;
                    return (
                      <PressableScale
                        key={h.n}
                        onPress={() => setCaballo(i, h.n)}
                        scaleTo={0.95}
                        style={[
                          styles.horseChip,
                          // El color del caballo SIEMPRE de fondo (su `soft` ~15%);
                          // seleccionado = borde grueso del color + sombra.
                          { backgroundColor: h.soft, borderColor: sel ? h.color : `${h.color}55` },
                          sel && { borderWidth: 2.5, ...shadows.card },
                        ]}>
                        <Caballito size={24} />
                        <Dorsal caballo={h} size={15} />
                      </PressableScale>
                    );
                  })}
                </View>
              </View>
              );
            })}
          </ScrollView>
          <View style={[styles.footer, styles.footerCentro, { paddingBottom: insets.bottom + 14 }]}>
            <PrimaryButton
              title={todosEligieron ? '¡Que empiece la carrera!' : 'Faltan caballos por elegir'}
              onPress={empezar}
              disabled={!todosEligieron}
              size="m"
              style={styles.empezarBtn}
            />
          </View>
        </>
      )}

      {/* ——— CARRERA (horizontal, pista de hipódromo por capas) ——— */}
      {fase === 'carrera' && (
        <View style={styles.carreraScreen}>
          <View style={[styles.carreraHeadLand, { paddingTop: insets.top + 6 }]}>
            <LiveBadge />
            <View style={styles.progresoTrackLand}>
              <ProgresoFill pct={racePct} />
            </View>
          </View>
          <PistaHipodromo posSV={posSV} lider={liderSV} ganador={ganador} />
        </View>
      )}

      {/* ——— REPARTO (acertantes mandan beber) ——— */}
      {fase === 'reparto' &&
        ganador !== null &&
        (() => {
          const rep = calcularReparto(jugadores, apuestas, ganador);
          const winner = rep.ganadores[repartoIdx];
          if (!winner) return null;
          return (
            <RepartoTurno
              key={winner.index}
              winner={winner}
              jugadores={jugadores}
              recibidosPrevios={recibidos}
              indice={repartoIdx}
              total={rep.ganadores.length}
              insetsTop={insets.top}
              insetsBottom={insets.bottom}
              onConfirm={(objetivos) => confirmarReparto(objetivos, rep.ganadores)}
            />
          );
        })()}

      {/* ——— RESULTADO ——— */}
      {fase === 'resultado' && ganador !== null && (
        <Resultado
          jugadores={jugadores}
          apuestas={apuestas}
          ganador={ganador}
          recibidos={recibidos}
          insetsBottom={insets.bottom}
          enCompeticion={enCompeticion}
          carreraNum={carreraNum}
          totalCarreras={TOTAL_CARRERAS_COMP}
          onNueva={nuevaCarrera}
          onSiguienteCarrera={siguienteCarreraComp}
          onContinuar={() => router.replace('/fin-juego')}
          onCambiar={() => {
            // La sesión entera de carreras (Libre) cuenta como UN juego completado.
            registrarPartida();
            router.replace('/juegos');
          }}
        />
      )}

      {ganador !== null && fase === 'carrera' && <Confetti cantidad={24} />}

      <SessionMenu visible={menuVisible} onClose={() => setMenuVisible(false)} onReiniciar={reiniciarJuego} />
    </View>
  );
}

// ——— Pista de hipódromo (vista cenital, por capas) ————————————————
// De fuera hacia dentro: tierra · valla · 4 franjas verdes (alternando oscuro
// y claro, un caballo por franja) · valla · tierra. Salida y meta a cuadros
// cruzan las 4 franjas de extremo a extremo. Estilo plano.

function PistaHipodromo({ posSV, lider, ganador }: {
  posSV: SharedValue<number>[];
  lider: SharedValue<number>;
  ganador: number | null;
}) {
  const [w, setW] = useState(320);
  return (
    <View style={styles.track}>
      <View style={styles.dirt} />
      <Valla />
      <View style={styles.cesped} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        {LISTA_CABALLOS.map((h, idx) => (
          <GreenLane
            key={h.n}
            caballo={h}
            dark={idx % 2 === 0}
            progress={posSV[idx]}
            lider={lider}
            win={ganador === h.n}
            trackW={w}
          />
        ))}
        {/* meta a cuadros (der), cruzando las 4 franjas */}
        <View style={styles.metaCol} pointerEvents="none">
          <CheckeredTall />
        </View>
      </View>
      <Valla />
      <View style={styles.dirt} />
    </View>
  );
}

function Valla() {
  return <View style={styles.valla} />;
}

function GreenLane({ caballo, dark, progress, lider, win, trackW }: {
  caballo: Caballo;
  dark: boolean;
  progress: SharedValue<number>;
  lider: SharedValue<number>;
  win: boolean;
  trackW: number;
}) {
  const travel = Math.max(0, trackW - 96);
  const moveStyle = useAnimatedStyle(() => ({ transform: [{ translateX: progress.value * travel }] }));
  // Resaltado del líder en vivo: borde interior blanco que aparece/desaparece.
  const liderStyle = useAnimatedStyle(() => {
    const esLider = lider.value === caballo.n ? 1 : 0;
    return {
      borderColor: interpolateColor(esLider, [0, 1], ['rgba(255,255,255,0)', '#FFFFFF']),
      borderWidth: 2.5 * esLider,
    };
  });

  return (
    <View style={[styles.lane, { backgroundColor: dark ? '#4D9E6A' : '#7FC79A' }]}>
      <Animated.View style={[styles.laneLider, liderStyle]} pointerEvents="none" />
      {/* Cajón de salida: rectángulo del color del caballo con su dorsal */}
      <View style={[styles.laneStart, { backgroundColor: caballo.color }]}>
        <Text style={styles.laneStartNum}>{caballo.n}</Text>
      </View>
      <Animated.View style={[styles.laneHorse, moveStyle]}>
        {!win && <SpeedLines color="#FFFFFF" />}
        <Caballito size={34} />
      </Animated.View>
      {win && <Text style={styles.laneCorona}>👑</Text>}
    </View>
  );
}

// Líneas de velocidad detrás del caballo: tres trazos que se desvanecen hacia
// atrás en bucle, dando sensación de carrera.
function SpeedLines({ color }: { color: string }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(withTiming(1, { duration: 380, easing: Easing.out(Easing.quad) }), -1, false);
    return () => cancelAnimation(p);
  }, [p]);
  const l1 = useAnimatedStyle(() => {
    const f = p.value % 1;
    return { opacity: 0.55 * (1 - f), transform: [{ translateX: -10 * f }] };
  });
  const l2 = useAnimatedStyle(() => {
    const f = (p.value + 0.33) % 1;
    return { opacity: 0.55 * (1 - f), transform: [{ translateX: -10 * f }] };
  });
  const l3 = useAnimatedStyle(() => {
    const f = (p.value + 0.66) % 1;
    return { opacity: 0.55 * (1 - f), transform: [{ translateX: -10 * f }] };
  });
  return (
    <View style={styles.speedWrap} pointerEvents="none">
      <Animated.View style={[styles.speedLine, { backgroundColor: color, width: 16, top: 4 }, l1]} />
      <Animated.View style={[styles.speedLine, { backgroundColor: color, width: 12, top: 13 }, l2]} />
      <Animated.View style={[styles.speedLine, { backgroundColor: color, width: 15, top: 22 }, l3]} />
    </View>
  );
}

// Meta a cuadros vertical: cruza las 4 franjas verdes de extremo a extremo.
function CheckeredTall() {
  return (
    <View style={styles.metaInner}>
      {Array.from({ length: 16 }).map((_, r) => (
        <View key={r} style={styles.metaRow}>
          <View style={{ flex: 1, backgroundColor: r % 2 === 0 ? '#111' : '#fff' }} />
          <View style={{ flex: 1, backgroundColor: r % 2 === 0 ? '#fff' : '#111' }} />
        </View>
      ))}
    </View>
  );
}

function ProgresoFill({ pct }: { pct: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({ width: `${pct.value * 100}%` }));
  return (
    <Animated.View style={[styles.progresoFill, style]}>
      <LinearGradient
        colors={gradients.purple.colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ flex: 1 }}
      />
    </Animated.View>
  );
}

function LiveBadge() {
  const op = useSharedValue(0.4);
  useEffect(() => {
    op.value = withRepeat(
      withSequence(withTiming(1, { duration: 550 }), withTiming(0.3, { duration: 550 })),
      -1,
      true
    );
    return () => cancelAnimation(op);
  }, [op]);
  const dot = useAnimatedStyle(() => ({ opacity: op.value }));
  return (
    <View style={styles.live}>
      <Animated.View style={[styles.liveDot, dot]} />
      <Text style={styles.liveText}>EN DIRECTO</Text>
    </View>
  );
}

// ——— Reparto: un acertante manda beber el doble de lo apostado —————————

function RepartoTurno({
  winner,
  jugadores,
  recibidosPrevios,
  indice,
  total,
  insetsTop,
  insetsBottom,
  onConfirm,
}: {
  winner: ResultadoJugador;
  jugadores: string[];
  recibidosPrevios: Record<number, number>;
  indice: number;
  total: number;
  insetsTop: number;
  insetsBottom: number;
  onConfirm: (objetivos: number[]) => void;
}) {
  const { session } = useSession();
  const [objetivos, setObjetivos] = useState<number[]>([]);
  const restante = winner.reparte - objetivos.length;
  const h = CABALLOS[winner.caballo];
  const otros = jugadores.map((_, i) => i).filter((i) => i !== winner.index);
  const countFor = (i: number) => (recibidosPrevios[i] ?? 0) + objetivos.filter((o) => o === i).length;

  return (
    <View style={{ flex: 1, paddingTop: insetsTop + 10 }}>
      <View style={styles.repHead}>
        <Overline color={h.color}>{`REPARTE ${indice + 1}/${total}`}</Overline>
        <View style={styles.repNameRow}>
          <Dorsal caballo={h} size={28} />
          <Text style={styles.repName} numberOfLines={1}>
            {winner.nombre}
          </Text>
        </View>
        <Text style={styles.repSub}>
          Acertó y reparte <Text style={{ fontFamily: fonts.bodyX, color: h.color }}>{winner.reparte} {emoji(session.tono, '🥃')}</Text>{' '}
          (el doble de lo apostado). Toca a quién mandar {verbo(session.tono, 'beber')}.
        </Text>
      </View>

      <View style={styles.repContador}>
        <Text style={[styles.repContadorNum, { color: restante > 0 ? colors.ink : '#16A34A' }]}>{restante}</Text>
        <Text style={styles.repContadorLbl}>{restante > 0 ? 'por repartir' : `¡Todo repartido, a ${verbo(session.tono, 'beber')}!`}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.repLista} showsVerticalScrollIndicator={false}>
        {otros.map((i) => {
          const c = countFor(i);
          return (
            <PressableScale
              key={i}
              onPress={() => restante > 0 && setObjetivos((o) => [...o, i])}
              disabled={restante <= 0}
              scaleTo={0.97}
              style={[styles.repChip, c > 0 && { borderColor: h.color, backgroundColor: h.soft }]}>
              <Text style={styles.repChipName} numberOfLines={1}>
                {jugadores[i]}
              </Text>
              <View style={[styles.repBadge, { backgroundColor: c > 0 ? h.color : colors.ghost }]}>
                <Text style={[styles.repBadgeTxt, { color: c > 0 ? colors.white : colors.grayLt }]}>{c} {emoji(session.tono, '🥃')}</Text>
              </View>
            </PressableScale>
          );
        })}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insetsBottom + 14, gap: 9 }]}>
        {objetivos.length > 0 && (
          <SecondaryButton title="↩ Deshacer último" variant="ghost" onPress={() => setObjetivos((o) => o.slice(0, -1))} />
        )}
        <PrimaryButton
          title={
            restante > 0
              ? `Te quedan ${restante} por repartir`
              : indice >= total - 1
                ? 'Ver resultados'
                : 'Siguiente acertante'
          }
          onPress={() => onConfirm(objetivos)}
          disabled={restante > 0}
        />
      </View>
    </View>
  );
}

// Desglose dinámico de la bebida: junta los componentes con valor > 0 en un
// texto "X apostados + Y recibidos" y devuelve también el total a beber. Si en
// el futuro hay más componentes (penalizaciones, etc.), basta añadirlos aquí.
function desgloseBebida(componentes: { n: number; label: string }[]): { texto: string; total: number } {
  const activos = componentes.filter((c) => c.n > 0);
  const total = activos.reduce((s, c) => s + c.n, 0);
  return { texto: activos.map((c) => `${c.n} ${c.label}`).join(' + '), total };
}

// ——— Resultado ————————————————————————————————————————————————

function Resultado({
  jugadores,
  apuestas,
  ganador,
  recibidos,
  insetsBottom,
  enCompeticion,
  carreraNum,
  totalCarreras,
  onNueva,
  onSiguienteCarrera,
  onContinuar,
  onCambiar,
}: {
  jugadores: string[];
  apuestas: Apuesta[];
  ganador: number;
  recibidos: Record<number, number>;
  insetsBottom: number;
  enCompeticion: boolean;
  carreraNum: number;
  totalCarreras: number;
  onNueva: () => void;
  onSiguienteCarrera: () => void;
  onContinuar: () => void;
  onCambiar: () => void;
}) {
  const { session } = useSession();
  const h = CABALLOS[ganador];
  const { ganadores, perdedores } = calcularReparto(jugadores, apuestas, ganador);

  return (
    <>
      <Confetti cantidad={30} />
      <View style={styles.resHead}>
        <Overline color={h.color}>🏆 GANADOR</Overline>
        <Text style={styles.resCaballo}>🐎</Text>
        <View style={styles.resGanaRow}>
          <Dorsal caballo={h} size={32} />
          <Text style={[styles.resGana, { color: h.color }]}>Gana el {h.nombre}</Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.resLista} showsVerticalScrollIndicator={false}>
        {ganadores.length > 0 && (
          <>
            <Text style={[styles.secLabel, { color: '#16A34A' }]}>ACERTARON · REPARTEN</Text>
            <View style={styles.secGrupo}>
              {ganadores.map((g) => {
                const bebe = recibidos[g.index] ?? 0; // tragos que le repartieron otros ganadores
                return (
                  <View key={g.index} style={[styles.resRow, styles.resRowGood]}>
                    <View style={[styles.resTile, { backgroundColor: CABALLOS[g.caballo].soft }]}>
                      <Caballito size={22} />
                    </View>
                    <View style={styles.resNombreCol}>
                      <Text style={styles.resNombre} numberOfLines={1}>
                        {g.nombre}
                      </Text>
                      {bebe > 0 && (
                        <Text style={styles.resRecibio}>
                          Aun ganando, le repartieron {bebe} {emoji(session.tono)}
                        </Text>
                      )}
                    </View>
                    <View style={styles.resAccionCol}>
                      <View style={styles.resAccion}>
                        <Text style={[styles.resVerbo, { color: '#15803D' }]}>Repartió</Text>
                        <Text style={[styles.resNum, { color: '#16A34A' }]}>{g.reparte} {emoji(session.tono, '🥃')}</Text>
                      </View>
                      {bebe > 0 && (
                        <View style={styles.resAccion}>
                          <Text style={[styles.resVerbo, { color: '#B91C1C' }]}>{cap(verbo(session.tono, 'bebe'))}</Text>
                          <Text style={[styles.resNum, { color: '#DC2626' }]}>{bebe} {emoji(session.tono)}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}

        <Text style={[styles.secLabel, { color: '#DC2626' }]}>FALLARON · {verbo(session.tono, 'beben').toUpperCase()}</Text>
        <View style={styles.secGrupo}>
          {perdedores.length === 0 ? (
            <Text style={styles.vacio}>¡Todos acertaron! Nadie {verbo(session.tono, 'bebe')} 🎉</Text>
          ) : (
            perdedores.map((p) => {
              const { texto, total } = desgloseBebida([
                { n: p.chupitos, label: 'apostados' },
                { n: recibidos[p.index] ?? 0, label: 'recibidos' },
              ]);
              return (
                <View key={p.index} style={[styles.resRow, styles.resRowBad]}>
                  <View style={[styles.resTile, { backgroundColor: CABALLOS[p.caballo]?.soft ?? colors.ghost }]}>
                    <Caballito size={22} />
                  </View>
                  <View style={styles.resNombreCol}>
                    <Text style={styles.resNombre} numberOfLines={1}>
                      {p.nombre}
                    </Text>
                    <Text style={styles.resDesglose}>{texto}</Text>
                  </View>
                  <View style={styles.resAccion}>
                    <Text style={[styles.resVerbo, { color: '#B91C1C' }]}>{cap(verbo(session.tono, 'bebe'))}</Text>
                    <Text style={[styles.resNum, { color: '#DC2626' }]}>{total} {emoji(session.tono, '🥃')}</Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insetsBottom + 14, gap: 9 }]}>
        {enCompeticion ? (
          carreraNum < totalCarreras ? (
            <PrimaryButton
              title={`Siguiente carrera (${carreraNum}/${totalCarreras})`}
              onPress={onSiguienteCarrera}
            />
          ) : (
            <PrimaryButton title="Continuar" onPress={onContinuar} />
          )
        ) : (
          <>
            <PrimaryButton title="Nueva carrera" onPress={onNueva} />
            <SecondaryButton title="Cambiar de juego" variant="ghost" onPress={onCambiar} />
          </>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 22 },
  topSpacer: { flex: 1 },
  footer: { paddingHorizontal: 26, paddingTop: 10 },
  footerCentro: { alignItems: 'center' },
  empezarBtn: { alignSelf: 'center' },
  // apuestas
  apHead: { paddingHorizontal: 26, paddingTop: 6, paddingBottom: 12 },
  apTitle: { ...type.titleM, fontSize: 30, color: colors.ink, marginTop: 6 },
  apSub: { ...type.body, color: colors.gray, marginTop: 6 },
  apLista: { paddingHorizontal: 26, paddingBottom: 16, gap: 10 },
  betCard: {
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 14,
    ...shadows.card,
  },
  betTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  betNombre: { flex: 1, fontFamily: fonts.display, fontSize: 18, color: colors.ink, letterSpacing: -0.4 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnPlus: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepOff: { opacity: 0.4 },
  stepMinus: { fontFamily: fonts.display, fontSize: 18, color: colors.purple },
  stepPlus: { fontFamily: fonts.display, fontSize: 18, color: colors.white },
  stepNum: { fontFamily: fonts.display, fontSize: 22, color: colors.ink, minWidth: 26, textAlign: 'center' },
  stepLabel: { fontSize: 16, marginLeft: 2 },
  horseRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  horseChip: {
    flex: 1,
    height: 56,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  // carrera (horizontal)
  carreraScreen: { flex: 1, backgroundColor: colors.surface },
  carreraHeadLand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 6,
  },
  live: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEE2E2',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  liveDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#EF4444' },
  liveText: { fontFamily: fonts.display, fontSize: 12, color: '#DC2626', letterSpacing: 0.5 },
  progresoTrackLand: { flex: 1, height: 6, backgroundColor: colors.lav100, borderRadius: 4, overflow: 'hidden' },
  progresoFill: { height: '100%', borderRadius: 4, overflow: 'hidden' },
  // pista por capas: tierra · valla · 4 franjas verdes · valla · tierra
  track: { flex: 1, overflow: 'hidden' },
  dirt: { height: 18, backgroundColor: '#B98A5E' },
  valla: { height: 4, backgroundColor: '#FFFFFF' },
  cesped: { flex: 1, overflow: 'hidden' },
  lane: { flex: 1, justifyContent: 'center', overflow: 'hidden' },
  laneLider: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 2, zIndex: 1 },
  laneStart: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 2,
    borderRightColor: 'rgba(255,255,255,0.9)',
    zIndex: 3,
  },
  laneStartNum: { fontFamily: fonts.display, fontSize: 15, color: colors.white },
  laneHorse: { position: 'absolute', left: 34, top: 0, bottom: 0, justifyContent: 'center', zIndex: 2 },
  laneCorona: { position: 'absolute', right: 32, top: 2, fontSize: 16, zIndex: 3 },
  metaCol: { position: 'absolute', right: 8, top: 0, bottom: 0, width: 18, borderRadius: 2, overflow: 'hidden', zIndex: 1 },
  metaInner: { flex: 1 },
  metaRow: { flexDirection: 'row', flex: 1 },
  speedWrap: { position: 'absolute', left: -18, top: 3, width: 18, height: 26 },
  speedLine: { position: 'absolute', height: 3, borderRadius: 2, right: 0 },
  // resultado
  resHead: { paddingHorizontal: 26, paddingTop: 4, paddingBottom: 18, alignItems: 'center' },
  resCaballo: { fontSize: 86, transform: [{ scaleX: -1 }] },
  resGanaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  resGana: { fontFamily: fonts.display, fontSize: 34, letterSpacing: -1.2 },
  resLista: { paddingHorizontal: 24, paddingBottom: 10 },
  secLabel: { fontFamily: fonts.bodyX, fontSize: 11, letterSpacing: 2, marginBottom: 8, marginTop: 6 },
  secGrupo: { gap: 8, marginBottom: 14 },
  resRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  resRowGood: { backgroundColor: '#F0FDF4', borderColor: '#86EFAC' },
  resRowBad: { backgroundColor: colors.white, borderColor: colors.border },
  resTile: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  resNombreCol: { flex: 1 },
  resNombre: { fontFamily: fonts.display, fontSize: 17, color: colors.ink },
  resRecibio: { fontFamily: fonts.bodyBold, fontSize: 11, color: '#B45309', marginTop: 1 },
  resDesglose: { fontFamily: fonts.bodyBold, fontSize: 11.5, color: colors.gray, marginTop: 2 },
  resAccion: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  resAccionCol: { alignItems: 'flex-end', gap: 3 },
  // reparto
  repHead: { paddingHorizontal: 26, paddingTop: 6, paddingBottom: 8 },
  repNameRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  repName: { flex: 1, fontFamily: fonts.display, fontSize: 30, color: colors.ink, letterSpacing: -1 },
  repSub: { fontFamily: fonts.body, fontSize: 13, color: colors.gray, marginTop: 8, lineHeight: 19 },
  repContador: { alignItems: 'center', paddingVertical: 6 },
  repContadorNum: { fontFamily: fonts.display, fontSize: 52, letterSpacing: -2, includeFontPadding: false },
  repContadorLbl: { fontFamily: fonts.bodyX, fontSize: 11, letterSpacing: 1.5, color: colors.grayLt, marginTop: -2 },
  repLista: { paddingHorizontal: 24, paddingBottom: 10, gap: 9 },
  repChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  repChipName: { flex: 1, fontFamily: fonts.display, fontSize: 18, color: colors.ink, letterSpacing: -0.4 },
  repBadge: { minWidth: 44, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, alignItems: 'center' },
  repBadgeTxt: { fontFamily: fonts.bodyX, fontSize: 13 },
  resVerbo: { fontFamily: fonts.bodyBold, fontSize: 13 },
  resNum: { fontFamily: fonts.display, fontSize: 22 },
  vacio: { fontFamily: fonts.body, fontSize: 13.5, color: colors.gray, textAlign: 'center', paddingVertical: 10 },
});
