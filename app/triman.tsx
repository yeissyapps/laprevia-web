// Triman — juego de dados con mecánica de racha. Sin JSON: lógica pura.
// El primero en sacar suma 3 se corona Triman; a partir de ahí cada 3 le hace
// beber. El Triman solo se libera sacando un 3 en su propio turno.
//
// Modos:
//  · Competición → paso previo de ORDEN DE ASIENTOS (para saber derecha/izquierda)
//    y aplicación automática de tragos con sumarTragos().
//  · Juego Libre y Escalada → sin orden; el resultado se muestra como texto y el
//    grupo lo resuelve verbalmente (en Escalada no hay paso de config para recoger
//    el orden, así que se comporta como Libre).

import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Confetti } from '@/components/Confetti';
import { Dado } from '@/components/Dado';
import { RulesButton } from '@/components/GameRules';
import { Overline } from '@/components/Overline';
import { PickerJugadores } from '@/components/PickerJugadores';
import { PressableScale } from '@/components/PressableScale';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SecondaryButton } from '@/components/SecondaryButton';
import { SessionMenu, SessionMenuButton } from '@/components/SessionMenu';
import { useSession } from '@/context/SessionContext';
import { emoji, unidad, verbo } from '@/utils/textoTono';
import type { Tono } from '@/data/types';
import {
  MIN_JUGADORES_TRIMAN,
  continuaRacha,
  resolverTirada,
  tirarDado,
  type EfectoTriman,
} from '@/data/triman';
import { colors, fonts, gradientAngle, gradients, shadows } from '@/theme/theme';

type Fase = 'orden' | 'tirada' | 'resultado' | 'coronacion' | 'liberacion';

function KeepAwake() {
  useKeepAwake();
  return null;
}

