// Verdad o Reto · Juego — elección por turno, racha máxima de 3, impuesto de
// la mentira y dos mazos (verdades/retos) por niveles.

import { LinearGradient } from 'expo-linear-gradient';
import { useKeepAwake } from 'expo-keep-awake';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RulesButton } from '@/components/GameRules';
import { IntroMazos } from '@/components/IntroMazos';
import { Overline } from '@/components/Overline';
import { PressableScale } from '@/components/PressableScale';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SecondaryButton } from '@/components/SecondaryButton';
import { SessionMenu, SessionMenuButton } from '@/components/SessionMenu';
import { useSession } from '@/context/SessionContext';
import { emoji, pick, verbo } from '@/utils/textoTono';
import {
  ESTILO_TIPO_VOR,
  MAX_MISMA_ELECCION,
  NIVELES_VOR,
  ORDEN_NIVELES_VOR,
  mazosVoR,
  type CartaVoR,
  type NivelVoR,
  type TipoVoR,
} from '@/data/verdadOReto';
import { cardTextSize, colors, fonts, gradientAngle, shadows, type } from '@/theme/theme';

function KeepAwake() {
  useKeepAwake();
  return null;
}

type Resultado = 'cumplio' | 'bebio' | 'saltada';

interface Completado {
  carta: CartaVoR;
  turno: number;
  resultado: Resultado;
}

