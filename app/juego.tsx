// 06 · Juego en curso (base reutilizable) — variante "Foco"
// Por ahora muestra cartas placeholder que demuestran el sistema de
// intensidad visual; las mecánicas reales de cada juego llegan después.

import { LinearGradient } from 'expo-linear-gradient';
import { useKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RulesButton } from '@/components/GameRules';
import { Overline } from '@/components/Overline';
import { PrimaryButton } from '@/components/PrimaryButton';
import { ProgressDots } from '@/components/ProgressDots';
import { SessionMenu, SessionMenuButton } from '@/components/SessionMenu';
import { useSession } from '@/context/SessionContext';
import { getJuego } from '@/data/content';
import { pick } from '@/utils/textoTono';
import { cardIntensity, cardTextSize, colors, fonts, gradientAngle, shadows, type } from '@/theme/theme';

type Nivel = keyof typeof cardIntensity;

interface CartaPlaceholder {
  texto: string;
  nivel: Nivel;
}

function cartasPlaceholder(nombreJuego: string): CartaPlaceholder[] {
  return [
    { texto: `Aquí aparecerá la primera carta de ${nombreJuego} 🚧`, nivel: 'suave' },
    { texto: 'Las cartas suaves se ven así: fondo blanco con borde lavanda', nivel: 'suave' },
    { texto: 'Cuando el reto sube de tono, la carta se tiñe de morado', nivel: 'atrevido' },
    { texto: 'Este sería un reto atrevido. El grupo decide si te libras o no', nivel: 'atrevido' },
    { texto: 'Y los retos físicos se ponen serios: fondo oscuro, texto claro', nivel: 'fisico' },
    { texto: 'Última carta de prueba. Pulsa «Siguiente» para terminar el juego', nivel: 'fisico' },
  ];
}

// La pantalla no se apaga durante la partida. Solo en nativo: en web el
// wake lock del navegador puede no activarse y revienta al desmontar.
function KeepAwake() {
  useKeepAwake();
  return null;
}

export default function JuegoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, sumarTragos } = useSession();

  const juego = session.juegoActual ? getJuego(session.juegoActual) : undefined;
  const nombreJuego = juego ? pick(juego.nombre, juego.nombreChill, session.tono) : 'Escalada';
  const emojiJuego = juego?.emoji ?? '🌡️';

  const cartas = useMemo(() => cartasPlaceholder(nombreJuego), [nombreJuego]);

  const [indice, setIndice] = useState(0);
  const [menuVisible, setMenuVisible] = useState(false);

  const jugadores = session.jugadores.length > 0 ? session.jugadores : ['Jugador 1', 'Jugador 2'];
  const jugadorActual = jugadores[indice % jugadores.length];
  const carta = cartas[indice];
  const estilo = cardIntensity[carta.nivel];
  const esUltima = indice === cartas.length - 1;

  const avanzar = (saltada: boolean) => {
    if (!saltada && (session.modo === 'competicion' || session.modo === 'escalada')) {
      // TODO(juegos): los tragos reales los asignará la mecánica de cada juego
      sumarTragos(indice % jugadores.length, 1);
    }
    if (esUltima) {
      router.replace('/fin-juego');
      return;
    }
    setIndice((i) => i + 1);
  };

  const reiniciarJuego = () => {
    setIndice(0);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
      {Platform.OS !== 'web' && <KeepAwake />}
      {/* Top: progreso + menú de sesión */}
      <View style={styles.topRow}>
        <ProgressDots total={cartas.length} actual={indice + 1} />
        <View style={styles.topBtns}>
          <RulesButton juegoId={session.juegoActual} />
          <SessionMenuButton onPress={() => setMenuVisible(true)} />
        </View>
      </View>

      {/* Jugador en foco */}
      <View style={styles.playerBlock}>
        <Overline color={colors.grayLt}>LE TOCA A</Overline>
        <Text style={styles.playerName} numberOfLines={1} adjustsFontSizeToFit>
          {jugadorActual}
        </Text>
      </View>

      {/* Carta-héroe */}
      <Animated.View key={indice} entering={FadeInDown.duration(320)} style={styles.cardArea}>
        {'gradient' in estilo ? (
          <LinearGradient
            colors={estilo.gradient.colors}
            locations={estilo.gradient.locations}
            start={gradientAngle.start}
            end={gradientAngle.end}
            style={[styles.card, carta.nivel === 'fisico' ? shadows.ink : shadows.purple]}>
            <CartaContenido carta={carta} emoji={emojiJuego} nombreJuego={nombreJuego} />
          </LinearGradient>
        ) : (
          <View style={[styles.card, styles.cardSuave, shadows.purpleSoft]}>
            <CartaContenido carta={carta} emoji={emojiJuego} nombreJuego={nombreJuego} />
          </View>
        )}
      </Animated.View>

      {/* Acciones */}
      <View style={[styles.actions, { paddingBottom: insets.bottom + 14 }]}>
        <PrimaryButton
          title={esUltima ? 'Terminar juego' : 'Siguiente'}
          onPress={() => avanzar(false)}
        />
      </View>

      {/* Menú de sesión */}
      <SessionMenu
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        onReiniciar={reiniciarJuego}
      />
    </View>
  );
}

function CartaContenido({ carta, emoji, nombreJuego }: {
  carta: CartaPlaceholder;
  emoji: string;
  nombreJuego: string;
}) {
  const estilo = cardIntensity[carta.nivel];
  return (
    <View style={styles.cardInner}>
      <View style={styles.cardTopRow}>
        <View style={[styles.chip, { backgroundColor: estilo.chipBg }]}>
          <Text style={[styles.chipText, { color: estilo.chipText }]}>{estilo.label}</Text>
        </View>
        <Text style={[styles.cardJuego, { color: estilo.chipText }]}>{nombreJuego}</Text>
      </View>
      <Text style={styles.watermark}>{emoji}</Text>
      <Text
        style={[
          styles.cardTexto,
          { color: estilo.text, fontSize: cardTextSize(carta.texto), lineHeight: cardTextSize(carta.texto) * 1.16 },
        ]}>
        {carta.texto}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
    paddingHorizontal: 26,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  topBtns: {
    flexDirection: 'row',
    gap: 8,
  },
  playerBlock: {
    marginTop: 8,
    marginBottom: 14,
    gap: 4,
  },
  playerName: {
    ...type.player,
    color: colors.ink,
  },
  cardArea: {
    flex: 1,
  },
  card: {
    flex: 1,
    borderRadius: 32,
    overflow: 'hidden',
  },
  cardSuave: {
    backgroundColor: cardIntensity.suave.bg,
    borderWidth: 1.5,
    borderColor: cardIntensity.suave.border,
  },
  cardInner: {
    flex: 1,
    padding: 26,
    justifyContent: 'space-between',
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 30,
  },
  chipText: {
    ...type.chip,
  },
  cardJuego: {
    fontFamily: fonts.bodyX,
    fontSize: 11,
    letterSpacing: 1,
    opacity: 0.9,
  },
  watermark: {
    position: 'absolute',
    right: -24,
    bottom: -30,
    fontSize: 170,
    opacity: 0.06,
  },
  cardTexto: {
    fontFamily: fonts.display,
    letterSpacing: -0.7,
  },
  actions: {
    paddingTop: 14,
    gap: 12,
  },
});
