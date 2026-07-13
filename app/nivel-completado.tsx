// Pantalla de transición entre niveles de Escalada. Muestra el nivel completado
// y el siguiente. El usuario pulsa "Continuar" para avanzar al siguiente nivel.

import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/PrimaryButton';
import { useSession } from '@/context/SessionContext';
import { getJuego } from '@/data/content';
import { rutaJuego } from '@/data/rutas';
import { pick } from '@/utils/textoTono';
import { colors, fonts, gradientAngle, gradients } from '@/theme/theme';
import escaladaJson from '@/assets/content/escalada.json';

const NIVELES = escaladaJson.niveles;
const LLAMAS = ['🔥', '🔥🔥', '🔥🔥🔥', '🔥🔥🔥🔥'];

export default function NivelCompletadoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, avanzarRonda } = useSession();

  const comp = session.competicion;
  const rondaActual = comp?.rondaActual ?? 0;
  const nextRonda = rondaActual + 1;
  const nextJuegoId = comp?.juegos[nextRonda];
  const nextJuego = getJuego(nextJuegoId ?? '');
  const nivelCompletado = NIVELES[rondaActual];
  const nivelSiguiente = NIVELES[nextRonda];

  // Seguridad: si no hay siguiente nivel, ir a resultados
  useEffect(() => {
    if (!comp || nextRonda >= comp.numRondas) {
      router.replace('/resultados');
    }
  }, []);

  const continuar = () => {
    avanzarRonda();
    router.replace(rutaJuego(nextJuegoId, { modo: session.modo ?? undefined, intensidad: session.intensidad }));
  };

  return (
    <View style={styles.flex}>
      <LinearGradient
        colors={gradients.purple.colors}
        locations={gradients.purple.locations}
        start={gradientAngle.start}
        end={gradientAngle.end}
        style={[styles.flex, { paddingTop: insets.top + 20 }]}>

        {/* Nivel completado */}
        <Animated.View entering={FadeIn.duration(400)} style={styles.completadoWrap}>
          <Text style={styles.completadoLabel}>NIVEL {nivelCompletado?.nivel ?? rondaActual + 1} COMPLETADO</Text>
          <Text style={styles.completadoEmoji}>{nivelCompletado?.emoji ?? '✅'}</Text>
          <Text style={styles.completadoNombre}>{nivelCompletado?.nombre ?? ''}</Text>
        </Animated.View>

        {/* Flecha */}
        <Animated.Text entering={FadeInDown.delay(200).duration(400)} style={styles.flecha}>
          ↓
        </Animated.Text>

        {/* Siguiente nivel */}
        <Animated.View entering={FadeInDown.delay(350).duration(400)} style={styles.siguienteCard}>
          <Text style={styles.siguienteOver}>SUBIENDO DE INTENSIDAD...</Text>
          <View style={styles.siguienteRow}>
            <Text style={styles.siguienteLlamas}>{LLAMAS[nextRonda] ?? '🔥'}</Text>
            <View>
              <Text style={styles.siguienteNivel}>Nivel {nivelSiguiente?.nivel ?? nextRonda + 1}: {nivelSiguiente?.nombre ?? ''}</Text>
              {nextJuego && (
                <Text style={styles.siguienteJuego}>{nextJuego.emoji} {pick(nextJuego.nombre, nextJuego.nombreChill, session.tono)}</Text>
              )}
            </View>
          </View>
        </Animated.View>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
          <PrimaryButton title="¡Vamos! 🔥" variant="white" onPress={continuar} />
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  completadoWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  completadoLabel: {
    fontFamily: fonts.bodyX, fontSize: 12, letterSpacing: 2.5,
    color: 'rgba(255,255,255,0.65)',
  },
  completadoEmoji: { fontSize: 56, marginTop: 8 },
  completadoNombre: {
    fontFamily: fonts.display, fontSize: 36, letterSpacing: -1.2,
    color: colors.white, textAlign: 'center',
  },
  flecha: {
    fontSize: 28, color: 'rgba(255,255,255,0.4)',
    textAlign: 'center', marginVertical: 8,
  },
  siguienteCard: {
    marginHorizontal: 24,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 22, padding: 20, gap: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  siguienteOver: {
    fontFamily: fonts.bodyX, fontSize: 11, letterSpacing: 2,
    color: 'rgba(255,255,255,0.6)',
  },
  siguienteRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  siguienteLlamas: { fontSize: 26 },
  siguienteNivel: {
    fontFamily: fonts.display, fontSize: 20, letterSpacing: -0.5, color: colors.white,
  },
  siguienteJuego: {
    fontFamily: fonts.bodySemi, fontSize: 14, color: 'rgba(255,255,255,0.75)', marginTop: 3,
  },
  footer: { paddingHorizontal: 24, paddingTop: 20 },
});
