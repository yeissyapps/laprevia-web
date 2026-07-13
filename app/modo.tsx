// 03 · Modo de juego — Escalada / Competición / Juego Libre

import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Overline } from '@/components/Overline';
import { PressableScale } from '@/components/PressableScale';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useSession } from '@/context/SessionContext';
import { conTono } from '@/utils/textoTono';
import type { Modo } from '@/data/types';
import { colors, fonts, gradientAngle, gradients, shadows, spacing, type } from '@/theme/theme';

interface ModoInfo {
  id: Modo;
  emoji: string;
  nombre: string;
  descripcion: string;
  badge?: string;
  proximamente?: boolean;
}

const MODOS: ModoInfo[] = [
  {
    id: 'escalada',
    emoji: '🔥',
    nombre: 'Escalada',
    descripcion:
      'La app elige los juegos por ti y sube la intensidad ronda a ronda: empieza suave y acaba picante. Para arrancar la noche sin pensar.',
  },
  {
    id: 'competicion',
    emoji: '🏆',
    nombre: 'Competición',
    descripcion:
      'Encadenad varios juegos con marcador de tragos. Al final, podio, campeón de la noche y muerte súbita si hay empate.',
  },
  {
    id: 'libre',
    emoji: '🎲',
    nombre: 'Juego Libre',
    descripcion:
      'Vosotros elegís el juego del menú y jugáis a vuestro ritmo, sin rondas ni marcador. Perfecto si ya sabéis lo que os gusta.',
  },
];

export default function ModoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setModo } = useSession();
  const [seleccion, setSeleccion] = useState<Modo | null>(null);

  const continuar = () => {
    if (!seleccion) return;
    setModo(seleccion);
    if (seleccion === 'competicion') router.push('/competicion');
    else if (seleccion === 'libre') router.push('/juegos');
    else router.push('/escalada');
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
      <View style={styles.content}>
        <PressableScale onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <Text style={styles.backIcon}>←</Text>
        </PressableScale>

        <Overline>NUEVA PARTIDA</Overline>
        <Text style={styles.title}>Elige cómo jugar</Text>
        <Text style={styles.subtitle}>Tres formas de empezar la noche. Elegid la vuestra.</Text>

        <View style={styles.cards}>
          {MODOS.map((modo) => {
            const activa = seleccion === modo.id;
            const apagada = (seleccion !== null && !activa) || modo.proximamente;
            return (
              <PressableScale
                key={modo.id}
                onPress={() => !modo.proximamente && setSeleccion(modo.id)}
                disabled={modo.proximamente}
                scaleTo={0.975}
                style={[
                  styles.cardWrap,
                  activa && { transform: [{ scale: 1.02 }] },
                  apagada && { transform: [{ scale: 0.98 }] },
                  modo.proximamente && { opacity: 0.6 },
                  activa ? shadows.purple : shadows.card,
                ]}>
                {activa ? (
                  <LinearGradient
                    colors={gradients.purple.colors}
                    locations={gradients.purple.locations}
                    start={gradientAngle.start}
                    end={gradientAngle.end}
                    style={styles.card}>
                    <CardContent modo={modo} activa />
                  </LinearGradient>
                ) : (
                  <View style={[styles.card, apagada ? styles.cardOff : styles.cardIdle]}>
                    <CardContent modo={modo} activa={false} />
                  </View>
                )}
              </PressableScale>
            );
          })}
        </View>

        {/* Hueco reservado para el CTA: las cards no saltan al seleccionar */}
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

function CardContent({ modo, activa }: { modo: ModoInfo; activa: boolean }) {
  const { session } = useSession();
  return (
    <View>
      <View style={styles.cardRow}>
        <View style={[styles.tile, activa ? styles.tileActive : styles.tileIdle]}>
          <Text style={styles.tileEmoji}>{modo.emoji}</Text>
        </View>
        <View style={styles.nameBlock}>
          <Text style={[styles.cardName, { color: activa ? colors.white : colors.ink }]}>
            {modo.nombre}
          </Text>
          {modo.badge && (
            <View style={[styles.badge, activa ? styles.badgeActive : styles.badgeIdle]}>
              <Text style={[styles.badgeText, { color: activa ? colors.purple : colors.white }]}>
                {modo.badge}
              </Text>
            </View>
          )}
        </View>
      </View>
      <Text
        style={[styles.cardDesc, { color: activa ? 'rgba(255,255,255,0.88)' : colors.gray }]}
        numberOfLines={4}>
        {conTono(modo.descripcion, session.tono)}
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
  nameBlock: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  cardName: {
    fontFamily: fonts.display,
    fontSize: 22,
    letterSpacing: -0.6,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 30,
  },
  badgeIdle: {
    backgroundColor: colors.purple,
  },
  badgeActive: {
    backgroundColor: colors.white,
  },
  badgeText: {
    fontFamily: fonts.bodyX,
    fontSize: 9.5,
    letterSpacing: 0.8,
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
