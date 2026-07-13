// La Pirámide — pirámide de 15 cartas + una mano boca arriba por jugador.
// Por TURNOS: al jugador de turno le toca decidir BEBER o PASAR para la próxima
// carta (la del borde verde). Reparto base → cima (1 → 5 🍺).
//
// Al revelar:
//  · BEBER  → cada jugador con cartas del mismo número bebe (doble por cada carta
//             que además coincida en palo). Suma automática (objetivo).
//  · PASAR  → cada carta coincidente se pasa a quien elija su dueño (picker). La
//             carta cambia de mano (máx. 7 por jugador) y quien la recibe bebe.
// sumarTragos solo tiene efecto en Competición/Escalada (no-op en Libre).

import { LinearGradient } from 'expo-linear-gradient';
import { useKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
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

import { RulesButton } from '@/components/GameRules';
import { Overline } from '@/components/Overline';
import { PressableScale } from '@/components/PressableScale';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SessionMenu, SessionMenuButton } from '@/components/SessionMenu';
import { useSession } from '@/context/SessionContext';
import { cap, emoji, verbo } from '@/utils/textoTono';
import { colorPalo } from '@/data/mayorMenor';
import {
  cartasAPasar,
  coincidencias,
  FILAS,
  INICIO_FILA,
  MAX_MANO,
  moverCarta,
  repartir,
  TOTAL_PIRAMIDE,
  tragosEnIndice,
  type CartaPasar,
  type CartaPoker,
  type Coincidencia,
} from '@/data/piramide';
import { colors, fonts, gradientAngle, gradients, shadows } from '@/theme/theme';

function KeepAwake() {
  useKeepAwake();
  return null;
}

type Fase = 'tablero' | 'eleccion' | 'pasar' | 'resultado';
type Eleccion = 'beber' | 'pasar';
type Resalte = 'match' | 'doble' | 'siguiente' | null;

// Verde para resaltar la próxima carta a levantar (visible sobre el morado).
const VERDE_SIG = '#22C55E';

// Colores por jugador para identificar manos y receptores.
const COLORES = ['#7C3AED', '#EF4444', '#22C55E', '#F97316', '#0EA5E9', '#EC4899'];
const colorJugador = (i: number) => COLORES[i % COLORES.length];
const inicial = (nombre: string) => (nombre.trim()[0] ?? '?').toUpperCase();

interface PasarRes {
  pasador: number;
  receptor: number;
  carta: CartaPoker;
  tragos: number;
}

