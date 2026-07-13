// Yo Nunca · Juego — intro animada de mazos + mecánica de cartas por niveles

import { LinearGradient } from 'expo-linear-gradient';
import { useKeepAwake } from 'expo-keep-awake';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RulesButton } from '@/components/GameRules';
import { IntroMazos } from '@/components/IntroMazos';
import { Overline } from '@/components/Overline';
import { PickerJugadores } from '@/components/PickerJugadores';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SessionMenu, SessionMenuButton } from '@/components/SessionMenu';
import { useSession } from '@/context/SessionContext';
import { emoji, pick, verbo } from '@/utils/textoTono';
import {
  NIVELES_YO_NUNCA,
  ORDEN_NIVELES,
  mazoBarajado,
  type NivelYoNunca,
} from '@/data/yoNunca';
import { cardTextSize, colors, fonts, gradientAngle, shadows, type } from '@/theme/theme';

// La pantalla no se apaga durante la partida (solo nativo; en web revienta al desmontar)
function KeepAwake() {
  useKeepAwake();
  return null;
}

// ——— Pantalla principal ————————————————————————————————————————

export default function YoNuncaJugarScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const params = useLocalSearchParams<{ niveles?: string; duracion?: string }>();

  const niveles = useMemo<NivelYoNunca[]>(() => {
    const pedidos = (params.niveles ?? 'suave').split(',') as NivelYoNunca[];
    const validos = pedidos.filter((n) => ORDEN_NIVELES.includes(n));
    return validos.length > 0 ? validos : ['suave'];
  }, [params.niveles]);

  // Duración elegida en Juego Libre (30/60/100); en su defecto, el máximo (100).
  const duracionLibre = useMemo(() => {
    const n = params.duracion ? parseInt(params.duracion, 10) : NaN;
    return Number.isFinite(n) && n > 0 ? n : 100;
  }, [params.duracion]);

  const [nonce, setNonce] = useState(0); // re-barajar al reiniciar
  // En Competición/Escalada se juegan como máximo 40 cartas (sea un nivel o varios).
  // En Juego Libre se recorta el mazo barajado a la duración elegida (selección aleatoria).
  const mazo = useMemo(() => {
    const m = mazoBarajado(niveles);
    return (session.modo === 'competicion' || session.modo === 'escalada')
      ? m.slice(0, 40)
      : m.slice(0, duracionLibre);
  }, [niveles, nonce, session.modo, duracionLibre]);

  const [fase, setFase] = useState<'intro' | 'jugando'>('intro');
  const [indice, setIndice] = useState(0);
  const [menuVisible, setMenuVisible] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);

  const jugadores = session.jugadores.length > 0 ? session.jugadores : ['Jugador 1', 'Jugador 2'];
  const enCompeticion = session.modo === 'competicion' || session.modo === 'escalada';
  const jugadorActual = jugadores[indice % jugadores.length];
  const carta = mazo[indice];
  const info = NIVELES_YO_NUNCA[carta.nivel];
  const esUltima = indice === mazo.length - 1;
  const restantes = mazo.length - indice - 1;

  const avanzar = () => {
    if (esUltima) {
      router.replace({ pathname: '/fin-juego', params: { niveles: niveles.join(',') } });
      return;
    }
    setIndice((i) => i + 1);
  };

  // En Competición, capturamos quién ha bebido antes de pasar a la siguiente.
  const siguiente = () => {
    if (enCompeticion) {
      setPickerVisible(true);
      return;
    }
    avanzar();
  };

  const reiniciarJuego = () => {
    setNonce((n) => n + 1);
    setIndice(0);
  };

  if (fase === 'intro') {
    return (
      <IntroMazos
        mazos={niveles.map((n) => ({ color: NIVELES_YO_NUNCA[n].dot, emoji: NIVELES_YO_NUNCA[n].emoji }))}
        nombreJuego="Yo Nunca"
        onDone={() => setFase('jugando')}
      />
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
      {Platform.OS !== 'web' && <KeepAwake />}

      {/* Top: progreso lineal + contador + menú */}
      <View style={styles.topRow}>
        <View style={styles.progresoWrap}>
          <View style={styles.progresoTrack}>
            <View style={[styles.progresoFill, { width: `${((indice + 1) / mazo.length) * 100}%` }]} />
          </View>
          <Text style={styles.contador}>
            {indice + 1}/{mazo.length}
          </Text>
        </View>
        <RulesButton juegoId="yo-nunca" />
        <SessionMenuButton onPress={() => setMenuVisible(true)} />
      </View>

      {restantes <= 5 && restantes > 0 && (
        <Animated.Text entering={FadeIn.duration(250)} style={styles.aviso}>
          🔥 ¡Quedan {restantes} cartas!
        </Animated.Text>
      )}

      {/* Jugador que lee */}
      <View style={styles.playerBlock}>
        <Overline color={colors.grayLt}>LE TOCA LEER A</Overline>
        <Text style={styles.playerName} numberOfLines={1} adjustsFontSizeToFit>
          {jugadorActual}
        </Text>
      </View>

      {/* Carta */}
      <Animated.View
        key={`${nonce}-${indice}`}
        entering={indice === 0 ? flipIn : FadeInDown.duration(320)}
        style={styles.cardArea}>
        {info.gradient ? (
          <LinearGradient
            colors={info.gradient.colors}
            locations={info.gradient.locations}
            start={gradientAngle.start}
            end={gradientAngle.end}
            style={[
              styles.card,
              carta.nivel === 'limite' ? shadows.ink : shadows.purple,
              info.border ? { borderWidth: 1.5, borderColor: info.border } : null,
            ]}>
            <CartaContenido carta={carta} />
          </LinearGradient>
        ) : (
          <View
            style={[
              styles.card,
              shadows.purpleSoft,
              { backgroundColor: info.bg, borderWidth: 1.5, borderColor: info.border },
            ]}>
            <CartaContenido carta={carta} />
          </View>
        )}
      </Animated.View>

      {/* Acciones */}
      <View style={[styles.actions, { paddingBottom: insets.bottom + 14 }]}>
        <PrimaryButton
          title={esUltima ? 'Terminar juego' : 'Siguiente'}
          onPress={siguiente}
        />
      </View>

      <SessionMenu
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        onReiniciar={reiniciarJuego}
      />

      <PickerJugadores
        visible={pickerVisible}
        modo="multiple"
        titulo={session.tono === 'chill' ? '¿Quién suma?' : '¿Quién ha bebido?'}
        subtitulo={pick(carta.texto, carta.textoChill, session.tono)}
        cantidad={1}
        onDone={() => {
          setPickerVisible(false);
          avanzar();
        }}
      />
    </View>
  );
}