export default function VerdadORetoJugarScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, sumarTragos } = useSession();
  const params = useLocalSearchParams<{ niveles?: string; duracion?: string }>();

  const niveles = useMemo<NivelVoR[]>(() => {
    const pedidos = (params.niveles ?? 'suave').split(',') as NivelVoR[];
    const validos = pedidos.filter((n) => ORDEN_NIVELES_VOR.includes(n));
    return validos.length > 0 ? validos : ['suave'];
  }, [params.niveles]);

  // Duración elegida en Juego Libre (30/60/100 de CADA tipo); si no, el máximo (100).
  const duracionLibre = useMemo(() => {
    const n = params.duracion ? parseInt(params.duracion, 10) : NaN;
    return Number.isFinite(n) && n > 0 ? n : 100;
  }, [params.duracion]);

  const jugadores = session.jugadores.length > 0 ? session.jugadores : ['Jugador 1', 'Jugador 2'];

  const [nonce, setNonce] = useState(0);
  // En Competición/Escalada, como máximo 50 verdades y 50 retos (sea un nivel o varios).
  // En Juego Libre se recorta cada mazo barajado a la duración elegida por tipo.
  const mazos = useMemo(() => {
    const m = mazosVoR(niveles);
    if (session.modo === 'competicion' || session.modo === 'escalada') {
      return { verdades: m.verdades.slice(0, 50), retos: m.retos.slice(0, 50) };
    }
    return { verdades: m.verdades.slice(0, duracionLibre), retos: m.retos.slice(0, duracionLibre) };
  }, [niveles, nonce, session.modo, duracionLibre]);

  const [fase, setFase] = useState<'intro' | 'elegir' | 'carta'>('intro');
  const [vIdx, setVIdx] = useState(0);
  const [rIdx, setRIdx] = useState(0);
  const [turno, setTurno] = useState(0);
  const [cartaActual, setCartaActual] = useState<CartaVoR | null>(null);
  const [rachas, setRachas] = useState<Record<number, { tipo: TipoVoR; count: number }>>({});
  const [completados, setCompletados] = useState<Completado[]>([]);
  const [menuVisible, setMenuVisible] = useState(false);

  const jugadorIdx = turno % jugadores.length;
  const quedanVerdades = mazos.verdades.length - vIdx;
  const quedanRetos = mazos.retos.length - rIdx;
  const totalCartas = mazos.verdades.length + mazos.retos.length;
  const consumidas = vIdx + rIdx;

  // Última jugada de cada jugador (para mostrar su elección/resultado en el turno)
  const ultimaPorJugador = useMemo(() => {
    const m: Record<number, Completado> = {};
    completados.forEach((e) => {
      m[e.turno % jugadores.length] = e;
    });
    return m;
  }, [completados, jugadores.length]);

  // Racha: si llevas 3 iguales seguidas, te toca la otra (salvo que no queden)
  const racha = rachas[jugadorIdx];
  const bloqueadoPorRacha = (tipo: TipoVoR) =>
    racha?.tipo === tipo &&
    racha.count >= MAX_MISMA_ELECCION &&
    (tipo === 'verdad' ? quedanRetos > 0 : quedanVerdades > 0);

  const elegir = (tipo: TipoVoR) => {
    const carta = tipo === 'verdad' ? mazos.verdades[vIdx] : mazos.retos[rIdx];
    if (!carta) return;
    if (tipo === 'verdad') setVIdx((i) => i + 1);
    else setRIdx((i) => i + 1);
    setRachas((r) => ({
      ...r,
      [jugadorIdx]: r[jugadorIdx]?.tipo === tipo ? { tipo, count: r[jugadorIdx].count + 1 } : { tipo, count: 1 },
    }));
    setCartaActual(carta);
    setFase('carta');
  };

  // Resolución del turno: bebe = no cumplió el reto / mintió en la verdad.
  // En competición eso suma un trago. saltada = se descarta sin penalización.
  const resolver = (bebe: boolean, saltada = false) => {
    if (!cartaActual) return;
    if (bebe && (session.modo === 'competicion' || session.modo === 'escalada')) {
      sumarTragos(jugadorIdx, 1);
    }
    setCompletados((c) => [
      ...c,
      {
        carta: cartaActual,
        turno,
        resultado: saltada ? 'saltada' : bebe ? 'bebio' : 'cumplio',
      },
    ]);
    setCartaActual(null);
    const quedan = quedanVerdades + quedanRetos;
    if (quedan <= 0) {
      router.replace({ pathname: '/fin-juego', params: { niveles: niveles.join(',') } });
      return;
    }
    setTurno((t) => t + 1);
    setFase('elegir');
  };

  const reiniciarJuego = () => {
    setNonce((n) => n + 1);
    setVIdx(0);
    setRIdx(0);
    setTurno(0);
    setRachas({});
    setCompletados([]);
    setCartaActual(null);
    setFase('elegir');
  };

  if (fase === 'intro') {
    return (
      <IntroMazos
        mazos={niveles.map((n) => ({ color: NIVELES_VOR[n].dot, emoji: NIVELES_VOR[n].emoji }))}
        nombreJuego="Verdad o Reto"
        onDone={() => setFase('elegir')}
      />
    );
  }

  const estiloCarta = cartaActual ? ESTILO_TIPO_VOR[cartaActual.tipo] : null;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
      {Platform.OS !== 'web' && <KeepAwake />}

      {/* Top: progreso + reglas + menú */}
      <View style={styles.topRow}>
        <View style={styles.progresoWrap}>
          <View style={styles.progresoTrack}>
            <View style={[styles.progresoFill, { width: `${(consumidas / totalCartas) * 100}%` }]} />
          </View>
          <Text style={styles.contador}>
            {consumidas}/{totalCartas}
          </Text>
        </View>
        <RulesButton juegoId="verdad-o-reto" />
        <SessionMenuButton onPress={() => setMenuVisible(true)} />
      </View>

      {/* Jugador en turno */}
      <View style={styles.playerBlock}>
        <Overline color={colors.grayLt}>LE TOCA A</Overline>
        <Text style={styles.playerName} numberOfLines={1} adjustsFontSizeToFit>
          {jugadores[jugadorIdx]}
        </Text>
      </View>

      {fase === 'elegir' ? (
        /* ——— Elección Verdad / Reto ——— */
        <>
          {completados.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.ultimasWrap}
              contentContainerStyle={styles.ultimasRow}>
              {jugadores.map((nombre, i) => {
                const u = ultimaPorJugador[i];
                return (
                  <View key={i} style={[styles.ultimaChip, i === jugadorIdx && styles.ultimaChipActivo]}>
                    <Text style={styles.ultimaNombre} numberOfLines={1}>
                      {nombre}
                    </Text>
                    {u ? (
                      <Text style={styles.ultimaDato}>
                        {ESTILO_TIPO_VOR[u.carta.tipo].emoji}{' '}
                        {u.resultado === 'bebio' ? emoji(session.tono) : u.resultado === 'saltada' ? '⤼' : '✓'}
                      </Text>
                    ) : (
                      <Text style={styles.ultimaVacio}>aún no juega</Text>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          )}

          <Animated.View key={`elegir-${turno}`} entering={FadeInDown.duration(280)} style={styles.opciones}>
            {(['verdad', 'reto'] as const).map((tipo) => {
              const info = ESTILO_TIPO_VOR[tipo];
              const sinCartas = tipo === 'verdad' ? quedanVerdades <= 0 : quedanRetos <= 0;
              const porRacha = bloqueadoPorRacha(tipo);
              const deshabilitado = sinCartas || porRacha;
              const quedan = tipo === 'verdad' ? quedanVerdades : quedanRetos;
              return (
                <PressableScale
                  key={tipo}
                  onPress={() => elegir(tipo)}
                  disabled={deshabilitado}
                  style={[styles.opcionWrap, !deshabilitado && shadows.purpleSoft]}>
                  {deshabilitado ? (
                    <View style={[styles.opcion, styles.opcionOff]}>
                      <Text style={styles.opcionEmojiOff}>{info.emoji}</Text>
                      <Text style={[styles.opcionLabel, { color: colors.grayLt }]}>{info.label}</Text>
                      <Text style={styles.opcionMotivo}>
                        {porRacha
                          ? `Esta vez toca ${tipo === 'verdad' ? 'Reto' : 'Verdad'}`
                          : `No quedan ${tipo === 'verdad' ? 'verdades' : 'retos'}`}
                      </Text>
                    </View>
                  ) : (
                    <LinearGradient
                      colors={info.gradient.colors}
                      locations={info.gradient.locations}
                      start={gradientAngle.start}
                      end={gradientAngle.end}
                      style={styles.opcion}>
                      <Text style={styles.opcionEmoji}>{info.emoji}</Text>
                      <Text style={[styles.opcionLabel, { color: colors.white }]}>{info.label}</Text>
                      <Text style={styles.opcionQuedan}>quedan {quedan}</Text>
                    </LinearGradient>
                  )}
                </PressableScale>
              );
            })}
          </Animated.View>

          <View style={{ height: insets.bottom + 14 }} />
        </>
      ) : (
        /* ——— Carta en juego ——— */
        cartaActual &&
        estiloCarta && (
          <>
            <Animated.View
              key={cartaActual.id}
              entering={FadeInDown.duration(300)}
              style={styles.cardArea}>
              <LinearGradient
                colors={estiloCarta.gradient.colors}
                locations={estiloCarta.gradient.locations}
                start={gradientAngle.start}
                end={gradientAngle.end}
                style={[styles.card, shadows.purple]}>
                <View style={styles.cardInner}>
                  <View style={styles.cardTopRow}>
                    <View style={[styles.chip, { backgroundColor: estiloCarta.chipBg }]}>
                      <Text style={[styles.chipText, { color: estiloCarta.chipText }]}>
                        {estiloCarta.emoji} {estiloCarta.label}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.watermark}>{estiloCarta.emoji}</Text>
                  <View style={styles.cardTextoWrap}>
                    <Text
                      style={[
                        styles.cardTexto,
                        {
                          fontSize: cardTextSize(cartaActual.texto),
                          lineHeight: cardTextSize(cartaActual.texto) * 1.16,
                        },
                      ]}>
                      {pick(cartaActual.texto, cartaActual.textoChill, session.tono)}
                    </Text>
                  </View>
                </View>
              </LinearGradient>
            </Animated.View>

            <View style={[styles.actions, { paddingBottom: insets.bottom + 14 }]}>
              <PrimaryButton
                title={cartaActual.tipo === 'verdad' ? '🙌 Dijo la verdad' : '✅ Cumplió el reto'}
                onPress={() => resolver(false)}
              />
              <SecondaryButton
                variant="destructive"
                title={cartaActual.tipo === 'verdad' ? `🤥 Mintió · ${verbo(session.tono, 'bebe')} ${emoji(session.tono)}` : `${emoji(session.tono)} No lo hizo · ${verbo(session.tono, 'bebe')}`}
                onPress={() => resolver(true)}
              />
            </View>
          </>
        )
      )}

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
    minWidth: 50,
    textAlign: 'right',
  },
  playerBlock: {
    marginTop: 8,
    marginBottom: 14,
    gap: 4,
  },
  // tira de últimas elecciones por jugador
  ultimasWrap: {
    flexGrow: 0,
    marginBottom: 12,
  },
  ultimasRow: {
    gap: 8,
    paddingRight: 4,
  },
  ultimaChip: {
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    minWidth: 76,
  },
  ultimaChipActivo: {
    borderColor: colors.purple,
    backgroundColor: colors.lav50,
  },
  ultimaNombre: {
    fontFamily: fonts.bodyX,
    fontSize: 12,
    color: colors.ink,
    maxWidth: 90,
  },
  ultimaDato: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    marginTop: 2,
  },
  ultimaVacio: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.grayLt,
    marginTop: 3,
  },
  playerName: {
    ...type.player,
    color: colors.ink,
  },
  // elección
  opciones: {
    flex: 1,
    gap: 12,
  },
  opcionWrap: {
    flex: 1,
    borderRadius: 28,
  },
  opcion: {
    flex: 1,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  opcionOff: {
    backgroundColor: colors.disabledBg,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  opcionEmoji: {
    fontSize: 44,
  },
  opcionEmojiOff: {
    fontSize: 44,
    opacity: 0.4,
  },
  opcionLabel: {
    fontFamily: fonts.display,
    fontSize: 30,
    letterSpacing: -0.8,
  },
  opcionQuedan: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
  },
  opcionMotivo: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.gray,
  },
  // carta
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
  watermark: {
    position: 'absolute',
    right: -24,
    bottom: -30,
    fontSize: 170,
    opacity: 0.07,
  },
  cardTextoWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 14,
  },
  cardTexto: {
    fontFamily: fonts.display,
    letterSpacing: -0.7,
    color: colors.white,
  },
  // acciones
  actions: {
    paddingTop: 14,
    gap: 12,
  },
});