export default function LaPiramideScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, sumarTragos } = useSession();

  const jugadores =
    session.jugadores.length >= 1
      ? session.jugadores
      : ['Jugador 1', 'Jugador 2', 'Jugador 3'];

  const [nonce, setNonce] = useState(0);
  const deal = useMemo(() => repartir(jugadores.length), [nonce, jugadores.length]);
  // Las manos se mutan al pasar cartas; null = manos del reparto inicial.
  const [manosMut, setManosMut] = useState<CartaPoker[][] | null>(null);
  const manos = manosMut ?? deal.manos;
  const piramide = deal.piramide;

  const [revelados, setRevelados] = useState<Set<number>>(new Set());
  const [paso, setPaso] = useState(0);
  const [turno, setTurno] = useState(0);
  const [fase, setFase] = useState<Fase>('tablero');
  const [eleccion, setEleccion] = useState<Eleccion | null>(null);
  // La carta héroe ya está volteada y mostrando su cara (dentro de 'eleccion').
  const [revelada, setRevelada] = useState(false);
  const ocupado = useRef(false); // evita doble-tap durante el volteo
  const [menuVisible, setMenuVisible] = useState(false);

  // Flujo "Pasar": una carta por paso, con manos de trabajo que se van mutando.
  const [pasarCola, setPasarCola] = useState<CartaPasar[]>([]);
  const [pasarPos, setPasarPos] = useState(0);
  const [pasarRes, setPasarRes] = useState<PasarRes[]>([]);
  const [manosPasar, setManosPasar] = useState<CartaPoker[][]>([]);

  const carta = piramide[paso];
  const tragosBase = tragosEnIndice(paso);
  const coincide = useMemo(
    () => coincidencias(carta, manos, tragosBase),
    [carta, manos, tragosBase]
  );

  // Reinicia el juego cuando cambia el reparto (nuevo nonce o nº de jugadores).
  useEffect(() => {
    setManosMut(null);
    setRevelados(new Set());
    setPaso(0);
    setTurno(0);
    setEleccion(null);
    setRevelada(false);
    setPasarCola([]);
    setPasarPos(0);
    setPasarRes([]);
    setFase('tablero');
  }, [deal]);

  // Flip de la carta héroe al revelar.
  const flip = useSharedValue(0);
  const flipStyle = useAnimatedStyle(() => ({
    // Flip 2D con scaleX (no rotateY): el rotateY creaba una capa 3D que corrompía
    // el render en iOS (media pantalla en blanco). scaleX = cos(ángulo) comprime la
    // carta a una línea a 90° y vuelve. `flip` sigue yendo 0→90→0.
    transform: [{ scaleX: Math.cos((flip.value * Math.PI) / 180) }],
  }));

  const elegir = (e: Eleccion) => {
    flip.value = 0;
    setRevelada(false);
    setEleccion(e);
    setFase('eleccion');
  };

  // Libera el lock de doble-tap. Debe ser una función del contexto JS (React):
  // pasar un closure creado DENTRO del worklet a runOnJS crashea en iOS.
  const liberarFlip = () => { ocupado.current = false; };

  // Voltea la carta héroe mostrando su CARA y la deja visible (no avanza solo).
  const revelar = () => {
    if (ocupado.current || revelada) return;
    ocupado.current = true;
    setRevelados((r) => new Set(r).add(paso));
    // Dos tramos encadenados con withSequence: a 90° (canto) se revela la cara;
    // la vuelta a 0° la deja visible. Cada callback worklet solo llama a
    // funciones JS vía runOnJS (nunca a un closure creado dentro del worklet).
    flip.value = withSequence(
      withTiming(90, { duration: 220, easing: Easing.in(Easing.quad) }, (finished) => {
        if (finished) runOnJS(setRevelada)(true);
      }),
      withTiming(0, { duration: 220, easing: Easing.out(Easing.quad) }, (finished) => {
        if (finished) runOnJS(liberarFlip)();
      })
    );
  };

  const aplicarYContinuar = () => {
    if (eleccion === 'beber') {
      coincide.forEach((m) => sumarTragos(m.jugador, m.tragosBeber));
      setFase('resultado');
      return;
    }
    // PASAR: cada carta coincidente se pasa individualmente.
    const cola = cartasAPasar(coincide);
    if (cola.length === 0) {
      setPasarRes([]);
      setFase('resultado');
      return;
    }
    setPasarCola(cola);
    setPasarPos(0);
    setPasarRes([]);
    setManosPasar(manos.map((m) => [...m]));
    setFase('pasar');
  };

  const elegirReceptor = (receptor: number) => {
    const item = pasarCola[pasarPos];
    const nuevoManos = moverCarta(manosPasar, item.jugador, receptor, item.carta);
    setManosPasar(nuevoManos);
    sumarTragos(receptor, tragosBase);
    const res = [...pasarRes, { pasador: item.jugador, receptor, carta: item.carta, tragos: tragosBase }];
    setPasarRes(res);
    if (pasarPos + 1 < pasarCola.length) {
      setPasarPos((p) => p + 1);
    } else {
      setManosMut(nuevoManos); // confirma el cambio de manos
      setFase('resultado');
    }
  };

  const siguiente = () => {
    if (paso >= TOTAL_PIRAMIDE - 1) {
      router.replace('/fin-juego');
      return;
    }
    setPaso((p) => p + 1);
    setTurno((t) => (t + 1) % jugadores.length);
    setEleccion(null);
    setRevelada(false);
    setPasarCola([]);
    setPasarPos(0);
    setPasarRes([]);
    setFase('tablero');
  };

  const reiniciarJuego = () => setNonce((n) => n + 1);

  // ─────────────────────────── TABLERO ───────────────────────────
  if (fase === 'tablero') {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
        {Platform.OS !== 'web' && <KeepAwake />}

        <View style={styles.topRow}>
          <View style={styles.progresoWrap}>
            <View style={styles.progresoTrack}>
              <View style={[styles.progresoFill, { width: `${(revelados.size / TOTAL_PIRAMIDE) * 100}%` }]} />
            </View>
            <Text style={styles.contador}>{revelados.size}/{TOTAL_PIRAMIDE}</Text>
          </View>
          <RulesButton juegoId="la-piramide" />
          <SessionMenuButton onPress={() => setMenuVisible(true)} />
        </View>

        <View style={styles.turnoRow}>
          <View style={{ flex: 1 }}>
            <Overline color={colors.grayLt}>LE TOCA A</Overline>
            <Text style={[styles.turnoNombre, { color: colorJugador(turno) }]} numberOfLines={1} adjustsFontSizeToFit>
              {jugadores[turno]}
            </Text>
          </View>
          <View style={styles.valePill}>
            <Text style={styles.valeNum}>{tragosBase}</Text>
            <Text style={styles.valeEmoji}>{emoji(session.tono)}</Text>
          </View>
        </View>

        <View style={styles.piramideWrap}>
          <VistaPiramide piramide={piramide} revelados={revelados} siguiente={paso} />
        </View>

        <View style={styles.divisor} />

        <Overline color={colors.grayLt}>CARTAS DE LA MESA</Overline>
        <ScrollView style={styles.manosScroll} contentContainerStyle={styles.manosContent}>
          <VistaManos jugadores={jugadores} manos={manos} />
        </ScrollView>

        <View style={[styles.accionesRow, { paddingBottom: insets.bottom + 14 }]}>
          <BotonGrad label={`${emoji(session.tono)} ${cap(verbo(session.tono, 'beber'))}`} colores={['#EF4444', '#DC2626']} onPress={() => elegir('beber')} />
          <BotonGrad label="Pasar ➡️" colores={[...gradients.purple.colors]} onPress={() => elegir('pasar')} />
        </View>

        <SessionMenu visible={menuVisible} onClose={() => setMenuVisible(false)} onReiniciar={reiniciarJuego} />
      </View>
    );
  }

  // ─────────────────────────── ELECCIÓN ───────────────────────────
  if (fase === 'eleccion') {
    const beber = eleccion === 'beber';
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
        {Platform.OS !== 'web' && <KeepAwake />}
        <View style={styles.centro}>
          <View style={[styles.pill, beber ? styles.pillRojo : styles.pillMorado]}>
            <Text style={[styles.pillText, { color: beber ? '#DC2626' : colors.purple }]}>
              {jugadores[turno]} {beber ? `va a ${verbo(session.tono, 'beber').toUpperCase()} · ${tragosBase} ${emoji(session.tono)}` : `va a PASAR · ${tragosBase} ${emoji(session.tono)}`}
            </Text>
          </View>
          <Animated.View style={[flipStyle, styles.heroWrap]}>
            {revelada ? <CartaMini carta={carta} w={150} resalte="match" /> : <CartaMini w={150} faceDown />}
          </Animated.View>
          <Text style={styles.heroPregunta}>
            {revelada
              ? `¡Ha salido el ${carta.etiqueta}${carta.palo}!`
              : beber
              ? `Quien tenga el mismo número, ${verbo(session.tono, 'bebe')} (doble si coincide el palo)`
              : 'Quien tenga el mismo número, pasa esa carta a quien quiera'}
          </Text>
        </View>
        <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
          {revelada ? (
            <PrimaryButton title={beber ? `Ver quién ${verbo(session.tono, 'bebe')}  →` : 'Continuar  →'} onPress={aplicarYContinuar} />
          ) : (
            <PrimaryButton title="Revelar carta  →" onPress={revelar} />
          )}
        </View>
      </View>
    );
  }

  // ─────────────────────────── PASAR (picker por carta) ───────────────────────────
  if (fase === 'pasar') {
    const item = pasarCola[pasarPos];
    const pasador = item.jugador;
    let opciones = jugadores
      .map((_, i) => i)
      .filter((i) => i !== pasador && (manosPasar[i]?.length ?? 0) < MAX_MANO);
    if (opciones.length === 0) opciones = jugadores.map((_, i) => i).filter((i) => i !== pasador);
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
        {Platform.OS !== 'web' && <KeepAwake />}
        <View style={styles.pasarHead}>
          <Overline color={colors.grayLt}>{`REPARTO ${pasarPos + 1} DE ${pasarCola.length}`}</Overline>
          <View style={styles.pasarCardRow}>
            <View style={[styles.avatar, { backgroundColor: colorJugador(pasador) }]}>
              <Text style={styles.avatarText}>{inicial(jugadores[pasador])}</Text>
            </View>
            <Text style={styles.pasarFlecha}>da su</Text>
            <CartaMini carta={item.carta} w={46} resalte="match" />
          </View>
          <Text style={styles.pasarTitulo}>{jugadores[pasador]}, ¿a quién se la das?</Text>
          <Text style={styles.pasarSub}>Quien la reciba {verbo(session.tono, 'bebe')} {tragosBase} {emoji(session.tono)}</Text>
        </View>

        <ScrollView contentContainerStyle={styles.pasarLista}>
          {opciones.map((i) => (
            <PressableScale key={i} onPress={() => elegirReceptor(i)} scaleTo={0.97} style={[styles.opcion, shadows.card]}>
              <View style={[styles.avatar, { backgroundColor: colorJugador(i) }]}>
                <Text style={styles.avatarText}>{inicial(jugadores[i])}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.opcionNombre}>{jugadores[i]}</Text>
                <Text style={styles.opcionCartas}>{manosPasar[i]?.length ?? 0} cartas</Text>
              </View>
              <Text style={styles.opcionTragos}>+{tragosBase} {emoji(session.tono)}</Text>
            </PressableScale>
          ))}
        </ScrollView>

        <SessionMenu visible={menuVisible} onClose={() => setMenuVisible(false)} onReiniciar={reiniciarJuego} />
      </View>
    );
  }

  // ─────────────────────────── RESULTADO ───────────────────────────
  const beber = eleccion === 'beber';
  const nadie = beber ? coincide.length === 0 : pasarRes.length === 0;
  return (
    <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
      {Platform.OS !== 'web' && <KeepAwake />}

      <View style={styles.resHead}>
        <Overline color={colors.grayLt}>{`CARTA REVELADA · ${tragosBase} ${emoji(session.tono)}`}</Overline>
        <Animated.View entering={FadeIn.duration(220)} style={styles.resCardWrap}>
          <CartaMini carta={carta} w={104} resalte="match" />
        </Animated.View>
      </View>

      <ScrollView contentContainerStyle={styles.resLista}>
        {nadie ? (
          <View style={styles.vacio}>
            <Text style={styles.vacioEmoji}>🍃</Text>
            <Text style={styles.vacioTexto}>Nadie tiene un {carta.etiqueta}. ¡Os libráis de esta!</Text>
          </View>
        ) : beber ? (
          <>
            <Text style={[styles.resLabel, { color: '#DC2626' }]}>Tienen un {carta.etiqueta} · {verbo(session.tono, 'beben')}</Text>
            {coincide.map((m) => (
              <FilaBebe
                key={m.jugador}
                nombre={jugadores[m.jugador]}
                color={colorJugador(m.jugador)}
                m={m}
                etiqueta={carta.etiqueta}
              />
            ))}
          </>
        ) : (
          <>
            <Text style={[styles.resLabel, { color: colors.purple }]}>Reparten su carta · quien la recibe bebe</Text>
            {pasarRes.map((p, i) => (
              <View key={i} style={[styles.filaPasa, shadows.card]}>
                <CartaMini carta={p.carta} w={30} resalte="match" />
                <Text style={styles.filaPasaNombre} numberOfLines={1}>
                  {jugadores[p.pasador]} <Text style={styles.flecha}>→</Text> {jugadores[p.receptor]}
                </Text>
                <Text style={styles.filaPasaTragos}>{p.tragos} {emoji(session.tono)}</Text>
              </View>
            ))}
            <Text style={styles.resPie}>✓ Cartas actualizadas en las manos</Text>
          </>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
        <PrimaryButton
          title={paso >= TOTAL_PIRAMIDE - 1 ? 'Ver resultados  →' : 'Siguiente carta  →'}
          onPress={siguiente}
        />
      </View>

      <SessionMenu visible={menuVisible} onClose={() => setMenuVisible(false)} onReiniciar={reiniciarJuego} />
    </View>
  );
}

// ─────────────────────────── Subcomponentes ───────────────────────────

function FilaBebe({
  nombre,
  color,
  m,
  etiqueta,
}: {
  nombre: string;
  color: string;
  m: Coincidencia;
  etiqueta: string;
}) {
  const { session } = useSession();
  const doble = m.mismoPalo > 0;
  const motivo =
    `${m.cartas.length} del nº ${etiqueta}` +
    (doble ? ` · ${m.mismoPalo} del mismo palo (×2)` : '');
  return (
    <View style={[styles.filaBebe, doble && styles.filaBebeDoble]}>
      <View style={styles.filaBebeCartas}>
        {m.cartas.map((cm, i) => (
          <CartaMini key={i} carta={cm.carta} w={30} resalte={cm.mismoPalo ? 'doble' : 'match'} />
        ))}
      </View>
      <View style={styles.filaBebeInfo}>
        <Text style={styles.filaBebeNombre} numberOfLines={1}>
          {nombre}
        </Text>
        <Text style={styles.filaBebeMotivo} numberOfLines={2}>
          {motivo}
        </Text>
      </View>
      <View style={styles.filaBebeTragosWrap}>
        <Text style={[styles.filaBebeTragos, { color: doble ? '#DC2626' : colors.ink }]}>{m.tragosBeber}</Text>
        <Text style={styles.filaBebeEmoji}>{emoji(session.tono)}</Text>
      </View>
    </View>
  );
}

function VistaPiramide({
  piramide,
  revelados,
  siguiente,
}: {
  piramide: CartaPoker[];
  revelados: Set<number>;
  siguiente: number;
}) {
  const { session } = useSession();
  // Visual: cima arriba, base abajo (FILAS está en orden de revelado base→cima).
  const filasVisual = FILAS.map((f, fi) => ({ ...f, fi })).reverse();
  return (
    <View style={styles.piramide}>
      {filasVisual.map(({ count, tragos, fi }) => (
        <View key={fi} style={styles.piramideFila}>
          <View style={styles.piramideTrago}>
            <Text style={styles.piramideTragoNum}>{tragos}</Text>
            <Text style={styles.piramideTragoEmoji}>{emoji(session.tono)}</Text>
          </View>
          {Array.from({ length: count }).map((_, k) => {
            const idx = INICIO_FILA[fi] + k;
            const shown = revelados.has(idx);
            const esSiguiente = idx === siguiente;
            return (
              <CartaMini
                key={idx}
                carta={piramide[idx]}
                w={40}
                faceDown={!shown}
                resalte={esSiguiente ? 'siguiente' : null}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}

function VistaManos({ jugadores, manos }: { jugadores: string[]; manos: CartaPoker[][] }) {
  return (
    <View style={styles.manos}>
      {jugadores.map((nombre, i) => (
        <View key={i} style={styles.manoFila}>
          <View style={styles.manoNombreWrap}>
            <View style={[styles.manoPunto, { backgroundColor: colorJugador(i) }]} />
            <Text style={styles.manoNombre} numberOfLines={1}>
              {nombre}
            </Text>
          </View>
          <View style={styles.manoCartas}>
            {(manos[i] ?? []).map((c, k) => (
              <CartaMini key={k} carta={c} w={28} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

function CartaMini({
  carta,
  w = 40,
  faceDown = false,
  dim = false,
  resalte = null,
}: {
  carta?: CartaPoker;
  w?: number;
  faceDown?: boolean;
  dim?: boolean;
  resalte?: Resalte;
}) {
  const h = w * 1.4;
  if (faceDown || !carta) {
    const sig = resalte === 'siguiente';
    return (
      <View
        style={[
          styles.dorso,
          {
            width: w,
            height: h,
            borderRadius: w * 0.16,
            borderColor: sig ? VERDE_SIG : colors.purpleDeep,
            borderWidth: sig ? 3 : 1.5,
            ...(sig
              ? { shadowColor: VERDE_SIG, shadowOpacity: 0.55, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 6 }
              : null),
          },
        ]}>
        <View
          style={[
            styles.dorsoMarco,
            { top: w * 0.1, left: w * 0.1, right: w * 0.1, bottom: w * 0.1, borderRadius: w * 0.1 },
          ]}
        />
        <Text style={[styles.dorsoLogo, { fontSize: w * 0.22 }]}>LP</Text>
      </View>
    );
  }
  const c = colorPalo(carta.palo);
  const borde = resalte === 'doble' ? colors.purpleAccent : resalte === 'match' ? colors.purple : '#E9E1FB';
  return (
    <View
      style={{
        width: w,
        height: h,
        borderRadius: w * 0.16,
        backgroundColor: colors.white,
        borderWidth: resalte ? 2.5 : 1.5,
        borderColor: borde,
        opacity: dim ? 0.4 : 1,
        alignItems: 'center',
        justifyContent: 'center',
        ...(resalte && resalte !== 'siguiente'
          ? { shadowColor: c, shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 }
          : null),
      }}>
      {/* Número y palo, una sola vez, centrados */}
      <Text style={{ fontFamily: fonts.display, fontSize: w * 0.42, lineHeight: w * 0.46, color: c }}>
        {carta.etiqueta}
      </Text>
      <Text style={{ fontSize: w * 0.4, lineHeight: w * 0.44, color: c, marginTop: -w * 0.02 }}>{carta.palo}</Text>
    </View>
  );
}

function BotonGrad({ label, colores, onPress }: { label: string; colores: string[]; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} scaleTo={0.965} style={styles.botonGrad}>
      <LinearGradient
        colors={colores as unknown as readonly [string, string, ...string[]]}
        start={gradientAngle.start}
        end={gradientAngle.end}
        style={styles.botonGradInner}>
        <Text style={styles.botonGradText}>{label}</Text>
      </LinearGradient>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: 22 },

  // Top
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  progresoWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  progresoTrack: { flex: 1, height: 6, borderRadius: 4, backgroundColor: colors.lav100, overflow: 'hidden' },
  progresoFill: { height: 6, borderRadius: 4, backgroundColor: colors.purple },
  contador: { fontFamily: fonts.bodyX, fontSize: 11, color: colors.grayLt, minWidth: 36, textAlign: 'right' },

  // Turno
  turnoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
  turnoNombre: { fontFamily: fonts.display, fontSize: 30, letterSpacing: -1, marginTop: 1 },
  valePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.lav100,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 30,
  },
  valeNum: { fontFamily: fonts.display, fontSize: 20, color: colors.purple },
  valeEmoji: { fontSize: 15 },

  // Pirámide
  piramideWrap: { alignItems: 'center', paddingVertical: 8 },
  piramide: { alignItems: 'center', gap: 5, paddingLeft: 30 },
  piramideFila: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  piramideTrago: { position: 'absolute', left: -34, flexDirection: 'row', alignItems: 'center', gap: 2 },
  piramideTragoNum: { fontFamily: fonts.display, fontSize: 14, color: colors.purple },
  piramideTragoEmoji: { fontSize: 10 },

  divisor: { height: 1, backgroundColor: colors.border, marginVertical: 8 },

  // Manos
  manosScroll: { flex: 1 },
  manosContent: { paddingTop: 8, paddingBottom: 4 },
  manos: { gap: 8 },
  manoFila: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  manoNombreWrap: { width: 78, flexDirection: 'row', alignItems: 'center', gap: 6 },
  manoPunto: { width: 8, height: 8, borderRadius: 4 },
  manoNombre: { flex: 1, fontFamily: fonts.display, fontSize: 12.5, color: colors.ink, letterSpacing: -0.3 },
  manoCartas: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 4 },

  // Acciones
  accionesRow: { flexDirection: 'row', gap: 10, paddingTop: 10 },
  botonGrad: { flex: 1, height: 64, borderRadius: 18 },
  botonGradInner: { flex: 1, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  botonGradText: { fontFamily: fonts.display, fontSize: 19, color: colors.white, letterSpacing: -0.3 },

  // Elección
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 22, paddingHorizontal: 24 },
  pill: { paddingVertical: 8, paddingHorizontal: 18, borderRadius: 30 },
  pillRojo: { backgroundColor: '#FEE2E2' },
  pillMorado: { backgroundColor: colors.lav100 },
  pillText: { fontFamily: fonts.display, fontSize: 16, letterSpacing: -0.3, textAlign: 'center' },
  heroWrap: { alignItems: 'center', justifyContent: 'center' },
  heroPregunta: { fontFamily: fonts.bodyBold, fontSize: 14.5, lineHeight: 20, color: colors.gray, textAlign: 'center' },

  // Pasar
  pasarHead: { alignItems: 'center', paddingTop: 12, paddingBottom: 16, gap: 8 },
  pasarCardRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  pasarFlecha: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.gray },
  pasarTitulo: { fontFamily: fonts.display, fontSize: 23, letterSpacing: -0.7, color: colors.ink, textAlign: 'center', marginTop: 4 },
  pasarSub: { fontFamily: fonts.body, fontSize: 13.5, color: colors.gray },
  pasarLista: { gap: 10, paddingBottom: 20 },
  opcion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 14,
  },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fonts.display, fontSize: 17, color: colors.white },
  opcionNombre: { fontFamily: fonts.display, fontSize: 19, color: colors.ink, letterSpacing: -0.4 },
  opcionCartas: { fontFamily: fonts.body, fontSize: 12, color: colors.grayLt, marginTop: 1 },
  opcionTragos: { fontFamily: fonts.bodyX, fontSize: 14, color: colors.purple },

  // Resultado
  resHead: { alignItems: 'center', paddingTop: 6, paddingBottom: 12, gap: 10 },
  resCardWrap: { alignItems: 'center' },
  resLista: { paddingBottom: 16, gap: 8 },
  resLabel: { fontFamily: fonts.bodyX, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 2 },
  resPie: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.green, textAlign: 'center', marginTop: 6 },
  vacio: { alignItems: 'center', paddingTop: 30, gap: 10 },
  vacioEmoji: { fontSize: 44 },
  vacioTexto: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.gray, textAlign: 'center', paddingHorizontal: 30 },

  filaBebe: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 16,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  filaBebeDoble: { backgroundColor: '#FEE2E2', borderColor: '#EF4444' },
  filaBebeCartas: { flexDirection: 'row', gap: 3 },
  filaBebeInfo: { flex: 1 },
  filaBebeNombre: { fontFamily: fonts.display, fontSize: 16, color: colors.ink, letterSpacing: -0.4 },
  filaBebeMotivo: { fontFamily: fonts.body, fontSize: 11.5, color: colors.gray, marginTop: 1 },
  filaBebeTragosWrap: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  filaBebeTragos: { fontFamily: fonts.display, fontSize: 26 },
  filaBebeEmoji: { fontSize: 15 },

  filaPasa: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  filaPasaNombre: { flex: 1, fontFamily: fonts.display, fontSize: 15.5, color: colors.ink, letterSpacing: -0.3 },
  flecha: { color: colors.purple },
  filaPasaTragos: { fontFamily: fonts.bodyX, fontSize: 13.5, color: colors.purple },

  footer: { paddingTop: 10 },

  // Carta dorso
  dorso: {
    backgroundColor: colors.purple,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  dorsoMarco: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  dorsoLogo: { fontFamily: fonts.display, color: 'rgba(255,255,255,0.9)', letterSpacing: 0.5 },
});
