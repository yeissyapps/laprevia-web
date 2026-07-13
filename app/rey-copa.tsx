// Rey de la Copa — se voltean cartas (baraja de 52), cada valor tiene su regla
// fija; los Reyes acumulan tragos hasta que el 4º acaba la partida.

import { LinearGradient } from 'expo-linear-gradient';
import { useKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Confetti } from '@/components/Confetti';
import { RulesButton } from '@/components/GameRules';
import { Overline } from '@/components/Overline';
import { CardBack, PokerCard } from '@/components/PokerCard';
import { PickerJugadores } from '@/components/PickerJugadores';
import { PressableScale } from '@/components/PressableScale';
import { PrimaryButton } from '@/components/PrimaryButton';
import { ReglasActivas, type ReglaActiva } from '@/components/ReglasActivas';
import { SecondaryButton } from '@/components/SecondaryButton';
import { SessionMenu, SessionMenuButton } from '@/components/SessionMenu';
import { useSession } from '@/context/SessionContext';
import { cap, emoji, unidad, verbo } from '@/utils/textoTono';
import { mazoPoker } from '@/data/mayorMenor';
import {
  COLORES_COMPI,
  MAX_REGLAS_REY,
  REGLAS_REY,
  efectoRey,
  textoRegla,
  type EfectoRey,
} from '@/data/reyCopa';
import { colors, fonts, gradientAngle, gradients, radius, shadows, type } from '@/theme/theme';

interface Alianza {
  a: number;
  b: number;
  color: string;
}
type ModalRey = { tipo: 'as' } | { tipo: 'ocho' } | { tipo: 'quitarRegla'; nueva: ReglaActiva } | null;

function KeepAwake() {
  useKeepAwake();
  return null;
}

