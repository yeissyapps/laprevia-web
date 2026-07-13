// La Bomba · Juego — fondo negro, bomba con mecha oculta (tiempo aleatorio),
// pasar el móvil y explosión con tragos aleatorios. Estados: inicio → jugando
// → explosion → rondas.

import { LinearGradient } from 'expo-linear-gradient';
import { useKeepAwake } from 'expo-keep-awake';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
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
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Bomba } from '@/components/Bomba';
import { RulesButton } from '@/components/GameRules';
import { PressableScale } from '@/components/PressableScale';
import { SessionMenu, SessionMenuButton } from '@/components/SessionMenu';
import { useSession } from '@/context/SessionContext';
import {
  CONFIG_MECHA,
  mazoBomba,
  nivelMecha,
  tiempoBombaMs,
  tragosBomba,
  type NivelMecha,
  type SeleccionBomba,
} from '@/data/laBomba';
import { detenerTick, explosionSonido, iniciarTick, mechaCrackle, setSonidoHabilitado } from '@/utils/sonido';
import { emoji, pick, unidad, verbo } from '@/utils/textoTono';
import { colors, fonts, gradientAngle } from '@/theme/theme';

type Fase = 'inicio' | 'jugando' | 'explosion' | 'rondas';

const NEGRO = '#0A0A0A';
const MORADO = '#7C3AED';

function KeepAwake() {
  useKeepAwake();
  return null;
}

// Vibración solo en nativo (en web expo-haptics no aplica)
function vibrar(fn: () => Promise<void>) {
  if (Platform.OS !== 'web') fn().catch(() => {});
}

