// Oca Borracha — tablero compartido de 45 casillas en zigzag con sendero SVG,
// fichas que avanzan casilla a casilla, vista grande de casilla y meta dorada.

import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
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
import Svg, { Path } from 'react-native-svg';

import { Confetti } from '@/components/Confetti';
import { RulesButton } from '@/components/GameRules';
import { Overline } from '@/components/Overline';
import { PickerJugadores } from '@/components/PickerJugadores';
import { PressableScale } from '@/components/PressableScale';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SecondaryButton } from '@/components/SecondaryButton';
import { SessionMenu, SessionMenuButton } from '@/components/SessionMenu';
import { useSession } from '@/context/SessionContext';
import { cap, conTono, emoji, unidad, verbo } from '@/utils/textoTono';

// Overrides Chill de las casillas que dependen del acto físico de beber
// (reformuladas con el mismo espíritu, no swap literal). El resto se transforma
// en runtime con `conTono`/`chillTexto`.
const OCA_CHILL: Record<number, { summary?: string; title?: string; detail?: string }> = {
  1: { summary: 'Suma 1', title: 'Suma 1 punto', detail: 'Te toca. +1 al marcador 🎯' },
  6: { summary: 'Punto + giro', title: 'Punto y 2 vueltas', detail: 'Suma 1 punto y da 2 vueltas sobre ti mismo.' },
  10: { summary: '3 de golpe', title: 'Golpe seco', detail: 'Te caen 3 puntos de golpe. Ay.' },
  19: { summary: 'Suma 1', title: 'Suma 1 punto', detail: 'Otro punto para tu marcador. 🎯' },
  24: { summary: 'Reto', title: 'Sin parpadear', detail: 'Aguanta 10 segundos sin parpadear. Si fallas, suma 1 punto.' },
  32: { summary: 'Sin «punto»', title: 'Prohibido «punto»', detail: 'No puedes decir la palabra «punto» hasta tu próximo turno. Quien te pille, tú sumas 1.' },
  40: { summary: 'Reto', title: 'Sin dientes', detail: 'Habla sin abrir los dientes 20 segundos. Si fallas, suma 1 punto.' },
  45: { detail: 'Llegas el primero y te coronas. ¡GANASTE! 🏆' },
};
import {
  BOARD,
  BOARD_H,
  BOARD_W,
  CAT_STYLE,
  CELL,
  CENTERS,
  FICHA_COLORES,
  PATH_D,
  capturaDe,
  inicial,
  type CellDef,
} from '@/data/oca';
import { colors, fonts, gradientAngle, gradients, shadows } from '@/theme/theme';

interface Ficha {
  name: string;
  key: string;
  color: string;
  pos: number;
}

