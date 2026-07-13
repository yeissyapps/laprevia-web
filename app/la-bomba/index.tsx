// La Bomba · Configuración — selector simple Neutro / Picante / Ambos

import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DesbloqueoAnuncio } from '@/components/DesbloqueoAnuncio';
import { Overline } from '@/components/Overline';
import { PressableScale } from '@/components/PressableScale';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useSession } from '@/context/SessionContext';
import { contarBomba, type SeleccionBomba } from '@/data/laBomba';
import { desbloquearAudio } from '@/utils/sonido';
import { colors, fonts, gradientAngle, gradients, radius, shadows, type } from '@/theme/theme';

const DESBLOQUEO_PICANTE_BOMBA = 'la-bomba-picante';

const OPCIONES: { id: SeleccionBomba; emoji: string; nombre: string; desc: string }[] = [
  { id: 'neutro', emoji: '😄', nombre: 'Neutro', desc: 'Preguntas para todos los públicos' },
  { id: 'picante', emoji: '🌶️', nombre: 'Picante', desc: 'Subidas de tono para confianza' },
  { id: 'ambos', emoji: '🎲', nombre: 'Ambos', desc: 'Mezcla de neutro y picante' },
];

export default function LaBombaConfigScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, estaDesbloqueado, desbloquearTemporal } = useSession();
  const [seleccion, setSeleccion] = useState<SeleccionBomba>('neutro');

  React.useEffect(() => {
    if (session.modo === 'escalada') {
      desbloquearAudio();
      const sel: SeleccionBomba = session.intensidad === 'picante' ? 'ambos' : 'neutro';
      router.replace({ pathname: '/la-bomba/jugar', params: { seleccion: sel } } as never);
    }
  }, [session.modo]);
  const [anuncioVisible, setAnuncioVisible] = useState(false);

  if (session.modo === 'escalada') return null;

  const picanteDesbloqueado = estaDesbloqueado(DESBLOQUEO_PICANTE_BOMBA);

  const totales: Record<SeleccionBomba, number> = {
    neutro: contarBomba('neutro'),
    picante: contarBomba('picante'),
    ambos: contarBomba('neutro') + contarBomba('picante'),
  };

  const irAJugar = () => {
    desbloquearAudio();
    router.push({ pathname: '/la-bomba/jugar', params: { seleccion } } as never);
  };

  // Picante (y Ambos, que lo incluye) requieren ver un vídeo si no está desbloqueado.
  const requiereVideo = seleccion === 'picante' || seleccion === 'ambos';

  const empezar = () => {
    if (requiereVideo && !picanteDesbloqueado) {
      setAnuncioVisible(true);
      return;
    }
    irAJugar();
  };

  const desbloquearPicante = () => {
    desbloquearTemporal(DESBLOQUEO_PICANTE_BOMBA);
    setAnuncioVisible(false);
    setTimeout(() => irAJugar(), 80);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
      <View style={styles.content}>
        <PressableScale onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <Text style={styles.backIcon}>←</Text>
        </PressableScale>

        <Overline>💣 LA BOMBA</Overline>
        <Text style={styles.title}>Elige el tono</Text>
        <Text style={styles.subtitle}>Responde y pasa el móvil antes de que explote.</Text>

        <View style={styles.opciones}>
          {OPCIONES.map((op) => {
            const activo = seleccion === op.id;
            const locked = (op.id === 'picante' || op.id === 'ambos') && !picanteDesbloqueado;
            return (
              <PressableScale
                key={op.id}
                onPress={() => setSeleccion(op.id)}
                scaleTo={0.98}
                style={[styles.cardWrap, activo ? shadows.purple : shadows.card]}>
                {activo ? (
                  <LinearGradient
                    colors={gradients.purple.colors}
                    locations={gradients.purple.locations}
                    start={gradientAngle.start}
                    end={gradientAngle.end}
                    style={styles.card}>
                    <CardInner op={op} total={totales[op.id]} activo locked={locked} />
                  </LinearGradient>
                ) : (
                  <View style={[styles.card, styles.cardIdle]}>
                    <CardInner op={op} total={totales[op.id]} activo={false} locked={locked} />
                  </View>
                )}
              </PressableScale>
            );
          })}
        </View>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
        <PrimaryButton title={requiereVideo && !picanteDesbloqueado ? '📺  Ver vídeo y empezar' : 'Empezar'} onPress={empezar} />
      </View>

      <DesbloqueoAnuncio
        visible={anuncioVisible}
        contenido="el contenido +18"
        onDesbloqueado={desbloquearPicante}
        onCancel={() => setAnuncioVisible(false)}
      />
    </View>
  );
}

function CardInner({
  op,
  total,
  activo,
  locked,
}: {
  op: { emoji: string; nombre: string; desc: string };
  total: number;
  activo: boolean;
  locked?: boolean;
}) {
  return (
    <View style={styles.cardRow}>
      <View style={[styles.tile, activo ? styles.tileActive : styles.tileIdle]}>
        <Text style={styles.tileEmoji}>{op.emoji}</Text>
      </View>
      <View style={styles.cardTexts}>
        <View style={styles.nameRow}>
          <Text style={[styles.cardName, { color: activo ? colors.white : colors.ink }]}>{op.nombre}</Text>
          <Text style={[styles.cardCount, { color: activo ? 'rgba(255,255,255,0.7)' : colors.grayLt }]}>
            {total} preguntas
          </Text>
        </View>
        <Text style={[styles.cardDesc, { color: activo ? 'rgba(255,255,255,0.85)' : colors.gray }]}>
          {op.desc}
        </Text>
        {locked && (
          <Text style={[styles.videoHint, { color: activo ? colors.white : colors.purple }]}>
            📺 Gratis con vídeo
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { flex: 1, paddingHorizontal: 26 },
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
  backIcon: { color: colors.ink, fontSize: 18, fontFamily: fonts.bodyBold },
  title: { ...type.titleL, fontSize: 34, color: colors.ink, marginTop: 8 },
  subtitle: { ...type.body, color: colors.gray, marginTop: 8 },
  opciones: { marginTop: 22, gap: 12 },
  cardWrap: { borderRadius: 20 },
  card: { borderRadius: 20, padding: 16, minHeight: 88, justifyContent: 'center' },
  cardIdle: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  tile: { width: 52, height: 52, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  tileIdle: { backgroundColor: colors.lav100 },
  tileActive: { backgroundColor: 'rgba(255,255,255,0.16)' },
  tileEmoji: { fontSize: 26 },
  cardTexts: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardName: { fontFamily: fonts.display, fontSize: 20, letterSpacing: -0.5 },
  cardCount: { fontFamily: fonts.bodyBold, fontSize: 12, marginLeft: 'auto' },
  cardDesc: { fontFamily: fonts.body, fontSize: 12.5, marginTop: 3 },
  videoHint: { fontFamily: fonts.bodyX, fontSize: 11, letterSpacing: 0.3, marginTop: 5 },
  footer: { paddingHorizontal: 26, paddingTop: 12 },
});
