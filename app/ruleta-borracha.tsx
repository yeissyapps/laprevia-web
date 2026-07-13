// Ruleta Borracha — ruleta de 13 sectores (0 verde, impares rojos, pares negros).
// Cada jugador apuesta a CUALQUIER combinación de número (×3), color (×2) y
// par/impar (×1). Los multiplicadores se multiplican; se gana solo si aciertan
// todas las categorías elegidas, si no se bebe lo que había en juego.
//
// Tragos por modo:
//  · Competición: fallos y 0-verde suman automático; los aciertos abren un
//    PickerJugadores (múltiple) para que el ganador reparta entre quien elija.
//  · Escalada: fallos y 0-verde suman automático; los repartos van por texto.
//  · Libre: tiradas infinitas, todo por texto (sumarTragos no hace nada).

import { LinearGradient } from 'expo-linear-gradient';
import { useKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, G, Path, Text as SvgText } from 'react-native-svg';

import { RulesButton } from '@/components/GameRules';
import { Overline } from '@/components/Overline';
import { PickerJugadores } from '@/components/PickerJugadores';
import { PressableScale } from '@/components/PressableScale';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SessionMenu, SessionMenuButton } from '@/components/SessionMenu';
import { useSession } from '@/context/SessionContext';
import { cap, emoji, verbo } from '@/utils/textoTono';
import {
  anguloFinal,
  enJuego,
  girarRuleta,
  hayApuesta,
  multiplicador,
  numColor,
  NUMS,
  resolver,
  BLACK,
  GREEN,
  RED,
  WHEEL_ORDER,
  type Apuesta,
  type Color,
  type Paridad,
  type ResultadoRuleta,
} from '@/data/ruleta';
import { colors, fonts, shadows } from '@/theme/theme';

function KeepAwake() {
  useKeepAwake();
  return null;
}

type Fase = 'apuestas' | 'girando' | 'resultado' | 'verde';

const COLORES = ['#7C3AED', '#EF4444', '#22C55E', '#F97316', '#0EA5E9', '#EC4899', '#EAB308', '#14B8A6'];
const colorJugador = (i: number) => COLORES[i % COLORES.length];
const inicial = (nombre: string) => (nombre.trim()[0] ?? '?').toUpperCase();

/** "Nº 7 · Rojo · Impar" */
function describirApuesta(b: Apuesta): string {
  const partes: string[] = [];
  if (b.num != null) partes.push(`Nº ${b.num}`);
  if (b.color) partes.push(b.color === 'rojo' ? 'Rojo' : 'Negro');
  if (b.paridad) partes.push(b.paridad === 'par' ? 'Par' : 'Impar');
  return partes.join(' · ');
}

