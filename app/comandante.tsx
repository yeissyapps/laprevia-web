// Comandante — juego con estado persistente: reglas activas, poderes en mano
// y alianzas entre jugadores. Mazo escalado por bloques de posición.

import { LinearGradient } from 'expo-linear-gradient';
import { useKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RulesButton } from '@/components/GameRules';
import { ReglasActivas } from '@/components/ReglasActivas';
import { Overline } from '@/components/Overline';
import { PickerJugadores } from '@/components/PickerJugadores';
import { PressableScale } from '@/components/PressableScale';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SecondaryButton } from '@/components/SecondaryButton';
import { SelectorDuracion } from '@/components/SelectorDuracion';
import { SessionMenu, SessionMenuButton } from '@/components/SessionMenu';
import { useSession } from '@/context/SessionContext';
import { bebeN, emoji, pick, verbo } from '@/utils/textoTono';
import type { Tono } from '@/data/types';
import {
  COLORES_ALIANZA,
  MAX_PODERES,
  MAX_REGLAS_ACTIVAS,
  TIPOS_COMANDANTE,
  cartasComandante,
  mazoComandante,
  textoComandanteSize,
  type CartaComandante,
} from '@/data/comandante';
import { guardarDuracion, leerDuracion } from '@/data/duracionJuego';
import { colors, fonts, gradientAngle, radius, shadows, type } from '@/theme/theme';

// Duraciones de Juego Libre: 40 / 70 / mazo completo (134 cartas reales).
const TOTAL_COMANDANTE = cartasComandante.length;
const DURACIONES_COMANDANTE = [40, 70, TOTAL_COMANDANTE];

function KeepAwake() {
  useKeepAwake();
  return null;
}

interface Alianza {
  a: number;
  b: number;
  color: string;
}

type ModalEstado =
  | { tipo: 'quitarRegla'; nueva: CartaComandante }
  | { tipo: 'poderes'; jugador: number }
  | { tipo: 'elegirAliado'; fijo: number; avanzarAlCerrar: boolean }
  | null;

// ——— Clasificación de cartas de alianza (genérica, por el texto) ———
// Una carta DEPENDE de una alianza si actúa sobre una ya existente (romperla,
// abandonarla, redirigirla). Si no hay ninguna activa, se resuelve con el
// efecto alternativo simple (quien la sacó bebe 2).
function dependeDeAlianza(carta: CartaComandante): boolean {
  return /TU ALIANZA|TUS ALIANZAS|DE TU ALIANZA|ALIANZA ACTUAL/i.test(carta.texto);
}

// Una carta CREA una alianza si su núcleo es elegir a un aliado nuevo.
function creaAlianza(carta: CartaComandante): boolean {
  if (dependeDeAlianza(carta)) return false;
  const t = carta.texto.toUpperCase();
  return /\bALIANZA\b/.test(t) && /(ELIGE UN JUGADOR|PROPONES ALIANZA AL JUGADOR)/.test(t);
}