const inicial = (nombre: string) => (nombre.trim()[0] ?? '?').toUpperCase();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function TrimanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, sumarTragos, registrarPartida } = useSession();

  const jugadores = session.jugadores.length > 0 ? session.jugadores : ['Jugador 1', 'Jugador 2'];
  const n = jugadores.length;
  // Solo Competición recoge el orden de asientos y aplica tragos automáticamente.
  const enCompeticion = session.modo === 'competicion';
  // Competición y Escalada cierran en /fin-juego (marcador / avance de nivel).
  const enMarcador = session.modo === 'competicion' || session.modo === 'escalada';

  const [orden, setOrden] = useState<number[]>(() => jugadores.map((_, i) => i));
  const [turnPos, setTurnPos] = useState(0);
  const [trimanIdx, setTrimanIdx] = useState<number | null>(null);
  const [dados, setDados] = useState<[number, number]>([1, 1]);
  const [efecto, setEfecto] = useState<EfectoTriman | null>(null);
  const [repartido, setRepartido] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [fase, setFase] = useState<Fase>(enCompeticion ? 'orden' : 'tirada');
  const [menuVisible, setMenuVisible] = useState(false);
  const [rodando, setRodando] = useState(false); // animación de girar los dados

  // Resync ante cambios de nº de jugadores (añadir/eliminar en el menú, hidratación).
  const prevN = useRef(n);
  useEffect(() => {
    if (prevN.current === n) return;
    prevN.current = n;
    setOrden(jugadores.map((_, i) => i));
    setTurnPos(0);
    setTrimanIdx((t) => (t != null && t < n ? t : null));
    setEfecto(null);
    setPickerVisible(false);
    setFase(enCompeticion ? 'orden' : 'tirada');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n]);

  const currentIdx = orden[turnPos] ?? 0;
  const rightIdx = orden[(turnPos + 1) % n];
  const leftIdx = orden[(turnPos - 1 + n) % n];
  const current = jugadores[currentIdx];
  const trimanNombre = trimanIdx != null ? jugadores[trimanIdx] : null;

  const tirar = async () => {
    if (rodando) return;
    const d1 = tirarDado();
    const d2 = tirarDado();

    // Animación de "girar": los dados ciclan valores aleatorios antes del resultado
    // (mismo patrón que Oca/Parchís). El resultado real (d1/d2) ya está decidido.
    setRodando(true);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    for (let k = 0; k < 8; k++) {
      setDados([1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]);
      await sleep(60);
    }
    setDados([d1, d2]);
    await sleep(200);
    setRodando(false);

    const eff = resolverTirada(d1, d2, trimanIdx, currentIdx);
    setEfecto(eff);
    setRepartido(false);

    if (eff.kind === 'triman_coronado') {
      setTrimanIdx(currentIdx);
      setFase('coronacion');
      return;
    }
    if (eff.kind === 'triman_liberado') {
      setFase('liberacion');
      return;
    }

    // Aplicación automática de tragos SOLO en Competición (tiene orden de asientos).
    if (enCompeticion) {
      if (eff.kind === 'derecha') sumarTragos(rightIdx, 1);
      else if (eff.kind === 'izquierda') sumarTragos(leftIdx, 1);
      else if (eff.kind === 'brindis') jugadores.forEach((_, i) => sumarTragos(i, 1));
      else if (eff.kind === 'triman_bebe' && trimanIdx != null) sumarTragos(trimanIdx, 1);
      else if (eff.kind === 'doble') setPickerVisible(true); // reparto manual
    }
    setFase('resultado');
  };

  const continuar = () => {
    if (efecto && continuaRacha(efecto)) {
      setFase('tirada'); // mismo jugador sigue tirando
      return;
    }
    setTurnPos((p) => (p + 1) % n); // tirada vacía → pasa turno
    setFase('tirada');
  };

  const onCoronado = () => setFase('tirada'); // sacó un 3 → la racha continúa
  const onLiberado = (nuevo: number) => {
    setTrimanIdx(nuevo);
    setTurnPos((p) => (p + 1) % n); // liberarse pasa turno
    setFase('tirada');
  };

  const terminar = () => {
    if (rodando) return;
    if (enMarcador) {
      router.replace('/fin-juego');
      return;
    }
    registrarPartida();
    router.replace('/juegos');
  };

  const reiniciarJuego = () => {
    setTrimanIdx(null);
    setTurnPos(0);
    setEfecto(null);
    setRepartido(false);
    setPickerVisible(false);
    setFase(enCompeticion ? 'orden' : 'tirada');
  };

  const moverAsiento = (pos: number, dir: -1 | 1) => {
    setOrden((o) => {
      const ni = pos + dir;
      if (ni < 0 || ni >= o.length) return o;
      const copia = [...o];
      [copia[pos], copia[ni]] = [copia[ni], copia[pos]];
      return copia;
    });
  };

  // ——— Guarda de mínimo de jugadores ———
  if (n < MIN_JUGADORES_TRIMAN) {
    return (
      <View style={styles.screen}>
        <View style={[styles.centro, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
          <Text style={styles.bigEmoji}>🎲</Text>
          <Text style={styles.guardTitulo}>Faltan jugadores</Text>
          <Text style={styles.guardSub}>Triman necesita al menos {MIN_JUGADORES_TRIMAN} jugadores.</Text>
          <View style={styles.guardBtn}>
            <PrimaryButton title="Volver al menú" onPress={() => router.replace('/juegos')} />
          </View>
        </View>
      </View>
    );
  }

  // ——— Coronación (dorado exclusivo) ———
  if (fase === 'coronacion') {
    return <Coronacion nombre={current} onDone={onCoronado} insets={insets} />;
  }

  // ——— Liberación (picker de nuevo Triman) ———
  if (fase === 'liberacion') {
    return (
      <Liberacion
        jugadores={jugadores}
        excluir={currentIdx}
        onPick={onLiberado}
        insets={insets}
      />
    );
  }

  // ——— Orden de asientos (solo Competición) ———
  if (fase === 'orden') {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
        <View style={styles.ordenTop}>
          <Overline>🎲 TRIMAN</Overline>
          <Text style={styles.ordenTitulo}>Orden en la mesa</Text>
          <Text style={styles.ordenSub}>
            Colocad a los jugadores en el orden en que estáis sentados (en círculo). Así sabremos a
            quién le toca {verbo(session.tono, 'beber')} a tu derecha y a tu izquierda.
          </Text>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.ordenLista} showsVerticalScrollIndicator={false}>
          {orden.map((jIdx, pos) => (
            <View key={jIdx} style={styles.ordenFila}>
              <View style={styles.ordenAvatar}>
                <Text style={styles.ordenAvatarText}>{pos + 1}</Text>
              </View>
              <Text style={styles.ordenNombre} numberOfLines={1}>
                {jugadores[jIdx]}
              </Text>
              <View style={styles.ordenBtns}>
                <PressableScale
                  onPress={() => moverAsiento(pos, -1)}
                  disabled={pos === 0}
                  style={[styles.ordenBtn, pos === 0 && styles.ordenBtnOff]}
                  hitSlop={6}>
                  <Text style={styles.ordenBtnText}>▲</Text>
                </PressableScale>
                <PressableScale
                  onPress={() => moverAsiento(pos, 1)}
                  disabled={pos === orden.length - 1}
                  style={[styles.ordenBtn, pos === orden.length - 1 && styles.ordenBtnOff]}
                  hitSlop={6}>
                  <Text style={styles.ordenBtnText}>▼</Text>
                </PressableScale>
              </View>
            </View>
          ))}
        </ScrollView>
        <View style={{ paddingHorizontal: 26, paddingBottom: insets.bottom + 14 }}>
          <PrimaryButton title="Confirmar orden" onPress={() => setFase('tirada')} />
        </View>
      </View>
    );
  }

  const info = efecto ? describir(efecto, { enCompeticion, rightName: jugadores[rightIdx], leftName: jugadores[leftIdx], trimanNombre, tono: session.tono }) : null;
  const vacio = efecto?.kind === 'vacio';
  const necesitaRepartir = enCompeticion && efecto?.kind === 'doble' && !repartido;

  return (
    <View style={styles.screen}>
      {Platform.OS !== 'web' && <KeepAwake />}

      {/* Cabecera: badge de Triman + reglas + menú */}
      <View style={[styles.top, { paddingTop: insets.top + 10 }]}>
        <View style={{ flex: 1 }}>
          {trimanNombre ? <TrimanBadge nombre={trimanNombre} /> : <SinTrimanBadge />}
        </View>
        <RulesButton juegoId="triman" />
        <SessionMenuButton onPress={() => setMenuVisible(true)} />
      </View>

      {fase === 'tirada' ? (
        /* ——— TIRADA ——— */
        <>
          <View style={styles.centroTirada}>
            <View style={styles.turnoBlock}>
              <Overline color={colors.grayLt}>LE TOCA A</Overline>
              <Text style={styles.turnoNombre} numberOfLines={1} adjustsFontSizeToFit>
                {current}
              </Text>
            </View>
            <View style={styles.dadosRow}>
              <Dado valor={dados[0]} size={100} />
              <Dado valor={dados[1]} size={100} color={colors.purple} />
            </View>
          </View>
          <View style={[styles.acciones, { paddingBottom: insets.bottom + 14 }]}>
            <PressableScale onPress={tirar} scaleTo={0.965} disabled={rodando}>
              <LinearGradient
                colors={gradients.purple.colors}
                locations={gradients.purple.locations}
                start={gradientAngle.start}
                end={gradientAngle.end}
                style={styles.tirarBtn}>
                <Text style={styles.tirarText}>{rodando ? '🎲 Rodando…' : '🎲 Tirar dados'}</Text>
              </LinearGradient>
            </PressableScale>
            <SecondaryButton
              title={enMarcador ? 'Terminar y ver marcador' : 'Cambiar de juego'}
              variant="ghost"
              onPress={terminar}
            />
          </View>
        </>
      ) : (
        /* ——— RESULTADO (con efecto o vacío) ——— */
        <Animated.View key={`res-${turnPos}-${dados[0]}-${dados[1]}`} entering={FadeIn.duration(220)} style={styles.centroResultado}>
          <View style={[styles.dadosRow, { opacity: vacio ? 0.55 : 1 }]}>
            <Dado valor={dados[0]} size={82} color={vacio ? colors.ink : colors.purple} />
            <Dado valor={dados[1]} size={82} color={vacio ? colors.ink : colors.purple} />
          </View>
          <Text style={styles.suma}>Suma {dados[0] + dados[1]}</Text>

          <View style={[styles.infoBox, { backgroundColor: vacio ? colors.ghost : colors.lav100 }]}>
            <Text style={[styles.infoTitulo, { color: vacio ? colors.gray : colors.purple }]}>{info?.title}</Text>
            <Text style={[styles.infoDetalle, { color: vacio ? colors.grayLt : colors.purpleDeep }]}>{info?.detail}</Text>
          </View>

          <View style={[styles.estadoPill, { backgroundColor: vacio ? colors.redBg : colors.greenBg }]}>
            <Text style={[styles.estadoText, { color: vacio ? colors.red : colors.green }]}>
              {vacio ? '➡️ Pasa el turno' : '¡Sigue tirando!'}
            </Text>
          </View>

          <View style={[styles.acciones, styles.accionesResultado, { paddingBottom: insets.bottom + 14 }]}>
            {necesitaRepartir ? (
              <PrimaryButton
                title={`Repartir ${efecto?.kind === 'doble' ? efecto.total : 0} ${emoji(session.tono)}`}
                onPress={() => setPickerVisible(true)}
              />
            ) : vacio ? (
              <PrimaryButton title="Siguiente jugador" onPress={continuar} />
            ) : (
              <PrimaryButton title="🎲 Tirar otra vez" onPress={continuar} />
            )}
          </View>
        </Animated.View>
      )}

      <SessionMenu
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        onReiniciar={reiniciarJuego}
        validarEliminar={() =>
          n <= MIN_JUGADORES_TRIMAN
            ? `Triman necesita al menos ${MIN_JUGADORES_TRIMAN} jugadores.`
            : null
        }
      />

      <PickerJugadores
        visible={pickerVisible}
        modo="multiple"
        titulo={`Reparte los ${unidad(session.tono, 2)}`}
        subtitulo={`Dobles: reparte ${efecto?.kind === 'doble' ? efecto.total : 0} ${unidad(session.tono, 2)} entre quien quieras`}
        cantidad={1}
        maxTotal={efecto?.kind === 'doble' ? efecto.total : undefined}
        onDone={() => {
          setPickerVisible(false);
          setRepartido(true);
        }}
      />
    </View>
  );
}