function KeepAwake() {
  useKeepAwake();
  return null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const vibrar = (fn: () => Promise<void>) => {
  if (Platform.OS !== 'web') fn().catch(() => {});
};

export default function OcaBorrachaScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { session, sumarTragos, registrarPartida } = useSession();

  const nombres = session.jugadores.length > 0 ? session.jugadores : ['Jugador 1', 'Jugador 2'];

  const [fichas, setFichas] = useState<Ficha[]>(() =>
    nombres.map((n, i) => ({ name: n, key: inicial(n), color: FICHA_COLORES[i % FICHA_COLORES.length], pos: 1 }))
  );
  const fichasRef = useRef(fichas);
  fichasRef.current = fichas;

  // Si se añade un jugador desde el menú de sesión, se le crea su ficha (en la
  // salida). Quitar jugadores lo gestiona eliminarFicha (onJugadorEliminado).
  useEffect(() => {
    setFichas((prev) => {
      if (nombres.length <= prev.length) return prev;
      const extra = nombres.slice(prev.length).map((n, i) => ({
        name: n,
        key: inicial(n),
        color: FICHA_COLORES[(prev.length + i) % FICHA_COLORES.length],
        pos: 1,
      }));
      return [...prev, ...extra];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nombres.length]);

  const [turno, setTurno] = useState(0);
  const [rodando, setRodando] = useState(false);
  const [dado, setDado] = useState(1);
  const [openCell, setOpenCell] = useState<CellDef | null>(null);
  const [yaSalto, setYaSalto] = useState(false);
  // Resultado del dado par/impar de la casilla 23 (null = aún no tirado)
  const [dado23Par, setDado23Par] = useState<boolean | null>(null);
  const [ganadorIdx, setGanadorIdx] = useState<number | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);

  const cur = fichas[turno] ?? fichas[0];

  // Escala para que el tablero ocupe el máximo espacio disponible (ancho y alto).
  // Reservamos solo lo justo para cabecera (turno) y pie (dado), sin holgura
  // muerta, y permitimos crecer algo por encima del tamaño nativo (cap 1.18).
  const escala = useMemo(() => {
    const dispW = width - 12;
    const dispH = height - insets.top - insets.bottom - 172;
    return Math.min(dispW / BOARD_W, dispH / BOARD_H, 1.3);
  }, [width, height, insets.top, insets.bottom]);

  // Escalada: límite de 12 minutos para partidas con duracion 'partida_completa_o_12min'
  const escaladaDuracion = session.modo === 'escalada'
    ? session.competicion?.duraciones?.[session.competicion?.rondaActual ?? 0]
    : null;
  const timerStart = useRef(Date.now());
  useEffect(() => {
    if (escaladaDuracion !== 'partida_completa_o_12min') return;
    timerStart.current = Date.now();
    const id = setInterval(() => {
      if (Date.now() - timerStart.current >= 12 * 60 * 1000) {
        clearInterval(id);
        router.replace('/fin-juego');
      }
    }, 15_000);
    return () => clearInterval(id);
  }, [escaladaDuracion]);

  const tokensEn = (n: number) =>
    fichas.filter((f) => f.pos === n).map((f) => ({ key: f.key, color: f.color }));

  const pasarTurno = () => {
    setTurno((t) => {
      const list = fichasRef.current;
      const n = list.length;
      for (let k = 1; k <= n; k++) {
        const nx = (t + k) % n;
        if (list[nx].pos < 45) return nx;
      }
      return t;
    });
  };

  // Aplica la acción de una casilla recién alcanzada y abre su vista grande.
  const llegarA = (n: number, esSalto: boolean) => {
    const cell = BOARD[n - 1];
    if (n === 45) {
      sumarTragos(turno, 5);
      setGanadorIdx(turno); // la partida termina con el primer ganador
      // En Libre cuenta como juego completado (en Competición/Escalada ya cuenta fin-juego).
      if (session.modo !== 'competicion' && session.modo !== 'escalada') registrarPartida();
      return;
    }
    if (cell.tragos) sumarTragos(turno, cell.tragos);
    setYaSalto(esSalto);
    setOpenCell(cell);
  };

  const tirar = async () => {
    if (rodando || openCell || ganadorIdx !== null) return;
    vibrar(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
    setRodando(true);
    const d = 1 + Math.floor(Math.random() * 6);
    for (let k = 0; k < 8; k++) {
      setDado(1 + Math.floor(Math.random() * 6));
      await sleep(55);
    }
    setDado(d);
    await sleep(200);
    const start = fichasRef.current[turno].pos;
    const landed = Math.min(45, start + d);
    for (let p = start + 1; p <= landed; p++) {
      setFichas((fs) => fs.map((f, i) => (i === turno ? { ...f, pos: p } : f)));
      await sleep(220);
    }
    setRodando(false);
    llegarA(landed, false);
  };

  // Casilla 23 (par/impar): el dado ya aplicó "bebes 2" si fue par; si fue impar
  // (repartes), en Competición abrimos el picker. Llamado al tirar el dado.
  const resolverDado23 = (esPar: boolean) => {
    setDado23Par(esPar);
    if (esPar) sumarTragos(turno, 2);
  };

  const cellDone = () => {
    const cell = openCell;
    if (!cell) return;
    // Salto/putadón aún sin mover → desplaza la ficha y abre la nueva casilla
    if (!yaSalto && (cell.type === 'salto' || cell.type === 'putadon')) {
      const dest = cell.type === 'putadon' ? 1 : cell.to ?? cell.n;
      setOpenCell(null);
      vibrar(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
      setFichas((fs) => fs.map((f, i) => (i === turno ? { ...f, pos: dest } : f)));
      setTimeout(() => llegarA(dest, true), 480);
      return;
    }
    // Casilla 23: solo se reparte (picker) si salió impar; el par ya bebió.
    if (cell.n === 23) {
      const repartir = dado23Par === false;
      setDado23Par(null);
      if (repartir && (session.modo === 'competicion' || session.modo === 'escalada') && capturaDe(cell.n)) {
        setPickerVisible(true);
        return;
      }
      setOpenCell(null);
      setYaSalto(false);
      pasarTurno();
      return;
    }
    // En Competición, capturar quién bebe en esta casilla (si aplica)
    if ((session.modo === 'competicion' || session.modo === 'escalada') && capturaDe(cell.n)) {
      setPickerVisible(true);
      return;
    }
    setOpenCell(null);
    setYaSalto(false);
    pasarTurno();
  };

  const cerrarPicker = () => {
    setPickerVisible(false);
    setOpenCell(null);
    setYaSalto(false);
    pasarTurno();
  };

  // Eliminar jugador desde el menú: quita su ficha del tablero y lo saca de la
  // rotación de turnos. Reajusta el índice de turno para no saltarse a nadie.
  const eliminarFicha = (index: number) => {
    const prevLen = fichasRef.current.length;
    const newLen = prevLen - 1;
    setFichas((prev) => prev.filter((_, i) => i !== index));
    setTurno((t) => {
      if (newLen <= 0) return 0;
      const nt = index < t ? t - 1 : t; // si eliminamos a alguien antes, baja 1
      return nt % newLen; // si era el último/actual, envuelve al primero
    });
  };

  const reiniciarJuego = () => {
    setFichas(nombres.map((n, i) => ({ name: n, key: inicial(n), color: FICHA_COLORES[i % FICHA_COLORES.length], pos: 1 })));
    setTurno(0);
    setOpenCell(null);
    setYaSalto(false);
    setGanadorIdx(null);
    setRodando(false);
  };

  // ——— Pantalla de victoria (primer ganador) ———
  if (ganadorIdx !== null) {
    const g = fichas[ganadorIdx];
    return (
      <View style={styles.flex}>
        {Platform.OS !== 'web' && <KeepAwake />}
        <LinearGradient colors={['#FDE68A', '#FBBF24', '#D97706']} style={styles.flex}>
          <Confetti cantidad={40} />
          <View style={[styles.victoriaCentro, { paddingTop: insets.top }]}>
            <Text style={styles.victoriaTrofeo}>🏆</Text>
            <Text style={styles.victoriaOver}>¡TENEMOS GANADOR!</Text>
            <Text style={styles.victoriaNombre} numberOfLines={2} adjustsFontSizeToFit>
              {g.name}
            </Text>
            <View style={styles.victoriaPill}>
              <Text style={styles.victoriaPillText}>{cap(verbo(session.tono, 'bebe'))} 5 {unidad(session.tono, 5, 'chupito')} para celebrarlo {emoji(session.tono, '🥃')}</Text>
            </View>
          </View>
          <View style={[styles.footer, styles.victoriaFooter, { paddingBottom: insets.bottom + 14, gap: 9 }]}>
            {(session.modo === 'competicion' || session.modo === 'escalada') ? (
              <PressableScale onPress={() => router.replace('/fin-juego')} scaleTo={0.965} style={styles.volverMenuBtn}>
                <Text style={styles.volverMenuText}>Continuar</Text>
              </PressableScale>
            ) : (
              <>
                <PressableScale onPress={() => router.replace('/juegos')} scaleTo={0.965} style={styles.volverMenuBtn}>
                  <Text style={styles.volverMenuText}>Volver al menú de juegos 🎲</Text>
                </PressableScale>
                <PressableScale onPress={reiniciarJuego} scaleTo={0.97} style={styles.otraVezBtn}>
                  <Text style={styles.otraVezText}>Jugar otra vez</Text>
                </PressableScale>
              </>
            )}
          </View>
        </LinearGradient>
      </View>
    );
  }

  // ——— Vista grande de casilla ———
  if (openCell) {
    const cap = capturaDe(openCell.n);
    const ctaCaptura = (session.modo === 'competicion' || session.modo === 'escalada') && cap ? `${emoji(session.tono)} ¿Quién ${verbo(session.tono, 'bebe')}?` : undefined;
    return (
      <>
        <CellBigView
          cell={openCell}
          onDone={cellDone}
          insets={insets}
          cta={ctaCaptura}
          interactiveDado={openCell.n === 23}
          onDado={resolverDado23}
        />
        {cap && (
          <PickerJugadores
            visible={pickerVisible}
            modo={cap.modo}
            titulo={`¿Quién ${verbo(session.tono, 'bebe')}?`}
            subtitulo={conTono(openCell.detail, session.tono, OCA_CHILL[openCell.n]?.detail)}
            cantidad={cap.cantidad}
            maxTotal={cap.total}
            onDone={cerrarPicker}
          />
        )}
      </>
    );
  }

  // ——— Tablero ———
  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      {Platform.OS !== 'web' && <KeepAwake />}

      {/* Controles (arriba-derecha) */}
      <View style={styles.controles}>
        <View style={styles.flex} />
        <RulesButton juegoId="oca-borracha" />
        <SessionMenuButton onPress={() => setMenuVisible(true)} />
      </View>

      {/* Turno, centrado sobre el tablero */}
      <View style={styles.turnoCentro}>
        <Overline color={colors.grayLt}>LE TOCA A</Overline>
        <View style={styles.turnoRow}>
          <Token tokenKey={cur.key} color={cur.color} size={26} />
          <Text style={styles.turnoNombre} numberOfLines={1} adjustsFontSizeToFit>
            {cur.name}
          </Text>
        </View>
      </View>

      {/* Tablero con sendero */}
      <View style={styles.boardArea}>
        <View style={{ width: BOARD_W * escala, height: BOARD_H * escala, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: BOARD_W, height: BOARD_H, transform: [{ scale: escala }] }}>
            <Svg width={BOARD_W} height={BOARD_H} style={{ position: 'absolute', left: 0, top: 0 }}>
              <Path d={PATH_D} fill="none" stroke="#EDE9FE" strokeWidth={26} strokeLinecap="round" strokeLinejoin="round" />
              <Path d={PATH_D} fill="none" stroke="#C4B5FD" strokeWidth={2.5} strokeLinecap="round" strokeDasharray="1 11" opacity={0.9} />
            </Svg>
            {BOARD.map((cell, i) => (
              <Cell key={cell.n} cell={cell} x={CENTERS[i].x} y={CENTERS[i].y} tokens={tokensEn(cell.n)} />
            ))}
          </View>
        </View>
      </View>

      {/* Dado + botón */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.dadoRow}>
          <Dado valor={dado} />
          <PressableScale onPress={tirar} disabled={rodando} scaleTo={0.965} style={styles.tirarWrap}>
            <LinearGradient
              colors={gradients.purple.colors}
              locations={gradients.purple.locations}
              start={gradientAngle.start}
              end={gradientAngle.end}
              style={[styles.tirarBtn, rodando && { opacity: 0.6 }]}>
              <Text style={styles.tirarText}>🎲 {rodando ? 'Avanzando…' : 'Tirar dado'}</Text>
            </LinearGradient>
          </PressableScale>
        </View>
      </View>

      <SessionMenu
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        onReiniciar={reiniciarJuego}
        onJugadorEliminado={eliminarFicha}
      />
    </View>
  );
}

// ——— Ficha ————————————————————————————————————————————————————————

function Token({ tokenKey, color, size = 20 }: { tokenKey: string; color: string; size?: number }) {
  return (
    <View
      style={[
        styles.token,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color, borderWidth: size > 22 ? 2.5 : 2 },
      ]}>
      <Text style={{ fontFamily: fonts.display, fontSize: size * 0.5, color: colors.white }}>{tokenKey}</Text>
    </View>
  );
}

// ——— Casilla del tablero ——————————————————————————————————————————

function Cell({ cell, x, y, tokens }: { cell: CellDef; x: number; y: number; tokens: { key: string; color: string }[] }) {
  const { session } = useSession();
  const st = CAT_STYLE[cell.cat];
  const big = cell.type === 'final';
  const dark = cell.cat === 'putadon';
  const especial = cell.type !== 'normal' || cell.cat === 'meta';

  return (
    <View
      style={[
        styles.cell,
        {
          left: x - CELL / 2,
          top: y - CELL / 2,
          borderRadius: big ? CELL / 2 : 18,
          backgroundColor: st.bg,
          borderColor: st.border,
          transform: [{ scale: big ? 1.14 : 1 }],
          zIndex: big ? 3 : 2,
        },
        especial ? { shadowColor: st.border, shadowOpacity: 0.45, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4 } : { elevation: 1 },
      ]}>
      {/* nº de casilla */}
      <View
        style={[
          styles.cellBadge,
          { backgroundColor: dark ? '#7F1D1D' : cell.cat === 'normal' ? colors.ink : st.border },
        ]}>
        <Text style={styles.cellBadgeText}>{cell.n}</Text>
      </View>
      {especial && <Text style={{ fontSize: big ? 22 : 15 }}>{conTono(cell.icon, session.tono)}</Text>}
      <Text
        style={[styles.cellSummary, {
          color: st.label,
          fontFamily: big ? fonts.display : dark ? fonts.bodyX : fonts.bodyBold,
          fontSize: dark && !big ? 9 : 10,
          letterSpacing: dark && !big ? -0.4 : -0.2,
        }]}
        numberOfLines={2}>
        {conTono(cell.summary, session.tono, OCA_CHILL[cell.n]?.summary)}
      </Text>
      {tokens.length > 0 && (
        <View style={styles.cellTokens}>
          {tokens.map((t, i) => (
            <View key={t.key + i} style={{ marginRight: i === 0 ? 0 : -9 }}>
              <Token tokenKey={t.key} color={t.color} size={18} />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ——— Dado (caras 1-6) —————————————————————————————————————————————

const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [0, 2], [2, 0], [2, 2]],
  5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
  6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
};

function Dado({ valor }: { valor: number }) {
  const pips = PIPS[valor] ?? PIPS[1];
  return (
    <View style={styles.dado}>
      {[0, 1, 2].map((r) =>
        [0, 1, 2].map((c) => {
          const on = pips.some(([pr, pc]) => pr === r && pc === c);
          return <View key={`${r}-${c}`} style={[styles.pip, { backgroundColor: on ? colors.ink : 'transparent' }]} />;
        })
      )}
    </View>
  );
}

// ——— Vista grande de casilla ——————————————————————————————————————

function CellBigView({ cell, onDone, insets, cta, interactiveDado, onDado }: {
  cell: CellDef;
  onDone: () => void;
  insets: { top: number; bottom: number };
  cta?: string;
  /** La casilla 23 (par/impar) muestra un dado virtual interactivo */
  interactiveDado?: boolean;
  /** Reporta al padre el resultado del dado (true = par) para aplicar la norma */
  onDado?: (esPar: boolean) => void;
}) {
  const { session } = useSession();
  const drama = cell.cat === 'putadon';
  const salto = cell.type === 'salto';
  const meta = cell.cat === 'meta';
  const positiva = cell.cat === 'positiva';

  // Dado virtual de la casilla par/impar (23)
  const [dadoVal, setDadoVal] = useState(1);
  const [dadoTirado, setDadoTirado] = useState(false);
  const [rodandoD, setRodandoD] = useState(false);
  const esParDado = dadoVal % 2 === 0;
  const tirarDado = async () => {
    if (rodandoD || dadoTirado) return;
    vibrar(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
    setRodandoD(true);
    for (let k = 0; k < 9; k++) {
      setDadoVal(1 + Math.floor(Math.random() * 6));
      await sleep(55);
    }
    const d = 1 + Math.floor(Math.random() * 6);
    setDadoVal(d);
    setRodandoD(false);
    setDadoTirado(true);
    onDado?.(d % 2 === 0);
  };

  const pop = useSharedValue(0);
  const shake = useSharedValue(0);
  const flash = useSharedValue(0.3);
  useEffect(() => {
    if (drama) {
      shake.value = withRepeat(
        withSequence(withTiming(1, { duration: 80 }), withTiming(-1, { duration: 80 }), withTiming(0, { duration: 80 })),
        -1,
        false
      );
      flash.value = withRepeat(withTiming(1, { duration: 400, easing: Easing.inOut(Easing.quad) }), -1, true);
    } else {
      pop.value = withSpring(1, { damping: 7, stiffness: 130, mass: 0.6 });
    }
    return () => {
      cancelAnimation(shake);
      cancelAnimation(flash);
      cancelAnimation(pop);
    };
  }, [drama, pop, shake, flash]);

  const iconStyle = useAnimatedStyle(() =>
    drama ? { transform: [{ translateX: shake.value * 5 }] } : { transform: [{ scale: 0.4 + pop.value * 0.6 }] }
  );
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));

  const st = CAT_STYLE[cell.cat];
  const bg: readonly [string, string, ...string[]] = drama
    ? ['#2A0E0E', '#150909']
    : meta
      ? ['#FDE68A', '#FBBF24', '#D97706']
      : salto
        ? ['#F3EEFE', colors.surface]
        : [colors.surface, colors.surface];
  const claro = drama;
  const tituloColor = claro ? colors.white : meta ? '#7C2D12' : colors.ink;

  return (
    <View style={styles.flex}>
      <LinearGradient colors={bg} style={[styles.flex, { paddingTop: insets.top }]}>
        {drama && <Animated.View pointerEvents="none" style={[styles.flashBorde, flashStyle]} />}
        {meta && <Confetti cantidad={26} />}

        <View style={styles.bigCentro}>
          <View style={[styles.bigPill, { backgroundColor: drama ? 'rgba(239,68,68,0.22)' : meta ? 'rgba(124,45,18,0.16)' : colors.lav100 }]}>
            <Text style={[styles.bigPillText, { color: drama ? '#FCA5A5' : meta ? '#7C2D12' : colors.purple }]}>
              CASILLA {cell.n}
            </Text>
          </View>

          {interactiveDado ? (
            <PressableScale onPress={tirarDado} disabled={rodandoD || dadoTirado} scaleTo={0.94}>
              <View style={[styles.bigDadoTile, dadoTirado && { borderColor: esParDado ? '#16A34A' : '#F97316' }]}>
                <View style={{ transform: [{ scale: 1.7 }] }}>
                  <Dado valor={dadoVal} />
                </View>
              </View>
            </PressableScale>
          ) : (
            <Animated.View style={iconStyle}>
              {salto ? (
                <LinearGradient colors={gradients.purple.colors} style={styles.bigIconTile}>
                  <Text style={styles.bigIcon}>{conTono(cell.icon, session.tono)}</Text>
                </LinearGradient>
              ) : (
                <View
                  style={[
                    styles.bigIconTile,
                    drama
                      ? { backgroundColor: 'rgba(239,68,68,0.14)', borderWidth: 2, borderColor: 'rgba(239,68,68,0.45)' }
                      : meta
                        ? { backgroundColor: 'rgba(255,255,255,0.55)', borderWidth: 2, borderColor: '#D97706' }
                        : positiva
                          ? { backgroundColor: 'rgba(22,163,74,0.14)', borderWidth: 2, borderColor: '#86EFAC' }
                          : { backgroundColor: st.bg === colors.white ? colors.lav100 : st.bg, borderWidth: 2, borderColor: st.border },
                  ]}>
                  <Text style={styles.bigIcon}>{conTono(cell.icon, session.tono)}</Text>
                </View>
              )}
            </Animated.View>
          )}

          <View style={styles.bigTextWrap}>
            <Text
              style={[styles.bigTitulo, { color: tituloColor, fontSize: drama ? 50 : meta ? 46 : 38 }]}
              numberOfLines={1}
              adjustsFontSizeToFit>
              {conTono(cell.title, session.tono, OCA_CHILL[cell.n]?.title)}
            </Text>
            <Text style={[styles.bigDetalle, { color: claro ? 'rgba(255,255,255,0.7)' : meta ? '#92400E' : colors.gray }]}>
              {interactiveDado
                ? dadoTirado
                  ? esParDado
                    ? `Salió ${dadoVal} · PAR → ${verbo(session.tono, 'bebes')} 2 ${unidad(session.tono, 2)} ${emoji(session.tono)}`
                    : `Salió ${dadoVal} · IMPAR → repartes 2 ${unidad(session.tono, 2)} ${emoji(session.tono, '🍻')}`
                  : `Toca el dado para tirarlo: par ${verbo(session.tono, 'bebes')} tú, impar repartes.`
                : conTono(cell.detail, session.tono, OCA_CHILL[cell.n]?.detail)}
            </Text>
          </View>
        </View>

        <View style={[styles.footer, styles.bigFooter, { paddingBottom: insets.bottom + 14 }]}>
          {interactiveDado ? (
            dadoTirado ? (
              <PrimaryButton
                title={esParDado ? 'Hecho ✓' : cta ?? 'Hecho ✓'}
                size="m"
                onPress={onDone}
                style={styles.bigDoneBtn}
              />
            ) : null
          ) : drama ? (
            <PressableScale onPress={onDone} scaleTo={0.965} style={[styles.dramaBtn, styles.bigDoneBtn]}>
              <Text style={styles.dramaText}>Acepto mi destino ✓</Text>
            </PressableScale>
          ) : meta ? (
            <PressableScale onPress={onDone} scaleTo={0.965} style={[styles.metaBtn, styles.bigDoneBtn]}>
              <Text style={styles.metaBtnText}>Hecho ✓</Text>
            </PressableScale>
          ) : (
            <PrimaryButton title={cta ?? 'Hecho ✓'} size="m" onPress={onDone} style={styles.bigDoneBtn} />
          )}
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: 6 },
  controles: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14 },
  turnoCentro: { alignItems: 'center', marginTop: 2, marginBottom: 6, gap: 2 },
  turnoRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  turnoNombre: { fontFamily: fonts.display, fontSize: 28, letterSpacing: -1, color: colors.ink, flexShrink: 1, textAlign: 'center' },
  boardArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // ficha
  token: {
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  // casilla
  cell: {
    position: 'absolute',
    width: CELL,
    height: CELL,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 3,
  },
  cellBadge: {
    position: 'absolute',
    top: -7,
    left: -5,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  cellBadgeText: { fontFamily: fonts.display, fontSize: 9, color: colors.white },
  cellSummary: { fontSize: 10, lineHeight: 11.5, textAlign: 'center', letterSpacing: -0.2 },
  cellTokens: { position: 'absolute', bottom: -8, right: -6, flexDirection: 'row-reverse' },
  // dado
  dadoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14 },
  dado: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 11,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignContent: 'space-between',
    justifyContent: 'space-between',
    ...shadows.card,
  },
  pip: { width: 8, height: 8, borderRadius: 4 },
  tirarWrap: { flex: 1 },
  tirarBtn: { height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center', ...shadows.purple },
  tirarText: { fontFamily: fonts.display, fontSize: 21, color: colors.white, letterSpacing: -0.3 },
  footer: { paddingTop: 10 },
  // vista grande
  bigCentro: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 22 },
  bigPill: { paddingVertical: 7, paddingHorizontal: 18, borderRadius: 30 },
  bigPillText: { fontFamily: fonts.display, fontSize: 13, letterSpacing: 2 },
  bigIconTile: { width: 150, height: 150, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  bigDadoTile: {
    width: 150,
    height: 150,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.lav100,
    borderWidth: 2,
    borderColor: colors.purple,
  },
  bigIcon: { fontSize: 74 },
  bigTextWrap: { alignItems: 'center', alignSelf: 'stretch' },
  // alignSelf:stretch da un ancho definido al texto para que adjustsFontSizeToFit
  // encoja "PUTADÓN" a una sola línea en vez de partir la N.
  bigTitulo: { fontFamily: fonts.display, letterSpacing: -1.4, textAlign: 'center', alignSelf: 'stretch' },
  bigDetalle: { fontFamily: fonts.body, fontSize: 15, marginTop: 14, textAlign: 'center', lineHeight: 22, maxWidth: 300 },
  flashBorde: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 4, borderColor: '#EF4444' },
  bigFooter: { alignItems: 'center' },
  // alignSelf centrado + sin sombra: evita el "haz de luz" morado del gradiente.
  bigDoneBtn: { alignSelf: 'center', paddingHorizontal: 36, minWidth: 220, shadowOpacity: 0, shadowRadius: 0, elevation: 0 },
  dramaBtn: { height: 56, borderRadius: 18, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center' },
  dramaText: { fontFamily: fonts.display, fontSize: 19, color: colors.white },
  metaBtn: { height: 56, borderRadius: 18, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  metaBtnText: { fontFamily: fonts.display, fontSize: 19, color: '#FBBF24' },
  // victoria
  victoriaCentro: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  victoriaTrofeo: { fontSize: 96 },
  victoriaOver: { fontFamily: fonts.bodyX, fontSize: 14, letterSpacing: 3, color: 'rgba(124,45,18,0.85)', marginTop: 8 },
  victoriaNombre: { fontFamily: fonts.display, fontSize: 58, letterSpacing: -2, color: '#7C2D12', textAlign: 'center', marginTop: 6 },
  victoriaPill: { backgroundColor: 'rgba(124,45,18,0.16)', borderRadius: 30, paddingHorizontal: 20, paddingVertical: 10, marginTop: 18 },
  victoriaPillText: { fontFamily: fonts.bodyX, fontSize: 16, color: '#7C2D12', textAlign: 'center' },
  victoriaFooter: { alignItems: 'stretch', paddingHorizontal: 26 },
  volverMenuBtn: {
    height: 56,
    borderRadius: 18,
    backgroundColor: '#7C2D12',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  volverMenuText: { fontFamily: fonts.display, fontSize: 18, color: '#FDE68A' },
  otraVezBtn: {
    height: 56,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.45)',
    borderWidth: 1.5,
    borderColor: 'rgba(124,45,18,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  otraVezText: { fontFamily: fonts.bodyBold, fontSize: 14, color: '#7C2D12' },
});
