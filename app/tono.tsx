// 02b · Tono de la partida — Modo Fiesta (con alcohol) / Modo Chill (sin alcohol).
// Se pregunta en cada partida nueva, entre "participantes" y "modo". No persiste.

import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Overline } from '@/components/Overline';
import { PressableScale } from '@/components/PressableScale';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useSession } from '@/context/SessionContext';
import type { Tono } from '@/data/types';
import { colors, fonts, gradientAngle, gradients, shadows, spacing, type } from '@/theme/theme';

interface TonoInfo {
  id: Tono;
  emoji: string;
  nombre: string;
  descripcion: string;
}

const TONOS: TonoInfo[] = [
  {
    id: 'fiesta',
    emoji: '🍺',
    nombre: 'Modo Fiesta',
    descripcion: 'El clásico. Reparte y acumula chupitos. Gana quien más aguante.',
  },
  {
    id: 'chill',
    emoji: '😌',
    nombre: 'Modo Chill',
    descripcion: 'Sin alcohol, misma diversión. Acumula puntos de penalización. Gana quien menos sume.',
  },
];

export default function TonoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setTono } = useSession();
  // Web: Chill preseleccionado por defecto (política AdSense); el usuario puede
  // cambiar a Fiesta con un toque. Nativo: sin preselección (v1.0).
  const [seleccion, setSeleccion] = useState<Tono | null>(Platform.OS === 'web' ? 'chill' : null);

  const continuar = () => {
    if (!seleccion) return;
    setTono(seleccion);
    router.push('/modo');
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
      <View style={styles.content}>
        <PressableScale onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <Text style={styles.backIcon}>←</Text>
        </PressableScale>

        <Overline>NUEVA PARTIDA</Overline>
        <Text style={styles.title}>¿Cómo va la noche?</Text>
        <Text style={styles.subtitle}>Elegid el tono. Se pregunta en cada partida.</Text>

        <View style={styles.cards}>
          {TONOS.map((t) => {
            const activa = seleccion === t.id;
            const apagada = seleccion !== null && !activa;
            return (
              <PressableScale
                key={t.id}
                onPress={() => setSeleccion(t.id)}
                scaleTo={0.975}
                style={[
                  styles.cardWrap,
                  activa && { transform: [{ scale: 1.02 }] },
                  apagada && { transform: [{ scale: 0.98 }] },
                  activa ? shadows.purple : shadows.card,
                ]}>
                {activa ? (
                  <LinearGradient
                    colors={gradients.purple.colors}
                    locations={gradients.purple.locations}
                    start={gradientAngle.start}
                    end={gradientAngle.end}
                    style={styles.card}>
                    <CardContent info={t} activa />
                  </LinearGradient>
                ) : (
                  <View style={[styles.card, apagada ? styles.cardOff : styles.cardIdle]}>
                    <CardContent info={t} activa={false} />
                  </View>
                )}
              </PressableScale>
            );
          })}
        </View>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
          {seleccion && (
            <Animated.View entering={FadeInDown.duration(280)}>
              <PrimaryButton title="Continuar" variant="ink" onPress={continuar} />
            </Animated.View>
          )}
        </View>
      </View>
    </View>
  );
}

function CardContent({ info, activa }: { info: TonoInfo; activa: boolean }) {
  return (
    <View>
      <View style={styles.cardRow}>
        <View style={[styles.tile, activa ? styles.tileActive : styles.tileIdle]}>
          <Text style={styles.tileEmoji}>{info.emoji}</Text>
        </View>
        <Text style={[styles.cardName, { color: activa ? colors.white : colors.ink }]}>
          {info.nombre}
        </Text>
      </View>
      <Text
        style={[styles.cardDesc, { color: activa ? 'rgba(255,255,255,0.88)' : colors.gray }]}
        numberOfLines={4}>
        {info.descripcion}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.screenHWide,
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
    fontSize: 20,
    lineHeight: 20,
    fontFamily: fonts.bodyBold,
    textAlign: 'center',
    includeFontPadding: false,
  },
  title: {
    ...type.titleL,
    color: colors.ink,
    marginTop: 8,
  },
  subtitle: {
    ...type.body,
    color: colors.gray,
    marginTop: 8,
  },
  cards: {
    flex: 1,
    marginTop: 24,
    gap: 12,
  },
  cardWrap: {
    flex: 1,
    borderRadius: 20,
  },
  card: {
    flex: 1,
    borderRadius: 20,
    padding: 15,
    minHeight: 80,
    justifyContent: 'center',
  },
  cardIdle: {
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  cardOff: {
    backgroundColor: colors.ghost,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  tile: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileIdle: {
    backgroundColor: colors.lav100,
  },
  tileActive: {
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  tileEmoji: {
    fontSize: 26,
  },
  cardName: {
    fontFamily: fonts.display,
    fontSize: 22,
    letterSpacing: -0.6,
  },
  cardDesc: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 9,
  },
  footer: {
    minHeight: 90,
    paddingTop: 14,
    justifyContent: 'flex-end',
  },
});