export default function ReyCopaScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, sumarTragos, registrarPartida } = useSession();

  const jugadores = session.jugadores.length > 0 ? session.jugadores : ['Jugador 1', 'Jugador 2'];
  const enCompeticion = session.modo === 'competicion' || session.modo === 'escalada';

  const [nonce, setNonce] = useState(0);
  const mazo = useMemo(() => mazoPoker(), [nonce]);

  const [idx, setIdx] = useState(0);
  const [turno, setTurno] = useState(0);
  const [revelada, setRevelada] = useState(false);
  const [reyes, setReyes] = useState(0);
  const [flash, setFlash] = useState(0);
  const [efecto, setEfecto] = useState<EfectoRey | null>(null);
  const [finPendiente, setFinPendiente] = useState(false);
  const [fase, setFase] = useState<'jugando' | 'finRey'>('jugando');
  const [reglasActivas, setReglasActivas] = useState<ReglaActiva[]>([]);
  const [alianzas, setAlianzas] = useState<Alianza[]>([]);
  const [modal, setModal] = useState<ModalRey>(null);
  const [reglaTexto, setReglaTexto] = useState('');
  const [menuVisible, setMenuVisible] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  // Alto/ancho medidos de la zona de carta (para escalar la carta y que quepa).
  const [areaH, setAreaH] = useState(0);
  const [areaW, setAreaW] = useState(0);

  const jugadorIdx = turno % jugadores.length;
  const jugador = jugadores[jugadorIdx];
  const carta = mazo[idx];
  const regla = REGLAS_REY[carta.valor];

  const flip = useSharedValue(0);
  const flipStyle = useAnimatedStyle(() => ({
    // Flip 2D con scaleX (no rotateY): el rotateY creaba una capa 3D que corrompía
    // el render en iOS (media pantalla en blanco). scaleX = cos(ángulo) comprime la
    // carta a una línea a 90° y vuelve. `flip` sigue yendo 0→90→0.
    transform: [{ scaleX: Math.cos((flip.value * Math.PI) / 180) }],
  }));
  const ocupado = useRef(false);
  // Secuencia monotónica para ids de regla únicos (evita keys duplicadas si se
  // confirma dos veces en el mismo As / mismo índice de carta).
  const reglaSeq = useRef(0);

  const aplicar = () => {
    if (regla.auto) {
      if (regla.auto.quien === 'drawer') sumarTragos(jugadorIdx, regla.auto.cantidad);
      else jugadores.forEach((_, i) => sumarTragos(i, regla.auto!.cantidad));
    }
    if (regla.especial === 'as') setModal({ tipo: 'as' });
    else if (regla.especial === 'ocho') setModal({ tipo: 'ocho' });
    else if (regla.especial === 'rey') {
      const nuevo = reyes + 1;
      const ef = efectoRey(nuevo, session.tono);
      setReyes(nuevo);
      setFlash(nuevo);
      setEfecto(ef);
      sumarTragos(jugadorIdx, ef.bebe);
      if (ef.fin) setFinPendiente(true);
    }
  };

  // Funciones JS (no worklet): pasar un closure creado dentro del worklet a
  // runOnJS crashea en iOS. Por eso se nombran fuera.
  const liberarFlip = () => { ocupado.current = false; };
  const revelarYAplicar = () => { setRevelada(true); aplicar(); };

  const voltear = () => {
    if (ocupado.current || revelada) return;
    ocupado.current = true;
    // Dos tramos encadenados: a 90° (canto) se revela la carta y se aplica su
    // efecto; la vuelta a 0° la deja visible. Sin setTimeout que desincroniza iOS.
    flip.value = withSequence(
      withTiming(90, { duration: 200, easing: Easing.in(Easing.quad) }, (finished) => {
        if (finished) runOnJS(revelarYAplicar)();
      }),
      withTiming(0, { duration: 200, easing: Easing.out(Easing.quad) }, (finished) => {
        if (finished) runOnJS(liberarFlip)();
      })
    );
  };

  const avanzarReal = () => {
    if (finPendiente) {
      // En Libre cuenta como juego completado (en Competición ya cuenta fin-juego).
      if (!enCompeticion) registrarPartida();
      setFase('finRey');
      return;
    }
    if (idx + 1 >= mazo.length) {
      router.replace('/fin-juego');
      return;
    }
    setIdx((i) => i + 1);
    setTurno((t) => t + 1);
    setRevelada(false);
    setEfecto(null);
  };

  // En Competición capturamos los tragos no deterministas (reparte / "los que…"
  // / reparto de Reyes) con el picker antes de avanzar.
  const reparteRey = regla.especial === 'rey' && !!efecto && efecto.reparte > 0;
  const pickerCfg = regla.captura ?? (reparteRey ? ({ modo: 'multiple', cantidad: 1 } as const) : null);
  const pickerSub = reparteRey ? `Reparte ${efecto?.reparte} ${unidad(session.tono, efecto?.reparte ?? 2)}` : textoRegla(carta.valor, jugador, session.tono);

  const siguiente = () => {
    if (enCompeticion && revelada && pickerCfg) {
      setPickerVisible(true);
      return;
    }
    avanzarReal();
  };

  // ——— As: confirmar regla ———
  const confirmarRegla = () => {
    const texto = reglaTexto.trim();
    if (!texto) return;
    const nueva: ReglaActiva = { id: `as-${idx}-${reglaSeq.current++}`, texto };
    if (reglasActivas.length >= MAX_REGLAS_REY) {
      setModal({ tipo: 'quitarRegla', nueva });
    } else {
      setReglasActivas((r) => [...r, nueva]);
      setModal(null);
    }
    setReglaTexto('');
  };
  const resolverQuitar = (id: string, nueva: ReglaActiva) => {
    setReglasActivas((r) => [...r.filter((x) => x.id !== id), ...(id === nueva.id ? [] : [nueva])]);
    setModal(null);
  };

  // ——— 8: compañero de bebida ———
  const elegirCompi = (p: number) => {
    const d = jugadorIdx;
    const color = COLORES_COMPI[alianzas.length % COLORES_COMPI.length];
    setAlianzas((al) => [
      ...al.filter((x) => ![x.a, x.b].some((q) => q === d || q === p)),
      { a: d, b: p, color },
    ]);
    setModal(null);
  };
  const alianzaDe = (i: number) => alianzas.find((al) => al.a === i || al.b === i);

  const reiniciarJuego = () => {
    setNonce((n) => n + 1);
    setIdx(0);
    setTurno(0);
    setRevelada(false);
    setReyes(0);
    setFlash(0);
    setEfecto(null);
    setFinPendiente(false);
    setFase('jugando');
    setReglasActivas([]);
    setAlianzas([]);
    setModal(null);
  };

  // ——— Pantalla especial del 4º Rey ———
  if (fase === 'finRey') {
    return (
      <LinearGradient colors={['#FDE68A', '#F59E0B', '#D97706']} locations={[0, 0.5, 1]} style={styles.finRey}>
        <Confetti cantidad={30} />
        <View style={[styles.finReyCentro, { paddingTop: insets.top }]}>
          <Text style={styles.finReyCorona}>👑</Text>
          <Text style={styles.finReyTitulo}>¡El último Rey!</Text>
          <Text style={styles.finReyNombre}>{jugador}</Text>
          <View style={styles.finReyPill}>
            <Text style={styles.finReyPillText}>{cap(verbo(session.tono, 'bebe'))} 4 y reparte 4 {emoji(session.tono, '🥃')}</Text>
          </View>
        </View>
        <View style={[styles.footer, { paddingBottom: insets.bottom + 14, gap: 9, paddingHorizontal: 26 }]}>
          {enCompeticion ? (
            <PressableScale onPress={() => router.replace('/fin-juego')} scaleTo={0.965} style={styles.finReyBtn}>
              <Text style={styles.finReyBtnText}>Continuar</Text>
            </PressableScale>
          ) : (
            <>
              <PressableScale onPress={reiniciarJuego} scaleTo={0.965} style={styles.finReyBtn}>
                <Text style={styles.finReyBtnText}>Nueva partida</Text>
              </PressableScale>
              <PressableScale onPress={() => router.replace('/juegos')} scaleTo={0.97} style={styles.finReyBtn2}>
                <Text style={styles.finReyBtn2Text}>Cambiar de juego</Text>
              </PressableScale>
            </>
          )}
        </View>
      </LinearGradient>
    );
  }

  const esRey = revelada && regla.especial === 'rey' && efecto;

  // Ajuste dinámico: medimos el alto real de la zona de carta y escalamos la
  // carta para que SIEMPRE quepa, reservando sitio al panel de regla cuando está
  // revelada. Así nunca se solapa con las coronas (arriba) ni con el panel
  // (abajo), haya o no reglas/alianzas, y por larga que sea la descripción.
  const PC_W = 232; // ancho base de PokerCard
  const PC_H = 320; // alto base de PokerCard
  const panelMax = revelada && areaH > 0 ? Math.round(areaH * 0.42) : 0;
  const cardZone = Math.max(0, areaH - panelMax);
  const cardScale =
    areaH === 0
      ? 0.7
      : Math.max(0.42, Math.min(0.86, (cardZone - 16) / PC_H, (areaW - 8) / PC_W));

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
      {Platform.OS !== 'web' && <KeepAwake />}

      {/* Cabecera: reglas + menú (el contador de Reyes va centrado, bajo el nombre) */}
      <View style={styles.top}>
        <View style={{ flex: 1 }} />
        <RulesButton juegoId="rey-copa" />
        <SessionMenuButton onPress={() => setMenuVisible(true)} />
      </View>

      <View style={styles.barras}>
        <ReglasActivas
          reglas={reglasActivas}
          onEliminar={(id) => setReglasActivas((r) => r.filter((x) => x.id !== id))}
        />
        {alianzas.length > 0 && (
          <View style={styles.compisRow}>
            {jugadores.map((nombre, i) => {
              const al = alianzaDe(i);
              if (!al) return null;
              return (
                <View key={i} style={[styles.compiChip, { borderColor: al.color }]}>
                  <Text style={styles.compiNombre} numberOfLines={1}>
                    {nombre}
                  </Text>
                  <Text style={styles.compiMini}>🤝</Text>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* Jugador en turno */}
      <View style={styles.playerBlock}>
        <Overline color={colors.grayLt}>LE TOCA A</Overline>
        <Text style={styles.playerName} numberOfLines={1} adjustsFontSizeToFit>
          {jugador}
        </Text>
      </View>

      {/* Contador de Reyes — centrado, entre el nombre y la carta */}
      <ContadorReyes reyes={reyes} flash={flash} />

      {/* Carta + panel de regla. El panel tiene scroll propio y la carta se
          centra en su zona, para que el botón "Siguiente" nunca quede tapado. */}
      <View
        style={styles.cardArea}
        onLayout={(e) => {
          setAreaH(e.nativeEvent.layout.height);
          setAreaW(e.nativeEvent.layout.width);
        }}>
        <View style={[styles.cardCenter, areaH > 0 ? { height: cardZone } : { flex: 1 }]}>
          <Animated.View style={flipStyle}>
            {revelada ? (
              <PokerCard etiqueta={carta.etiqueta} palo={carta.palo} scale={cardScale} />
            ) : (
              <CardBack titulo1="Rey de" titulo2="la Copa" scale={cardScale} />
            )}
          </Animated.View>
        </View>

        {revelada && (
          <Animated.View entering={FadeIn.duration(220)} style={[styles.panelWrap, { maxHeight: panelMax }]}>
            <ScrollView
              style={styles.panelScroll}
              contentContainerStyle={styles.panelScrollContent}
              showsVerticalScrollIndicator={false}>
              <View style={[styles.panel, esRey && styles.panelRey]}>
                <Text style={[styles.panelTitulo, esRey && { color: '#B45309' }]}>
                  {esRey ? '👑 ' + (efecto?.numero === 4 ? '¡El último Rey!' : `Rey nº ${efecto?.numero}`) : regla.titulo}
                </Text>
                <Text style={[styles.panelTexto, esRey && { color: '#92400E' }]}>
                  {esRey ? efecto?.texto : textoRegla(carta.valor, jugador, session.tono)}
                </Text>
              </View>
            </ScrollView>
          </Animated.View>
        )}
      </View>

      {/* Acción */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
        {!revelada ? (
          <PrimaryButton title="Voltear carta" onPress={voltear} />
        ) : finPendiente ? (
          <PrimaryButton title="Ver el final" onPress={siguiente} />
        ) : (
          <PrimaryButton title="Siguiente" onPress={siguiente} />
        )}
      </View>

      <SessionMenu visible={menuVisible} onClose={() => setMenuVisible(false)} onReiniciar={reiniciarJuego} />

      <PickerJugadores
        visible={pickerVisible}
        modo={pickerCfg?.modo ?? 'multiple'}
        titulo={`¿Quién ${verbo(session.tono, 'bebe')}?`}
        subtitulo={pickerSub}
        cantidad={pickerCfg?.cantidad ?? 1}
        maxTotal={reparteRey ? efecto?.reparte : undefined}
        onDone={() => {
          setPickerVisible(false);
          avanzarReal();
        }}
      />

      {/* ——— Modal As: inventar regla ——— */}
      <Modal visible={modal?.tipo === 'as'} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitulo}>✍️ Inventa una regla</Text>
            <Text style={styles.modalSub}>Valdrá el resto de la partida. Quien la rompa, {verbo(session.tono, 'bebe')} 2.</Text>
            <TextInput
              value={reglaTexto}
              onChangeText={setReglaTexto}
              placeholder="Ej: prohibido decir nombres propios"
              placeholderTextColor={colors.grayLt}
              style={styles.modalInput}
              multiline
              maxLength={120}
              autoFocus
            />
            <PrimaryButton title="Confirmar" size="m" onPress={confirmarRegla} disabled={!reglaTexto.trim()} />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ——— Modal max 5 reglas ——— */}
      <Modal visible={modal?.tipo === 'quitarRegla'} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitulo}>Máximo 5 reglas</Text>
            <Text style={styles.modalSub}>Elige cuál eliminar para hacer sitio:</Text>
            {modal?.tipo === 'quitarRegla' &&
              [...reglasActivas, modal.nueva].map((r) => (
                <PressableScale key={r.id} onPress={() => resolverQuitar(r.id, modal.nueva)} style={styles.opcion}>
                  <Text style={styles.opcionTexto} numberOfLines={3}>
                    {r.id === modal.nueva.id ? '🆕 ' : '📜 '}
                    {r.texto}
                  </Text>
                </PressableScale>
              ))}
          </View>
        </View>
      </Modal>

      {/* ——— Modal 8: compañero de bebida ——— */}
      <Modal visible={modal?.tipo === 'ocho'} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitulo}>🤝 Compañero de bebida</Text>
            <Text style={styles.modalSub}>{jugador}, elige con quién compartes los {unidad(session.tono, 2)}:</Text>
            <View style={styles.compisGrid}>
              {jugadores.map((nombre, i) =>
                i === jugadorIdx ? null : (
                  <PressableScale key={i} onPress={() => elegirCompi(i)} style={styles.compiOpcion}>
                    <Text style={styles.compiOpcionText}>{nombre}</Text>
                  </PressableScale>
                )
              )}
            </View>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

// ——— Contador de Reyes ————————————————————————————————————————

function ContadorReyes({ reyes, flash }: { reyes: number; flash: number }) {
  return (
    <View style={styles.reyesRow}>
      {[1, 2, 3, 4].map((n) => (
        <Corona key={n} on={n <= reyes} destacar={flash === n} />
      ))}
    </View>
  );
}

function Corona({ on, destacar }: { on: boolean; destacar: boolean }) {
  const s = useSharedValue(1);
  useEffect(() => {
    if (destacar) {
      s.value = 1.7;
      s.value = withSpring(1, { damping: 6, stiffness: 140 });
    }
  }, [destacar, s]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <View style={[styles.coronaWrap, on && styles.coronaOn]}>
      <Animated.Text style={[styles.corona, { opacity: on ? 1 : 0.25 }, style]}>👑</Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: 26 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  reyesRow: { flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center', marginTop: 2, marginBottom: 4 },
  coronaWrap: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ghost,
  },
  coronaOn: { backgroundColor: '#FEF3C7' },
  corona: { fontSize: 24 },
  barras: { gap: 8 },
  compisRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  compiChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderRadius: 20,
    paddingHorizontal: 11,
    height: 30,
  },
  compiNombre: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.ink, maxWidth: 90 },
  compiMini: { fontSize: 11 },
  playerBlock: { marginTop: 2, marginBottom: 4, gap: 2 },
  playerName: { fontFamily: fonts.display, fontSize: 40, letterSpacing: -1.4, color: colors.ink },
  cardArea: { flex: 1, alignItems: 'stretch' },
  cardCenter: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  panelWrap: { marginTop: 6 },
  panelScroll: { flexGrow: 0 },
  panelScrollContent: { paddingBottom: 2 },
  panel: {
    alignSelf: 'stretch',
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 18,
    ...shadows.card,
  },
  panelRey: { backgroundColor: '#FEF3C7', borderColor: '#FCD34D' },
  panelTitulo: { fontFamily: fonts.display, fontSize: 19, letterSpacing: -0.5, color: colors.purple },
  panelTexto: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.ink, marginTop: 6 },
  footer: { paddingTop: 12 },
  // modales
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(13,11,26,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: { alignSelf: 'stretch', backgroundColor: colors.white, borderRadius: 22, padding: 22, gap: 10 },
  modalTitulo: { fontFamily: fonts.display, fontSize: 21, letterSpacing: -0.5, color: colors.ink },
  modalSub: { fontFamily: fonts.body, fontSize: 13, color: colors.gray },
  modalInput: {
    minHeight: 70,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: 14,
    fontFamily: fonts.bodySemi,
    fontSize: 16,
    color: colors.ink,
    textAlignVertical: 'top',
  },
  opcion: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.small,
    padding: 12,
  },
  opcionTexto: { fontFamily: fonts.bodySemi, fontSize: 13.5, lineHeight: 18.5, color: colors.ink },
  compisGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  compiOpcion: {
    backgroundColor: colors.lav100,
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 46,
    justifyContent: 'center',
  },
  compiOpcionText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.purple },
  // fin del 4º rey
  finRey: { flex: 1 },
  finReyCentro: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  finReyCorona: { fontSize: 96 },
  finReyTitulo: { fontFamily: fonts.display, fontSize: 44, color: colors.white, letterSpacing: -1.8, marginTop: 8 },
  finReyNombre: { fontFamily: fonts.display, fontSize: 30, color: colors.white, letterSpacing: -1, marginTop: 6 },
  finReyPill: {
    marginTop: 16,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 30,
    paddingHorizontal: 20,
    paddingVertical: 11,
  },
  finReyPillText: { fontFamily: fonts.bodyX, fontSize: 15, color: colors.white },
  finReyBtn: {
    height: 70,
    borderRadius: 20,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  finReyBtnText: { fontFamily: fonts.display, fontSize: 22, color: colors.white },
  finReyBtn2: {
    height: 56,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  finReyBtn2Text: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.white },
});