// ——— Texto del resultado según efecto y modo ———
function describir(
  e: EfectoTriman,
  ctx: { enCompeticion: boolean; rightName: string; leftName: string; trimanNombre: string | null; tono: Tono }
): { title: string; detail: string } {
  const chill = ctx.tono === 'chill';
  switch (e.kind) {
    case 'derecha':
      return {
        title: 'Suma 7',
        detail: ctx.enCompeticion
          ? (chill ? `Punto para ${ctx.rightName}` : `Bebe ${ctx.rightName}`)
          : (chill ? 'Punto para el jugador de tu derecha' : 'Bebe el jugador de tu derecha'),
      };
    case 'izquierda':
      return {
        title: 'Suma 9',
        detail: ctx.enCompeticion
          ? (chill ? `Punto para ${ctx.leftName}` : `Bebe ${ctx.leftName}`)
          : (chill ? 'Punto para el jugador de tu izquierda' : 'Bebe el jugador de tu izquierda'),
      };
    case 'brindis':
      return { title: 'Suma 11', detail: chill ? '¡Todos a una! Toda la mesa suma un punto' : '¡Brindis! Toda la mesa bebe' };
    case 'doble':
      return { title: `Dobles (${e.total})`, detail: chill ? `Repartes ${e.total} puntos a quien quieras` : `Repartes ${e.total} tragos a quien quieras` };
    case 'triman_bebe':
      return {
        title: '¡Sale un 3!',
        detail: ctx.trimanNombre
          ? (chill ? `Punto para el Triman: ${ctx.trimanNombre}` : `Bebe el Triman: ${ctx.trimanNombre}`)
          : (chill ? 'Punto para el Triman' : 'Bebe el Triman'),
      };
    default:
      return { title: 'Tirada vacía', detail: 'Nada especial esta vez' };
  }
}