// Volteo de entrada de la primera carta (continúa el flip de la intro)
function flipIn() {
  'worklet';
  return {
    initialValues: { transform: [{ scaleX: 0 }] },
    animations: { transform: [{ scaleX: withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) }) }] },
  };
}

function CartaContenido({ carta }: { carta: { texto: string; textoChill?: string; nivel: NivelYoNunca } }) {
  const { session } = useSession();
  const info = NIVELES_YO_NUNCA[carta.nivel];
  const fontSize = cardTextSize(carta.texto);
  return (
    <View style={styles.cardInner}>
      <View style={styles.cardTopRow}>
        <View style={[styles.chip, { backgroundColor: info.chipBg }]}>
          <Text style={[styles.chipText, { color: info.chipText }]}>{info.nombre.toUpperCase()}</Text>
        </View>
      </View>
      <Text style={styles.watermark}>🙊</Text>
      <View style={styles.cardTextoWrap}>
        <Text style={[styles.cardTexto, { color: info.text, fontSize, lineHeight: fontSize * 1.16 }]}>
          {pick(carta.texto, carta.textoChill, session.tono)}
        </Text>
      </View>
      <Text style={[styles.cardRegla, { color: info.chipText }]}>El que lo haya hecho  →  {verbo(session.tono, 'bebe')} {emoji(session.tono)}</Text>
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
    gap: 8,
    marginBottom: 6,
  },
  progresoWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  progresoTrack: {
    flex: 1,
    height: 6,
    borderRadius: 4,
    backgroundColor: colors.lav100,
    overflow: 'hidden',
  },
  progresoFill: {
    height: 6,
    borderRadius: 4,
    backgroundColor: colors.purple,
  },
  contador: {
    fontFamily: fonts.bodyX,
    fontSize: 11,
    color: colors.grayLt,
    minWidth: 50,
    textAlign: 'right',
  },
  aviso: {
    fontFamily: fonts.bodyX,
    fontSize: 12,
    color: colors.purple,
    marginTop: 4,
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
  cardInner: {
    flex: 1,
    padding: 26,
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
  nivelDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  watermark: {
    position: 'absolute',
    right: -24,
    bottom: -30,
    fontSize: 170,
    opacity: 0.06,
  },
  cardTextoWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 14,
  },
  cardTexto: {
    fontFamily: fonts.display,
    letterSpacing: -0.7,
  },
  cardRegla: {
    fontFamily: fonts.bodyX,
    fontSize: 12.5,
    letterSpacing: 0.3,
    opacity: 0.9,
  },
  actions: {
    paddingTop: 14,
    gap: 12,
  },
});
