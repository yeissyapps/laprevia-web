// 04 · Menú de juegos — filtros por jugadores, badges gratis/premium, sheet de desbloqueo

import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DesbloqueoAnuncio } from '@/components/DesbloqueoAnuncio';
import { PressableScale } from '@/components/PressableScale';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SecondaryButton } from '@/components/SecondaryButton';
import { useSession } from '@/context/SessionContext';
import { juegos } from '@/data/content';
import { pick } from '@/utils/textoTono';
import type { Href } from 'expo-router';
import type { FiltroDuracion, FiltroJugadores, JuegoConfig } from '@/data/types';
import { colors, fonts, radius, shadows } from '@/theme/theme';

type Cat = 'jugadores' | 'tipo' | 'duracion';

const TITULO: Record<Cat, string> = { jugadores: 'Jugadores', tipo: 'Tipo', duracion: 'Duración' };
const OPCIONES: Record<Cat, { v: string; l: string }[]> = {
  jugadores: [
    { v: '2', l: '2 jugadores' },
    { v: '3mas', l: '3 o más' },
    { v: 'equipos', l: 'Equipos' },
  ],
  tipo: [
    { v: 'tablero', l: 'Tablero' },
    { v: 'preguntas', l: 'Preguntas' },
    { v: 'cartas', l: 'Cartas' },
    { v: 'casino', l: 'Casino' },
  ],
  duracion: [
    { v: 'corta', l: 'Corta' },
    { v: 'media', l: 'Media' },
    { v: 'larga', l: 'Larga' },
  ],
};