// ——— Badges de estado del Triman ———
function TrimanBadge({ nombre }: { nombre: string }) {
  return (
    <View style={styles.badgeTriman}>
      <Text style={styles.badgeEmoji}>👑</Text>
      <Text style={styles.badgeTrimanText} numberOfLines={1}>
        Triman: <Text style={styles.badgeTrimanNombre}>{nombre}</Text>
      </Text>
    </View>
  );
}

function SinTrimanBadge() {
  return (
    <View style={styles.badgeSin}>
      <Text style={styles.badgeEmoji}>🎯</Text>
      <Text style={styles.badgeSinText}>Nadie es Triman todavía</Text>
    </View>
  );
}

// ——— Coronación (dorado exclusivo) ———
function Coronacion({ nombre, onDone, insets }: { nombre: string; onDone: () => void; insets: { bottom: number } }) {
  const { session } = useSession();
  return (
    <View style={styles.screen}>
      {Platform.OS !== 'web' && <KeepAwake />}
      <Confetti cantidad={30} />
      <LinearGradient colors={['#FDE68A', '#F59E0B', '#B45309']} locations={[0, 0.46, 1]} style={styles.coronaWrap}>
        <Text style={styles.coronaEmoji}>👑</Text>
        <Overline color="rgba(120,53,15,0.85)">¡PRIMER 3 DE LA PARTIDA!</Overline>
        <Text style={styles.coronaNombre} numberOfLines={2} adjustsFontSizeToFit>
          {nombre} es el Triman
        </Text>
        <View style={styles.coronaBox}>
          <Text style={styles.coronaBoxText}>
            A partir de ahora, cualquier 3 que salga… le hace {verbo(session.tono, 'beber')} a él.
          </Text>
        </View>
        <View style={[styles.coronaBtnWrap, { bottom: insets.bottom + 20 }]}>
          <Pressable onPress={onDone} style={({ pressed }) => [styles.coronaBtn, pressed && { transform: [{ scale: 0.965 }] }]}>
            <Text style={styles.coronaBtnText}>Larga vida al Triman</Text>
          </Pressable>
        </View>
      </LinearGradient>
    </View>
  );
}

