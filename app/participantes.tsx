// 02 · Participantes — lista dinámica de jugadores (2–10).
// Cabecera compacta + lista de nombres + "Añadir jugador" al final y "×" por fila.
// Añadir/quitar funciona con el teclado abierto (el botón está bajo los campos),
// sin saltos. El campo enfocado se lleva por encima del teclado (adjustResize).

import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeOut, Layout } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Overline } from '@/components/Overline';
import { PressableScale } from '@/components/PressableScale';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useSession } from '@/context/SessionContext';
import { colors, fonts, gradientAngle, gradients, spacing } from '@/theme/theme';

const MIN_JUGADORES = 2;
const MAX_JUGADORES = 10;

export default function ParticipantesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { empezarPartida } = useSession();

  const [nombres, setNombres] = useState<string[]>(['', '', '', '']);
  const [tecladoVisible, setTecladoVisible] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const inputRefs = useRef<(TextInput | null)[]>([]);
  const focusedIdxRef = useRef(-1);
  const rowY = useRef<number[]>([]);

  const scrollToIdx = (idx: number) => {
    const y = rowY.current[idx];
    if (idx < 0 || y == null) return;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 16), animated: true });
  };

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s = Keyboard.addListener(showEvt, () => {
      setTecladoVisible(true);
      const delay = Platform.OS === 'android' ? 120 : 0;
      setTimeout(() => scrollToIdx(focusedIdxRef.current), delay);
    });
    const h = Keyboard.addListener(hideEvt, () => setTecladoVisible(false));
    return () => {
      s.remove();
      h.remove();
    };
  }, []);

  const cambiarNombre = (index: number, valor: string) => {
    setNombres((prev) => prev.map((n, i) => (i === index ? valor : n)));
  };

  const anadirJugador = () => {
    setNombres((prev) => {
      if (prev.length >= MAX_JUGADORES) return prev;
      const next = [...prev, ''];
      // Enfoca el nuevo campo y baja el scroll para verlo (sin cerrar el teclado).
      setTimeout(() => {
        inputRefs.current[next.length - 1]?.focus();
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 80);
      return next;
    });
  };

  const quitarJugador = (index: number) => {
    setNombres((prev) => (prev.length <= MIN_JUGADORES ? prev : prev.filter((_, i) => i !== index)));
  };

  const empezar = () => {
    const jugadores = nombres.map((n, i) => {
      const nombre = n.trim();
      return nombre.length > 0 ? nombre : `Jugador ${i + 1}`;
    });
    empezarPartida(jugadores);
    router.push('/tono');
  };

  return (
    <View style={styles.screen}>
      {/* Cabecera compacta fija */}
      <LinearGradient
        colors={gradients.purple.colors}
        locations={gradients.purple.locations}
        start={gradientAngle.start}
        end={gradientAngle.end}
        style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <PressableScale onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <Text style={styles.backIcon}>←</Text>
        </PressableScale>
        <Overline color="rgba(255,255,255,0.75)">NUEVA PARTIDA</Overline>
        <Text style={styles.title}>¿Quién juega?</Text>
        <Text style={styles.subtitulo}>{nombres.length} jugadores · puedes añadir o quitar</Text>
      </LinearGradient>

      <ScrollView
        ref={scrollRef}
        style={styles.body}
        contentContainerStyle={[styles.bodyContent, { paddingBottom: tecladoVisible ? 280 : insets.bottom + 16 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}>
        {nombres.map((nombre, i) => (
          <Animated.View
            key={i}
            entering={FadeIn.duration(180)}
            exiting={FadeOut.duration(140)}
            layout={Layout.springify().damping(18)}
            style={styles.inputRow}
            onLayout={(e) => {
              rowY.current[i] = e.nativeEvent.layout.y;
            }}>
            <LinearGradient
              colors={gradients.purple.colors}
              locations={gradients.purple.locations}
              start={gradientAngle.start}
              end={gradientAngle.end}
              style={styles.avatar}>
              <Text style={styles.avatarText}>{i + 1}</Text>
            </LinearGradient>
            <TextInput
              ref={(r) => {
                inputRefs.current[i] = r;
              }}
              value={nombre}
              onChangeText={(v) => cambiarNombre(i, v)}
              placeholder={`Jugador ${i + 1}`}
              placeholderTextColor={colors.grayLt}
              style={styles.input}
              maxLength={16}
              autoCorrect={false}
              returnKeyType="next"
              onFocus={() => {
                focusedIdxRef.current = i;
                if (tecladoVisible) scrollToIdx(i);
              }}
            />
            {nombres.length > MIN_JUGADORES && (
              <PressableScale onPress={() => quitarJugador(i)} style={styles.removeBtn} hitSlop={8}>
                <Text style={styles.removeIcon}>×</Text>
              </PressableScale>
            )}
          </Animated.View>
        ))}

        {nombres.length < MAX_JUGADORES && (
          <Animated.View layout={Layout.springify().damping(18)}>
            <PressableScale onPress={anadirJugador} style={styles.addRow}>
              <Text style={styles.addRowText}>+ Añadir jugador</Text>
            </PressableScale>
          </Animated.View>
        )}
      </ScrollView>

      {!tecladoVisible && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
          <PrimaryButton title="¡Empezar!" onPress={empezar} />
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
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: spacing.screenH,
    paddingTop: 18,
    gap: spacing.list,
  },
  header: {
    paddingHorizontal: spacing.screenH,
    paddingBottom: 22,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    alignItems: 'center',
  },
  backBtn: {
    alignSelf: 'flex-start',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  backIcon: {
    color: colors.white,
    fontSize: 20,
    lineHeight: 20,
    fontFamily: fonts.bodyBold,
    textAlign: 'center',
    includeFontPadding: false,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 32,
    letterSpacing: -1.2,
    color: colors.white,
    marginTop: 6,
  },
  subtitulo: {
    fontFamily: fonts.bodyBold,
    fontSize: 12.5,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 6,
  },
  footer: {
    paddingHorizontal: spacing.screenH,
    paddingTop: 12,
    backgroundColor: colors.surface,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.white,
    fontFamily: fonts.bodyX,
    fontSize: 13,
  },
  input: {
    flex: 1,
    height: 56,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    fontFamily: fonts.bodySemi,
    fontSize: 16,
    color: colors.ink,
  },
  removeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.ghost,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeIcon: {
    fontFamily: fonts.bodyBold,
    fontSize: 20,
    lineHeight: 22,
    color: colors.grayLt,
  },
  addRow: {
    height: 52,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.purple,
    borderStyle: 'dashed',
    backgroundColor: colors.lav50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addRowText: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.purple,
  },
});
