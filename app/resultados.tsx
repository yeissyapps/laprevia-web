// 09 · Resultados finales de Competición — full-bleed morado, podio y confeti

import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Confetti } from '@/components/Confetti';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SecondaryButton } from '@/components/SecondaryButton';
import { StoreCTA } from '@/components/StoreCTA';
import { useSession } from '@/context/SessionContext';
import { rutaJuego } from '@/data/rutas';
import { emoji } from '@/utils/textoTono';
import { colors, fonts, gradientAngle, gradients, type } from '@/theme/theme';

const MEDALLAS = ['🥇', '🥈', '🥉'];

export default function ResultadosScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, repetirCompeticion, reiniciarSesion } = useSession();

  const comp = session.competicion;
  // Chill: gana quien MENOS suma (orden ascendente). Fiesta: comportamiento v1.0
  // exacto (descendente, gana el máximo).
  const chill = session.tono === 'chill';

  const ranking = useMemo(
    () =>
      session.jugadores
        .map((nombre, i) => ({ nombre, tragos: comp?.tragos[i] ?? 0 }))
        .sort((a, b) => (chill ? a.tragos - b.tragos : b.tragos - a.tragos)),
    [session.jugadores, comp, chill]
  );

  const hayEmpate = ranking.length >= 2 && ranking[0].tragos === ranking[1].tragos;

  // lp-pop del emoji
  const pop = useSharedValue(0.82);
  useEffect(() => {
    pop.value = withSpring(1, { damping: 9, stiffness: 160, mass: 0.7 });
  }, [pop]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  const repetir = () => {
    repetirCompeticion();
    router.replace(rutaJuego(comp?.juegos[0]));
  };

  const nuevaPartida = () => {
    // mismos jugadores, vuelta a elegir modo
    router.replace('/modo');
  };

  const menuPrincipal = () => {
    reiniciarSesion();
    router.replace('/');
  };

  return (
    <LinearGradient
      colors={gradients.finale.colors}
      locations={gradients.finale.locations}
      start={gradientAngle.start}
      end={gradientAngle.end}
      style={styles.screen}>
      <StatusBar style="light" />
      <Confetti />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}>
        <Animated.Text style={[styles.emoji, popStyle]}>🎉</Animated.Text>
        <Text style={styles.title}>¡Fin de la partida!</Text>
        <Text style={styles.subtitle}>
          {session.modo === 'escalada' ? 'Escalada' : 'Competición'} · {comp?.numRondas ?? 0} juegos · {session.jugadores.length} jugadores
        </Text>

        {/* Podio */}
        <View style={styles.podio}>
          {ranking.map((fila, i) => (
            <Animated.View
              key={fila.nombre + i}
              entering={FadeInDown.delay(200 + i * 120).duration(340)}
              style={[styles.filaBase, i === 0 ? styles.filaGanador : styles.fila]}>
              <Text style={styles.medalla}>{MEDALLAS[i] ?? `${i + 1}`}</Text>
              <View style={styles.filaTexts}>
                <Text style={[styles.filaNombre, i === 0 && { color: colors.purple }]}>
                  {fila.nombre}
                </Text>
                {i === 0 && <Text style={styles.campeon}>Campeón de la noche</Text>}
              </View>
              <Text style={[styles.filaTragos, i === 0 && { color: colors.purpleDeep }]}>
                {emoji(session.tono)} {fila.tragos}
              </Text>
            </Animated.View>
          ))}
        </View>

        {hayEmpate && (
          <Animated.View entering={FadeInDown.delay(600).duration(300)} style={styles.empate}>
            <Text style={styles.empateText}>¡Empate en cabeza!</Text>
            <PrimaryButton
              title="⚔️  Muerte súbita"
              variant="white"
              onPress={() => router.push('/muerte-subita')}
            />
          </Animated.View>
        )}

        <View style={styles.spacer} />

        {/* CTA de descarga (solo web; no-op en nativo) */}
        <StoreCTA variant="card" />

        <View style={styles.botones}>
          <PrimaryButton title="Repetir partida  🔁" variant="white" onPress={repetir} />
          <SecondaryButton title="Nueva partida (mismos jugadores)" variant="onColor" onPress={nuevaPartida} />
          <SecondaryButton title="Menú principal" variant="onColor" onPress={menuPrincipal} />
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 28,
    alignItems: 'center',
  },
  emoji: {
    fontSize: 54,
  },
  title: {
    ...type.titleL,
    color: colors.white,
    marginTop: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: 'rgba(255,255,255,0.78)',
    marginTop: 8,
  },
  podio: {
    alignSelf: 'stretch',
    marginTop: 26,
    gap: 10,
  },
  filaBase: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  filaGanador: {
    backgroundColor: colors.white,
  },
  fila: {
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  medalla: {
    fontSize: 24,
    color: colors.white,
    fontFamily: fonts.display,
    minWidth: 30,
    textAlign: 'center',
  },
  filaTexts: {
    flex: 1,
  },
  filaNombre: {
    fontFamily: fonts.display,
    fontSize: 18,
    letterSpacing: -0.4,
    color: colors.white,
  },
  campeon: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    color: colors.gray,
    marginTop: 1,
  },
  filaTragos: {
    fontFamily: fonts.bodyX,
    fontSize: 15,
    color: colors.white,
  },
  empate: {
    alignSelf: 'stretch',
    marginTop: 18,
    gap: 10,
    alignItems: 'center',
  },
  empateText: {
    fontFamily: fonts.bodyX,
    fontSize: 13,
    letterSpacing: 1,
    color: colors.white,
  },
  spacer: {
    flex: 1,
    minHeight: 26,
  },
  botones: {
    alignSelf: 'stretch',
    gap: 9,
  },
});