export default function ComandanteScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, sumarTragos } = useSession();

  const jugadores = session.jugadores.length > 0 ? session.jugadores : ['Jugador 1', 'Jugador 2'];

  // Solo en Juego Libre se muestra la config de duración; Competición/Escalada
  // conservan su tope de 75 cartas y entran directos a jugar.
  const esLibre = session.modo !== 'competicion' && session.modo !== 'escalada';
  const [fase, setFase] = useState<'config' | 'jugando'>(esLibre ? 'config' : 'jugando');
  const [duracion, setDuracion] = useState<number>(TOTAL_COMANDANTE);

  const [nonce, setNonce] = useState(0);
  // En Competición/Escalada se juegan 75 cartas (proporcionales por bloque, mantienen
  // la escalada); en Juego Libre, la duración elegida (recorte proporcional por bloque).
  const mazo = useMemo(
    () => mazoComandante(esLibre ? duracion : 75),
    [nonce, esLibre, duracion]
  );

  const [indice, setIndice] = useState(0);
  const [reglasActivas, setReglasActivas] = useState<CartaComandante[]>([]);
  const [poderes, setPoderes] = useState<Record<number, CartaComandante[]>>({});
  const [alianzas, setAlianzas] = useState<Alianza[]>([]);
  const [modal, setModal] = useState<ModalEstado>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const jugadorIdx = indice % jugadores.length;
  const carta = mazo[indice];
  const estilo = TIPOS_COMANDANTE[carta.tipo];
  const esUltima = indice === mazo.length - 1;
  const manoActual = poderes[jugadorIdx] ?? [];

  // Carta que rompe/usa una alianza pero no hay ninguna activa → efecto alterno
  const alianzaInexistente = dependeDeAlianza(carta) && alianzas.length === 0;
  const textoMostrado = alianzaInexistente
    ? `No hay ninguna alianza activa: ${jugadores[jugadorIdx]} ${bebeN(session.tono, 2, false)} ${emoji(session.tono)}`
    : textoCarta(carta, session.tono);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  // Blindaje de hidratación: si el modo llega (async) y NO es libre, saltar la config.
  useEffect(() => {
    if (!esLibre) setFase('jugando');
  }, [esLibre]);

  // Preselecciona la última duración usada en Juego Libre.
  useEffect(() => {
    if (!esLibre) return;
    let vivo = true;
    leerDuracion('comandante').then((g) => {
      if (vivo && g != null && DURACIONES_COMANDANTE.includes(g)) setDuracion(g);
    });
    return () => {
      vivo = false;
    };
  }, [esLibre]);

  const empezarComandante = () => {
    guardarDuracion('comandante', duracion);
    setFase('jugando');
  };

  // ——— Fase de configuración (solo Juego Libre): duración de la partida ———
  if (fase === 'config') {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
        <PressableScale onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <Text style={styles.backIcon}>←</Text>
        </PressableScale>
        <Overline>🫡 COMANDANTE</Overline>
        <Text style={styles.configTitle}>Duración de la partida</Text>
        <Text style={styles.configSub}>
          Elige cuántas cartas jugaréis. Se eligen al azar del mazo manteniendo la escalada
          (suave → caos).
        </Text>
        <View style={styles.configSelector}>
          <SelectorDuracion
            opciones={DURACIONES_COMANDANTE}
            valor={duracion}
            onChange={setDuracion}
            titulo="CARTAS"
          />
        </View>
        <View style={{ flex: 1 }} />
        <View style={{ paddingBottom: insets.bottom + 14 }}>
          <PrimaryButton title="Empezar" onPress={empezarComandante} />
        </View>
      </View>
    );
  }

  const avanzar = () => {
    if (esUltima) {
      router.replace('/fin-juego');
      return;
    }
    setIndice((i) => i + 1);
  };

  // En Competición, las cartas que hacen beber capturan quién bebe con el picker
  // antes de avanzar; reglas/poderes (estado puro) pasan directos.
  const terminarCarta = () => {
    if (session.modo === 'competicion' || session.modo === 'escalada') {
      setPickerVisible(true);
      return;
    }
    avanzar();
  };

  const resolver = () => {
    // REGLA: la elección de cuál quitar (al llegar a 5) sí merece modal — pesan.
    if (carta.tipo === 'regla') {
      if (reglasActivas.length >= MAX_REGLAS_ACTIVAS) {
        setModal({ tipo: 'quitarRegla', nueva: carta });
        return;
      }
      setReglasActivas((r) => [...r, carta]);
      setToast('📜 Nueva regla activa');
      avanzar();
      return;
    }

    // PODER: máximo 1 en mano; uno nuevo sustituye al anterior sin preguntar.
    if (carta.tipo === 'poder') {
      const sustituye = manoActual.length >= MAX_PODERES;
      setPoderes((p) => {
        const mano = [...(p[jugadorIdx] ?? []), carta];
        return { ...p, [jugadorIdx]: mano.slice(Math.max(0, mano.length - MAX_PODERES)) };
      });
      setToast(sustituye ? '⚡ Poder sustituido' : `⚡ ${jugadores[jugadorIdx]} guarda un poder`);
      avanzar();
      return;
    }

    // Carta que actúa sobre una alianza existente: si no hay ninguna, bebe 2.
    // TODO(v1.1): cuando a un jugador CON alianza activa le toque beber, mostrar
    // un mensaje contextual con el nombre del aliado, p. ej. "Como tienes alianza
    // con {aliado}, brindad y bebed los dos" (usar alianzaDe(jugadorIdx) para
    // resolver el aliado) en lugar de aplicar el trago en silencio. Aplica también
    // a la alianza del 8 en Rey de la Copa (rey-copa.tsx · alianzaDe).
    if (dependeDeAlianza(carta)) {
      if (alianzas.length > 0) {
        setAlianzas((list) => list.filter((al) => al.a !== jugadorIdx && al.b !== jugadorIdx));
        setToast('🗡️ Alianza rota');
      } else {
        sumarTragos(jugadorIdx, 2);
        setToast(`${emoji(session.tono)} Sin alianzas: ${jugadores[jugadorIdx]} ${verbo(session.tono, 'bebe')} 2`);
      }
      avanzar();
      return;
    }

    // Carta cuyo núcleo es elegir un aliado: un solo toque para crear la alianza.
    if (creaAlianza(carta)) {
      setModal({ tipo: 'elegirAliado', fijo: jugadorIdx, avanzarAlCerrar: true });
      return;
    }

    // accion / votacion / duelo / caos / traición: capturar bebida en Competición
    terminarCarta();
  };

  // ——— reglas ———
  const quitarRegla = (id: string, nueva: CartaComandante) => {
    setReglasActivas((r) => [...r.filter((x) => x.id !== id), ...(id === nueva.id ? [] : [nueva])]);
    setToast(id === nueva.id ? '📜 Regla nueva descartada' : '📜 Regla sustituida');
    setModal(null);
    avanzar();
  };

  const eliminarReglaManual = (id: string) => {
    setReglasActivas((r) => r.filter((x) => x.id !== id));
  };

  // ——— poderes ———
  const usarPoder = (jugador: number, poder: CartaComandante) => {
    setPoderes((p) => ({ ...p, [jugador]: (p[jugador] ?? []).filter((x) => x.id !== poder.id) }));
    setToast(`⚡ ${jugadores[jugador]} usa: ${nombrePoder(poder)}`);
    if (creaAlianza(poder)) {
      setModal({ tipo: 'elegirAliado', fijo: jugador, avanzarAlCerrar: false });
      return;
    }
    setModal(null);
  };

  // ——— alianzas: un toque crea {dueño, aliado} ———
  const elegirAliado = (aliado: number, fijo: number, avanzarAlCerrar: boolean) => {
    if (aliado !== fijo) {
      const color = COLORES_ALIANZA[alianzas.length % COLORES_ALIANZA.length];
      setAlianzas((al) => [
        ...al.filter((x) => ![x.a, x.b].some((p) => p === aliado || p === fijo)),
        { a: fijo, b: aliado, color },
      ]);
      setToast(`🤝 ${jugadores[fijo]} y ${jugadores[aliado]} ahora son aliados`);
    }
    setModal(null);
    if (avanzarAlCerrar) avanzar();
  };

  const alianzaDe = (i: number) => alianzas.find((al) => al.a === i || al.b === i);

  const reiniciarJuego = () => {
    setNonce((n) => n + 1);
    setIndice(0);
    setReglasActivas([]);
    setPoderes({});
    setAlianzas([]);
    setModal(null);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
      {Platform.OS !== 'web' && <KeepAwake />}

      {/* Top: progreso + menú */}
      <View style={styles.topRow}>
        <View style={styles.progresoWrap}>
          <View style={styles.progresoTrack}>
            <View style={[styles.progresoFill, { width: `${((indice + 1) / mazo.length) * 100}%` }]} />
          </View>
          <Text style={styles.contador}>
            {indice + 1}/{mazo.length}
          </Text>
        </View>
        <RulesButton juegoId="comandante" />
        <SessionMenuButton onPress={() => setMenuVisible(true)} />
      </View>

      {/* Reglas activas (colapsable) */}
      <ReglasActivas
        reglas={reglasActivas.map((r) => ({ id: r.id, texto: textoRegla(r, session.tono) }))}
        onEliminar={eliminarReglaManual}
      />

      {/* Jugadores: poderes y alianzas a la vista */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={styles.chips}>
        {jugadores.map((nombre, i) => {
          const alianza = alianzaDe(i);
          const nPoderes = (poderes[i] ?? []).length;
          const esTurno = i === jugadorIdx;
          return (
            <PressableScale
              key={i}
              onPress={() => setModal({ tipo: 'poderes', jugador: i })}
              style={[
                styles.chipJugador,
                esTurno && styles.chipJugadorTurno,
                alianza ? { borderColor: alianza.color, borderWidth: 2 } : null,
              ]}>
              <Text style={[styles.chipNombre, esTurno && { color: colors.white }]} numberOfLines={1}>
                {nombre}
              </Text>
              {alianza && <Text style={styles.chipMini}>🤝</Text>}
              {nPoderes > 0 && (
                <View style={styles.chipPoderes}>
                  <Text style={styles.chipPoderesText}>⚡{nPoderes}</Text>
                </View>
              )}
            </PressableScale>
          );
        })}
      </ScrollView>

      {toast && (
        <Animated.Text entering={FadeIn.duration(180)} style={styles.toast}>
          {toast}
        </Animated.Text>
      )}

      {/* Jugador en turno */}
      <View style={styles.playerBlock}>
        <Overline color={colors.grayLt}>LE TOCA A</Overline>
        <Text style={styles.playerName} numberOfLines={1} adjustsFontSizeToFit>
          {jugadores[jugadorIdx]}
        </Text>
      </View>

      {/* Carta */}
      <Animated.View key={`${nonce}-${indice}`} entering={FadeInDown.duration(300)} style={styles.cardArea}>
        <LinearGradient
          colors={estilo.gradient.colors}
          locations={estilo.gradient.locations}
          start={gradientAngle.start}
          end={gradientAngle.end}
          style={[
            styles.card,
            carta.tipo === 'caos' ? shadows.ink : shadows.purple,
            estilo.border ? { borderWidth: 2, borderColor: estilo.border } : null,
          ]}>
          <View style={styles.cardInner}>
            <View style={styles.cardTopRow}>
              <View style={[styles.chipTipo, { backgroundColor: estilo.chipBg }]}>
                <Text style={[styles.chipTipoText, { color: estilo.chipText }]}>
                  {estilo.emoji} {estilo.label}
                </Text>
              </View>
            </View>
            <Text style={styles.watermark}>{estilo.emoji}</Text>
            <View style={styles.cardTextoWrap}>
              <Text
                style={[
                  styles.cardTexto,
                  {
                    color: estilo.text,
                    fontSize: textoComandanteSize(textoMostrado),
                    lineHeight: textoComandanteSize(textoMostrado) * 1.18,
                  },
                ]}>
                {textoMostrado}
              </Text>
            </View>
          </View>
        </LinearGradient>
      </Animated.View>

      {/* Acciones */}
      <View style={[styles.actions, { paddingBottom: insets.bottom + 14 }]}>
        {manoActual.length > 0 && (
          <View style={styles.secondaryRow}>
            <PressableScale onPress={() => setModal({ tipo: 'poderes', jugador: jugadorIdx })} hitSlop={8}>
              <Text style={styles.poderesText}>⚡ Mis poderes ({manoActual.length})</Text>
            </PressableScale>
          </View>
        )}
        <PrimaryButton title={esUltima ? 'Terminar juego' : 'Siguiente'} onPress={resolver} />
      </View>

      <SessionMenu visible={menuVisible} onClose={() => setMenuVisible(false)} onReiniciar={reiniciarJuego} />

      <PickerJugadores
        visible={pickerVisible}
        modo="multiple"
        titulo={`¿Quién ${verbo(session.tono, 'bebe')} en esta carta?`}
        subtitulo={textoMostrado}
        cantidad={1}
        onDone={() => {
          setPickerVisible(false);
          avanzar();
        }}
      />

      {/* ——— Modales del juego ——— */}
      <ModalCard
        visible={modal?.tipo === 'quitarRegla'}
        titulo="Máximo 5 reglas"
        subtitulo="Elige cuál eliminar para hacer sitio:"
        onClose={() => {}}>
        {modal?.tipo === 'quitarRegla' &&
          [...reglasActivas, modal.nueva].map((r) => (
            <PressableScale key={r.id} onPress={() => quitarRegla(r.id, modal.nueva)} style={styles.opcion}>
              <Text style={styles.opcionTexto} numberOfLines={3}>
                {r.id === modal.nueva.id ? '🆕 ' : '📜 '}
                {textoRegla(r, session.tono)}
              </Text>
            </PressableScale>
          ))}
      </ModalCard>

      <ModalCard
        visible={modal?.tipo === 'poderes'}
        titulo={modal?.tipo === 'poderes' ? `⚡ Poderes de ${jugadores[modal.jugador]}` : ''}
        onClose={() => setModal(null)}
        cerrable>
        {modal?.tipo === 'poderes' &&
          ((poderes[modal.jugador] ?? []).length === 0 ? (
            <Text style={styles.vacio}>No tiene poderes guardados… aún 👀</Text>
          ) : (
            (poderes[modal.jugador] ?? []).map((p) => (
              <View key={p.id} style={styles.opcion}>
                <Text style={styles.opcionTexto}>{textoCarta(p, session.tono)}</Text>
                <SecondaryButton
                  title="⚡ Usar ahora"
                  variant="soft"
                  onPress={() => usarPoder(modal.jugador, p)}
                  style={styles.usarBtn}
                />
              </View>
            ))
          ))}
      </ModalCard>

      <ModalCard
        visible={modal?.tipo === 'elegirAliado'}
        titulo="🤝 Elige tu aliado"
        subtitulo="Toca al jugador con quien te alías:"
        onClose={() => {}}>
        {modal?.tipo === 'elegirAliado' && (
          <>
            <View style={styles.aliadosGrid}>
              {jugadores.map((nombre, i) =>
                i === modal.fijo ? null : (
                  <PressableScale
                    key={i}
                    onPress={() => elegirAliado(i, modal.fijo, modal.avanzarAlCerrar)}
                    style={styles.aliadoChip}>
                    <Text style={styles.aliadoNombre}>{nombre}</Text>
                  </PressableScale>
                )
              )}
            </View>
          </>
        )}
      </ModalCard>
    </View>
  );
}