export default function RuletaBorrachaScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, sumarTragos } = useSession();

  const jugadores = session.jugadores.length >= 1 ? session.jugadores : ['Jugador 1', 'Jugador 2'];
  const enCompeticion = session.modo === 'competicion' || session.modo === 'escalada';
  const conPickers = session.modo === 'competicion';

  // Nº de tiradas en modo marcador (escalada: "8_tiradas"; competición: 8 por defecto).
  const duracion = session.competicion?.duraciones?.[session.competicion?.rondaActual ?? 0];
  const maxTiradas = (() => {
    const m = /^(\d+)/.exec(duracion ?? '');
    return m ? parseInt(m[1], 10) : 8;
  })();

  const [fase, setFase] = useState<Fase>('apuestas');
  const [tirada, setTirada] = useState(1);

  // Apuestas por turnos — combinación libre de número / color / paridad.
  const [bets, setBets] = useState<Apuesta[]>([]);
  const [betIdx, setBetIdx] = useState(0);
  const [numSel, setNumSel] = useState<number | null>(null);
  const [colorSel, setColorSel] = useState<Color | null>(null);
  const [paridadSel, setParidadSel] = useState<Paridad | null>(null);
  const [chips, setChips] = useState(1);

  // Resultado
  const [winner, setWinner] = useState<number | null>(null);
  const [resultados, setResultados] = useState<{ b: Apuesta; r: ResultadoRuleta }[]>([]);
  const [repartoIdx, setRepartoIdx] = useState(0);

  const [menuVisible, setMenuVisible] = useState(false);

  const rot = useSharedValue(0);
  const betsRef = useRef<Apuesta[]>([]);

  // ─────────────── Apuestas ───────────────
  const sel = { num: numSel, color: colorSel, paridad: paridadSel };
  const apuestaValida = hayApuesta(sel);
  const mult = multiplicador(sel);
  const enJuegoAhora = chips * mult;

  // Selección ÚNICA: elegir una categoría limpia las otras dos.
  const elegirNum = (n: number) => {
    setNumSel((p) => (p === n ? null : n));
    setColorSel(null);
    setParidadSel(null);
  };
  const elegirColor = (c: Color) => {
    setColorSel((p) => (p === c ? null : c));
    setNumSel(null);
    setParidadSel(null);
  };
  const elegirParidad = (p2: Paridad) => {
    setParidadSel((p) => (p === p2 ? null : p2));
    setNumSel(null);
    setColorSel(null);
  };

  const limpiarSeleccion = () => {
    setNumSel(null);
    setColorSel(null);
    setParidadSel(null);
    setChips(1);
  };

  const confirmarApuesta = () => {
    if (!apuestaValida) return;
    const nueva: Apuesta = { pIdx: betIdx, num: numSel, color: colorSel, paridad: paridadSel, chips };
    const next = [...bets, nueva];
    setBets(next);
    if (betIdx + 1 < jugadores.length) {
      setBetIdx(betIdx + 1);
      limpiarSeleccion();
    } else {
      girar(next);
    }
  };

  const girar = (apuestas: Apuesta[]) => {
    betsRef.current = apuestas;
    const w = girarRuleta();
    setWinner(w);
    setFase('girando');
    rot.value = 0;
    rot.value = withTiming(
      anguloFinal(w),
      { duration: 6600, easing: Easing.bezier(0.17, 0.67, 0.2, 1) },
      (finished) => {
        if (finished) runOnJS(finGiro)(w);
      }
    );
  };

  const finGiro = (w: number) => {
    const res = betsRef.current.map((b) => ({ b, r: resolver(b, w) }));
    setResultados(res);
    if (enCompeticion) {
      if (w === 0) betsRef.current.forEach((b) => sumarTragos(b.pIdx, b.chips));
      else res.forEach(({ b, r }) => { if (r.tipo === 'falla') sumarTragos(b.pIdx, r.cantidad); });
    }
    setRepartoIdx(0);
    setTimeout(() => setFase(w === 0 ? 'verde' : 'resultado'), 600);
  };

  const finalizar = enCompeticion && tirada >= maxTiradas;

  const continuar = () => {
    if (finalizar) {
      router.replace('/fin-juego');
      return;
    }
    setBets([]);
    setBetIdx(0);
    limpiarSeleccion();
    setWinner(null);
    setResultados([]);
    setRepartoIdx(0);
    if (enCompeticion) setTirada((t) => t + 1);
    rot.value = 0;
    setFase('apuestas');
  };

  const reiniciarJuego = () => {
    setFase('apuestas');
    setTirada(1);
    setBets([]);
    setBetIdx(0);
    limpiarSeleccion();
    setWinner(null);
    setResultados([]);
    setRepartoIdx(0);
    rot.value = 0;
  };

  // ═══════════════ APUESTAS ═══════════════
  if (fase === 'apuestas') {
    const esUltimoJugador = betIdx + 1 >= jugadores.length;
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
        {Platform.OS !== 'web' && <KeepAwake />}

        <View style={styles.topRow}>
          <View style={{ flex: 1 }}>
            <Overline color={colors.grayLt}>
              {enCompeticion ? `RULETA · TIRADA ${tirada}/${maxTiradas}` : 'RULETA BORRACHA'}
            </Overline>
            <Text style={styles.apuestaDe}>
              Apuesta de <Text style={{ color: colorJugador(betIdx) }}>{jugadores[betIdx]}</Text>
            </Text>
          </View>
          <RulesButton juegoId="ruleta-borracha" />
          <SessionMenuButton onPress={() => setMenuVisible(true)} />
        </View>

        <Text style={styles.contadorApuestas}>
          Jugador {betIdx + 1} de {jugadores.length} · elige número, color o par-impar
        </Text>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.mesa} showsVerticalScrollIndicator={false}>
          {/* NÚMERO ×3 */}
          <View style={styles.seccionLabelRow}>
            <Text style={styles.seccionLabel}>NÚMERO</Text>
            <Text style={styles.seccionMult}>reparte ×3</Text>
          </View>
          <View style={{ alignItems: 'center', marginBottom: 8 }}>
            <NumChip n={0} sel={numSel === 0} onPress={() => elegirNum(0)} size={52} />
          </View>
          <View style={styles.grid}>
            {NUMS.map((n) => (
              <NumChip key={n} n={n} sel={numSel === n} onPress={() => elegirNum(n)} size={58} />
            ))}
          </View>

          {/* COLOR ×1 */}
          <View style={styles.seccionLabelRow}>
            <Text style={styles.seccionLabel}>COLOR</Text>
            <Text style={styles.seccionMult}>reparte ×1</Text>
          </View>
          <View style={styles.outerRow}>
            <ColorBtn label="Rojo" bg={RED} sel={colorSel === 'rojo'} onPress={() => elegirColor('rojo')} />
            <ColorBtn label="Negro" bg={BLACK} sel={colorSel === 'negro'} onPress={() => elegirColor('negro')} />
          </View>

          {/* PAR / IMPAR ×1 */}
          <View style={styles.seccionLabelRow}>
            <Text style={styles.seccionLabel}>PAR / IMPAR</Text>
            <Text style={styles.seccionMult}>reparte ×1</Text>
          </View>
          <View style={styles.outerRow}>
            <ToggleBtn label="Par" sel={paridadSel === 'par'} onPress={() => elegirParidad('par')} />
            <ToggleBtn label="Impar" sel={paridadSel === 'impar'} onPress={() => elegirParidad('impar')} />
          </View>

          {/* chupitos */}
          <View style={styles.chipsCard}>
            <View>
              <Overline color={colors.grayLt}>APUESTAS</Overline>
              <Text style={styles.chipsLabel}>chupitos</Text>
            </View>
            <View style={styles.stepper}>
              <PressableScale onPress={() => setChips((c) => Math.max(1, c - 1))} style={styles.stepBtn} hitSlop={6}>
                <Text style={styles.stepMinus}>−</Text>
              </PressableScale>
              <Text style={styles.stepNum}>{chips}</Text>
              <PressableScale onPress={() => setChips((c) => Math.min(5, c + 1))} hitSlop={6} style={styles.stepPlusBtn}>
                <LinearGradient colors={['#8B5CF6', '#6D28D9']} style={styles.stepPlusFill}>
                  <Text style={styles.stepPlus}>+</Text>
                </LinearGradient>
              </PressableScale>
            </View>
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
          {apuestaValida && (
            <View style={styles.potBox}>
              <View style={styles.potRow}>
                <Text style={styles.potLabel}>Aciertas → repartes </Text>
                <Text style={styles.potNum}>{enJuegoAhora}</Text>
                <Text style={styles.potEmoji}> {emoji(session.tono)}</Text>
              </View>
              <Text style={styles.potBreak}>
                Fallas → {verbo(session.tono, 'bebes')} {chips} {emoji(session.tono)}  ·  {numSel != null ? 'número ×3' : 'color/par-impar ×1'}
              </Text>
            </View>
          )}
          <PrimaryButton
            title={esUltimoJugador ? '🎰 Girar la ruleta' : 'Confirmar apuesta  →'}
            onPress={confirmarApuesta}
            disabled={!apuestaValida}
          />
        </View>

        <SessionMenu visible={menuVisible} onClose={() => setMenuVisible(false)} onReiniciar={reiniciarJuego} />
      </View>
    );
  }

  // ═══════════════ GIRANDO ═══════════════
  if (fase === 'girando') {
    return (
      <View style={styles.darkScreen}>
        {Platform.OS !== 'web' && <KeepAwake />}
        <View style={styles.girandoPill}>
          <View style={styles.girandoDot} />
          <Text style={styles.girandoText}>GIRANDO…</Text>
        </View>
        <Ruleta size={290} rot={rot} />
        <Text style={styles.girandoPregunta}>¿Dónde caerá?</Text>
      </View>
    );
  }

  // ═══════════════ VERDE (0) ═══════════════
  if (fase === 'verde') {
    return (
      <View style={{ flex: 1 }}>
        {Platform.OS !== 'web' && <KeepAwake />}
        <LinearGradient colors={['#16A34A', '#064E2B']} style={[styles.verde, { paddingTop: insets.top + 30, paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.verdeCirculo}>
            <Text style={styles.verdeCero}>0</Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 36 }}>💚</Text>
            <Text style={styles.verdeTitulo}>¡VERDE!</Text>
            <Text style={styles.verdeSub}>Todos beben</Text>
            <Text style={styles.verdeAyuda}>Cae el comodín. Cada uno bebe lo que apostó, sin importar a qué.</Text>
          </View>
          <View style={styles.verdeChips}>
            {bets.map((b) => (
              <View key={b.pIdx} style={styles.verdeChip}>
                <View style={[styles.verdeAvatar, { backgroundColor: colorJugador(b.pIdx) }]}>
                  <Text style={styles.verdeAvatarText}>{inicial(jugadores[b.pIdx])}</Text>
                </View>
                <Text style={styles.verdeChipNum}>{b.chips}</Text>
                <Text style={{ fontSize: 13 }}>{emoji(session.tono)}</Text>
              </View>
            ))}
          </View>
          <View style={styles.verdeFooter}>
            <PressableScale onPress={continuar} scaleTo={0.965} style={styles.verdeBtn}>
              <Text style={styles.verdeBtnText}>{finalizar ? 'Ver marcador →' : `¡A ${verbo(session.tono, 'beber')} todos! 🎰`}</Text>
            </PressableScale>
          </View>
        </LinearGradient>
        <SessionMenu visible={menuVisible} onClose={() => setMenuVisible(false)} onReiniciar={reiniciarJuego} />
      </View>
    );
  }

  // ═══════════════ RESULTADO (1-12) ═══════════════
  const w = winner ?? 0;
  const col = numColor(w);
  const repartos = resultados.filter((x) => x.r.tipo === 'gana');
  const pendientePicker = conPickers && repartoIdx < repartos.length;
  const repartoActual = pendientePicker ? repartos[repartoIdx] : null;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
      {Platform.OS !== 'web' && <KeepAwake />}

      <View style={styles.resHead}>
        <Overline color={colors.grayLt}>HA SALIDO EL</Overline>
        <View style={[styles.resCirculo, { backgroundColor: col, shadowColor: col }]}>
          <Text style={styles.resNumero}>{w}</Text>
        </View>
        <View style={styles.resTags}>
          <Text style={[styles.resTag, { color: col }]}>{col === RED ? 'Rojo' : 'Negro'}</Text>
          <Text style={styles.resTagSep}>·</Text>
          <Text style={[styles.resTag, { color: colors.ink }]}>{w % 2 === 1 ? 'Impar' : 'Par'}</Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.resLista} showsVerticalScrollIndicator={false}>
        {resultados.map(({ b, r }) => {
          const gana = r.tipo === 'gana';
          return (
            <View key={b.pIdx} style={[styles.resFila, { backgroundColor: gana ? '#F0FDF4' : '#FEE2E2', borderColor: gana ? '#22C55E' : '#EF4444' }]}>
              <View style={[styles.resAvatar, { backgroundColor: colorJugador(b.pIdx) }]}>
                <Text style={styles.resAvatarText}>{inicial(jugadores[b.pIdx])}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.resNombre} numberOfLines={1}>{jugadores[b.pIdx]}</Text>
                <Text style={[styles.resEtiqueta, { color: gana ? '#15803D' : '#DC2626' }]} numberOfLines={1}>
                  {describirApuesta(b)} · ×{multiplicador(b)}
                </Text>
              </View>
              <View style={styles.resPago}>
                <Text style={[styles.resVerbo, { color: gana ? '#15803D' : '#DC2626' }]}>{gana ? 'Reparte' : cap(verbo(session.tono, 'bebe'))}</Text>
                <Text style={[styles.resPay, { color: gana ? '#15803D' : '#DC2626' }]}>{r.cantidad}</Text>
                <Text style={{ fontSize: 13 }}>{gana ? emoji(session.tono, '🥃') : emoji(session.tono)}</Text>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {!pendientePicker && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
          <PrimaryButton title={finalizar ? 'Ver marcador  →' : 'Nueva tirada  🎰'} onPress={continuar} />
        </View>
      )}

      {repartoActual && (
        <PickerJugadores
          visible
          modo="multiple"
          titulo={`¿Entre quién repartes ${repartoActual.r.cantidad} ${emoji(session.tono)}?`}
          subtitulo={`${jugadores[repartoActual.b.pIdx]} acertó ${describirApuesta(repartoActual.b)} (×${multiplicador(repartoActual.b)})`}
          cantidad={1}
          maxTotal={repartoActual.r.cantidad}
          excluir={[repartoActual.b.pIdx]}
          onDone={() => setRepartoIdx((i) => i + 1)}
        />
      )}

      <SessionMenu visible={menuVisible} onClose={() => setMenuVisible(false)} onReiniciar={reiniciarJuego} />
    </View>
  );
}