export default function JuegosScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, setJuegoActual, estaDesbloqueado, desbloquearTemporal, comprarPremium, anuncioMantenimiento, consumirAnuncioMantenimiento } =
    useSession();

  const comprarSinAnuncios = async () => {
    const r = await comprarPremium();
    if (r === 'comprado') {
      const juego = premiumPendiente;
      setPremiumPendiente(null);
      if (juego) setTimeout(() => jugar(juego), 80);
    } else if (r === 'no_disponible') {
      Alert.alert('Compras no disponibles', 'La compra sin anuncios estará disponible muy pronto.');
    } else if (r === 'error') {
      Alert.alert('No se pudo completar', 'Inténtalo de nuevo en un momento.');
    }
  };

  const [sel, setSel] = useState<Record<Cat, string | null>>({ jugadores: null, tipo: null, duracion: null });
  const [abierto, setAbierto] = useState<Cat | null>(null);
  const [premiumPendiente, setPremiumPendiente] = useState<JuegoConfig | null>(null);
  // Juego cuyo anuncio de desbloqueo se está mostrando
  const [anuncioJuego, setAnuncioJuego] = useState<JuegoConfig | null>(null);

  const nJugadores = Math.max(session.jugadores.length, 2);

  // Las pestañas numéricas filtran por jugadores reales soportados (un juego de
  // 2–10 aparece tanto en "2 jugadores" como en "3+"). Equipos va aparte.
  // Filtros acumulativos (AND). Ninguno seleccionado → todos los juegos.
  const lista = useMemo(
    () =>
      juegos.filter((j) => {
        if (sel.jugadores && !j.clasif.jugadores.includes(sel.jugadores as FiltroJugadores)) return false;
        if (sel.tipo && j.clasif.tipo !== sel.tipo) return false;
        if (sel.duracion && !j.clasif.duracion.includes(sel.duracion as FiltroDuracion)) return false;
        return true;
      }),
    [sel]
  );

  const jugar = (juego: JuegoConfig) => {
    setJuegoActual(juego.id);
    // Pasa por el splash del juego (nombre + emoji + reglas + ¡Comenzar!).
    router.push('/jugar' as Href);
  };

  const onPressJuego = (juego: JuegoConfig) => {
    if (juego.premium && !estaDesbloqueado(juego.id)) {
      setPremiumPendiente(juego);
      return;
    }
    jugar(juego);
  };

  // Desde el sheet premium: cierra el sheet y abre el flujo de anuncio.
  const abrirAnuncio = () => {
    if (!premiumPendiente) return;
    setAnuncioJuego(premiumPendiente);
    setPremiumPendiente(null);
  };

  // El usuario completó el vídeo: desbloqueo temporal (2,5 h) y a jugar.
  const desbloqueadoPorAnuncio = () => {
    const juego = anuncioJuego;
    if (!juego) return;
    desbloquearTemporal(juego.id);
    setAnuncioJuego(null);
    setTimeout(() => jugar(juego), 80);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
      {/* Header */}
      <View style={styles.header}>
        <PressableScale onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <Text style={styles.backIcon}>←</Text>
        </PressableScale>
        <Text style={styles.title}>Juegos</Text>
        <View style={styles.headerSpacer} />
      </View>

      <Text style={styles.hint}>
        Todo gratis 🎉  ·  algunos se desbloquean viendo un vídeo
      </Text>

      {/* Filtros: tres desplegables independientes y acumulativos */}
      <View style={styles.filtrosWrap}>
        <View style={styles.dropRow}>
          {(['jugadores', 'tipo', 'duracion'] as Cat[]).map((cat) => {
            const activo = sel[cat];
            const label = activo ? OPCIONES[cat].find((o) => o.v === activo)?.l : TITULO[cat];
            const open = abierto === cat;
            return (
              <PressableScale
                key={cat}
                onPress={() => setAbierto(open ? null : cat)}
                scaleTo={0.97}
                style={[styles.drop, (activo || open) && styles.dropActivo]}>
                <Text style={[styles.dropText, activo && styles.dropTextActivo]} numberOfLines={1}>
                  {label}
                </Text>
                <Text style={[styles.dropChevron, activo && styles.dropTextActivo]}>{open ? '▴' : '▾'}</Text>
              </PressableScale>
            );
          })}
        </View>

        {abierto && (
          <View style={[styles.opcionesPanel, shadows.card]}>
            <PressableScale
              onPress={() => {
                setSel((s) => ({ ...s, [abierto]: null }));
                setAbierto(null);
              }}
              scaleTo={0.96}
              style={[styles.opcionChip, !sel[abierto] && styles.opcionChipOn]}>
              <Text style={[styles.opcionChipText, !sel[abierto] && styles.opcionChipTextOn]}>Todos</Text>
            </PressableScale>
            {OPCIONES[abierto].map((o) => {
              const on = sel[abierto] === o.v;
              return (
                <PressableScale
                  key={o.v}
                  onPress={() => {
                    setSel((s) => ({ ...s, [abierto]: o.v }));
                    setAbierto(null);
                  }}
                  scaleTo={0.96}
                  style={[styles.opcionChip, on && styles.opcionChipOn]}>
                  <Text style={[styles.opcionChipText, on && styles.opcionChipTextOn]}>{o.l}</Text>
                </PressableScale>
              );
            })}
          </View>
        )}
      </View>

      {/* Lista */}
      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}>
        {lista.map((juego) => {
          const insuficientes = juego.minJugadores > nJugadores;
          const bloqueado = juego.premium && !estaDesbloqueado(juego.id);
          return (
            <PressableScale
              key={juego.id}
              onPress={() => onPressJuego(juego)}
              disabled={insuficientes}
              style={[styles.card, shadows.card, insuficientes && styles.cardOff]}>
              <View style={[styles.tile, { backgroundColor: juego.premium ? colors.ghost : colors.lav100 }]}>
                <Text style={styles.tileEmoji}>{juego.emoji}</Text>
              </View>
              <View style={styles.cardTexts}>
                <View style={styles.nameRow}>
                  <Text style={styles.cardName}>{pick(juego.nombre, juego.nombreChill, session.tono)}</Text>
                  {bloqueado ? (
                    <View style={[styles.badge, { backgroundColor: colors.lav100 }]}>
                      <Text style={[styles.badgeText, { color: colors.purple }]}>📺 GRATIS CON VÍDEO</Text>
                    </View>
                  ) : (
                    <View style={[styles.badge, { backgroundColor: colors.greenBg }]}>
                      <Text style={[styles.badgeText, { color: colors.green }]}>
                        {juego.premium ? 'DESBLOQUEADO' : 'GRATIS'}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.cardMeta}>
                  {insuficientes
                    ? `Necesita ${juego.minJugadores}+ jugadores (sois ${nJugadores})`
                    : `👥 ${juego.minJugadores}–${juego.maxJugadores} jugadores`}
                </Text>
              </View>
              <Text style={styles.cardChevron}>›</Text>
            </PressableScale>
          );
        })}
      </ScrollView>

      {/* Bottom sheet de desbloqueo premium */}
      <Modal
        visible={premiumPendiente !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setPremiumPendiente(null)}>
        <Pressable style={styles.backdrop} onPress={() => setPremiumPendiente(null)} />
        <View style={styles.sheetWrap} pointerEvents="box-none">
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.handle} />
            <Text style={styles.sheetEmoji}>{premiumPendiente?.emoji}</Text>
            <Text style={styles.sheetTitle}>{premiumPendiente ? pick(premiumPendiente.nombre, premiumPendiente.nombreChill, session.tono) : ''} es premium</Text>
            <Text style={styles.sheetBody}>
              Desbloquéalo gratis viendo un anuncio o pásate a la versión sin anuncios.
            </Text>
            <View style={styles.sheetBtns}>
              <PrimaryButton title="📺  Ver anuncio gratis" size="m" onPress={abrirAnuncio} />
              <SecondaryButton
                title="Sin anuncios — 2,99 €"
                variant="ghost"
                onPress={comprarSinAnuncios}
              />
              <SecondaryButton title="Cancelar" variant="ghost" onPress={() => setPremiumPendiente(null)} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Flujo de anuncio recompensado para desbloquear el juego premium */}
      <DesbloqueoAnuncio
        visible={anuncioJuego !== null}
        contenido={anuncioJuego ? pick(anuncioJuego.nombre, anuncioJuego.nombreChill, session.tono) : ''}
        onDesbloqueado={desbloqueadoPorAnuncio}
        onCancel={() => setAnuncioJuego(null)}
      />

      {/* Anuncio de mantenimiento cada 3 juegos (informativo, no desbloquea nada) */}
      <DesbloqueoAnuncio
        modo="informativo"
        visible={anuncioMantenimiento && anuncioJuego === null && premiumPendiente === null}
        onDesbloqueado={consumirAnuncioMantenimiento}
        onCancel={consumirAnuncioMantenimiento}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 26,
    marginBottom: 14,
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
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.display,
    fontSize: 28,
    letterSpacing: -1,
    color: colors.ink,
  },
  headerSpacer: {
    width: 40,
  },
  hint: {
    fontFamily: fonts.bodySemi,
    fontSize: 12.5,
    color: colors.gray,
    paddingHorizontal: 26,
    marginTop: -2,
    marginBottom: 12,
  },
  filtrosWrap: { paddingHorizontal: 26, paddingBottom: 14 },
  dropRow: { flexDirection: 'row', gap: 8 },
  drop: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  dropActivo: { borderColor: colors.purple, backgroundColor: colors.lav100 },
  dropText: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.gray },
  dropTextActivo: { color: colors.purple },
  dropChevron: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.grayLt, marginLeft: 4 },
  opcionesPanel: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
    padding: 12,
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  opcionChip: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  opcionChipOn: { backgroundColor: colors.purple, borderColor: colors.purple },
  opcionChipText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.gray },
  opcionChipTextOn: { color: colors.white },
  list: {
    paddingHorizontal: 26,
    gap: 10,
    paddingTop: 2,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.gameCard,
    padding: 14,
  },
  cardOff: {
    opacity: 0.45,
  },
  tile: {
    width: 54,
    height: 54,
    borderRadius: radius.tile,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileEmoji: {
    fontSize: 29,
  },
  cardTexts: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    rowGap: 3,
    gap: 7,
  },
  cardName: {
    fontFamily: fonts.display,
    fontSize: 16,
    letterSpacing: -0.3,
    color: colors.ink,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 30,
  },
  badgeText: {
    fontFamily: fonts.bodyX,
    fontSize: 9.5,
    letterSpacing: 0.8,
  },
  cardDesc: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.gray,
    marginTop: 3,
  },
  cardMeta: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    color: colors.grayLt,
    marginTop: 3,
  },
  cardChevron: {
    fontFamily: fonts.display,
    fontSize: 22,
    color: colors.grayLt,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(13,11,26,0.52)',
  },
  sheetWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: 24,
    paddingTop: 10,
    alignItems: 'center',
  },
  handle: {
    width: 40,
    height: 4.5,
    borderRadius: 3,
    backgroundColor: colors.border,
    marginBottom: 16,
  },
  sheetEmoji: {
    fontSize: 44,
  },
  sheetTitle: {
    fontFamily: fonts.display,
    fontSize: 22,
    letterSpacing: -0.6,
    color: colors.ink,
    marginTop: 8,
    textAlign: 'center',
  },
  sheetBody: {
    fontFamily: fonts.body,
    fontSize: 13.5,
    lineHeight: 19,
    color: colors.gray,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 18,
  },
  sheetBtns: {
    alignSelf: 'stretch',
    gap: 9,
  },
});
