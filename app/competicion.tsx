// 05 · Configuración de Competición — rondas (4/6/8) + selección de juegos

import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Overline } from '@/components/Overline';
import { PressableScale } from '@/components/PressableScale';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useSession } from '@/context/SessionContext';
import { pick } from '@/utils/textoTono';
import { juegos } from '@/data/content';
import { rutaJuego } from '@/data/rutas';
import { colors, fonts, gradientAngle, gradients, radius, shadows, type } from '@/theme/theme';

const OPCIONES_RONDAS = [
  { num: 4, tiempo: '~20 min' },
  { num: 6, tiempo: '~35 min' },
  { num: 8, tiempo: '~50 min' },
];

export default function CompeticionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, configurarCompeticion } = useSession();

  const [rondas, setRondas] = useState<number | null>(null);
  const [seleccion, setSeleccion] = useState<string[]>([]);

  const nJugadores = Math.max(session.jugadores.length, 2);
  const disponibles = juegos.filter((j) => j.minJugadores <= nJugadores);
  const faltan = rondas ? rondas - seleccion.length : 0;
  const completo = rondas !== null && faltan === 0;

  const elegirRondas = (num: number) => {
    setRondas(num);
    setSeleccion((sel) => sel.slice(0, num));
  };

  const toggleJuego = (id: string) => {
    setSeleccion((sel) => {
      if (sel.includes(id)) return sel.filter((s) => s !== id);
      if (rondas !== null && sel.length >= rondas) return sel; // máximo alcanzado
      return [...sel, id];
    });
  };

  const empezar = () => {
    if (!rondas || !completo) return;
    configurarCompeticion(rondas, seleccion);
    router.push(rutaJuego(seleccion[0]));
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 140 }]}
        showsVerticalScrollIndicator={false}>
        <PressableScale onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <Text style={styles.backIcon}>←</Text>
        </PressableScale>

        <Overline>MODO COMPETICIÓN</Overline>
        <Text style={styles.title}>¿Cuántos juegos?</Text>

        {/* Bloque 1: rondas */}
        <View style={styles.rondas}>
          {OPCIONES_RONDAS.map((op) => {
            const activo = rondas === op.num;
            return (
              <PressableScale
                key={op.num}
                onPress={() => elegirRondas(op.num)}
                style={[styles.rondaWrap, activo && styles.rondaWrapActiva, activo ? shadows.purpleSoft : shadows.card]}>
                {activo ? (
                  <LinearGradient
                    colors={gradients.purple.colors}
                    locations={gradients.purple.locations}
                    start={gradientAngle.start}
                    end={gradientAngle.end}
                    style={styles.ronda}>
                    <Text style={[styles.rondaNum, { color: colors.white }]}>{op.num}</Text>
                    <Text style={[styles.rondaTiempo, { color: 'rgba(255,255,255,0.8)' }]}>
                      {op.tiempo}
                    </Text>
                  </LinearGradient>
                ) : (
                  <View style={[styles.ronda, styles.rondaIdle]}>
                    <Text style={[styles.rondaNum, { color: colors.ink }]}>{op.num}</Text>
                    <Text style={[styles.rondaTiempo, { color: colors.grayLt }]}>{op.tiempo}</Text>
                  </View>
                )}
              </PressableScale>
            );
          })}
        </View>

        {/* Bloque 2: juegos */}
        {rondas !== null && (
          <Animated.View entering={FadeInDown.duration(280)}>
            <View style={styles.juegosHeader}>
              <Text style={styles.juegosTitle}>Elige los juegos</Text>
              <Text style={[styles.contador, completo && { color: colors.green }]}>
                {seleccion.length}/{rondas}
              </Text>
            </View>

            <View style={styles.lista}>
              {disponibles.map((juego) => {
                const marcado = seleccion.includes(juego.id);
                const tope = !marcado && seleccion.length >= rondas;
                return (
                  <PressableScale
                    key={juego.id}
                    onPress={() => toggleJuego(juego.id)}
                    disabled={tope}
                    style={[
                      styles.card,
                      shadows.card,
                      marcado && styles.cardMarcada,
                      tope && { opacity: 0.4 },
                    ]}>
                    <View style={styles.tile}>
                      <Text style={styles.tileEmoji}>{juego.emoji}</Text>
                    </View>
                    <View style={styles.cardTexts}>
                      <Text style={styles.cardName}>{pick(juego.nombre, juego.nombreChill, session.tono)}</Text>
                      <Text style={styles.cardDesc} numberOfLines={2}>
                        {pick(juego.descripcion, juego.descripcionChill, session.tono)}
                      </Text>
                    </View>
                    {marcado ? (
                      <LinearGradient
                        colors={gradients.purple.colors}
                        locations={gradients.purple.locations}
                        start={gradientAngle.start}
                        end={gradientAngle.end}
                        style={styles.check}>
                        <Text style={styles.checkIcon}>✓</Text>
                      </LinearGradient>
                    ) : (
                      <View style={[styles.check, styles.checkIdle]} />
                    )}
                  </PressableScale>
                );
              })}
            </View>
          </Animated.View>
        )}
      </ScrollView>

      {/* CTA inteligente */}
      {rondas !== null && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
          <PrimaryButton
            title={
              completo
                ? '¡Empezar Competición!'
                : `Selecciona ${faltan} juego${faltan === 1 ? '' : 's'} más`
            }
            onPress={empezar}
            disabled={!completo}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  content: {
    paddingHorizontal: 26,
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
    fontSize: 18,
    fontFamily: fonts.bodyBold,
  },
  title: {
    ...type.titleM,
    fontSize: 32,
    color: colors.ink,
    marginTop: 8,
    marginBottom: 18,
  },
  rondas: {
    flexDirection: 'row',
    gap: 10,
  },
  rondaWrap: {
    flex: 1,
    borderRadius: radius.round,
  },
  rondaWrapActiva: {
    transform: [{ scale: 1.04 }],
  },
  ronda: {
    borderRadius: radius.round,
    paddingVertical: 18,
    alignItems: 'center',
  },
  rondaIdle: {
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  rondaNum: {
    fontFamily: fonts.display,
    fontSize: 34,
    letterSpacing: -1,
  },
  rondaTiempo: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    marginTop: 2,
  },
  juegosHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 28,
    marginBottom: 12,
  },
  juegosTitle: {
    fontFamily: fonts.display,
    fontSize: 22,
    letterSpacing: -0.6,
    color: colors.ink,
  },
  contador: {
    fontFamily: fonts.display,
    fontSize: 18,
    color: colors.purple,
  },
  lista: {
    gap: 10,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.gameCard,
    padding: 13,
  },
  cardMarcada: {
    borderColor: colors.purple,
  },
  tile: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: colors.lav100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileEmoji: {
    fontSize: 21,
  },
  cardTexts: {
    flex: 1,
  },
  cardName: {
    fontFamily: fonts.display,
    fontSize: 15.5,
    letterSpacing: -0.3,
    color: colors.ink,
  },
  cardDesc: {
    fontFamily: fonts.body,
    fontSize: 11.5,
    color: colors.gray,
    marginTop: 2,
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkIdle: {
    borderWidth: 2,
    borderColor: colors.border,
  },
  checkIcon: {
    color: colors.white,
    fontSize: 13,
    fontFamily: fonts.bodyX,
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
