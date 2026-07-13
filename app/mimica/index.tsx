// Mímica · Configuración — equipos (azar/manual), categorías y modo de puntuación.

import { useRouter, type Href } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DesbloqueoAnuncio } from '@/components/DesbloqueoAnuncio';
import { Overline } from '@/components/Overline';
import { PressableScale } from '@/components/PressableScale';
import { PrimaryButton } from '@/components/PrimaryButton';
import { RulesButton } from '@/components/GameRules';
import { useSession } from '@/context/SessionContext';
import {
  CATEGORIAS_DEFECTO,
  CATEGORIAS_MIMICA,
  RONDAS_DEFAULT,
  RONDAS_MAX,
  RONDAS_MIN,
  nombreEquipo,
  repartirEquipos,
  type FormacionEquipos,
  type ModoPuntuacion,
} from '@/data/mimica';
import { colors, fonts, radius, shadows, type } from '@/theme/theme';

const EQUIPO_A = colors.purple;
const EQUIPO_B = colors.coral;
const MIN_POR_EQUIPO = 2;
const DESBLOQUEO_PICANTE = 'mimica-picante';
const PICANTE_ID = CATEGORIAS_MIMICA.find((c) => c.nivel === 'picante')?.id ?? 'picante';

export default function MimicaConfigScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, estaDesbloqueado, desbloquearTemporal } = useSession();

  const jugadores = session.jugadores.length > 0 ? session.jugadores : ['Jugador 1', 'Jugador 2'];
  const n = jugadores.length;
  const picanteDesbloqueado = estaDesbloqueado(DESBLOQUEO_PICANTE);
  const [anuncioVisible, setAnuncioVisible] = useState(false);

  const [formacion, setFormacion] = useState<FormacionEquipos>('aleatorio');
  // Asignación manual: 'a'/'b' por índice de jugador (alterna por defecto)
  const [asign, setAsign] = useState<('a' | 'b')[]>(() => jugadores.map((_, i) => (i % 2 === 0 ? 'a' : 'b')));

  // La sesión hidrata de AsyncStorage tras el primer render: ajusta la asignación
  // al número real de jugadores conservando lo ya elegido.
  useEffect(() => {
    setAsign((prev) => {
      if (prev.length === n) return prev;
      return Array.from({ length: n }, (_, i) => prev[i] ?? (i % 2 === 0 ? 'a' : 'b'));
    });
  }, [n]);
  const [cats, setCats] = useState<string[]>(CATEGORIAS_DEFECTO);
  const [modo, setModo] = useState<ModoPuntuacion>('libre');
  const [rondas, setRondas] = useState(RONDAS_DEFAULT);

  const equiposManual = useMemo(() => {
    const a: number[] = [];
    const b: number[] = [];
    asign.forEach((t, i) => (t === 'a' ? a : b).push(i));
    return { a, b };
  }, [asign]);

  const toggleAsign = (i: number) =>
    setAsign((prev) => prev.map((t, idx) => (idx === i ? (t === 'a' ? 'b' : 'a') : t)));

  const toggleCat = (id: string) => {
    // El picante es premium: se desbloquea gratis viendo un vídeo de 30 s
    if (id === PICANTE_ID && !picanteDesbloqueado && !cats.includes(PICANTE_ID)) {
      setAnuncioVisible(true);
      return;
    }
    setCats((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  };

  const desbloquearPicante = () => {
    desbloquearTemporal(DESBLOQUEO_PICANTE);
    setAnuncioVisible(false);
    setCats((prev) => (prev.includes(PICANTE_ID) ? prev : [...prev, PICANTE_ID]));
  };

  const equiposValidos =
    formacion === 'aleatorio'
      ? n >= MIN_POR_EQUIPO * 2
      : equiposManual.a.length >= MIN_POR_EQUIPO && equiposManual.b.length >= MIN_POR_EQUIPO;
  const puedeEmpezar = equiposValidos && cats.length > 0;

  const empezar = () => {
    if (!puedeEmpezar) return;
    const equipos = formacion === 'aleatorio' ? repartirEquipos(n) : equiposManual;
    // Cast a Href: el watcher de typed routes aún no conoce '/mimica/jugar' (ver rutas.ts)
    const q =
      `ea=${equipos.a.join('-')}&eb=${equipos.b.join('-')}` +
      `&cats=${cats.join('-')}&modo=${modo}&rondas=${rondas}`;
    router.push(`/mimica/jugar?${q}` as Href);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
      <View style={styles.header}>
        <PressableScale onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <Text style={styles.backIcon}>←</Text>
        </PressableScale>
        <Text style={styles.title}>Mímica</Text>
        <RulesButton juegoId="mimica" />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 130 }]} showsVerticalScrollIndicator={false}>
        {/* ——— Equipos ——— */}
        <Overline>1 · EQUIPOS</Overline>
        <View style={styles.segmentoBig}>
          {(
            [
              { id: 'aleatorio', emoji: '🎲', label: 'Aleatorios', sub: 'La app reparte' },
              { id: 'manual', emoji: '✋', label: 'Yo elijo', sub: 'Tú asignas' },
            ] as const
          ).map((op) => {
            const activo = formacion === op.id;
            return (
              <PressableScale
                key={op.id}
                onPress={() => setFormacion(op.id)}
                scaleTo={0.97}
                style={[styles.formCard, activo ? styles.formCardOn : styles.formCardOff]}>
                <Text style={styles.formEmoji}>{op.emoji}</Text>
                <Text style={[styles.formLabel, { color: activo ? colors.white : colors.ink }]}>{op.label}</Text>
                <Text style={[styles.formSub, { color: activo ? 'rgba(255,255,255,0.85)' : colors.grayLt }]}>
                  {op.sub}
                </Text>
              </PressableScale>
            );
          })}
        </View>

        {formacion === 'manual' && (
          <View style={styles.manualBox}>
            <Text style={styles.manualHint}>Toca un nombre para cambiarlo de equipo</Text>
            {jugadores.map((nombre, i) => {
              const enA = asign[i] === 'a';
              return (
                <PressableScale
                  key={i}
                  onPress={() => toggleAsign(i)}
                  scaleTo={0.98}
                  style={[styles.asignRow, { borderColor: enA ? EQUIPO_A : EQUIPO_B }]}>
                  <Text style={styles.asignNombre} numberOfLines={1}>
                    {nombre}
                  </Text>
                  <View style={[styles.asignPill, { backgroundColor: enA ? EQUIPO_A : EQUIPO_B }]}>
                    <Text style={styles.asignPillText}>{nombreEquipo(enA ? 'a' : 'b')}</Text>
                  </View>
                </PressableScale>
              );
            })}
            {(equiposManual.a.length < MIN_POR_EQUIPO || equiposManual.b.length < MIN_POR_EQUIPO) && (
              <Text style={styles.aviso}>Cada equipo necesita al menos {MIN_POR_EQUIPO} jugadores</Text>
            )}
          </View>
        )}

        {/* ——— Categorías ——— */}
        <Overline style={styles.secGap}>2 · CATEGORÍAS</Overline>
        <View style={styles.catLista}>
          {CATEGORIAS_MIMICA.map((cat) => {
            const marcado = cats.includes(cat.id);
            const picante = cat.nivel === 'picante';
            const bloqueado = picante && !picanteDesbloqueado;
            return (
              <PressableScale
                key={cat.id}
                onPress={() => toggleCat(cat.id)}
                style={[styles.catRow, shadows.card, marcado && { borderColor: picante ? EQUIPO_B : colors.purple }]}>
                <View
                  style={[
                    styles.check,
                    marcado
                      ? { backgroundColor: picante ? EQUIPO_B : colors.purple, borderColor: picante ? EQUIPO_B : colors.purple }
                      : { borderColor: colors.border },
                  ]}>
                  {marcado ? <Text style={styles.checkIcon}>✓</Text> : bloqueado ? <Text style={styles.lockIcon}>🔒</Text> : null}
                </View>
                <Text style={styles.catNombre}>{cat.nombre}</Text>
                {picante &&
                  (bloqueado ? (
                    <View style={[styles.picanteBadge, { backgroundColor: colors.lav100 }]}>
                      <Text style={[styles.picanteText, { color: colors.purple }]}>📺 GRATIS CON VÍDEO</Text>
                    </View>
                  ) : (
                    <View style={styles.picanteBadge}>
                      <Text style={styles.picanteText}>🌶️ +18</Text>
                    </View>
                  ))}
              </PressableScale>
            );
          })}
        </View>

        {/* ——— Puntuación ——— */}
        <Overline style={styles.secGap}>3 · PUNTUACIÓN</Overline>
        <View style={styles.segmento}>
          {(
            [
              { id: 'libre', label: 'Libre' },
              { id: 'rondas', label: 'A rondas' },
            ] as const
          ).map((op) => {
            const activo = modo === op.id;
            return (
              <PressableScale
                key={op.id}
                onPress={() => setModo(op.id)}
                scaleTo={0.97}
                style={[styles.segBtn, activo && styles.segBtnOn]}>
                <Text style={[styles.segText, { color: activo ? colors.purple : colors.gray }]}>{op.label}</Text>
              </PressableScale>
            );
          })}
        </View>
        <Text style={styles.modoHint}>
          {modo === 'libre'
            ? 'Sin límite: jugáis los turnos que queráis y termináis cuando decidáis.'
            : 'Se juega un número fijo de turnos, alternando entre los dos equipos.'}
        </Text>

        {modo === 'rondas' && (
          <View style={styles.rondasRow}>
            <Text style={styles.rondasLabel}>Rondas totales</Text>
            <View style={styles.stepper}>
              <PressableScale
                onPress={() => setRondas((r) => Math.max(RONDAS_MIN, r - 1))}
                disabled={rondas <= RONDAS_MIN}
                style={[styles.stepBtn, rondas <= RONDAS_MIN && styles.stepOff]}
                hitSlop={6}>
                <Text style={styles.stepMinus}>−</Text>
              </PressableScale>
              <Text style={styles.stepNum}>{rondas}</Text>
              <PressableScale
                onPress={() => setRondas((r) => Math.min(RONDAS_MAX, r + 1))}
                disabled={rondas >= RONDAS_MAX}
                style={[styles.stepBtnPlus, rondas >= RONDAS_MAX && styles.stepOff]}
                hitSlop={6}>
                <Text style={styles.stepPlus}>+</Text>
              </PressableScale>
            </View>
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
        <PrimaryButton
          title={puedeEmpezar ? '¡Empezar!' : cats.length === 0 ? 'Elige al menos una categoría' : 'Revisa los equipos'}
          onPress={empezar}
          disabled={!puedeEmpezar}
        />
      </View>

      <DesbloqueoAnuncio
        visible={anuncioVisible}
        contenido="la categoría +18"
        onDesbloqueado={desbloquearPicante}
        onCancel={() => setAnuncioVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 26,
    marginBottom: 8,
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
  },
  backIcon: {
    color: colors.ink,
    fontSize: 20,
    lineHeight: 20,
    fontFamily: fonts.bodyBold,
    textAlign: 'center',
    includeFontPadding: false,
  },
  title: { flex: 1, fontFamily: fonts.display, fontSize: 28, letterSpacing: -1, color: colors.ink },
  content: { paddingHorizontal: 26, paddingTop: 8 },
  secGap: { marginTop: 24 },
  // equipos
  segmentoBig: { flexDirection: 'row', gap: 12, marginTop: 12 },
  formCard: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 18,
    alignItems: 'center',
    gap: 2,
    borderWidth: 2,
  },
  formCardOn: { backgroundColor: colors.purple, borderColor: colors.purple, ...shadows.purpleSoft },
  formCardOff: { backgroundColor: colors.white, borderColor: colors.border },
  formEmoji: { fontSize: 32, marginBottom: 4 },
  formLabel: { fontFamily: fonts.display, fontSize: 19, letterSpacing: -0.4 },
  formSub: { fontFamily: fonts.bodyBold, fontSize: 11.5 },
  manualBox: { marginTop: 12, gap: 8 },
  manualHint: { fontFamily: fonts.body, fontSize: 12.5, color: colors.grayLt, marginBottom: 2 },
  asignRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  asignNombre: { flex: 1, fontFamily: fonts.display, fontSize: 18, color: colors.ink, letterSpacing: -0.4 },
  asignPill: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  asignPillText: { fontFamily: fonts.bodyX, fontSize: 12, color: colors.white, letterSpacing: 0.3 },
  aviso: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.red, marginTop: 2 },
  // categorías
  catLista: { gap: 10, marginTop: 12 },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.gameCard,
    padding: 15,
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkIcon: { color: colors.white, fontSize: 13, fontFamily: fonts.bodyX },
  lockIcon: { fontSize: 11 },
  catNombre: { flex: 1, fontFamily: fonts.display, fontSize: 17, color: colors.ink, letterSpacing: -0.3 },
  picanteBadge: { backgroundColor: '#FFE7E2', borderRadius: 30, paddingHorizontal: 9, paddingVertical: 3 },
  picanteText: { fontFamily: fonts.bodyX, fontSize: 10.5, color: '#E11D48', letterSpacing: 0.3 },
  // puntuación
  segmento: {
    flexDirection: 'row',
    backgroundColor: colors.ghost,
    borderRadius: 14,
    padding: 4,
    gap: 4,
    marginTop: 12,
  },
  segBtn: { flex: 1, height: 44, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  segBtnOn: { backgroundColor: colors.white, ...shadows.card },
  segText: { fontFamily: fonts.bodyX, fontSize: 14 },
  modoHint: { fontFamily: fonts.body, fontSize: 12.5, color: colors.grayLt, marginTop: 8, lineHeight: 18 },
  rondasRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 14,
    ...shadows.card,
  },
  rondasLabel: { fontFamily: fonts.display, fontSize: 16, color: colors.ink, letterSpacing: -0.3 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnPlus: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepOff: { opacity: 0.4 },
  stepMinus: { fontFamily: fonts.display, fontSize: 22, lineHeight: 26, color: colors.purple, includeFontPadding: false, textAlign: 'center' },
  stepPlus: { fontFamily: fonts.display, fontSize: 22, lineHeight: 26, color: colors.white, includeFontPadding: false, textAlign: 'center' },
  stepNum: {
    fontFamily: fonts.display,
    fontSize: 26,
    color: colors.ink,
    minWidth: 40,
    textAlign: 'center',
    includeFontPadding: false,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 26,
    paddingTop: 12,
    backgroundColor: colors.surface,
  },
});
