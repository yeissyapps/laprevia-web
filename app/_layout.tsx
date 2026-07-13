import {
  BricolageGrotesque_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/bricolage-grotesque';
import {
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { useKeepAwake } from 'expo-keep-awake';
import { Stack } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { SessionProvider } from '@/context/SessionContext';
import { WebFrame } from '@/components/WebFrame';
import { colors } from '@/theme/theme';
import { inicializarAds } from '@/utils/ads';
import { configurarAudioNativo } from '@/utils/sonido';

SplashScreen.preventAutoHideAsync();

// La pantalla no se apaga en NINGÚN momento de la app (juego, menús de
// competición, marcadores intermedios…). En web el wake lock puede fallar, así
// que solo se activa en nativo, montando el hook en un componente aparte.
function KeepAwakeGlobal() {
  useKeepAwake();
  return null;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    BricolageGrotesque_800ExtraBold,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  // Inicializa el SDK de anuncios una vez al arrancar (no-op en web).
  useEffect(() => {
    inicializarAds();
  }, []);

  // Configura la sesión de audio de iOS (reproducir en modo silencio). No-op en web.
  useEffect(() => {
    configurarAudioNativo();
  }, []);

  // Toda la app en vertical (app.json usa "default" para permitir que SOLO la
  // pantalla de carrera fuerce horizontal; aquí fijamos el resto a portrait).
  useEffect(() => {
    if (Platform.OS === 'web') return;
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
  }, []);

  if (!fontsLoaded) return null;

  return (
    <SessionProvider>
      {Platform.OS !== 'web' && <KeepAwakeGlobal />}
      <StatusBar style="dark" />
      <WebFrame>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: colors.surface },
        }}>
        {/* Sin gestos de volver durante el juego: evita salidas accidentales */}
        <Stack.Screen name="juego" options={{ gestureEnabled: false }} />
        <Stack.Screen name="yo-nunca/jugar" options={{ gestureEnabled: false, animation: 'fade' }} />
        <Stack.Screen name="comandante" options={{ gestureEnabled: false }} />
        <Stack.Screen name="verdad-o-reto/jugar" options={{ gestureEnabled: false, animation: 'fade' }} />
        <Stack.Screen name="mayor-menor" options={{ gestureEnabled: false }} />
        <Stack.Screen name="cinco-segundos/jugar" options={{ gestureEnabled: false, animation: 'fade' }} />
        <Stack.Screen name="la-bomba/jugar" options={{ gestureEnabled: false, animation: 'fade' }} />
        <Stack.Screen name="carrera-caballos" options={{ gestureEnabled: false }} />
        <Stack.Screen name="rey-copa" options={{ gestureEnabled: false }} />
        <Stack.Screen name="mimica/jugar" options={{ gestureEnabled: false, animation: 'fade' }} />
        <Stack.Screen name="alias/jugar" options={{ gestureEnabled: false, animation: 'fade' }} />
        <Stack.Screen name="oca-borracha" options={{ gestureEnabled: false }} />
        <Stack.Screen name="el-impostor" options={{ gestureEnabled: false }} />
        <Stack.Screen name="parchis-borracho" options={{ gestureEnabled: false }} />
        <Stack.Screen name="triman" options={{ gestureEnabled: false }} />
        <Stack.Screen name="polis-y-cacos" options={{ gestureEnabled: false }} />
        <Stack.Screen name="fin-juego" options={{ gestureEnabled: false, animation: 'fade' }} />
        <Stack.Screen name="resultados" options={{ gestureEnabled: false, animation: 'fade' }} />
        <Stack.Screen name="muerte-subita" options={{ gestureEnabled: false, animation: 'fade' }} />
      </Stack>
      </WebFrame>
    </SessionProvider>
  );
}
