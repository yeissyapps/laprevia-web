// 01 · Splash — logo, tagline y "Toca para empezar".
// Si hay una partida guardada, ofrece continuarla.

import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SecondaryButton } from '@/components/SecondaryButton';
import { useSession } from '@/context/SessionContext';
import { rutaJuego } from '@/data/rutas';
import { colors, fonts, gradientAngle, gradients, type } from '@/theme/theme';

export default function SplashScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, hayPartidaGuardada, reiniciarSesion } = useSession();

  // lp-pop: scale 0.82 → 1 con rebote
  const pop = useSharedValue(0.82);
  // lp-breathe: opacidad 1 ↔ 0.45
  const breathe = useSharedValue(1);

  useEffect(() => {
    pop.value = withSpring(1, { damping: 9, stiffness: 160, mass: 0.7 });
    breathe.value = withRepeat(withTiming(0.45, { duration: 1300 }), -1, true);
  }, [pop, breathe]);

  const logoStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const breatheStyle = useAnimatedStyle(() => ({ opacity: breathe.value }));

  const empezar = () => {
    reiniciarSesion();
    router.push('/participantes');
  };

  const continuar = () => {
    // Escalada: siempre volver a la intro para que el usuario vea los niveles y pulse Empezar
    if (session.modo === 'escalada') {
      router.push('/escalada');
    } else if (session.modo === 'competicion' && session.competicion) {
      router.push(rutaJuego(session.juegoActual, { modo: session.modo, intensidad: session.intensidad }));
    } else if (session.juegoActual) {
      router.push(rutaJuego(session.juegoActual));
    } else if (session.modo === 'libre') {
      router.push('/juegos');
    } else {
      router.push('/modo');
    }
  };

  return (
    <Pressable style={styles.screen} onPress={empezar}>
      {/* Halo radial superior (dos capas para simular degradado radial) */}
      <View style={[styles.haloOuter, styles.noPointer]} />
      <View style={[styles.haloInner, styles.noPointer]} />

      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Animated.View style={[styles.logoBlock, logoStyle]}>
          <Text style={[styles.logoLine, { color: colors.purpleLight }]}>LA</Text>
          <Text style={[styles.logoLine, { color: colors.ink }]}>PREVIA</Text>
          <LinearGradient
            colors={gradients.purple.colors}
            locations={gradients.purple.locations}
            start={gradientAngle.start}
            end={gradientAngle.end}
            style={styles.underline}
          />
          <Text style={[type.overline, styles.tagline]}>JUEGOS PARA FIESTAS</Text>
        </Animated.View>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 28 }]}>
        {hayPartidaGuardada && (
          <SecondaryButton title="Continuar partida anterior" onPress={continuar} style={styles.continueBtn} />
        )}
        <Animated.Text style={[styles.tap, breatheStyle]}>Toca para empezar</Animated.Text>
        <Text style={styles.legal}>+18 · Bebe con responsabilidad</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.white,
  },
  noPointer: {
    pointerEvents: 'none',
  },
  haloOuter: {
    position: 'absolute',
    top: -360,
    alignSelf: 'center',
    width: 720,
    height: 720,
    borderRadius: 360,
    backgroundColor: colors.lav50,
  },
  haloInner: {
    position: 'absolute',
    top: -300,
    alignSelf: 'center',
    width: 520,
    height: 520,
    borderRadius: 260,
    backgroundColor: '#F3EEFE',
    opacity: 0.85,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoBlock: {
    alignItems: 'center',
  },
  logoLine: {
    fontFamily: fonts.display,
    fontSize: 90,
    letterSpacing: -5,
    lineHeight: 90 * 0.88,
    includeFontPadding: false,
  },
  underline: {
    width: 54,
    height: 6,
    borderRadius: 3,
    marginTop: 18,
  },
  tagline: {
    color: colors.grayLt,
    marginTop: 14,
  },
  footer: {
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 26,
  },
  continueBtn: {
    alignSelf: 'stretch',
    marginBottom: 8,
  },
  tap: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.purple,
  },
  legal: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    color: colors.grayLt,
  },
});
