// Splash de juego — pantalla previa única para los 11 juegos. Muestra nombre +
// emoji del juego, "¿Cómo se juega?" (reglas desde reglas_juegos.json) y el CTA
// "¡Comenzar!". Se llega aquí desde el menú de juegos; "Comenzar" entra al juego.

import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { reglasDe, RulesModal } from '@/components/GameRules';
import { PressableScale } from '@/components/PressableScale';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SecondaryButton } from '@/components/SecondaryButton';
import { useSession } from '@/context/SessionContext';
import { getJuego } from '@/data/content';
import { rutaJuego } from '@/data/rutas';
import { pick } from '@/utils/textoTono';
import { colors, fonts, gradientAngle, gradients, spacing } from '@/theme/theme';

export default function JugarSplashScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useSession();

  const [reglasVisible, setReglasVisible] = useState(false);

  const juego = getJuego(session.juegoActual ?? '');
  const tieneReglas = !!reglasDe(session.juegoActual);

  const comenzar = () => {
    // Reemplaza el splash para que "atrás" desde el juego vuelva al menú, no aquí.
    router.replace(rutaJuego(session.juegoActual));
  };

  if (!juego) {
    // Sin juego seleccionado (acceso directo improbable): volver al menú.
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top + 10 }]}>
        <Text style={styles.fallback}>No hay ningún juego seleccionado.</Text>
        <SecondaryButton title="Ir al menú de juegos" variant="soft" onPress={() => router.replace('/juegos')} />
      </View>
    );
  }

  const esEscalada = session.modo === 'escalada';
  const nivelActual = esEscalada ? (session.competicion?.rondaActual ?? 0) + 1 : null;
  const totalNiveles = esEscalada ? (session.competicion?.numRondas ?? 4) : null;
  const LLAMAS = ['🔥', '🔥🔥', '🔥🔥🔥', '🔥🔥🔥🔥'];

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
      {esEscalada && nivelActual !== null && (
        <View style={styles.escaladaBanner}>
          <Text style={styles.escaladaText}>
            {LLAMAS[(nivelActual - 1) % 4]}  Nivel {nivelActual} de {totalNiveles}  ·  Escalada
          </Text>
        </View>
      )}

      <PressableScale onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
        <Text style={styles.backIcon}>←</Text>
      </PressableScale>

      <View style={styles.center}>
        <Animated.View entering={FadeIn.duration(320)} style={styles.tile}>
          <LinearGradient
            colors={gradients.purple.colors}
            locations={gradients.purple.locations}
            start={gradientAngle.start}
            end={gradientAngle.end}
            style={styles.tileGrad}>
            <Text style={styles.emoji}>{juego.emoji}</Text>
          </LinearGradient>
        </Animated.View>

        <Animated.Text entering={FadeInDown.duration(360)} style={styles.nombre}>
          {pick(juego.nombre, juego.nombreChill, session.tono)}
        </Animated.Text>

        <Animated.Text entering={FadeInDown.delay(60).duration(360)} style={styles.meta}>
          👥 {juego.minJugadores}–{juego.maxJugadores} jugadores
        </Animated.Text>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        {tieneReglas && (
          <SecondaryButton
            title="📖  ¿Cómo se juega?"
            variant="soft"
            onPress={() => setReglasVisible(true)}
          />
        )}
        <PrimaryButton title="¡Comenzar!" onPress={comenzar} />
      </View>

      <RulesModal
        juegoId={session.juegoActual}
        visible={reglasVisible}
        onClose={() => setReglasVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.screenH,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
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
  tile: {
    marginBottom: 22,
  },
  tileGrad: {
    width: 132,
    height: 132,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 66,
  },
  nombre: {
    fontFamily: fonts.display,
    fontSize: 42,
    letterSpacing: -1.4,
    color: colors.ink,
    textAlign: 'center',
  },
  meta: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.gray,
    marginTop: 4,
  },
  escaladaBanner: {
    alignSelf: 'stretch',
    backgroundColor: colors.lav100,
    borderRadius: 30,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginBottom: 10,
    alignItems: 'center',
  },
  escaladaText: {
    fontFamily: fonts.bodyX,
    fontSize: 12,
    color: colors.purple,
    letterSpacing: 0.3,
  },
  fallback: {
    fontFamily: fonts.bodySemi,
    fontSize: 16,
    color: colors.gray,
    textAlign: 'center',
    marginBottom: 18,
  },
  footer: {
    gap: 10,
    paddingTop: 10,
  },
});
