// Mayor o Menor — baraja de 52 cartas, predicción mayor/menor y tragos según resultado

import { LinearGradient } from 'expo-linear-gradient';
import { useKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RulesButton } from '@/components/GameRules';
import { Overline } from '@/components/Overline';
import { CardBack, PokerCard } from '@/components/PokerCard';
import { PressableScale } from '@/components/PressableScale';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SessionMenu, SessionMenuButton } from '@/components/SessionMenu';
import { useSession } from '@/context/SessionContext';
import {
  RESULTADOS,
  mazoPoker,
  resolver,
  type CartaPoker,
  type Eleccion,
  type Resultado,
} from '@/data/mayorMenor';
import { conTono } from '@/utils/textoTono';
import { colors, fonts, gradientAngle, gradients, type } from '@/theme/theme';

function KeepAwake() {
  useKeepAwake();
  return null;
}

export default function MayorMenorScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, sumarTragos } = useSession();

  const jugadores = session.jugadores.length > 0 ? session.jugadores : ['Jugador 1', 'Jugador 2'];

  const [nonce, setNonce] = useState(0);
  const mazo = useMemo(() => mazoPoker(), [nonce]);

  // idx = posición de la carta de referencia; cada turno revela idx+1
  const [idx, setIdx] = useState(0);
  const [turno, setTurno] = useState(0);
  const [revelada, setRevelada] = useState<CartaPoker | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [dorso, setDorso] = useState(true); // volteo inicial de la primera carta
  const [menuVisible, setMenuVisible] = useState(false);
  const ocupado = useRef(false); // evita dobles taps durante el flip

  const jugadorIdx = turno % jugadores.length;
  const referencia = mazo[idx];
  const mostrada = revelada ?? referencia;
  const r = resultado ? RESULTADOS[resultado] : null;
  const jugadas = idx; // nº de cartas adivinadas hasta ahora
  const totalJugadas = mazo.length - 1; // 51

  // Flip: gira a 90°, se cambia el contenido y vuelve a 0.
  const flip = useSharedValue(0);
  const flipStyle = useAnimatedStyle(() => ({
    // Flip 2D con scaleX (no rotateY): en iOS el rotateY crea una capa de
    // transformación 3D que corrompía el render (media pantalla en blanco). scaleX
    // es afín 2D: la carta se comprime a una línea a 90° (cos=0) y vuelve. Idéntico
    // en Android/iOS. `flip` sigue yendo 0→90→0, solo cambia cómo se proyecta.
    transform: [{ scaleX: Math.cos((flip.value * Math.PI) / 180) }],
  }));

  // Libera el lock de doble-tap. Debe ser una función del contexto JS (React):
  // pasar un closure creado DENTRO del worklet a runOnJS crashea en iOS.
  const liberarFlip = () => { ocupado.current = false; };

  const voltear = (alMedio: () => void) => {
    if (ocupado.current) return;
    ocupado.current = true;
    // Dos tramos encadenados con withSequence: a 90° (canto, invisible) se cambia
    // el contenido; la vuelta a 0° revela la nueva cara. Cada tramo tiene su
    // callback worklet que solo invoca funciones JS vía runOnJS.
    flip.value = withSequence(
      withTiming(90, { duration: 220, easing: Easing.in(Easing.quad) }, (finished) => {
        if (finished) runOnJS(alMedio)();
      }),
      withTiming(0, { duration: 220, easing: Easing.out(Easing.quad) }, (finished) => {
        if (finished) runOnJS(liberarFlip)();
      })
    );
  };

  // Volteo inicial del dorso a la carta de referencia
  useEffect(() => {
    if (!dorso) return;
    const t = setTimeout(() => voltear(() => setDorso(false)), 650);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dorso, nonce]);

  const elegir = (eleccion: Eleccion) => {
    const siguiente = mazo[idx + 1];
    if (!siguiente || resultado) return;
    const res = resolver(referencia, siguiente, eleccion);
    voltear(() => {
      setRevelada(siguiente);
      setResultado(res);
    });
    // Tragos según resultado (solo cuenta en competición)
    if (res === 'fallo') {
      sumarTragos(jugadorIdx, 1);
    } else if (res === 'empate') {
      jugadores.forEach((_, i) => sumarTragos(i, 1));
    }
  };

  const siguiente = () => {
    if (!resultado) return;
    if (idx + 1 >= mazo.length - 1) {
      router.replace('/fin-juego');
      return;
    }
    setIdx((i) => i + 1);
    setTurno((t) => t + 1);
    setRevelada(null);
    setResultado(null);
  };

  const reiniciarJuego = () => {
    setNonce((n) => n + 1);
    setIdx(0);
    setTurno(0);
    setRevelada(null);
    setResultado(null);
    setDorso(true);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
      {Platform.OS !== 'web' && <KeepAwake />}

      {/* Top: progreso + reglas + menú */}
      <View style={styles.topRow}>
        <View style={styles.progresoWrap}>
          <View style={styles.progresoTrack}>
            <View style={[styles.progresoFill, { width: `${(jugadas / totalJugadas) * 100}%` }]} />
          </View>
          <Text style={styles.contador}>
            {jugadas}/{totalJugadas}
          </Text>
        </View>
        <RulesButton juegoId="mayor-menor" />
        <SessionMenuButton onPress={() => setMenuVisible(true)} />
      </View>

      {/* Jugador en turno */}
      <View style={styles.playerBlock}>
        <Overline color={colors.grayLt}>LE TOCA A</Overline>
        <Text style={styles.playerName} numberOfLines={1} adjustsFontSizeToFit>
          {jugadores[jugadorIdx]}
        </Text>
      </View>

      {/* Pista */}
      <View style={styles.pista}>
        {dorso ? (
          <Text style={styles.pistaTexto}>Volteando la primera carta…</Text>
        ) : !resultado ? (
          <Text style={styles.pistaTexto}>
            ¿La siguiente carta será <Text style={styles.pistaDestacado}>mayor</Text> o{' '}
            <Text style={styles.pistaDestacado}>menor</Text>?
          </Text>
        ) : (
          <Text style={styles.pistaAnterior}>
            Carta anterior:{' '}
            <Text style={{ color: colors.purple }}>
              {referencia.etiqueta} {referencia.palo}
            </Text>
          </Text>
        )}
      </View>

      {/* Carta */}
      <View style={styles.cardArea}>
        <Animated.View style={flipStyle}>
          {dorso ? (
            <CardBack titulo1="Mayor" titulo2="o Menor" />
          ) : (
            <PokerCard
              etiqueta={mostrada.etiqueta}
              palo={mostrada.palo}
              borde={r?.borde}
              badge={r?.badge}
              badgeBg={r?.badgeBg}
            />
          )}
        </Animated.View>

        {r && (
          <Animated.View entering={FadeIn.duration(200)} style={styles.resultadoBlock}>
            <View style={[styles.resultadoPill, { backgroundColor: r.msgBg }]}>
              <Text style={[styles.resultadoMsg, { color: r.msgColor }]}>{conTono(r.msg, session.tono)}</Text>
            </View>
            <Text style={styles.resultadoSub}>{conTono(r.sub, session.tono)}</Text>
          </Animated.View>
        )}
      </View>

      {/* Acciones */}
      <View style={[styles.actions, { paddingBottom: insets.bottom + 14 }]}>
        {!resultado ? (
          <View style={styles.guessRow}>
            <PressableScale
              onPress={() => elegir('mayor')}
              disabled={dorso}
              style={[styles.guessBtn, dorso && { opacity: 0.5 }]}>
              <LinearGradient
                colors={gradients.purple.colors}
                locations={gradients.purple.locations}
                start={gradientAngle.start}
                end={gradientAngle.end}
                style={styles.guessInner}>
                <Text style={[styles.guessLabel, { color: colors.white }]}>MAYOR</Text>
              </LinearGradient>
            </PressableScale>
            <PressableScale
              onPress={() => elegir('menor')}
              disabled={dorso}
              style={[styles.guessBtn, styles.guessMenor, dorso && { opacity: 0.5 }]}>
              <Text style={[styles.guessLabel, { color: colors.purple }]}>MENOR</Text>
            </PressableScale>
          </View>
        ) : (
          <PrimaryButton title="Siguiente" onPress={siguiente} />
        )}
      </View>

      <SessionMenu visible={menuVisible} onClose={() => setMenuVisible(false)} onReiniciar={reiniciarJuego} />
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
    minWidth: 44,
    textAlign: 'right',
  },
  playerBlock: {
    marginTop: 8,
    gap: 4,
  },
  playerName: {
    fontFamily: fonts.display,
    fontSize: 44,
    letterSpacing: -1.5,
    color: colors.ink,
  },
  pista: {
    alignItems: 'center',
    paddingTop: 8,
    minHeight: 30,
  },
  pistaTexto: {
    ...type.body,
    color: colors.gray,
  },
  pistaDestacado: {
    color: colors.purple,
    fontFamily: fonts.bodyX,
  },
  pistaAnterior: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.grayLt,
  },
  cardArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  resultadoBlock: {
    alignItems: 'center',
    gap: 4,
  },
  resultadoPill: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 30,
  },
  resultadoMsg: {
    fontFamily: fonts.display,
    fontSize: 19,
    letterSpacing: -0.4,
  },
  resultadoSub: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: colors.grayLt,
  },
  actions: {
    paddingTop: 8,
  },
  guessRow: {
    flexDirection: 'row',
    gap: 12,
  },
  guessBtn: {
    flex: 1,
    height: 76,
    borderRadius: 20,
  },
  guessInner: {
    flex: 1,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guessMenor: {
    borderWidth: 2,
    borderColor: '#E0D8F5',
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guessLabel: {
    fontFamily: fonts.display,
    fontSize: 22,
    letterSpacing: -0.3,
  },
});
