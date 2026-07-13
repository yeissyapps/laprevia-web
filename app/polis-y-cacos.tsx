// Polis y Cacos — roles ocultos con guiño. 1 Asesino, 1 Policía, resto Ciudadanos.
// Reparto privado (pasar el móvil) → ronda activa (móvil compartido con timer y
// lista pulsable) → fin por acusación / tiempo / asesino mata a todos.
//
// Modos:
//  · Juego Libre → cada muerte se marca y avisa con un toast al instante (verbal).
//  · Competición/Escalada → las muertes se acumulan y se resuelven al final con un
//    picker preseleccionado; sumarTragos alimenta el marcador. 1 partida → /fin-juego.

import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { Confetti } from '@/components/Confetti';
import { RulesButton } from '@/components/GameRules';
import { Overline } from '@/components/Overline';
import { PressableScale } from '@/components/PressableScale';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SecondaryButton } from '@/components/SecondaryButton';
import { SessionMenu, SessionMenuButton } from '@/components/SessionMenu';
import { useSession } from '@/context/SessionContext';
import { bebeN, emoji, unidad, verbo } from '@/utils/textoTono';
import {
  MIN_JUGADORES_POLIS,
  ROLES_POLIS,
  ROUND_SECONDS_POLIS,
  TRAGOS_ACUSACION_FALLIDA,
  TRAGOS_ASESINO_PILLADO,
  TRAGOS_MUERTO,
  asignarRolesPolis,
  ciudadanosDe,
  colorJugador,
  rolDe,
  type RolesPartida,
} from '@/data/polisYCacos';
import { colors, fonts, gradientAngle, gradients } from '@/theme/theme';

type Fase = 'reparto' | 'ronda' | 'acusar' | 'hit' | 'miss' | 'asesino_gana' | 'policia_muerto' | 'resolucion';

const NIGHT = ['#1B1730', '#0D0B1A'] as const;
const RING = 232;
const STROKE = 15;
const RAD = (RING - STROKE) / 2;
const CIRC = 2 * Math.PI * RAD;

function KeepAwake() {
  useKeepAwake();
  return null;
}

const inicial = (nombre: string) => (nombre.trim()[0] ?? '?').toUpperCase();