export default function LaBombaJugarScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, sumarTragos, registrarPartida } = useSession();
  const params = useLocalSearchParams<{ seleccion?: string }>();

  const seleccion = (params.seleccion ?? 'neutro') as SeleccionBomba;
  const jugadores = session.jugadores.length > 0 ? session.jugadores : ['Jugador 1', 'Jugador 2'];
  const enCompeticion = session.modo === 'competicion' || session.modo === 'escalada';

  const mazo = useMemo(() => mazoBomba(seleccion), [seleccion]);

  const TOTAL_COMPETICION = 15; // preguntas/bombas antes de pasar al siguiente juego

  const [fase, setFase] = useState<Fase>('inicio');
  const [nivel, setNivel] = useState<NivelMecha>('larga');
  const [pregIdx, setPregIdx] = useState(0);
  const [rondaComp, setRondaComp] = useState(0); // bombas jugadas en Competición
  const [booms, setBooms] = useState<Record<string, number>>({});
  const [tragosBoom, setTragosBoom] = useState(0);
  const [menuVisible, setMenuVisible] = useState(false);

  // Tiempo y tragos OCULTOS de la ronda
  const totalRef = useRef(0);
  const startRef = useRef(0);
  const tragosRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastBeepRef = useRef(0);
  const pausedElapsedRef = useRef<number | null>(null); // ms elapsed al pausar
  const bombaEnCursoAlPausarRef = useRef(false);

  // Una sola categoría por ronda: el móvil se pasa físicamente, no cambia hasta
  // que explota. ronda solo rota qué categoría sale en cada bomba nueva.
  const pregunta = mazo[pregIdx % mazo.length];

  useEffect(() => {
    setSonidoHabilitado(session.sonidoActivado);
  }, [session.sonidoActivado]);

  const pararBomba = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    detenerTick();
  };

  useEffect(() => () => pararBomba(), []);

  const explotar = () => {
    pararBomba();
    vibrar(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
    vibrar(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
    explosionSonido();
    setTragosBoom(tragosRef.current);
    // No sabemos quién la tenía (se pasa físicamente): se elige al explotar.
    setFase('explosion');
  };

  // Tras el boom, el grupo marca a quién le explotó (atribución + competición)
  const asignarCulpable = (idx: number) => {
    const nombre = jugadores[idx];
    setBooms((b) => ({ ...b, [nombre]: (b[nombre] ?? 0) + 1 }));
    if (enCompeticion) {
      sumarTragos(idx, tragosBoom);
      // En Competición se juegan 15 bombas seguidas antes de pasar al siguiente juego.
      if (rondaComp + 1 >= TOTAL_COMPETICION) {
        router.replace('/fin-juego');
        return;
      }
      setRondaComp((r) => r + 1);
      setPregIdx((i) => i + 1);
      setFase('inicio');
      return;
    }
    setFase('rondas');
  };

  const tick = () => {
    const elapsed = Date.now() - startRef.current;
    const frac = Math.max(0, 1 - elapsed / totalRef.current);
    const nuevoNivel = nivelMecha(frac);
    setNivel((prev) => (prev === nuevoNivel ? prev : nuevoNivel));

    // Chisporroteo que acelera (gap 520ms → 80ms) + vibración en zona roja
    const now = Date.now();
    const gap = 520 - 440 * (1 - frac);
    if (now - lastBeepRef.current >= gap) {
      lastBeepRef.current = now;
      mechaCrackle();
      if (nuevoNivel === 'corta' && session.sonidoActivado) {
        vibrar(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
      }
    }

    if (frac <= 0) explotar();
  };

  const encender = () => {
    totalRef.current = tiempoBombaMs();
    tragosRef.current = tragosBomba();
    startRef.current = Date.now();
    lastBeepRef.current = 0;
    setNivel('larga');
    setFase('jugando');
    pararBomba();
    iniciarTick(totalRef.current / 1000);
    intervalRef.current = setInterval(tick, 110);
  };

  const abrirMenu = () => {
    if (fase === 'jugando') {
      pausedElapsedRef.current = Date.now() - startRef.current;
      pararBomba();
      bombaEnCursoAlPausarRef.current = true;
    }
    setMenuVisible(true);
  };
  const cerrarMenu = () => {
    setMenuVisible(false);
    if (bombaEnCursoAlPausarRef.current) {
      bombaEnCursoAlPausarRef.current = false;
      startRef.current = Date.now() - (pausedElapsedRef.current ?? 0);
      const remaining = Math.max(0, (totalRef.current - (pausedElapsedRef.current ?? 0)) / 1000);
      pausedElapsedRef.current = null;
      lastBeepRef.current = Date.now(); // evita chisporroteo inmediato al reanudar
      iniciarTick(remaining);
      intervalRef.current = setInterval(tick, 110);
    }
  };

  const nuevaBomba = () => {
    setPregIdx((i) => i + 1);
    setFase('inicio');
  };

  const reiniciarJuego = () => {
    pararBomba();
    setBooms({});
    setPregIdx(0);
    setRondaComp(0);
    setFase('inicio');
  };

  const danger = fase === 'jugando' && nivel === 'corta';

  return (
    <View style={styles.screen}>
      {Platform.OS !== 'web' && <KeepAwake />}
      {danger && <TinteRojo />}

      {/* Cabecera: menú + reglas (no en la explosión) */}
      {fase !== 'explosion' && (
        <View style={[styles.top, { paddingTop: insets.top + 10 }]}>
          {enCompeticion ? (
            <View style={styles.topSpacer}>
              <View style={styles.compPill}>
                <Text style={styles.compPillText}>💣 {Math.min(rondaComp + 1, TOTAL_COMPETICION)}/{TOTAL_COMPETICION}</Text>
              </View>
            </View>
          ) : (
            <View style={styles.topSpacer} />
          )}
          <RulesButton juegoId="la-bomba" />
          <SessionMenuButton onPress={abrirMenu} onColor />
        </View>
      )}

      {/* ——— INICIO ——— */}
      {fase === 'inicio' && (
        <>
          <View style={styles.centro}>
            <View style={styles.inicioHead}>
              <Text style={styles.inicioOver}>PÁSALA ANTES DE QUE…</Text>
              <Text style={styles.inicioTitulo}>
                La <Text style={{ color: MORADO }}>Bomba</Text>
              </Text>
            </View>
            <Bomba fuse="larga" size={212} />
            <Text style={styles.inicioDesc}>
              Responde rápido y pasa el móvil. A quien le explote…{' '}
              <Text style={styles.inicioDescFuerte}>{verbo(session.tono, 'bebe')}</Text>.
            </Text>
          </View>
          <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
            <FireBtn label="Encender mecha  🔥" onPress={encender} />
          </View>
        </>
      )}

      {/* ——— JUGANDO ——— */}
      {fase === 'jugando' && (
        <>
          <View style={styles.tieneBlock}>
            <Text style={[styles.tieneOver, danger && { color: '#FF6A4D' }]}>CATEGORÍA</Text>
          </View>
          <View style={styles.bombaArea}>
            <BombaAnimada nivel={nivel} />
            <Text style={styles.pregunta}>{pick(pregunta.texto, pregunta.textoChill, session.tono)}</Text>
          </View>
          <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
            <Text style={[styles.pasaHint, danger && { color: '#FF8A6B' }]}>
              Responde algo y pásala rápido 💣{'\n'}A quien le explote… {verbo(session.tono, 'bebe')}
            </Text>
          </View>
        </>
      )}

      {/* ——— EXPLOSIÓN ——— */}
      {fase === 'explosion' && (
        <LinearGradient
          colors={['#FFE36B', '#FF8A1F', '#FF3D1A', '#C01018']}
          locations={[0, 0.28, 0.52, 1]}
          style={styles.explosionFill}>
          <BurstRays />
          <View style={[styles.explosionCentro, { paddingTop: insets.top }]}>
            <Animated.Text entering={FadeIn.duration(150)} style={styles.boomEmoji}>
              💥
            </Animated.Text>
            <Animated.Text entering={FadeIn.duration(200)} style={styles.boomTitulo}>
              ¡BOOM!
            </Animated.Text>
            <View style={styles.boomPill}>
              <Text style={styles.boomTragos}>
                Quien la tuviera {verbo(session.tono, 'bebe')}{' '}
                <Text style={styles.boomTragosNum}>{tragosBoom}</Text> {unidad(session.tono, tragosBoom)} {emoji(session.tono)}
              </Text>
            </View>
          </View>
          <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
            <Text style={styles.culpableLabel}>¿A quién le explotó?</Text>
            <View style={styles.culpableGrid}>
              {jugadores.map((nombre, i) => (
                <PressableScale
                  key={i}
                  onPress={() => asignarCulpable(i)}
                  scaleTo={0.95}
                  style={styles.culpableChip}>
                  <Text style={styles.culpableNombre} numberOfLines={1}>
                    {nombre}
                  </Text>
                </PressableScale>
              ))}
            </View>
          </View>
        </LinearGradient>
      )}

      {/* ——— ENTRE RONDAS ——— */}
      {fase === 'rondas' && (
        <Marcador
          jugadores={jugadores}
          booms={booms}
          insetsBottom={insets.bottom}
          onNueva={nuevaBomba}
          onFin={() => {
            // La Bomba en Libre termina aquí (no pasa por fin-juego): cuenta como completada.
            registrarPartida();
            router.replace('/juegos');
          }}
        />
      )}

      <SessionMenu visible={menuVisible} onClose={cerrarMenu} onReiniciar={reiniciarJuego} />
    </View>
  );
}

// ——— Bomba con pulso (media) / vibración (corta) ————————————————

function BombaAnimada({ nivel }: { nivel: NivelMecha }) {
  const pulse = useSharedValue(1);
  const shake = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(pulse);
    cancelAnimation(shake);
    pulse.value = 1;
    shake.value = 0;
    if (nivel === 'media') {
      pulse.value = withRepeat(
        withSequence(withTiming(1.05, { duration: 520 }), withTiming(1, { duration: 520 })),
        -1,
        true
      );
    } else if (nivel === 'corta') {
      pulse.value = withRepeat(
        withSequence(withTiming(1.06, { duration: 300 }), withTiming(1, { duration: 300 })),
        -1,
        true
      );
      shake.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 55 }),
          withTiming(-1, { duration: 55 }),
          withTiming(0, { duration: 55 })
        ),
        -1,
        false
      );
    }
  }, [nivel, pulse, shake]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }, { translateX: shake.value * 5 }],
  }));

  return (
    <Animated.View style={style}>
      <Bomba fuse={nivel} size={CONFIG_MECHA[nivel].bombSize} />
    </Animated.View>
  );
}

