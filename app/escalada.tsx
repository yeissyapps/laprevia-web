// 04c · Escalada — intro del modo + selección aleatoria de juegos por nivel

import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DesbloqueoAnuncio } from '@/components/DesbloqueoAnuncio';
import { Overline } from '@/components/Overline';
import { PressableScale } from '@/components/PressableScale';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useSession } from '@/context/SessionContext';
import { getJuego } from '@/data/content';
import { rutaJuego } from '@/data/rutas';
import { colors, fonts, gradientAngle, gradients, shadows, spacing } from '@/theme/theme';
import escaladaJson from '@/assets/content/escalada.json';

const ESCALADA_PLUS18_ID = 'escalada-18';

interface NivelInfo {
  nivel: number;
  nombre: string;
  emoji: string;
  juegos: { id: string; min_jugadores: number; max_jugadores: number; duracion: string }[];
}

const NIVELES: NivelInfo[] = escaladaJson.niveles as NivelInfo[];

const LLAMAS = ['🔥', '🔥🔥', '🔥🔥🔥', '🔥🔥🔥🔥'];

function barajarArr<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function EscaladaScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, setIntensidad, configurarCompeticion, estaDesbloqueado, desbloquearTemporal } = useSession();

  const [plus18, setPlus18] = useState(false);
  const [showAd, setShowAd] = useState(false);
  // Guarda los juegos seleccionados para arrancar tras el anuncio
  const pendingGames = useRef<{ ids: string[]; duraciones: string[] } | null>(null);

  const numJugadores = session.jugadores.length;

  const seleccionarJuegos = (): { ids: string[]; duraciones: string[] } => {
    const ids: string[] = [];
    const duraciones: string[] = [];
    for (const nivel of NIVELES) {
      const compatibles = nivel.juegos.filter(
        (j) => numJugadores >= j.min_jugadores && numJugadores <= j.max_jugadores
      );
      if (compatibles.length === 0) {
        console.warn(`Escalada: nivel ${nivel.nivel} sin juegos para ${numJugadores} jugadores`);
        continue;
      }
      const elegido = barajarArr(compatibles)[0];
      ids.push(elegido.id);
      duraciones.push(elegido.duracion);
    }
    return { ids, duraciones };
  };

  const arrancar = (ids: string[], duraciones: string[]) => {
    const intensidad = plus18 ? 'picante' : 'normal';
    setIntensidad(intensidad);
    configurarCompeticion(ids.length, ids, duraciones);
    router.replace(rutaJuego(ids[0], { modo: 'escalada', intensidad }));
  };

  const empezar = () => {
    const { ids, duraciones } = seleccionarJuegos();
    if (plus18 && !estaDesbloqueado(ESCALADA_PLUS18_ID)) {
      pendingGames.current = { ids, duraciones };
      setShowAd(true);
      return;
    }
    arrancar(ids, duraciones);
  };

  const onAdDesbloqueado = () => {
    desbloquearTemporal(ESCALADA_PLUS18_ID);
    setShowAd(false);
    const p = pendingGames.current;
    if (p) arrancar(p.ids, p.duraciones);
  };

  const handlePlus18 = (valor: boolean) => {
    if (!valor) {
      setPlus18(false);
      return;
    }
    // Si ya tiene el desbloqueo activo (vio el anuncio antes en esta sesión)
    if (estaDesbloqueado(ESCALADA_PLUS18_ID)) {
      setPlus18(true);
    } else {
      // Activar optimistamente; el anuncio se pedirá al pulsar Empezar
      setPlus18(true);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 16 }]}
        showsVerticalScrollIndicator={false}>
        <PressableScale onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <Text style={styles.backIcon}>←</Text>
        </PressableScale>

        <Overline>MODO ESCALADA</Overline>
        <Text style={styles.title}>🔥 Escalada</Text>
        <Text style={styles.subtitle}>
          La app elige los juegos por vosotros y sube la intensidad poco a poco. Empezamos suave y acabamos con todo.
        </Text>

        {/* Tarjetas de los 4 niveles */}
        <View style={styles.niveles}>
          {NIVELES.map((n, i) => (
            <View key={n.nivel} style={[styles.nivelCard, shadows.card]}>
              <View style={[styles.nivelBadge, { backgroundColor: BADGE_COLORS[i] }]}>
                <Text style={styles.nivelBadgeText}>NIVEL {n.nivel}</Text>
              </View>
              <View style={styles.nivelInfo}>
                <Text style={styles.nivelEmoji}>{n.emoji}</Text>
                <View>
                  <Text style={styles.nivelNombre}>{n.nombre}</Text>
                  <Text style={styles.nivelLlamas}>{LLAMAS[i]}</Text>
                </View>
              </View>
              <Text style={styles.nivelJuegos}>
                {n.juegos
                  .filter((j) => numJugadores >= j.min_jugadores && numJugadores <= j.max_jugadores)
                  .map((j) => {
                    const cfg = getJuego(j.id);
                    return session.tono === 'chill' && cfg?.nombreChill ? cfg.nombreChill : j.id.replace(/-/g, ' ');
                  })
                  .join(' · ')}
              </Text>
            </View>
          ))}
        </View>

        {/* Toggle +18 */}
        <View style={[styles.toggleCard, shadows.card]}>
          <View style={styles.toggleTexts}>
            <Text style={styles.toggleTitle}>¿Incluir contenido +18?</Text>
            <Text style={styles.toggleSub}>
              {plus18
                ? 'Los juegos usarán sus preguntas más atrevidas 🌶️'
                : 'Los juegos usarán contenido normal'}
            </Text>
          </View>
          <Switch
            value={plus18}
            onValueChange={handlePlus18}
            trackColor={{ false: colors.border, true: colors.purple }}
            thumbColor={colors.white}
          />
        </View>

        {plus18 && !estaDesbloqueado(ESCALADA_PLUS18_ID) && (
          <Text style={styles.adNote}>📺 Se pedirá ver un anuncio breve al empezar</Text>
        )}

        <Text style={styles.meta}>
          👥 {numJugadores} jugadores · {session.jugadores.join(', ')}
        </Text>

        <PressableScale onPress={empezar} scaleTo={0.97}>
          <LinearGradient
            colors={gradients.purple.colors}
            locations={gradients.purple.locations}
            start={gradientAngle.start}
            end={gradientAngle.end}
            style={styles.empezarBtn}>
            <Text style={styles.empezarText}>Empezar Escalada 🔥</Text>
          </LinearGradient>
        </PressableScale>
      </ScrollView>

      <DesbloqueoAnuncio
        visible={showAd}
        modo="desbloqueo"
        contenido="contenido +18 de Escalada"
        onDesbloqueado={onAdDesbloqueado}
        onCancel={() => { setShowAd(false); setPlus18(false); }}
      />
    </View>
  );
}

