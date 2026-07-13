// 10 · Muerte Súbita — full-bleed coral, desempate a copa

import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Confetti } from '@/components/Confetti';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SecondaryButton } from '@/components/SecondaryButton';
import { useSession } from '@/context/SessionContext';
import { colors, fonts, gradientAngle, gradients, type } from '@/theme/theme';

export default function MuerteSubitaScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useSession();

  const [confirmado, setConfirmado] = useState(false);

  // Jugadores empatados en cabeza (fallback: los dos primeros).
  // Chill: la "cabeza" es el mínimo (gana quien menos suma). Fiesta: el máximo (v1.0).
  const empatados = useMemo(() => {
    const comp = session.competicion;
    const jugadores = session.jugadores;
    if (!comp || jugadores.length < 2) return jugadores.slice(0, 2);
    const chill = session.tono === 'chill';
    const ranking = jugadores
      .map((nombre, i) => ({ nombre, tragos: comp.tragos[i] ?? 0 }))
      .sort((a, b) => (chill ? a.tragos - b.tragos : b.tragos - a.tragos));
    // Tras el sort, ranking[0] es ya el "ganador" (mín en chill, máx en fiesta).
    const objetivo = ranking[0]?.tragos ?? 0;
    const top = ranking.filter((r) => r.tragos === objetivo).map((r) => r.nombre);
    return top.length >= 2 ? top : ranking.slice(0, 2).map((r) => r.nombre);
  }, [session.competicion, session.jugadores, session.tono]);

  // Punto pulsante del badge (lp-breathe)
  const pulso = useSharedValue(1);
  useEffect(() => {
    pulso.value = withRepeat(withTiming(0.35, { duration: 800 }), -1, true);
  }, [pulso]);
  const pulsoStyle = useAnimatedStyle(() => ({ opacity: pulso.value }));

  return (
    <LinearGradient
      colors={gradients.coral.colors}
      locations={gradients.coral.locations}
      start={gradientAngle.start}
      end={gradientAngle.end}
      style={styles.screen}>
      <StatusBar style="light" />
      {confirmado && <Confetti />}

      <View style={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 20 }]}>
        {/* Badge */}
        <View style={styles.badge}>
          <Animated.View style={[styles.badgeDot, pulsoStyle]} />
          <Text style={styles.badgeText}>MUERTE SÚBITA</Text>
        </View>

        <View style={styles.center}>
          <Text style={styles.empateInfo}>Empate en cabeza</Text>
          <Text style={styles.versus} adjustsFontSizeToFit numberOfLines={2}>
            {empatados.join('  vs  ')}
          </Text>

          <View style={styles.chip}>
            <Text style={styles.chipText}>DESEMPATE</Text>
          </View>

          <Text style={styles.reto}>
            {session.tono === 'chill'
              ? <>El primero que aguante{'\n'}la mirada sin reír,{'\n'}gana 🏆</>
              : <>El primero que se beba{'\n'}lo que le queda en la copa,{'\n'}gana 🏆</>}
          </Text>
        </View>

        <View style={styles.botones}>
          {confirmado ? (
            <>
              <PrimaryButton title="🏆  ¡Ganador confirmado!" variant="ink" onPress={() => router.back()} />
              <SecondaryButton title="Volver a resultados" variant="onColor" onPress={() => router.back()} />
            </>
          ) : (
            <PrimaryButton
              title="¡Hay ganador!"
              variant="whiteOnCoral"
              onPress={() => setConfirmado(true)}
            />
          )}
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 28,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
    borderRadius: 30,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  badgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.white,
  },
  badgeText: {
    fontFamily: fonts.bodyX,
    fontSize: 11,
    letterSpacing: 2,
    color: colors.white,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  empateInfo: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
  },
  versus: {
    fontFamily: fonts.display,
    fontSize: 46,
    letterSpacing: -1.6,
    color: colors.white,
    textAlign: 'center',
  },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 30,
    paddingHorizontal: 13,
    paddingVertical: 6,
  },
  chipText: {
    ...type.chip,
    color: colors.white,
  },
  reto: {
    fontFamily: fonts.display,
    fontSize: 28,
    letterSpacing: -0.8,
    lineHeight: 34,
    color: colors.white,
    textAlign: 'center',
    marginTop: 10,
  },
  botones: {
    gap: 9,
  },
});