// ——— Tinte rojo + borde parpadeante (zona de peligro) ———————————

function TinteRojo() {
  const op = useSharedValue(0.25);
  useEffect(() => {
    op.value = withRepeat(withTiming(1, { duration: 250, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => cancelAnimation(op);
  }, [op]);
  const style = useAnimatedStyle(() => ({ opacity: op.value }));
  return (
    <>
      <View pointerEvents="none" style={styles.tinteRadial} />
      <Animated.View pointerEvents="none" style={[styles.bordeRojo, style]} />
    </>
  );
}

// ——— Rayos de explosión ————————————————————————————————————————

function BurstRays() {
  return (
    <View pointerEvents="none" style={styles.rays}>
      {Array.from({ length: 18 }).map((_, i) => (
        <View key={i} style={[styles.ray, { transform: [{ rotate: `${i * 20}deg` }] }]} />
      ))}
    </View>
  );
}

// ——— Marcador entre rondas ——————————————————————————————————————

function Marcador({
  jugadores,
  booms,
  insetsBottom,
  onNueva,
  onFin,
}: {
  jugadores: string[];
  booms: Record<string, number>;
  insetsBottom: number;
  onNueva: () => void;
  onFin: () => void;
}) {
  const tabla = jugadores
    .map((n) => ({ name: n, booms: booms[n] ?? 0 }))
    .sort((a, b) => b.booms - a.booms);
  const max = Math.max(0, ...tabla.map((s) => s.booms));

  return (
    <>
      <View style={styles.marcadorHead}>
        <Text style={styles.marcadorOver}>MARCADOR</Text>
        <Text style={styles.marcadorTitulo}>¿Quién explota más?</Text>
      </View>
      <View style={styles.marcadorLista}>
        {tabla.map((s, i) => {
          const lead = s.booms === max && max > 0;
          return (
            <View key={s.name} style={[styles.fila, lead ? styles.filaLead : styles.filaNorm]}>
              <Text style={[styles.filaPos, { color: lead ? '#C4B5FD' : 'rgba(255,255,255,0.4)' }]}>
                {i + 1}
              </Text>
              <Text style={styles.filaNombre} numberOfLines={1}>
                {s.name}
              </Text>
              <Text style={[styles.filaBooms, { color: lead ? '#FF6A4D' : colors.white }]}>
                {s.booms} 💥
              </Text>
            </View>
          );
        })}
      </View>
      <View style={[styles.footer, { paddingBottom: insetsBottom + 14, gap: 10 }]}>
        <FireBtn label="Nueva bomba  💣" purple onPress={onNueva} />
        <PressableScale onPress={onFin} scaleTo={0.97} style={styles.finBtn}>
          <Text style={styles.finBtnText}>Fin del juego</Text>
        </PressableScale>
      </View>
    </>
  );
}

function FireBtn({ label, onPress, purple }: { label: string; onPress: () => void; purple?: boolean }) {
  return (
    <PressableScale onPress={onPress} scaleTo={0.965}>
      <LinearGradient
        colors={purple ? ['#9D6BFF', '#7C3AED'] : ['#FF8A3D', '#FF5A1F', '#E11D2A']}
        start={gradientAngle.start}
        end={gradientAngle.end}
        style={[styles.fireBtn, { height: purple ? 72 : 78 }]}>
        <Text style={styles.fireBtnText}>{label}</Text>
      </LinearGradient>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: NEGRO },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 22,
  },
  topSpacer: { flex: 1, justifyContent: 'center' },
  compPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  compPillText: { fontFamily: fonts.bodyX, fontSize: 13, color: colors.white },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  // inicio
  inicioHead: { alignItems: 'center', marginBottom: 26 },
  inicioOver: {
    fontFamily: fonts.bodyX,
    fontSize: 13,
    letterSpacing: 4,
    color: '#FF5A1F',
  },
  inicioTitulo: {
    fontFamily: fonts.display,
    fontSize: 56,
    color: colors.white,
    letterSpacing: -2.5,
    marginTop: 4,
  },
  inicioDesc: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 270,
    marginTop: 18,
  },
  inicioDescFuerte: { color: colors.white, fontFamily: fonts.bodyX },
  // jugando
  tieneBlock: { alignItems: 'center', paddingTop: 4 },
  tieneOver: {
    fontFamily: fonts.bodyX,
    fontSize: 13,
    letterSpacing: 3,
    color: 'rgba(255,255,255,0.5)',
  },
  bombaArea: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  pregunta: {
    fontFamily: fonts.display,
    fontSize: 30,
    color: colors.white,
    letterSpacing: -0.7,
    textAlign: 'center',
    lineHeight: 35,
    paddingHorizontal: 28,
  },
  pasaHint: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    lineHeight: 20,
  },
  // explosion
  explosionFill: { flex: 1 },
  explosionCentro: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 26 },
  boomEmoji: { fontSize: 72 },
  boomTitulo: {
    fontFamily: fonts.display,
    fontSize: 76,
    color: colors.white,
    letterSpacing: -3,
    marginTop: -4,
  },
  boomPill: {
    marginTop: 22,
    backgroundColor: 'rgba(0,0,0,0.28)',
    paddingVertical: 14,
    paddingHorizontal: 26,
    borderRadius: 24,
    alignItems: 'center',
  },
  boomTragos: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.white,
    textAlign: 'center',
  },
  boomTragosNum: { fontFamily: fonts.display, fontSize: 20 },
  culpableLabel: {
    fontFamily: fonts.bodyX,
    fontSize: 13,
    letterSpacing: 1,
    color: colors.white,
    textAlign: 'center',
    marginBottom: 12,
  },
  culpableGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 9,
  },
  culpableChip: {
    backgroundColor: 'rgba(0,0,0,0.32)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 18,
    minWidth: 96,
    alignItems: 'center',
  },
  culpableNombre: {
    fontFamily: fonts.display,
    fontSize: 19,
    color: colors.white,
    letterSpacing: -0.5,
    maxWidth: 130,
  },
  // rondas
  marcadorHead: { paddingHorizontal: 28, paddingTop: 10, paddingBottom: 14 },
  marcadorOver: {
    fontFamily: fonts.bodyX,
    fontSize: 12,
    letterSpacing: 3,
    color: 'rgba(255,255,255,0.5)',
  },
  marcadorTitulo: {
    fontFamily: fonts.display,
    fontSize: 30,
    color: colors.white,
    letterSpacing: -1.2,
    marginTop: 4,
  },
  marcadorLista: { flex: 1, paddingHorizontal: 24, gap: 10 },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 18,
    borderRadius: 18,
    borderWidth: 1.5,
  },
  filaLead: { backgroundColor: 'rgba(124,58,237,0.18)', borderColor: MORADO },
  filaNorm: { backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.08)' },
  filaPos: { fontFamily: fonts.display, fontSize: 16, minWidth: 22 },
  filaNombre: { flex: 1, fontFamily: fonts.display, fontSize: 20, color: colors.white, letterSpacing: -0.5 },
  filaBooms: { fontFamily: fonts.display, fontSize: 22 },
  finBtn: {
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  finBtnText: { fontFamily: fonts.bodyBold, fontSize: 15, color: 'rgba(255,255,255,0.8)' },
  // comunes
  footer: { paddingHorizontal: 24, paddingTop: 8 },
  fireBtn: { borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  fireBtnText: { fontFamily: fonts.display, fontSize: 23, color: colors.white, letterSpacing: -0.3 },
  // overlays peligro
  tinteRadial: {
    position: 'absolute',
    top: '14%',
    left: '-25%',
    right: '-25%',
    height: '60%',
    borderRadius: 400,
    backgroundColor: 'rgba(220,38,38,0.16)',
  },
  bordeRojo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 5,
    borderColor: '#DC2626',
    zIndex: 5,
  },
  // explosion rays
  rays: { position: 'absolute', top: '40%', left: '50%' },
  ray: {
    position: 'absolute',
    width: 4,
    height: 300,
    marginLeft: -2,
    marginTop: -150,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
});