// ─────────────────────────── Rueda SVG ───────────────────────────

function Ruleta({ size, rot }: { size: number; rot: SharedValue<number> }) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2;
  const n = WHEEL_ORDER.length;
  const seg = 360 / n;
  const pol = (deg: number, rad: number): [number, number] => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
  };
  const arc = (i: number) => {
    const a0 = i * seg;
    const a1 = (i + 1) * seg;
    const [x0, y0] = pol(a0, r);
    const [x1, y1] = pol(a1, r);
    return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1} Z`;
  };
  const wheelStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }));

  return (
    <View style={{ width: size, height: size }}>
      {/* puntero fijo superior */}
      <View style={[styles.puntero, { left: size / 2 - 12 }]} />
      <Animated.View style={[{ width: size, height: size }, wheelStyle]}>
        <Svg width={size} height={size}>
          {WHEEL_ORDER.map((numero, i) => {
            const mid = (i + 0.5) * seg;
            const [tx, ty] = pol(mid, r * 0.72);
            return (
              <G key={numero}>
                <Path d={arc(i)} fill={numColor(numero)} stroke="rgba(255,255,255,0.14)" strokeWidth={1} />
                <SvgText
                  x={tx}
                  y={ty}
                  fill="#fff"
                  fontFamily={fonts.display}
                  fontSize={size * 0.058}
                  textAnchor="middle"
                  alignmentBaseline="central"
                  transform={`rotate(${mid}, ${tx}, ${ty})`}>
                  {String(numero)}
                </SvgText>
              </G>
            );
          })}
          <Circle cx={cx} cy={cy} r={size * 0.13} fill="#2A2440" stroke="#7C3AED" strokeWidth={3} />
        </Svg>
      </Animated.View>
      <View style={[styles.ruletaEmojiWrap, { top: size / 2 - size * 0.05, width: size }]} pointerEvents="none">
        <Text style={{ fontSize: size * 0.1 }}>🎰</Text>
      </View>
    </View>
  );
}

// ─────────────────────────── Botones de mesa ───────────────────────────

function NumChip({ n, sel, onPress, size = 58 }: { n: number; sel: boolean; onPress: () => void; size?: number }) {
  const col = numColor(n);
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.94}
      style={[
        styles.numChip,
        {
          width: size,
          height: size,
          backgroundColor: sel ? col : colors.white,
          borderColor: sel ? col : n === 0 ? GREEN : colors.border,
        },
      ]}>
      <Text style={{ fontFamily: fonts.display, fontSize: size * 0.36, color: sel ? colors.white : col }}>{n}</Text>
    </PressableScale>
  );
}

// Botón de color: SIEMPRE pintado de su color; al seleccionarlo se ilumina
// (opacidad plena + aro blanco + ✓); sin seleccionar queda atenuado.
function ColorBtn({ label, bg, sel, onPress }: { label: string; bg: string; sel: boolean; onPress: () => void }) {
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.96}
      style={[styles.colorBtn, { backgroundColor: bg, opacity: sel ? 1 : 0.5, borderColor: sel ? '#fff' : 'transparent' }]}>
      <Text style={styles.colorBtnText}>
        {sel ? '✓ ' : ''}● {label}
      </Text>
    </PressableScale>
  );
}

function ToggleBtn({ label, sel, onPress }: { label: string; sel: boolean; onPress: () => void }) {
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.96}
      style={[styles.toggleBtn, { backgroundColor: sel ? colors.purple : colors.white, borderColor: sel ? colors.purple : colors.border }]}>
      <Text style={{ fontFamily: fonts.display, fontSize: 15, color: sel ? colors.white : colors.gray }}>
        {sel ? '✓ ' : ''}{label}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: 22 },
  darkScreen: { flex: 1, backgroundColor: '#0A0A0A', alignItems: 'center', justifyContent: 'center', gap: 36 },

  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  apuestaDe: { fontFamily: fonts.display, fontSize: 26, letterSpacing: -0.8, color: colors.ink, marginTop: 2 },
  contadorApuestas: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.grayLt, marginTop: 4, marginBottom: 8 },

  // Mesa de apuestas
  mesa: { paddingBottom: 12 },
  seccionLabelRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 6, marginBottom: 6 },
  seccionLabel: { fontFamily: fonts.bodyX, fontSize: 11, letterSpacing: 1.5, color: colors.ink, textTransform: 'uppercase' },
  seccionMult: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.purple },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 6 },
  numChip: { borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  outerRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  colorBtn: { flex: 1, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 3 },
  colorBtnText: { fontFamily: fonts.display, fontSize: 15, color: colors.white },
  toggleBtn: { flex: 1, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },

  chipsCard: {
    marginTop: 10,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...shadows.card,
  },
  chipsLabel: { fontFamily: fonts.display, fontSize: 16, color: colors.ink, marginTop: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepBtn: { width: 42, height: 42, borderRadius: 21, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  stepMinus: { fontFamily: fonts.display, fontSize: 22, color: colors.purple },
  stepNum: { fontFamily: fonts.display, fontSize: 32, color: colors.ink, minWidth: 34, textAlign: 'center' },
  stepPlusBtn: { width: 42, height: 42, borderRadius: 21, overflow: 'hidden' },
  stepPlusFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  stepPlus: { fontFamily: fonts.display, fontSize: 22, color: colors.white },

  footer: { paddingTop: 10 },

  // Mensaje "en juego"
  potBox: {
    alignItems: 'center',
    backgroundColor: colors.lav100,
    borderRadius: 16,
    paddingVertical: 10,
    marginBottom: 10,
  },
  potLabel: { fontFamily: fonts.bodyX, fontSize: 10.5, letterSpacing: 1.5, color: colors.purple, textTransform: 'uppercase' },
  potRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 1 },
  potNum: { fontFamily: fonts.display, fontSize: 30, color: colors.purpleDeep, letterSpacing: -1 },
  potEmoji: { fontSize: 18 },
  potBreak: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.gray, marginTop: 1 },

  // Girando
  girandoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(124,58,237,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.4)',
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 30,
  },
  girandoDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#A855F7' },
  girandoText: { fontFamily: fonts.display, fontSize: 13, color: '#C4B5FD', letterSpacing: 1 },
  girandoPregunta: { fontFamily: fonts.display, fontSize: 22, color: 'rgba(255,255,255,0.5)' },
  puntero: {
    position: 'absolute',
    top: -6,
    zIndex: 5,
    width: 0,
    height: 0,
    borderLeftWidth: 12,
    borderRightWidth: 12,
    borderTopWidth: 20,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#fff',
  },
  ruletaEmojiWrap: { position: 'absolute', left: 0, alignItems: 'center' },

  // Resultado
  resHead: { alignItems: 'center', paddingTop: 6, paddingBottom: 14, gap: 10 },
  resCirculo: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: colors.white,
    shadowOpacity: 0.4,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  resNumero: { fontFamily: fonts.display, fontSize: 52, color: colors.white },
  resTags: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  resTag: { fontFamily: fonts.display, fontSize: 15 },
  resTagSep: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.grayLt },

  resLista: { gap: 8, paddingBottom: 12 },
  resFila: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, borderWidth: 1.5 },
  resAvatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  resAvatarText: { fontFamily: fonts.display, fontSize: 14, color: colors.white },
  resNombre: { fontFamily: fonts.display, fontSize: 16, color: colors.ink, letterSpacing: -0.3 },
  resEtiqueta: { fontFamily: fonts.bodyX, fontSize: 10.5, textTransform: 'uppercase', marginTop: 1 },
  resPago: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  resVerbo: { fontFamily: fonts.bodyBold, fontSize: 11 },
  resPay: { fontFamily: fonts.display, fontSize: 22 },

  // Verde
  verde: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, gap: 18 },
  verdeCirculo: {
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  verdeCero: { fontFamily: fonts.display, fontSize: 72, color: colors.white },
  verdeTitulo: { fontFamily: fonts.display, fontSize: 52, color: colors.white, letterSpacing: -2 },
  verdeSub: { fontFamily: fonts.display, fontSize: 26, color: 'rgba(255,255,255,0.9)' },
  verdeAyuda: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: 'rgba(255,255,255,0.75)', marginTop: 10, textAlign: 'center', maxWidth: 290 },
  verdeChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  verdeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 30,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  verdeAvatar: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  verdeAvatarText: { fontFamily: fonts.display, fontSize: 11, color: colors.white },
  verdeChipNum: { fontFamily: fonts.display, fontSize: 16, color: colors.white },
  verdeFooter: { position: 'absolute', bottom: 0, left: 26, right: 26 },
  verdeBtn: { height: 70, borderRadius: 20, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  verdeBtnText: { fontFamily: fonts.display, fontSize: 22, color: '#15803D' },
});
