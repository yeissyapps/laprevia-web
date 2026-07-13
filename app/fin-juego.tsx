// 07 · Fin de juego — repetir / cambiar / menú; en Competición, marcador parcial y siguiente ronda

import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Overline } from '@/components/Overline';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SecondaryButton } from '@/components/SecondaryButton';
import { StoreCTA } from '@/components/StoreCTA';
import { useSession } from '@/context/SessionContext';
import { getJuego } from '@/data/content';
import { rutaJuego } from '@/data/rutas';
import { emoji, marcadorLabel, pick } from '@/utils/textoTono';
import { colors, fonts, shadows, type } from '@/theme/theme';

export default function FinJuegoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, avanzarRonda, reiniciarSesion, registrarPartida } = useSession();
  // Configuración con la que se jugó (p. ej. niveles de Yo Nunca), para poder repetir igual
  const { niveles } = useLocalSearchParams<{ niveles?: string }>();

  // Cuenta este juego como completado (una vez por visita a esta pantalla). Cubre
  // los juegos de cartas en Libre y TODOS los juegos en Competición (que pasan
  // siempre por aquí). Los juegos con pantalla de fin propia cuentan en la suya.
  const contado = useRef(false);
  useEffect(() => {
    if (!contado.current) {
      contado.current = true;
      registrarPartida();
    }
  }, [registrarPartida]);

  const juego = session.juegoActual ? getJuego(session.juegoActual) : undefined;
  const enModoMarcador = session.modo === 'competicion' || session.modo === 'escalada';
  const comp = enModoMarcador ? session.competicion : null;
  const esUltimaRonda = comp !== null && comp.rondaActual >= comp.numRondas - 1;
  const esEscalada = session.modo === 'escalada';

  // Chill: gana quien MENOS suma (ascendente). Fiesta: v1.0 exacto (descendente).
  const chill = session.tono === 'chill';
  const marcador = comp
    ? session.jugadores
        .map((nombre, i) => ({ nombre, tragos: comp.tragos[i] ?? 0 }))
        .sort((a, b) => (chill ? a.tragos - b.tragos : b.tragos - a.tragos))
    : [];

  const siguienteJuego = () => {
    if (esUltimaRonda) {
      router.replace('/resultados');
      return;
    }
    if (esEscalada) {
      // La pantalla de transición hace avanzarRonda() y navega al juego
      router.replace('/nivel-completado');
      return;
    }
    const proximo = comp?.juegos[comp.rondaActual + 1];
    avanzarRonda();
    router.replace(rutaJuego(proximo));
  };

  // Juegos con mazos por niveles: repetir = re-barajar con los mismos niveles
  const conNiveles = session.juegoActual === 'yo-nunca' || session.juegoActual === 'verdad-o-reto';

  const repetir = () => {
    if (conNiveles && niveles) {
      router.replace({ pathname: `/${session.juegoActual}/jugar`, params: { niveles } } as never);
      return;
    }
    router.replace(rutaJuego(session.juegoActual));
  };
  const cambiar = () => router.replace('/juegos');
  const menuPrincipal = () => {
    reiniciarSesion();
    router.replace('/');
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 24 }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}>
        <Animated.Text entering={FadeInDown.duration(300)} style={styles.emoji}>
          {esEscalada ? '🔥' : '🎉'}
        </Animated.Text>
        <Text style={styles.title}>¡Juego terminado!</Text>
        <Text style={styles.subtitle}>
          {juego ? `${juego.emoji} ${pick(juego.nombre, juego.nombreChill, session.tono)}` : 'Escalada'}
          {comp ? (esEscalada ? `  ·  Nivel ${comp.rondaActual + 1} de ${comp.numRondas}` : `  ·  Ronda ${comp.rondaActual + 1} de ${comp.numRondas}`) : ''}
        </Text>

        {/* Marcador parcial (solo Competición) */}
        {comp && (
          <Animated.View entering={FadeInDown.delay(120).duration(300)} style={[styles.marcador, shadows.card]}>
            <Overline color={colors.grayLt}>{marcadorLabel(session.tono)}</Overline>
            {marcador.map((fila, i) => (
              <View key={fila.nombre + i} style={styles.fila}>
                <Text style={styles.filaPos}>{i + 1}</Text>
                <Text style={styles.filaNombre}>{fila.nombre}</Text>
                <Text style={styles.filaTragos}>{emoji(session.tono)} {fila.tragos}</Text>
              </View>
            ))}
          </Animated.View>
        )}

        <View style={styles.spacer} />

        {/* CTA de descarga (solo web; no-op en nativo) */}
        <StoreCTA variant="card" />

        <View style={styles.botones}>
          {comp ? (
            <>
              <PrimaryButton
                title={esUltimaRonda ? 'Ver resultados' : esEscalada ? 'Subir de nivel 🔥' : 'Siguiente juego'}
                onPress={siguienteJuego}
              />
              <SecondaryButton
                title={esEscalada ? 'Abandonar Escalada' : 'Abandonar competición'}
                variant="destructive"
                onPress={menuPrincipal}
              />
            </>
          ) : (
            <>
              <PrimaryButton
                title={conNiveles ? 'Barajar de nuevo  🔀' : 'Repetir juego  🔁'}
                onPress={repetir}
              />
              <SecondaryButton title="Cambiar de juego" variant="soft" onPress={cambiar} />
              <SecondaryButton title="Menú principal" variant="ghost" onPress={menuPrincipal} />
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 28,
    alignItems: 'center',
  },
  emoji: {
    fontSize: 56,
    marginTop: 18,
  },
  title: {
    ...type.titleL,
    color: colors.ink,
    marginTop: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.gray,
    marginTop: 8,
  },
  marcador: {
    alignSelf: 'stretch',
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 18,
    marginTop: 24,
    gap: 10,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  filaPos: {
    width: 22,
    fontFamily: fonts.display,
    fontSize: 15,
    color: colors.grayLt,
  },
  filaNombre: {
    flex: 1,
    fontFamily: fonts.bodySemi,
    fontSize: 15,
    color: colors.ink,
  },
  filaTragos: {
    fontFamily: fonts.bodyX,
    fontSize: 14,
    color: colors.purple,
  },
  spacer: {
    flex: 1,
    minHeight: 24,
  },
  botones: {
    alignSelf: 'stretch',
    gap: 9,
  },
});