// Quita los prefijos en mayúsculas del texto ("REGLA ACTIVA:", "PODER — X:", …)
function textoCarta(carta: CartaComandante, tono: Tono): string {
  return pick(carta.texto, carta.textoChill, tono).replace(/^[A-ZÁÉÍÓÚÑ\s—-]+:\s*/, '');
}

function textoRegla(carta: CartaComandante, tono: Tono): string {
  return pick(carta.texto, carta.textoChill, tono).replace(/^REGLA ACTIVA:\s*/, '');
}

function nombrePoder(carta: CartaComandante): string {
  const m = carta.texto.match(/^PODER\s*—\s*([A-ZÁÉÍÓÚÑ]+)/);
  return m ? m[1] : 'su poder';
}

// Modal genérico centrado del juego
function ModalCard({ visible, titulo, subtitulo, children, onClose, cerrable = false }: {
  visible: boolean;
  titulo: string;
  subtitulo?: string;
  children: React.ReactNode;
  onClose: () => void;
  cerrable?: boolean;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={cerrable ? onClose : undefined}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          <Text style={styles.modalTitulo}>{titulo}</Text>
          {subtitulo && <Text style={styles.modalSubtitulo}>{subtitulo}</Text>}
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
            {children}
          </ScrollView>
          {cerrable && (
            <PressableScale onPress={onClose} hitSlop={8} style={styles.modalCerrar}>
              <Text style={styles.modalCerrarText}>Cerrar</Text>
            </PressableScale>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
    paddingHorizontal: 26,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  backIcon: {
    color: colors.ink,
    fontSize: 18,
    fontFamily: fonts.bodyBold,
  },
  configTitle: {
    ...type.titleL,
    fontSize: 34,
    color: colors.ink,
    marginTop: 8,
  },
  configSub: {
    ...type.body,
    color: colors.gray,
    marginTop: 8,
  },
  configSelector: {
    marginTop: 24,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
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
  chipsScroll: {
    flexGrow: 0,
    marginBottom: 4,
  },
  chips: {
    gap: 7,
    paddingVertical: 2,
  },
  chipJugador: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 12,
    height: 34,
  },
  chipJugadorTurno: {
    backgroundColor: colors.purple,
    borderColor: colors.purple,
  },
  chipNombre: {
    fontFamily: fonts.bodyBold,
    fontSize: 12.5,
    color: colors.ink,
    maxWidth: 90,
  },
  chipMini: {
    fontSize: 11,
  },
  chipPoderes: {
    backgroundColor: '#FEF3C7',
    borderRadius: 9,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  chipPoderesText: {
    fontFamily: fonts.bodyX,
    fontSize: 10,
    color: '#B45309',
  },
  toast: {
    fontFamily: fonts.bodyX,
    fontSize: 12,
    color: colors.purple,
    marginTop: 4,
  },
  playerBlock: {
    marginTop: 6,
    marginBottom: 10,
    gap: 2,
  },
  playerName: {
    fontFamily: fonts.display,
    fontSize: 36,
    letterSpacing: -1.2,
    color: colors.ink,
  },
  cardArea: {
    flex: 1,
  },
  card: {
    flex: 1,
    borderRadius: 32,
    overflow: 'hidden',
  },
  cardInner: {
    flex: 1,
    padding: 24,
  },
  cardTopRow: {
    flexDirection: 'row',
  },
  chipTipo: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 30,
  },
  chipTipoText: {
    ...type.chip,
  },
  watermark: {
    position: 'absolute',
    right: -24,
    bottom: -30,
    fontSize: 170,
    opacity: 0.07,
  },
  cardTextoWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 12,
  },
  cardTexto: {
    fontFamily: fonts.display,
    letterSpacing: -0.6,
  },
  actions: {
    paddingTop: 12,
    gap: 11,
  },
  secondaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  poderesText: {
    fontFamily: fonts.bodyX,
    fontSize: 14,
    color: '#B45309',
  },
  // modales
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(13,11,26,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    alignSelf: 'stretch',
    backgroundColor: colors.white,
    borderRadius: 22,
    padding: 22,
    maxHeight: '75%',
  },
  modalTitulo: {
    fontFamily: fonts.display,
    fontSize: 21,
    letterSpacing: -0.5,
    color: colors.ink,
  },
  modalSubtitulo: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.gray,
    marginTop: 4,
  },
  modalScroll: {
    flexGrow: 0,
    marginTop: 12,
  },
  modalContent: {
    gap: 9,
  },
  opcion: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.small,
    padding: 12,
    gap: 8,
  },
  opcionTexto: {
    fontFamily: fonts.bodySemi,
    fontSize: 13.5,
    lineHeight: 18.5,
    color: colors.ink,
  },
  usarBtn: {
    height: 44,
  },
  vacio: {
    fontFamily: fonts.body,
    fontSize: 13.5,
    color: colors.gray,
    textAlign: 'center',
    paddingVertical: 10,
  },
  aliadosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  aliadoChip: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 14,
    height: 38,
    justifyContent: 'center',
  },
  aliadoNombre: {
    fontFamily: fonts.bodyBold,
    fontSize: 13.5,
    color: colors.ink,
  },
  modalCerrar: {
    alignSelf: 'center',
    marginTop: 12,
  },
  modalCerrarText: {
    fontFamily: fonts.bodyBold,
    fontSize: 13.5,
    color: colors.grayLt,
  },
});