export default function PolisYCacosScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, sumarTragos, registrarPartida } = useSession();

  const jugadores = session.jugadores.length > 0 ? session.jugadores : ['Jugador 1', 'Jugador 2'];
  const n = jugadores.length;
  const enMarcador = session.modo === 'competicion' || session.modo === 'escalada';

  const [roles, setRoles] = useState<RolesPartida>(() => asignarRolesPolis(n));
  const [fase, setFase] = useState<Fase>('reparto');
  const [revelIdx, setRevelIdx] = useState(0);
  const [left, setLeft] = useState(ROUND_SECONDS_POLIS);
  const [muertos, setMuertos] = useState<Set<number>>(new Set());
  const [acusado, setAcusado] = useState<number | null>(null);
  const [ganaPorTiempo, setGanaPorTiempo] = useState(false); // motivo de la victoria del Asesino
  const [menuVisible, setMenuVisible] = useState(false);

  // Toast de "X bebe" (solo Juego Libre)
  const [toast, setToast] = useState<{ nombre: string; id: number } | null>(null);
  const toastAnim = useRef(new Animated.Value(0)).current;

  // Resync si cambia el nº de jugadores (añadir/eliminar en el menú, hidratación).
  const prevN = useRef(n);
  useEffect(() => {
    if (prevN.current === n) return;
    prevN.current = n;
    setRoles(asignarRolesPolis(n));
    setFase('reparto');
    setRevelIdx(0);
    setLeft(ROUND_SECONDS_POLIS);
    setMuertos(new Set());
    setAcusado(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n]);

  // Cuenta atrás: solo corre durante la ronda activa (se pausa en acusar/resultados).
  useEffect(() => {
    if (fase !== 'ronda') return;
    if (left <= 0) {
      setGanaPorTiempo(true);
      setFase('asesino_gana');
      return;
    }
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [fase, left]);

  const nuevaPartida = () => {
    setRoles(asignarRolesPolis(n));
    setRevelIdx(0);
    setLeft(ROUND_SECONDS_POLIS);
    setMuertos(new Set());
    setAcusado(null);
    setFase('reparto');
  };

  const salirAlMenu = () => {
    registrarPartida();
    router.replace('/juegos');
  };

  // ——— Reparto ———
  const siguienteReparto = () => {
    if (revelIdx + 1 >= n) {
      setFase('ronda');
      return;
    }
    setRevelIdx((i) => i + 1);
  };

  // ——— Marcar muerto en la ronda ———
  const marcarMuerto = (i: number) => {
    if (muertos.has(i)) return;
    const next = new Set(muertos);
    next.add(i);
    setMuertos(next);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    // Si el Asesino mata al Policía → se delata y pierde: bebe como si lo pillaran.
    if (i === roles.policia) {
      if (enMarcador) sumarTragos(roles.asesino, TRAGOS_ASESINO_PILLADO);
      setFase('policia_muerto');
      return;
    }

    // Juego Libre: aviso instantáneo (verbal). Competición: solo se registra.
    if (!enMarcador) mostrarToast(jugadores[i]);

    // ¿El Asesino ha matado a todos los Ciudadanos? → victoria automática.
    const ciudadanos = ciudadanosDe(n, roles);
    if (ciudadanos.length > 0 && ciudadanos.every((c) => next.has(c))) {
      setGanaPorTiempo(false); // ganó por eliminar a todos los ciudadanos
      setFase('asesino_gana');
    }
  };

  const mostrarToast = (nombre: string) => {
    const id = Date.now();
    setToast({ nombre, id });
    toastAnim.setValue(0);
    Animated.sequence([
      Animated.timing(toastAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(1200),
      Animated.timing(toastAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start(() => setToast((t) => (t?.id === id ? null : t)));
  };

  // ——— Acusación ———
  const confirmarAcusacion = (i: number) => {
    setAcusado(i);
    if (i === roles.asesino) {
      if (enMarcador) sumarTragos(roles.asesino, TRAGOS_ASESINO_PILLADO);
      setFase('hit');
    } else {
      // "Quien acusó" = el Policía (la app lo conoce internamente).
      if (enMarcador) sumarTragos(roles.policia, TRAGOS_ACUSACION_FALLIDA);
      setFase('miss');
    }
  };

  // ——— Fin de ronda ———
  const trasResultado = () => {
    if (enMarcador) {
      setFase('resolucion');
      return;
    }
    nuevaPartida(); // Libre: nueva ronda
  };

  const aplicarResolucion = (indices: number[]) => {
    indices.forEach((i) => sumarTragos(i, TRAGOS_MUERTO));
    router.replace('/fin-juego');
  };

  const reiniciarJuego = () => nuevaPartida();

  // ——— Guarda de mínimo de jugadores ———
  if (n < MIN_JUGADORES_POLIS) {
    return (
      <View style={styles.screen}>
        <View style={[styles.centro, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
          <Text style={styles.bigEmoji}>🚓</Text>
          <Text style={styles.guardTitulo}>Faltan jugadores</Text>
          <Text style={styles.guardSub}>Polis y Cacos necesita al menos {MIN_JUGADORES_POLIS} jugadores.</Text>
          <View style={styles.guardBtn}>
            <PrimaryButton title="Volver al menú" onPress={() => router.replace('/juegos')} />
          </View>
        </View>
      </View>
    );
  }

  // ——— REPARTO (privado, pasar el móvil) ———
  if (fase === 'reparto') {
    return (
      <CartaReparto
        key={revelIdx}
        nombre={jugadores[revelIdx]}
        siguienteNombre={revelIdx + 1 < n ? jugadores[revelIdx + 1] : ''}
        posicion={revelIdx + 1}
        total={n}
        rol={rolDe(revelIdx, roles)}
        esUltimo={revelIdx + 1 >= n}
        insets={insets}
        onListo={siguienteReparto}
      />
    );
  }

  // ——— HIT (acierto, dorado) ———
  if (fase === 'hit' && acusado != null) {
    return (
      <View style={styles.screen}>
        {Platform.OS !== 'web' && <KeepAwake />}
        <Confetti cantidad={30} />
        <LinearGradient colors={['#D4AF37', '#92702A']} style={[styles.fullBleed, { paddingTop: insets.top + 20 }]}>
          <Text style={styles.emojiXL}>👮</Text>
          <Overline color="rgba(120,53,15,0.8)">¡ACUSACIÓN CORRECTA!</Overline>
          <Text style={styles.hitTitulo} numberOfLines={3} adjustsFontSizeToFit>
            {jugadores[acusado]} era el Asesino 🔪
          </Text>
          <View style={styles.hitCaja}>
            <Text style={styles.hitCajaText}>{bebeN(session.tono, TRAGOS_ASESINO_PILLADO)} {emoji(session.tono)}</Text>
          </View>
          <View style={[styles.fullBtn, { bottom: insets.bottom + 20 }]}>
            <Pressable onPress={trasResultado} style={({ pressed }) => [styles.darkBtn, pressed && styles.pressed]}>
              <Text style={styles.darkBtnText}>{enMarcador ? 'Resolver quién murió' : 'Nueva ronda'}</Text>
            </Pressable>
          </View>
        </LinearGradient>
      </View>
    );
  }

  // ——— MISS (fallo) ———
  if (fase === 'miss' && acusado != null) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
        {Platform.OS !== 'web' && <KeepAwake />}
        <View style={styles.centroFlex}>
          <View style={styles.missIcon}>
            <Text style={{ fontSize: 48 }}>❌</Text>
          </View>
          <Overline color={colors.red}>ACUSACIÓN INCORRECTA</Overline>
          <Text style={styles.missTitulo} numberOfLines={3} adjustsFontSizeToFit>
            {jugadores[acusado]} no era el Asesino
          </Text>
          <Text style={styles.missSub}>Era solo un Ciudadano 🙂. La ronda termina.</Text>
          <View style={styles.missCaja}>
            <Text style={{ fontSize: 22 }}>👮</Text>
            <Text style={styles.missCajaText}>
              {jugadores[roles.policia]} bebe {TRAGOS_ACUSACION_FALLIDA} tragos por equivocarse
            </Text>
          </View>
        </View>
        <View style={[styles.acciones, { paddingBottom: insets.bottom + 14 }]}>
          <Pressable onPress={trasResultado} style={({ pressed }) => [pressed && styles.pressed]}>
            <LinearGradient colors={gradients.ink.colors} locations={gradients.ink.locations} style={styles.inkBtn}>
              <Text style={styles.inkBtnText}>{enMarcador ? 'Resolver quién murió' : 'Nueva ronda'}</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    );
  }

  // ——— VICTORIA DEL ASESINO ———
  if (fase === 'asesino_gana') {
    return (
      <View style={[styles.screen, { backgroundColor: '#17070A' }]}>
        {Platform.OS !== 'web' && <KeepAwake />}
        <View style={[styles.centroFlex, { paddingTop: insets.top + 20 }]}>
          <Text style={styles.emojiXL}>🔪</Text>
          <Overline color="#FCA5A5">{ganaPorTiempo ? 'EL TIEMPO SE AGOTÓ' : 'NO QUEDAN CIUDADANOS'}</Overline>
          <Text style={styles.winTitulo}>El Asesino{'\n'}gana la ronda</Text>
          <View style={styles.winCaja}>
            <Text style={styles.winCajaTitulo}>Era {jugadores[roles.asesino]} 🔪</Text>
            <Text style={styles.winCajaSub}>
              {ganaPorTiempo ? 'Nadie lo descubrió a tiempo' : 'Los mató a todos sin ser descubierto'}
            </Text>
          </View>
        </View>
        <View style={[styles.acciones, { paddingBottom: insets.bottom + 14 }]}>
          <Pressable onPress={trasResultado} style={({ pressed }) => [pressed && styles.pressed]}>
            <LinearGradient colors={['#EF4444', '#DC2626']} style={styles.redBtn}>
              <Text style={styles.redBtnText}>{enMarcador ? 'Resolver quién murió' : 'Nueva ronda'}</Text>
            </LinearGradient>
          </Pressable>
          {!enMarcador && (
            <SecondaryButton title="Cambiar de juego" variant="soft" onPress={salirAlMenu} />
          )}
        </View>
      </View>
    );
  }

  // ——— EL ASESINO MATA AL POLICÍA → pierde ———
  if (fase === 'policia_muerto') {
    return (
      <View style={[styles.screen, { backgroundColor: '#0F1B2E' }]}>
        {Platform.OS !== 'web' && <KeepAwake />}
        <View style={[styles.centroFlex, { paddingTop: insets.top + 20 }]}>
          <Text style={styles.emojiXL}>🚨</Text>
          <Overline color="#93C5FD">EL ASESINO SE HA DELATADO</Overline>
          <Text style={styles.winTitulo}>El Asesino{'\n'}ha perdido</Text>
          <View style={styles.policiaCaja}>
            <Text style={styles.winCajaTitulo}>El Asesino era {jugadores[roles.asesino]} 🔪</Text>
            <Text style={styles.winCajaSub}>
              Mató al Policía y se delató: bebe {TRAGOS_ASESINO_PILLADO} tragos · el Policía bebe {TRAGOS_MUERTO}
            </Text>
          </View>
        </View>
        <View style={[styles.acciones, { paddingBottom: insets.bottom + 14 }]}>
          <Pressable onPress={trasResultado} style={({ pressed }) => [pressed && styles.pressed]}>
            <LinearGradient colors={['#2563EB', '#1D4ED8']} style={styles.redBtn}>
              <Text style={styles.redBtnText}>{enMarcador ? 'Resolver quién murió' : 'Nueva ronda'}</Text>
            </LinearGradient>
          </Pressable>
          {!enMarcador && <SecondaryButton title="Cambiar de juego" variant="soft" onPress={salirAlMenu} />}
        </View>
      </View>
    );
  }

  // ——— RESOLUCIÓN (solo Competición/Escalada) ———
  if (fase === 'resolucion') {
    return (
      <Resolucion
        jugadores={jugadores}
        preseleccion={muertos}
        insets={insets}
        onAplicar={aplicarResolucion}
      />
    );
  }

  // ——— ACUSAR (picker de un solo acusado entre vivos) ———
  if (fase === 'acusar') {
    // El Policía no puede acusarse a sí mismo → fuera de la lista (además de los muertos).
    const vivos = jugadores.map((_, i) => i).filter((i) => !muertos.has(i) && i !== roles.policia);
    return (
      <Acusar
        jugadores={jugadores}
        candidatos={vivos}
        insets={insets}
        onCancelar={() => setFase('ronda')}
        onConfirmar={confirmarAcusacion}
      />
    );
  }

  // ——— RONDA ACTIVA (móvil compartido) ———
  const frac = left / ROUND_SECONDS_POLIS;
  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');
  const vivosCount = n - muertos.size;
  const izquierda = jugadores.map((_, i) => i).filter((i) => i % 2 === 0);
  const derecha = jugadores.map((_, i) => i).filter((i) => i % 2 === 1);

  return (
    <View style={styles.screen}>
      {Platform.OS !== 'web' && <KeepAwake />}
      <LinearGradient colors={NIGHT} style={{ flex: 1 }}>
        {/* Barra superior: reglas + menú (sobre fondo oscuro) */}
        <View style={[styles.topRow, { paddingTop: insets.top + 8 }]}>
          <RulesButton juegoId="polis-y-cacos" />
          <SessionMenuButton onColor onPress={() => setMenuVisible(true)} />
        </View>

        {/* Timer dominante */}
        <View style={styles.timerZona}>
          <Text style={styles.ambiente}>Policía, tienes que atrapar al Asesino. Te quedan:</Text>
          <View style={styles.ringWrap}>
            <Svg width={RING} height={RING} style={{ transform: [{ rotate: '-90deg' }] }}>
              <Circle cx={RING / 2} cy={RING / 2} r={RAD} stroke="rgba(255,255,255,0.1)" strokeWidth={STROKE} fill="none" />
              <Circle
                cx={RING / 2}
                cy={RING / 2}
                r={RAD}
                stroke={left <= 30 ? '#EF4444' : colors.purple}
                strokeWidth={STROKE}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={CIRC}
                strokeDashoffset={CIRC * (1 - frac)}
              />
            </Svg>
            <View style={styles.ringCentro}>
              <Text style={styles.ringTiempo}>{mm}:{ss}</Text>
            </View>
          </View>
          <Text style={styles.pistaMuerte}>Cuando te maten, pulsa sobre tu nombre 💀</Text>
          <View style={styles.vivosPill}>
            <View style={styles.vivosDot} />
            <Text style={styles.vivosText}>{vivosCount} vivos de {n}</Text>
          </View>
        </View>

        {/* Lista de jugadores en 2 columnas */}
        <View style={styles.listaZona}>
          {[izquierda, derecha].map((col, ci) => (
            <View key={ci} style={styles.columna}>
              {col.map((i) => {
                const muerto = muertos.has(i);
                return (
                  <Pressable
                    key={i}
                    disabled={muerto}
                    onPress={() => marcarMuerto(i)}
                    style={({ pressed }) => [
                      styles.jugadorFila,
                      muerto ? styles.jugadorMuerto : null,
                      pressed && !muerto ? { opacity: 0.8 } : null,
                    ]}>
                    <Text style={{ fontSize: 15 }}>{muerto ? '💀' : '🔪'}</Text>
                    <Text
                      numberOfLines={1}
                      style={[styles.jugadorNombre, muerto && styles.jugadorNombreMuerto]}>
                      {jugadores[i]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>

        {/* Acusar (siempre visible) */}
        <View style={[styles.acusarWrap, { paddingBottom: insets.bottom + 8 }]}>
          <Text style={styles.acusarPista}>Policía: cuando sepas quién es el Asesino, pulsa el botón</Text>
          <Pressable onPress={() => setFase('acusar')} style={({ pressed }) => [styles.acusarBtn, pressed && styles.pressed]}>
            <Text style={styles.acusarText}>🚨 Acusar</Text>
          </Pressable>
        </View>

        {/* Toast "X bebe" (solo Libre) */}
        {toast && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.toastWrap,
              { bottom: insets.bottom + 96, opacity: toastAnim, transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] },
            ]}>
            <View style={styles.toastCard}>
              <Text style={{ fontSize: 20 }}>{emoji(session.tono)}</Text>
              <Text style={styles.toastText}>{toast.nombre} {verbo(session.tono, 'bebe')}</Text>
            </View>
          </Animated.View>
        )}
      </LinearGradient>

      <SessionMenu
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        onReiniciar={reiniciarJuego}
        validarEliminar={() =>
          n <= MIN_JUGADORES_POLIS ? `Polis y Cacos necesita al menos ${MIN_JUGADORES_POLIS} jugadores.` : null
        }
      />
    </View>
  );
}

// ——— Carta de reparto (dorso → flip a rol) ———
function CartaReparto({
  nombre,
  siguienteNombre,
  posicion,
  total,
  rol,
  esUltimo,
  insets,
  onListo,
}: {
  nombre: string;
  siguienteNombre: string;
  posicion: number;
  total: number;
  rol: 'asesino' | 'policia' | 'ciudadano';
  esUltimo: boolean;
  insets: { top: number; bottom: number };
  onListo: () => void;
}) {
  const [revelada, setRevelada] = useState(false);
  const r = ROLES_POLIS[rol];

  return (
    <View style={styles.screen}>
      {Platform.OS !== 'web' && <KeepAwake />}
      <LinearGradient colors={NIGHT} style={[styles.repartoWrap, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        {/* Grupo centrado: la frase queda a media altura, no pegada arriba */}
        <View style={styles.repartoCentro}>
          <Text style={styles.repartoOverline}>
            {revelada ? 'TU ROL ES' : `PÁSALE EL MÓVIL A · ${posicion}/${total}`}
          </Text>
          {!revelada && (
            <Text style={styles.repartoNombre} numberOfLines={1} adjustsFontSizeToFit>
              {nombre}
            </Text>
          )}

          <View style={styles.repartoCardArea}>
            {!revelada ? (
              <Pressable onPress={() => setRevelada(true)} style={styles.dorso}>
                <View style={styles.cardBorde} />
                <Text style={{ fontSize: 56 }}>🚓</Text>
                <Text style={styles.dorsoLogo}>LA PREVIA</Text>
                <Text style={styles.dorsoJuego}>Polis y Cacos</Text>
              </Pressable>
            ) : (
              <View style={[styles.cartaRol, { backgroundColor: r.color, borderColor: r.color }]}>
                <View style={[styles.cardBorde, { borderColor: 'rgba(255,255,255,0.25)' }]} />
                <Text style={{ fontSize: 64 }}>{r.icon}</Text>
                <Text style={styles.rolLabel}>{r.label}</Text>
              </View>
            )}
          </View>

          {revelada && (
            <View style={styles.instrCaja}>
              <Text style={styles.instrText}>{r.instr}</Text>
            </View>
          )}
        </View>

        <View style={styles.repartoBottom}>
          {revelada ? (
            <Pressable onPress={onListo} style={({ pressed }) => [pressed && styles.pressed]}>
              <LinearGradient
                colors={gradients.purple.colors}
                locations={gradients.purple.locations}
                start={gradientAngle.start}
                end={gradientAngle.end}
                style={styles.repartoBtn}>
                <Text style={styles.repartoBtnText} numberOfLines={1} adjustsFontSizeToFit>
                  {esUltimo ? 'Listo, ¡a jugar!' : `Pasa el móvil a ${siguienteNombre}`}
                </Text>
              </LinearGradient>
            </Pressable>
          ) : (
            <Text style={styles.repartoAviso}>Que nadie más mire la pantalla 👀</Text>
          )}
        </View>
      </LinearGradient>
    </View>
  );
}

// ——— Acusar: selección de un acusado entre los vivos ———
function Acusar({
  jugadores,
  candidatos,
  insets,
  onCancelar,
  onConfirmar,
}: {
  jugadores: string[];
  candidatos: number[];
  insets: { top: number; bottom: number };
  onCancelar: () => void;
  onConfirmar: (i: number) => void;
}) {
  const [sel, setSel] = useState(candidatos[0] ?? 0);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
      {Platform.OS !== 'web' && <KeepAwake />}
      <View style={styles.acusarHead}>
        <PressableScale onPress={onCancelar} style={styles.backBtn} hitSlop={10}>
          <Text style={styles.backIcon}>←</Text>
        </PressableScale>
        <Text style={styles.acusarEmoji}>🚨</Text>
        <Text style={styles.acusarTitulo}>¿A quién acusas?</Text>
        <Text style={styles.acusarSub}>El Policía señala a su sospechoso.</Text>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.acusarLista} showsVerticalScrollIndicator={false}>
        {candidatos.map((i) => {
          const on = sel === i;
          return (
            <PressableScale key={i} onPress={() => setSel(i)} scaleTo={0.98} style={[styles.acusarFila, on && styles.acusarFilaOn]}>
              <View style={[styles.avatar, { backgroundColor: colorJugador(i) }]}>
                <Text style={styles.avatarText}>{inicial(jugadores[i])}</Text>
              </View>
              <Text style={styles.acusarNombre} numberOfLines={1}>{jugadores[i]}</Text>
              <View style={[styles.radio, on && styles.radioOn]}>{on && <Text style={styles.radioCheck}>✓</Text>}</View>
            </PressableScale>
          );
        })}
      </ScrollView>
      <View style={[styles.acciones, { paddingBottom: insets.bottom + 14 }]}>
        <Pressable onPress={() => onConfirmar(sel)} style={({ pressed }) => [pressed && styles.pressed]}>
          <LinearGradient colors={['#EF4444', '#DC2626']} style={styles.redBtn}>
            <Text style={styles.redBtnText}>Confirmar acusación</Text>
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

// ——— Resolución final (Competición): quién murió, preseleccionado ———
function Resolucion({
  jugadores,
  preseleccion,
  insets,
  onAplicar,
}: {
  jugadores: string[];
  preseleccion: Set<number>;
  insets: { top: number; bottom: number };
  onAplicar: (indices: number[]) => void;
}) {
  const { session } = useSession();
  const [sel, setSel] = useState<Set<number>>(() => new Set(preseleccion));
  const toggle = (i: number) =>
    setSel((prev) => {
      const nxt = new Set(prev);
      if (nxt.has(i)) nxt.delete(i);
      else nxt.add(i);
      return nxt;
    });

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
      {Platform.OS !== 'web' && <KeepAwake />}
      <View style={styles.resHead}>
        <View style={styles.resBadge}>
          <Text style={styles.resBadgeText}>SOLO MODO COMPETICIÓN</Text>
        </View>
        <Text style={{ fontSize: 36 }}>⚰️</Text>
        <Text style={styles.resTitulo}>¿Quién ha sido asesinado?</Text>
        <Text style={styles.resSub}>Ajusta la lista si hace falta. Cada víctima bebe {TRAGOS_MUERTO}.</Text>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.acusarLista} showsVerticalScrollIndicator={false}>
        {jugadores.map((nombre, i) => {
          const on = sel.has(i);
          return (
            <PressableScale key={i} onPress={() => toggle(i)} scaleTo={0.98} style={[styles.acusarFila, on && styles.acusarFilaOn]}>
              <View style={[styles.avatar, { backgroundColor: colorJugador(i) }]}>
                <Text style={styles.avatarText}>{inicial(nombre)}</Text>
              </View>
              <Text style={[styles.acusarNombre, on && { textDecorationLine: 'line-through' }]} numberOfLines={1}>{nombre}</Text>
              {on && <Text style={{ fontSize: 18 }}>💀</Text>}
              <View style={[styles.check, on && styles.checkOn]}>{on && <Text style={styles.radioCheck}>✓</Text>}</View>
            </PressableScale>
          );
        })}
      </ScrollView>
      <View style={[styles.acciones, { paddingBottom: insets.bottom + 14 }]}>
        <PrimaryButton title={`Aplicar ${unidad(session.tono, 2)} (${sel.size})`} onPress={() => onAplicar([...sel])} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  // guarda
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, gap: 10 },
  bigEmoji: { fontSize: 64 },
  guardTitulo: { fontFamily: fonts.display, fontSize: 26, letterSpacing: -0.8, color: colors.ink, textAlign: 'center' },
  guardSub: { fontFamily: fonts.body, fontSize: 14, color: colors.gray, textAlign: 'center', maxWidth: 300 },
  guardBtn: { alignSelf: 'stretch', marginTop: 8 },
  // barra superior ronda
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, paddingHorizontal: 20 },
  // timer
  timerZona: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  ambiente: { fontFamily: fonts.body, fontSize: 13, color: 'rgba(255,255,255,0.5)', textAlign: 'center', paddingHorizontal: 20 },
  ringWrap: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  ringCentro: { position: 'absolute', alignItems: 'center' },
  ringTiempo: { fontFamily: fonts.display, fontSize: 58, color: '#fff', letterSpacing: -2.5 },
  pistaMuerte: { fontFamily: fonts.body, fontSize: 13, color: 'rgba(255,255,255,0.6)', textAlign: 'center', paddingHorizontal: 20 },
  vivosPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 6, paddingHorizontal: 16, borderRadius: 30,
  },
  vivosDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#22C55E' },
  vivosText: { fontFamily: fonts.bodyBold, fontSize: 12.5, color: 'rgba(255,255,255,0.65)' },
  // lista
  listaZona: { flex: 1, flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingTop: 10 },
  columna: { flex: 1, gap: 8, justifyContent: 'center' },
  jugadorFila: {
    flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.14)',
  },
  jugadorMuerto: { backgroundColor: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.06)', opacity: 0.5 },
  jugadorNombre: { flex: 1, fontFamily: fonts.display, fontSize: 14.5, color: '#fff' },
  jugadorNombreMuerto: { color: 'rgba(255,255,255,0.4)', textDecorationLine: 'line-through' },
  // acusar botón
  acusarWrap: { paddingHorizontal: 26, paddingTop: 10 },
  acusarBtn: {
    height: 68, borderRadius: 20, borderWidth: 2, borderColor: 'rgba(239,68,68,0.5)',
    backgroundColor: 'rgba(239,68,68,0.14)', alignItems: 'center', justifyContent: 'center',
  },
  acusarText: { fontFamily: fonts.display, fontSize: 21, color: '#FCA5A5' },
  acusarPista: { fontFamily: fonts.bodyBold, fontSize: 12.5, color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginBottom: 10, paddingHorizontal: 6 },
  // toast
  toastWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  toastCard: {
    backgroundColor: '#fff', borderRadius: 30, paddingVertical: 12, paddingHorizontal: 22,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 8,
  },
  toastText: { fontFamily: fonts.display, fontSize: 16, color: colors.ink },
  // reparto
  repartoWrap: { flex: 1, paddingHorizontal: 26 },
  repartoCentro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  repartoOverline: { fontFamily: fonts.bodyX, fontSize: 12, letterSpacing: 2.5, color: 'rgba(255,255,255,0.45)' },
  repartoNombre: { fontFamily: fonts.display, fontSize: 40, color: '#fff', letterSpacing: -1.5, textAlign: 'center' },
  repartoCardArea: { alignItems: 'center', justifyContent: 'center' },
  dorso: {
    width: 230, height: 320, borderRadius: 26, backgroundColor: '#1F1A38',
    borderWidth: 2.5, borderColor: '#4C3B7A', alignItems: 'center', justifyContent: 'center', gap: 12,
  },
  cardBorde: { position: 'absolute', top: 12, left: 12, right: 12, bottom: 12, borderRadius: 18, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)' },
  dorsoLogo: { fontFamily: fonts.display, fontSize: 15, color: 'rgba(255,255,255,0.5)', letterSpacing: 2 },
  dorsoJuego: { fontFamily: fonts.display, fontSize: 22, color: '#fff' },
  cartaRol: { width: 230, height: 320, borderRadius: 26, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center', gap: 14 },
  rolLabel: { fontFamily: fonts.display, fontSize: 30, color: '#fff', letterSpacing: -1 },
  instrCaja: {
    backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 16, padding: 16, maxWidth: 320,
  },
  instrText: { fontFamily: fonts.body, fontSize: 14, color: 'rgba(255,255,255,0.8)', textAlign: 'center', lineHeight: 21 },
  repartoBottom: { paddingTop: 16, paddingBottom: 14, minHeight: 96, justifyContent: 'center' },
  repartoAviso: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: 'rgba(255,255,255,0.6)', textAlign: 'center' },
  repartoBtn: { height: 80, borderRadius: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22 },
  repartoBtnText: { fontFamily: fonts.display, fontSize: 23, color: '#fff', letterSpacing: -0.3 },
  // botones comunes
  acciones: { paddingHorizontal: 26, paddingTop: 12, gap: 10 },
  pressed: { transform: [{ scale: 0.965 }] },
  redBtn: { height: 70, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  redBtnText: { fontFamily: fonts.display, fontSize: 21, color: '#fff' },
  inkBtn: { height: 70, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  inkBtnText: { fontFamily: fonts.display, fontSize: 21, color: '#fff' },
  darkBtn: { height: 70, borderRadius: 20, backgroundColor: '#3B2A0A', alignItems: 'center', justifyContent: 'center' },
  darkBtnText: { fontFamily: fonts.display, fontSize: 21, color: '#FDE68A' },
  // full-bleed helpers
  fullBleed: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, gap: 16 },
  fullBtn: { position: 'absolute', left: 26, right: 26 },
  emojiXL: { fontSize: 64 },
  centroFlex: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, gap: 16 },
  // hit
  hitTitulo: { fontFamily: fonts.display, fontSize: 40, color: '#fff', letterSpacing: -1.5, textAlign: 'center', maxWidth: 340 },
  hitCaja: { backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)', borderRadius: 18, padding: 16 },
  hitCajaText: { fontFamily: fonts.display, fontSize: 20, color: '#fff' },
  // miss
  missIcon: { width: 100, height: 100, borderRadius: 30, backgroundColor: colors.redBg, alignItems: 'center', justifyContent: 'center' },
  missTitulo: { fontFamily: fonts.display, fontSize: 34, color: colors.ink, letterSpacing: -1.2, textAlign: 'center', maxWidth: 340 },
  missSub: { fontFamily: fonts.body, fontSize: 14, color: colors.gray },
  missCaja: { backgroundColor: colors.redBg, borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
  missCajaText: { fontFamily: fonts.display, fontSize: 17, color: '#B91C1C' },
  // win
  winTitulo: { fontFamily: fonts.display, fontSize: 42, color: '#fff', letterSpacing: -1.5, textAlign: 'center' },
  winCaja: { backgroundColor: 'rgba(239,68,68,0.14)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.35)', borderRadius: 18, padding: 16, alignItems: 'center' },
  winCajaTitulo: { fontFamily: fonts.display, fontSize: 20, color: '#FCA5A5' },
  winCajaSub: { fontFamily: fonts.body, fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 4, textAlign: 'center' },
  policiaCaja: { backgroundColor: 'rgba(37,99,235,0.15)', borderWidth: 1, borderColor: 'rgba(147,197,253,0.35)', borderRadius: 18, padding: 16, alignItems: 'center' },
  // acusar screen
  acusarHead: { alignItems: 'center', paddingHorizontal: 24, gap: 4 },
  backBtn: {
    position: 'absolute', left: 0, top: 0, width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
  },
  backIcon: { color: colors.ink, fontSize: 18, fontFamily: fonts.bodyBold },
  acusarEmoji: { fontSize: 40, marginTop: 4 },
  acusarTitulo: { fontFamily: fonts.display, fontSize: 30, color: colors.ink, letterSpacing: -1, marginTop: 6 },
  acusarSub: { fontFamily: fonts.body, fontSize: 13, color: colors.gray, marginTop: 2, textAlign: 'center' },
  acusarLista: { paddingHorizontal: 24, paddingTop: 18, gap: 10, paddingBottom: 10 },
  acusarFila: {
    flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 18,
    backgroundColor: colors.white, borderWidth: 2, borderColor: colors.border,
  },
  acusarFilaOn: { backgroundColor: colors.redBg, borderColor: colors.red },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fonts.display, fontSize: 15, color: '#fff' },
  acusarNombre: { flex: 1, fontFamily: fonts.display, fontSize: 18, color: colors.ink },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.red, backgroundColor: colors.red },
  radioCheck: { color: '#fff', fontFamily: fonts.display, fontSize: 12 },
  check: { width: 24, height: 24, borderRadius: 7, borderWidth: 2.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  checkOn: { borderColor: colors.red, backgroundColor: colors.red },
  // resolución
  resHead: { alignItems: 'center', paddingHorizontal: 24, gap: 4 },
  resBadge: { backgroundColor: colors.lav100, paddingVertical: 4, paddingHorizontal: 12, borderRadius: 20, marginBottom: 10 },
  resBadgeText: { fontFamily: fonts.display, fontSize: 10, color: colors.purple, letterSpacing: 1 },
  resTitulo: { fontFamily: fonts.display, fontSize: 26, color: colors.ink, letterSpacing: -1, marginTop: 6, textAlign: 'center' },
  resSub: { fontFamily: fonts.body, fontSize: 13, color: colors.gray, marginTop: 4, textAlign: 'center' },
});