// ——— Liberación (elige nuevo Triman) ———
function Liberacion({
  jugadores,
  excluir,
  onPick,
  insets,
}: {
  jugadores: string[];
  excluir: number;
  onPick: (idx: number) => void;
  insets: { top: number; bottom: number };
}) {
  const candidatos = jugadores.map((_, i) => i).filter((i) => i !== excluir);
  const [sel, setSel] = useState(candidatos[0] ?? 0);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
      <View style={styles.libTop}>
        <Text style={styles.libEmoji}>🕊️</Text>
        <Text style={styles.libTitulo} numberOfLines={2} adjustsFontSizeToFit>
          ¡{jugadores[excluir]} se libera!
        </Text>
        <Text style={styles.libSub}>Sacó un 3 en su propio turno. Elige al nuevo Triman:</Text>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.libLista} showsVerticalScrollIndicator={false}>
        {candidatos.map((i) => {
          const on = sel === i;
          return (
            <PressableScale
              key={i}
              onPress={() => setSel(i)}
              scaleTo={0.98}
              style={[styles.libFila, on && styles.libFilaOn]}>
              <View style={[styles.libAvatar, on && styles.libAvatarOn]}>
                <Text style={[styles.libAvatarText, on && { color: colors.white }]}>{inicial(jugadores[i])}</Text>
              </View>
              <Text style={[styles.libNombre, on && { color: colors.white }]} numberOfLines={1}>
                {jugadores[i]}
              </Text>
              <View style={[styles.libCheck, on && styles.libCheckOn]}>
                {on && <Text style={styles.libCheckText}>✓</Text>}
              </View>
            </PressableScale>
          );
        })}
      </ScrollView>
      <View style={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 14 }}>
        <Pressable onPress={() => onPick(sel)} style={({ pressed }) => [styles.libBtn, pressed && { transform: [{ scale: 0.965 }] }]}>
          <Text style={styles.libBtnText}>👑 Nombrar Triman</Text>
        </Pressable>
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
  // guarda mínimo jugadores
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, gap: 10 },
  bigEmoji: { fontSize: 64 },
  guardTitulo: { fontFamily: fonts.display, fontSize: 26, letterSpacing: -0.8, color: colors.ink, textAlign: 'center' },
  guardSub: { fontFamily: fonts.body, fontSize: 14, color: colors.gray, textAlign: 'center', maxWidth: 300 },
  guardBtn: { alignSelf: 'stretch', marginTop: 8 },
  // badges
  badgeTriman: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#FEF3C7',
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 30,
  },
  badgeEmoji: { fontSize: 16 },
  badgeTrimanText: { fontFamily: fonts.display, fontSize: 13, color: '#92400E', letterSpacing: -0.2 },
  badgeTrimanNombre: { color: '#78350F' },
  badgeSin: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    backgroundColor: colors.lav100,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 30,
  },
  badgeSinText: { fontFamily: fonts.display, fontSize: 13, color: colors.purple, letterSpacing: -0.2 },
  // tirada
  centroTirada: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 30 },
  turnoBlock: { alignItems: 'center', gap: 4 },
  turnoNombre: { fontFamily: fonts.display, fontSize: 44, letterSpacing: -1.5, color: colors.ink, textAlign: 'center', maxWidth: 340 },
  dadosRow: { flexDirection: 'row', gap: 16 },
  acciones: { paddingHorizontal: 26, gap: 10 },
  accionesResultado: { alignSelf: 'stretch' },
  tirarBtn: { height: 76, borderRadius: 20, alignItems: 'center', justifyContent: 'center', ...shadows.purple },
  tirarText: { fontFamily: fonts.display, fontSize: 24, color: colors.white, letterSpacing: -0.3 },
  // resultado
  centroResultado: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18, paddingHorizontal: 26 },
  suma: { fontFamily: fonts.display, fontSize: 15, color: colors.grayLt },
  infoBox: { borderRadius: 20, padding: 18, alignItems: 'center', maxWidth: 320 },
  infoTitulo: { fontFamily: fonts.display, fontSize: 22, letterSpacing: -0.5, textAlign: 'center' },
  infoDetalle: { fontFamily: fonts.bodyBold, fontSize: 15, marginTop: 4, textAlign: 'center' },
  estadoPill: { paddingVertical: 9, paddingHorizontal: 20, borderRadius: 30 },
  estadoText: { fontFamily: fonts.display, fontSize: 14 },
  // orden de asientos
  ordenTop: { paddingHorizontal: 26, gap: 6, marginBottom: 10 },
  ordenTitulo: { fontFamily: fonts.display, fontSize: 32, letterSpacing: -1.2, color: colors.ink, marginTop: 6 },
  ordenSub: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.gray },
  ordenLista: { paddingHorizontal: 26, paddingVertical: 10, gap: 10 },
  ordenFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  ordenAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.lav100, alignItems: 'center', justifyContent: 'center' },
  ordenAvatarText: { fontFamily: fonts.display, fontSize: 16, color: colors.purple },
  ordenNombre: { flex: 1, fontFamily: fonts.display, fontSize: 20, letterSpacing: -0.4, color: colors.ink },
  ordenBtns: { flexDirection: 'row', gap: 8 },
  ordenBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.ghost, alignItems: 'center', justifyContent: 'center' },
  ordenBtnOff: { opacity: 0.35 },
  ordenBtnText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.purple },
  // coronación
  coronaWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, gap: 16 },
  coronaEmoji: { fontSize: 84 },
  coronaNombre: { fontFamily: fonts.display, fontSize: 46, letterSpacing: -1.8, color: colors.white, textAlign: 'center', marginTop: 4, maxWidth: 340 },
  coronaBox: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
    borderRadius: 18,
    padding: 16,
    marginTop: 6,
  },
  coronaBoxText: { fontFamily: fonts.body, fontSize: 14, color: colors.white, textAlign: 'center', lineHeight: 21, maxWidth: 300 },
  coronaBtnWrap: { position: 'absolute', left: 26, right: 26 },
  coronaBtn: { height: 70, borderRadius: 20, backgroundColor: '#78350F', alignItems: 'center', justifyContent: 'center' },
  coronaBtnText: { fontFamily: fonts.display, fontSize: 21, color: '#FDE68A' },
  // liberación
  libTop: { alignItems: 'center', paddingHorizontal: 26, gap: 6 },
  libEmoji: { fontSize: 52 },
  libTitulo: { fontFamily: fonts.display, fontSize: 30, letterSpacing: -1, color: colors.ink, textAlign: 'center', marginTop: 4, maxWidth: 340 },
  libSub: { fontFamily: fonts.body, fontSize: 14, color: colors.gray, textAlign: 'center', maxWidth: 320 },
  libLista: { paddingHorizontal: 24, paddingTop: 18, gap: 10 },
  libFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 14,
  },
  libFilaOn: { backgroundColor: colors.purple, borderColor: colors.purple },
  libAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.lav100, alignItems: 'center', justifyContent: 'center' },
  libAvatarOn: { backgroundColor: 'rgba(255,255,255,0.22)' },
  libAvatarText: { fontFamily: fonts.display, fontSize: 17, color: colors.purple },
  libNombre: { flex: 1, fontFamily: fonts.display, fontSize: 19, color: colors.ink, letterSpacing: -0.3 },
  libCheck: { width: 26, height: 26, borderRadius: 13, borderWidth: 2.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  libCheckOn: { borderColor: colors.white, backgroundColor: colors.white },
  libCheckText: { color: colors.purple, fontFamily: fonts.display, fontSize: 13 },
  libBtn: { height: 70, borderRadius: 20, backgroundColor: '#F59E0B', alignItems: 'center', justifyContent: 'center' },
  libBtnText: { fontFamily: fonts.display, fontSize: 21, color: '#78350F' },
});