const BADGE_COLORS = ['#D1FAE5', '#FEF3C7', '#FFEDD5', '#FEE2E2'];

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: spacing.screenH, gap: 0 },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', marginBottom: 18,
  },
  backIcon: { color: colors.ink, fontSize: 18, fontFamily: fonts.bodyBold },
  title: {
    fontFamily: fonts.display, fontSize: 38, letterSpacing: -1.4,
    color: colors.ink, marginTop: 8,
  },
  subtitle: {
    fontFamily: fonts.body, fontSize: 14.5, lineHeight: 21,
    color: colors.gray, marginTop: 10, marginBottom: 22,
  },
  niveles: { gap: 10, marginBottom: 20 },
  nivelCard: {
    backgroundColor: colors.white, borderRadius: 18,
    borderWidth: 1.5, borderColor: colors.border, padding: 14, gap: 8,
  },
  nivelBadge: {
    alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: 20,
  },
  nivelBadgeText: {
    fontFamily: fonts.bodyX, fontSize: 10, letterSpacing: 1, color: colors.ink,
  },
  nivelInfo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  nivelEmoji: { fontSize: 28 },
  nivelNombre: {
    fontFamily: fonts.display, fontSize: 18, letterSpacing: -0.4, color: colors.ink,
  },
  nivelLlamas: { fontSize: 12, marginTop: 1 },
  nivelJuegos: {
    fontFamily: fonts.body, fontSize: 12, color: colors.gray,
    textTransform: 'capitalize',
  },
  toggleCard: {
    backgroundColor: colors.white, borderRadius: 18,
    borderWidth: 1.5, borderColor: colors.border,
    padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14,
    marginBottom: 8,
  },
  toggleTexts: { flex: 1 },
  toggleTitle: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.ink },
  toggleSub: { fontFamily: fonts.body, fontSize: 12, color: colors.gray, marginTop: 2 },
  adNote: {
    fontFamily: fonts.body, fontSize: 12.5, color: colors.grayLt,
    textAlign: 'center', marginBottom: 8,
  },
  meta: {
    fontFamily: fonts.bodyBold, fontSize: 12, color: colors.grayLt,
    textAlign: 'center', marginTop: 14, marginBottom: 16,
  },
  empezarBtn: {
    height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
  },
  empezarText: {
    fontFamily: fonts.display, fontSize: 20, color: colors.white, letterSpacing: -0.3,
  },
});
