// Parchís Borracho — tablero en cruz (SVG) + motor de turnos. Identidad La Previa.
// Soporta 2 (cada uno 2 colores opuestos), 3 y 4 jugadores. En Competición los
// tragos determinables se aplican con sumarTragos; los de Categoría 2, con picker.

import { LinearGradient } from 'expo-linear-gradient';
import { useKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, G, Path, Polygon, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Confetti } from '@/components/Confetti';
import { RulesButton } from '@/components/GameRules';
import { Overline } from '@/components/Overline';
import { PickerJugadores } from '@/components/PickerJugadores';
import { PressableScale } from '@/components/PressableScale';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SecondaryButton } from '@/components/SecondaryButton';
import { SessionMenu, SessionMenuButton } from '@/components/SessionMenu';
import { useSession } from '@/context/SessionContext';
import { bebeN, emoji, pick, unidad, verbo } from '@/utils/textoTono';
import {
  BOARD,
  CELL,
  CENTER_STEP,
  CASA_SLOTS,
  COLORES,
  HOME_PATHS,
  HOUSES,
  PARTIDAS_COMPETICION,
  SALIDA_CON,
  SEGURO,
  TRACK,
  TRACK_LEN,
  TRAGOS_COMIDO,
  TURNOS_SIN_SALIR,
  celdaFicha,
  coloresActivos,
  coloresDeJugador,
  cx,
  cy,
  duenoColor,
  seleccionarEspeciales,
  trackGlobal,
  type Efecto,
} from '@/data/parchis';
import { colors, fonts, gradientAngle, gradients } from '@/theme/theme';

type Fase = 'turno' | 'elegir' | 'sinMov' | 'comer' | 'especial' | 'victoria';

interface Ficha {
  color: number;
  idx: number;
  step: number; // -1 casa · 0..CENTER_STEP · CENTER_STEP = meta
}

function KeepAwake() {
  useKeepAwake();
  return null;
}

const dado6Auto = ['bebe', 'todos', 'derecha', 'reparteCada', 'porFicha', 'cercano', 'menosFichas', 'ultimoSeis'];
const necesitaPicker = (t: string) => t === 'reparte' || t === 'reparteFichas' || t === 'picker';

export default function ParchisBorrachoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { session, sumarTragos, registrarPartida } = useSession();

  const nombres = session.jugadores.length > 0 ? session.jugadores : ['Jugador 1', 'Jugador 2'];
  const numJugadores = Math.min(Math.max(nombres.length, 2), 4);
  const enCompeticion = session.modo === 'competicion' || session.modo === 'escalada';
  const dueno = useMemo(() => duenoColor(numJugadores), [numJugadores]);
  const activos = useMemo(() => coloresActivos(numJugadores), [numJugadores]);

  const fichasIniciales = (): Ficha[] =>
    activos.flatMap((c) => [0, 1].map((idx) => ({ color: c, idx, step: -1 })));

  const [fichas, setFichas] = useState<Ficha[]>(fichasIniciales);
  const [especiales, setEspeciales] = useState<Record<number, Efecto>>(() => seleccionarEspeciales());
  const [turno, setTurno] = useState(0); // índice de jugador
  const [dado, setDado] = useState<number | null>(null);
  const [fase, setFase] = useState<Fase>('turno');
  const [especial, setEspecial] = useState<{ efecto: Efecto; color: number; idx: number; texto: string } | null>(null);
  const [comer, setComer] = useState<{ eater: number; victima: number } | null>(null);
  const [ganadorColor, setGanadorColor] = useState<number | null>(null);
  const [sinMovTexto, setSinMovTexto] = useState('');
  const [partidaNum, setPartidaNum] = useState(1);
  const [menuVisible, setMenuVisible] = useState(false);
  const [picker, setPicker] = useState<{ titulo: string; subtitulo: string; cantidad: number; maxTotal?: number } | null>(null);

  const [sinSalirPena, setSinSalirPena] = useState(false);

  // Animación del dado
  const [dadoAnimando, setDadoAnimando] = useState(false);
  const [dadoFace, setDadoFace] = useState(1);
  const dadoScaleAnim = useRef(new Animated.Value(1)).current;

  // Refs para el flujo asíncrono (overlays) sin closures obsoletas.
  const dadoRef = useRef(0);
  const colorMovioRef = useRef(0);
  const pendingEspecial = useRef<{ efecto: Efecto; color: number; idx: number } | null>(null);
  const ultimoSeis = useRef<number | null>(null);
  const saltar = useRef<Set<number>>(new Set());
  const sinSalir = useRef<number[]>(Array(4).fill(0));
  // Ref síncrona del estado de fichas: el flujo (mover→comer→especial→continuar)
  // pasa por overlays asíncronos, y setState no actualiza al instante. La ref nos
  // da el estado actual en el mismo tick (clave para detectar la victoria).
  const fichasRef = useRef<Ficha[]>(fichas);
  const setFichasSync = (next: Ficha[]) => {
    fichasRef.current = next;
    setFichas(next);
  };

  const escala = Math.min(1, (width - 28) / BOARD);

  // Escalada: límite de 12 minutos para partidas con duracion 'partida_completa_o_12min'
  const escaladaDuracion = enCompeticion && session.modo === 'escalada'
    ? session.competicion?.duraciones?.[session.competicion?.rondaActual ?? 0]
    : null;
  const timerStart = useRef(Date.now());
  useEffect(() => {
    if (escaladaDuracion !== 'partida_completa_o_12min') return;
    timerStart.current = Date.now();
    const id = setInterval(() => {
      if (Date.now() - timerStart.current >= 12 * 60 * 1000) {
        clearInterval(id);
        router.replace('/fin-juego');
      }
    }, 15_000);
    return () => clearInterval(id);
  }, [escaladaDuracion]);

  // ——— Helpers de estado (leen la ref síncrona) ———
  const fichasDe = (jugador: number) => fichasRef.current.filter((f) => dueno[f.color] === jugador);
  const fichasFueraDe = (jugador: number) => fichasDe(jugador).filter((f) => f.step >= 0).length;
  const colorTerminado = (color: number) =>
    fichasRef.current.filter((f) => f.color === color).every((f) => f.step >= CENTER_STEP);

  const movible = (f: Ficha, d: number) => {
    if (f.step >= CENTER_STEP) return false;
    if (f.step < 0) return d === SALIDA_CON;
    return true;
  };
  const movibles = (jugador: number, d: number) => fichasDe(jugador).filter((f) => movible(f, d));

  const todasEnCasa = fichasDe(turno).every((f) => f.step < 0);

  // ——— Tirada ———
  const procesarTirada = (d: number) => {
    setDado(d);
    dadoRef.current = d;
    if (d === 6) ultimoSeis.current = turno;
    const movs = movibles(turno, d);
    if (movs.length === 0) {
      let txt = `Sacaste un ${d}. `;
      if (todasEnCasa && d !== SALIDA_CON) {
        sinSalir.current[turno] += 1;
        if (sinSalir.current[turno] >= TURNOS_SIN_SALIR) {
          sinSalir.current[turno] = 0;
          if (enCompeticion) sumarTragos(turno, 1);
          setSinSalirPena(true);
          txt += `Sacaste un ${d}.`;
        } else {
          txt += `Necesitas un ${SALIDA_CON} para salir.`;
        }
      } else {
        txt += 'No puedes mover ninguna ficha.';
      }
      setSinMovTexto(txt);
      setFase('sinMov');
      return;
    }
    if (todasEnCasa && d === SALIDA_CON) sinSalir.current[turno] = 0;
    if (movs.length === 1) moverFicha(movs[0]);
    else setFase('elegir');
  };

  const tirar = () => {
    if (dadoAnimando) return;
    const d = 1 + Math.floor(Math.random() * 6);
    setDadoAnimando(true);
    setDadoFace(1 + Math.floor(Math.random() * 6));
    Animated.timing(dadoScaleAnim, { toValue: 1.8, duration: 150, useNativeDriver: true }).start();
    let flips = 0;
    const iv = setInterval(() => {
      setDadoFace(1 + Math.floor(Math.random() * 6));
      flips++;
      if (flips >= 8) {
        clearInterval(iv);
        setDadoFace(d);
        setTimeout(() => {
          Animated.timing(dadoScaleAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start(() => {
            setDadoAnimando(false);
            procesarTirada(d);
          });
        }, 400);
      }
    }, 80);
  };

  // ——— Mover una ficha ———
  const moverFicha = (f: Ficha) => {
    const d = dadoRef.current;
    const nuevas = fichas.map((x) => ({ ...x }));
    const ff = nuevas.find((x) => x.color === f.color && x.idx === f.idx)!;
    if (ff.step < 0) ff.step = 0; // sale de casa (el dado era 5)
    else ff.step = Math.min(ff.step + d, CENTER_STEP);
    colorMovioRef.current = ff.color;

    // ¿come una ficha rival? (casilla compartida, no segura)
    let comido: Ficha | null = null;
    const g = trackGlobal(ff.color, ff.step);
    if (g >= 0 && !SEGURO.has(g)) {
      const enemigo = nuevas.find((x) => x.color !== ff.color && x.step >= 0 && trackGlobal(x.color, x.step) === g);
      if (enemigo) {
        enemigo.step = -1;
        comido = enemigo;
      }
    }
    setFichasSync(nuevas);

    const esp = g >= 0 ? especiales[g] : undefined;
    pendingEspecial.current = esp ? { efecto: esp, color: ff.color, idx: ff.idx } : null;

    if (comido) {
      if (enCompeticion) sumarTragos(dueno[comido.color], TRAGOS_COMIDO);
      setComer({ eater: ff.color, victima: comido.color });
      setFase('comer');
    } else if (esp) {
      abrirEspecial(esp, ff.color, ff.idx);
    } else {
      continuar(false);
    }
  };

  const trasComer = () => {
    setComer(null);
    const pe = pendingEspecial.current;
    if (pe) abrirEspecial(pe.efecto, pe.color, pe.idx);
    else continuar(false);
  };

  // ——— Casillas especiales ———
  const aplicarAuto = (efecto: Efecto, color: number) => {
    const j = dueno[color];
    switch (efecto.tipo) {
      case 'bebe':
        sumarTragos(j, efecto.cantidad);
        break;
      case 'todos':
        for (let i = 0; i < numJugadores; i++) sumarTragos(i, efecto.cantidad);
        break;
      case 'derecha':
        sumarTragos((j + 1) % numJugadores, efecto.cantidad);
        break;
      case 'reparteCada':
        for (let i = 0; i < numJugadores; i++) if (i !== j) sumarTragos(i, efecto.cantidad);
        break;
      case 'porFicha':
        sumarTragos(j, Math.max(1, fichasFueraDe(j)));
        break;
      case 'menosFichas': {
        let min = Infinity;
        let cual = j;
        for (let i = 0; i < numJugadores; i++) {
          const n = fichasFueraDe(i);
          if (n < min) {
            min = n;
            cual = i;
          }
        }
        sumarTragos(cual, efecto.cantidad);
        break;
      }
      case 'ultimoSeis':
        if (ultimoSeis.current != null) sumarTragos(ultimoSeis.current, efecto.cantidad);
        break;
      case 'cercano': {
        const gMio = trackGlobal(color, fichas.find((f) => f.color === color && f.step >= 0)?.step ?? -1);
        let best = Infinity;
        let cual = -1;
        fichas.forEach((f) => {
          if (dueno[f.color] === j || f.step < 0) return;
          const gg = trackGlobal(f.color, f.step);
          if (gg < 0 || gMio < 0) return;
          const dist = Math.min((gg - gMio + TRACK_LEN) % TRACK_LEN, (gMio - gg + TRACK_LEN) % TRACK_LEN);
          if (dist < best) {
            best = dist;
            cual = dueno[f.color];
          }
        });
        if (cual >= 0) sumarTragos(cual, efecto.cantidad);
        break;
      }
    }
  };

  const abrirEspecial = (efecto: Efecto, color: number, idx: number) => {
    if (enCompeticion && dado6Auto.includes(efecto.tipo)) aplicarAuto(efecto, color);
    setEspecial({ efecto, color, idx, texto: pick(efecto.texto, efecto.textoChill, session.tono) });
    setFase('especial');
  };

  const abrirPickerEspecial = () => {
    if (!especial) return;
    const { efecto, color } = especial;
    const sub = pick(efecto.texto, efecto.textoChill, session.tono);
    if (efecto.tipo === 'picker') {
      setPicker({ titulo: `¿Quién ${verbo(session.tono, 'bebe')}?`, subtitulo: sub, cantidad: 1 });
    } else if (efecto.tipo === 'reparte') {
      setPicker({ titulo: `Reparte ${unidad(session.tono, 2)}`, subtitulo: sub, cantidad: 1, maxTotal: efecto.cantidad });
    } else if (efecto.tipo === 'reparteFichas') {
      const total = Math.max(1, fichasFueraDe(dueno[color]));
      setPicker({ titulo: `Reparte ${unidad(session.tono, 2)}`, subtitulo: sub, cantidad: 1, maxTotal: total });
    }
  };

  const resolverEspecial = () => {
    if (!especial) return;
    const { efecto, color, idx } = especial;
    let forzarExtra = false;
    if (efecto.tipo === 'avanza' || efecto.tipo === 'retrocede') {
      const delta = efecto.tipo === 'avanza' ? efecto.cantidad : -efecto.cantidad;
      setFichasSync(
        fichasRef.current.map((f) =>
          f.color === color && f.idx === idx && f.step >= 0
            ? { ...f, step: Math.max(0, Math.min(f.step + delta, CENTER_STEP)) }
            : f
        )
      );
    } else if (efecto.tipo === 'pierdeTurno') {
      saltar.current.add(dueno[color]);
    } else if (efecto.tipo === 'tiraOtra') {
      forzarExtra = true;
    }
    setEspecial(null);
    continuar(forzarExtra);
  };

  // ——— Continuar el turno (victoria / tirada extra / pasar) ———
  const continuar = (forzarExtra: boolean) => {
    const colorWin = colorMovioRef.current;
    if (colorTerminado(colorWin)) {
      setGanadorColor(colorWin);
      setFase('victoria');
      return;
    }
    const extra = forzarExtra || dadoRef.current === 6;
    setDado(null);
    if (!extra) pasarTurno();
    setFase('turno');
  };

  // Sin movimiento posible: siempre pasa turno (sin tirada extra aunque sea 6,
  // para no encadenar seises infinitos con todas las fichas en casa).
  const pasarSinMov = () => {
    setDado(null);
    pasarTurno();
    setFase('turno');
  };

  const pasarTurno = () => {
    let next = (turno + 1) % numJugadores;
    let guard = 0;
    while (saltar.current.has(next) && guard < numJugadores) {
      saltar.current.delete(next);
      next = (next + 1) % numJugadores;
      guard++;
    }
    setTurno(next);
  };

  const nuevaPartida = () => {
    setFichasSync(fichasIniciales());
    setEspeciales(seleccionarEspeciales());
    setTurno(0);
    setDado(null);
    setEspecial(null);
    setComer(null);
    setGanadorColor(null);
    ultimoSeis.current = null;
    saltar.current.clear();
    sinSalir.current = Array(4).fill(0);
    setFase('turno');
  };

  const reiniciarJuego = () => {
    setPartidaNum(1);
    nuevaPartida();
  };

  // Si cambia el nº de jugadores (añadir/quitar desde el menú de sesión) se
  // rehace el tablero para esa cantidad — no se puede insertar a alguien en una
  // partida de tablero en curso. El máximo (4) lo controla el menú de sesión.
  const primeraSync = useRef(true);
  useEffect(() => {
    if (primeraSync.current) {
      primeraSync.current = false;
      return;
    }
    nuevaPartida();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numJugadores]);

  const siguientePartidaComp = () => {
    setPartidaNum((n) => n + 1);
    nuevaPartida();
  };

  const salirAlMenu = () => {
    registrarPartida();
    router.replace('/juegos');
  };

  // ——— Datos derivados para el render ———
  const piezasRender = fichas.map((f) => {
    const cel = celdaFicha(f.color, f.idx, f.step);
    return { color: f.color, x: cel.x, y: cel.y, key: `${f.color}-${f.idx}`, ref: f };
  });
  const movsActuales = dado != null ? movibles(turno, dado) : [];
  const movKeys = new Set(movsActuales.map((f) => `${f.color}-${f.idx}`));
  const inicialColor = (color: number) => {
    const j = dueno[color];
    return (nombres[j]?.[0] ?? COLORES[color].nombre[0]).toUpperCase();
  };
  const nombreColor = (color: number) => nombres[dueno[color]] ?? COLORES[color].nombre;

  // ——— Pantalla de victoria ———
  if (fase === 'victoria' && ganadorColor != null) {
    const cdef = COLORES[ganadorColor];
    return (
      <View style={styles.flex}>
        {Platform.OS !== 'web' && <KeepAwake />}
        <LinearGradient colors={[cdef.color, cdef.dark]} style={styles.flex}>
          <Confetti cantidad={40} />
          <View style={[styles.victoriaCentro, { paddingTop: insets.top }]}>
            <Text style={styles.victoriaTrofeo}>🏆</Text>
            <View style={styles.victoriaFichas}>
              <FichaDot color={ganadorColor} letra={inicialColor(ganadorColor)} size={40} />
              <FichaDot color={ganadorColor} letra={inicialColor(ganadorColor)} size={40} />
            </View>
            <Text style={styles.victoriaOver}>LAS 2 FICHAS EN META</Text>
            <Text style={styles.victoriaNombre} numberOfLines={2} adjustsFontSizeToFit>
              ¡{nombreColor(ganadorColor)} gana!
            </Text>
            <View style={styles.victoriaPill}>
              <Text style={styles.victoriaPillText}>Reparte 10 {unidad(session.tono, 10, 'chupito')} entre la mesa {emoji(session.tono, '🥃')}</Text>
            </View>
          </View>
          <View style={[styles.footer, { paddingBottom: insets.bottom + 14, gap: 9, alignItems: 'stretch', paddingHorizontal: 26 }]}>
            {enCompeticion ? (
              partidaNum < PARTIDAS_COMPETICION ? (
                <PrimaryButton title={`Siguiente partida (${partidaNum}/${PARTIDAS_COMPETICION})`} variant="white" onPress={siguientePartidaComp} />
              ) : (
                <PrimaryButton title="Continuar" variant="white" onPress={() => router.replace('/fin-juego')} />
              )
            ) : (
              <>
                <PrimaryButton title="Seguir jugando" variant="white" onPress={nuevaPartida} />
                <SecondaryButton title="Terminar partida" variant="onColor" onPress={salirAlMenu} />
              </>
            )}
          </View>
        </LinearGradient>
      </View>
    );
  }

  // ——— Pantalla "comer" (overlay oscuro) ———
  if (fase === 'comer' && comer) {
    return (
      <View style={styles.flex}>
        {Platform.OS !== 'web' && <KeepAwake />}
        <LinearGradient colors={['#2B2735', '#17151F']} style={[styles.flex, styles.comerCentro, { paddingTop: insets.top }]}>
          <View style={styles.comerBadge}>
            <Text style={styles.comerBadgeText}>¡TE COMO!</Text>
          </View>
          <View style={styles.comerFichas}>
            <FichaDot color={comer.eater} letra={inicialColor(comer.eater)} size={40} />
            <Text style={styles.comerEmoji}>😋</Text>
            <FichaDot color={comer.victima} letra={inicialColor(comer.victima)} size={32} />
          </View>
          <Text style={styles.comerTitulo} numberOfLines={2} adjustsFontSizeToFit>
            {nombreColor(comer.eater)} se come a {nombreColor(comer.victima)}
          </Text>
          <Text style={styles.comerSub}>
            La ficha vuelve a casa y {nombreColor(comer.victima)} {bebeN(session.tono, TRAGOS_COMIDO, false)} {emoji(session.tono)}
          </Text>
          <View style={[styles.footer, { paddingBottom: insets.bottom + 14, paddingHorizontal: 26, alignSelf: 'stretch' }]}>
            <PrimaryButton title={`¡A ${verbo(session.tono, 'beber')}!`} variant="whiteOnCoral" onPress={trasComer} />
          </View>
        </LinearGradient>
      </View>
    );
  }

  // ——— Pantalla principal (tablero + turno / elegir / sinMov / especial) ———
  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      {Platform.OS !== 'web' && <KeepAwake />}

      <View style={styles.top}>
        {enCompeticion ? (
          <View style={styles.compPillWrap}>
            <Text style={styles.compPill}>🎲 {Math.min(partidaNum, PARTIDAS_COMPETICION)}/{PARTIDAS_COMPETICION}</Text>
          </View>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        <RulesButton juegoId="parchis-borracho" />
        <SessionMenuButton onPress={() => setMenuVisible(true)} />
      </View>

      {/* Turno */}
      <View style={styles.turnoHead}>
        <Overline color={colors.grayLt}>LE TOCA A</Overline>
        <View style={styles.turnoRow}>
          <Text
            style={[styles.turnoNombre, { color: COLORES[coloresDeJugador(turno, numJugadores)[0]].color }]}
            numberOfLines={1}
            adjustsFontSizeToFit>
            {nombres[turno]}
          </Text>
        </View>
      </View>

      {/* Tablero */}
      <View style={styles.boardArea}>
        <View style={{ width: BOARD * escala, height: BOARD * escala }}>
          <View style={{ width: BOARD, height: BOARD, transform: [{ scale: escala }] }}>
            <Tablero especiales={especiales} />
            {/* ⭐ Casillas especiales */}
            {Object.keys(especiales).map((key) => {
              const i = parseInt(key);
              const [c, r] = TRACK[i];
              return (
                <View key={`esp-${i}`} pointerEvents="none" style={{ position: 'absolute', left: c * CELL + 3, top: r * CELL + 3, width: CELL - 6, height: CELL - 6, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 12 }}>⭐</Text>
                </View>
              );
            })}
            {/* 🏠 Casillas de salida/seguro */}
            {[...SEGURO].map((i) => {
              const [c, r] = TRACK[i];
              return (
                <View key={`seg-${i}`} pointerEvents="none" style={{ position: 'absolute', left: c * CELL + 3, top: r * CELL + 3, width: CELL - 6, height: CELL - 6, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 12 }}>🏠</Text>
                </View>
              );
            })}
            {/* Logo en el centro */}
            <View pointerEvents="none" style={{ position: 'absolute', left: 4 * CELL, top: 4 * CELL, width: 3 * CELL, height: 3 * CELL, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: fonts.display, fontSize: 11, color: colors.purple, textAlign: 'center', letterSpacing: 0.5, opacity: 0.85, lineHeight: 14 }}>{'LA\nPREVIA'}</Text>
            </View>
            {/* Fichas (sobre el SVG) */}
            {piezasRender.map((p) => {
              const tappable = fase === 'elegir' && movKeys.has(p.key);
              if (tappable) {
                return (
                  <PressableScale
                    key={p.key}
                    onPress={() => moverFicha(p.ref)}
                    scaleTo={0.9}
                    style={[styles.fichaPos, styles.fichaTap, { left: p.x - 16, top: p.y - 16 }]}>
                    <FichaDot color={p.color} letra={inicialColor(p.color)} size={26} />
                  </PressableScale>
                );
              }
              return (
                <View key={p.key} pointerEvents="none" style={[styles.fichaPos, { left: p.x - 13, top: p.y - 13 }]}>
                  <FichaDot color={p.color} letra={inicialColor(p.color)} size={26} />
                </View>
              );
            })}
          </View>
        </View>
      </View>

      {/* Pie según fase */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        {fase === 'turno' && (
          <>
            <Text style={styles.hint}>
              {todasEnCasa ? `🎯 Saca un ${SALIDA_CON} para sacar ficha` : '🎲 Mueve una de tus fichas'}
            </Text>
            <View style={styles.dadoRow}>
              <Animated.View style={{ transform: [{ scale: dadoScaleAnim }], zIndex: dadoAnimando ? 20 : 1 }}>
                <Dado valor={dadoAnimando ? dadoFace : (dado ?? 1)} />
              </Animated.View>
              <PressableScale onPress={tirar} scaleTo={0.965} style={styles.tirarWrap} disabled={dadoAnimando}>
                <LinearGradient
                  colors={gradients.purple.colors}
                  locations={gradients.purple.locations}
                  start={gradientAngle.start}
                  end={gradientAngle.end}
                  style={styles.tirarBtn}>
                  <Text style={styles.tirarText}>🎲 Tirar dado</Text>
                </LinearGradient>
              </PressableScale>
            </View>
          </>
        )}

        {fase === 'elegir' && (
          <Text style={styles.elegirHint}>Sacaste un {dado} · toca la ficha que quieres mover 👆</Text>
        )}

        {fase === 'sinMov' && (
          <>
            <Text style={styles.sinMovTexto}>{sinMovTexto}</Text>
            <PrimaryButton title="Seguir" onPress={pasarSinMov} />
          </>
        )}
      </View>

      {/* Overlay de casilla especial */}
      {fase === 'especial' && especial && (
        <View style={styles.especialBackdrop}>
          <View style={styles.especialCard}>
            <Text style={styles.especialBadge}>⭐ CASILLA ESPECIAL</Text>
            <Text style={styles.especialTexto}>{especial.texto}</Text>
            {enCompeticion && necesitaPicker(especial.efecto.tipo) ? (
              <PrimaryButton
                title={especial.efecto.tipo === 'picker' ? `¿Quién ${verbo(session.tono, 'bebe')}?` : `Repartir ${emoji(session.tono)}`}
                size="m"
                onPress={abrirPickerEspecial}
              />
            ) : (
              <PrimaryButton title="Continuar" size="m" onPress={resolverEspecial} />
            )}
          </View>
        </View>
      )}

      {/* Popup pena: 3 turnos sin salir */}
      {sinSalirPena && (
        <View style={styles.especialBackdrop}>
          <View style={styles.especialCard}>
            <Text style={styles.especialBadge}>⏰ PENA</Text>
            <Text style={styles.especialTexto}>
              {TURNOS_SIN_SALIR} turnos sin sacar ficha.{'\n'}¡{nombres[turno]} {bebeN(session.tono, 1, false)}! {emoji(session.tono)}
            </Text>
            <PrimaryButton
              title={`¡A ${verbo(session.tono, 'beber')}!`}
              size="m"
              onPress={() => {
                setSinSalirPena(false);
                pasarSinMov();
              }}
            />
          </View>
        </View>
      )}

      <SessionMenu visible={menuVisible} onClose={() => setMenuVisible(false)} onReiniciar={reiniciarJuego} />

      <PickerJugadores
        visible={picker !== null}
        modo="multiple"
        titulo={picker?.titulo ?? `¿Quién ${verbo(session.tono, 'bebe')}?`}
        subtitulo={picker?.subtitulo}
        cantidad={picker?.cantidad ?? 1}
        maxTotal={picker?.maxTotal}
        onDone={() => {
          setPicker(null);
          resolverEspecial();
        }}
      />
    </View>
  );
}

// ——— Tablero SVG ————————————————————————————————————————————————

const trackD = TRACK.map(([c, r], i) => `${i === 0 ? 'M' : 'L'} ${cx(c)} ${cy(r)}`).join(' ') + ' Z';

function Tablero({ especiales }: { especiales: Record<number, Efecto> }) {
  return (
    <Svg width={BOARD} height={BOARD} style={StyleSheet.absoluteFill}>
      {/* casas */}
      {HOUSES.map((h, id) => {
        const t = COLORES[id];
        return (
          <G key={id}>
            <Rect x={h.x * CELL + 3} y={h.y * CELL + 3} width={CELL * 4 - 6} height={CELL * 4 - 6} rx={16} fill={t.soft} stroke={t.color} strokeWidth={2} />
            {CASA_SLOTS[id].map((s, i) => (
              <Circle key={i} cx={s.x} cy={s.y} r={11} fill="#fff" stroke={`${t.color}55`} strokeWidth={1.5} />
            ))}
          </G>
        );
      })}
      {/* sendero base */}
      <Path d={trackD} fill="none" stroke="#EDE9FE" strokeWidth={CELL - 6} strokeLinejoin="round" strokeLinecap="round" />
      {/* casillas del recorrido */}
      {TRACK.map(([c, r], i) => {
        const esp = especiales[i];
        const seg = SEGURO.has(i);
        return (
          <Rect
            key={i}
            x={c * CELL + 3}
            y={r * CELL + 3}
            width={CELL - 6}
            height={CELL - 6}
            rx={6}
            fill={esp ? '#EDE9FE' : seg ? '#FEF3C7' : '#fff'}
            stroke={esp ? colors.purple : seg ? '#FBBF24' : '#ECEAF2'}
            strokeWidth={esp || seg ? 2 : 1.4}
          />
        );
      })}
      {/* pasillos de meta */}
      {HOME_PATHS.map((cells, id) => {
        const t = COLORES[id];
        return cells.slice(0, 4).map(([c, r], i) => (
          <Rect key={`${id}-${i}`} x={c * CELL + 3} y={r * CELL + 3} width={CELL - 6} height={CELL - 6} rx={6} fill={t.color} stroke={t.dark} strokeWidth={1.6} />
        ));
      })}
      {/* centro / meta */}
      <Rect x={4 * CELL} y={4 * CELL} width={CELL * 3} height={CELL * 3} rx={10} fill="#fff" stroke="#ECEAF2" strokeWidth={1.5} />
      <Polygon points={`${5.5 * CELL},${4.2 * CELL} ${6.8 * CELL},${5.5 * CELL} ${5.5 * CELL},${6.8 * CELL} ${4.2 * CELL},${5.5 * CELL}`} fill="#EDE9FE" />
    </Svg>
  );
}

// ——— Ficha (círculo con inicial) ————————————————————————————————————

function FichaDot({ color, letra, size = 26 }: { color: number; letra: string; size?: number }) {
  const t = COLORES[color];
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: t.color,
        borderWidth: 2,
        borderColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
        elevation: 3,
      }}>
      <Text style={{ fontFamily: fonts.display, fontSize: size * 0.44, color: '#fff' }}>{letra}</Text>
    </View>
  );
}

// ——— Dado (pips 1-6) ————————————————————————————————————————————

const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [0, 2], [2, 0], [2, 2]],
  5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
  6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
};

function Dado({ valor }: { valor: number }) {
  const pips = PIPS[valor] ?? PIPS[1];
  return (
    <View style={styles.dado}>
      {[0, 1, 2].map((r) =>
        [0, 1, 2].map((c) => {
          const on = pips.some(([pr, pc]) => pr === r && pc === c);
          return <View key={`${r}-${c}`} style={[styles.pip, { backgroundColor: on ? colors.ink : 'transparent' }]} />;
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: 14 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  compPillWrap: { flex: 1 },
  compPill: {
    alignSelf: 'flex-start',
    fontFamily: fonts.bodyX,
    fontSize: 13,
    color: colors.purple,
    backgroundColor: colors.lav100,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  turnoHead: { alignItems: 'center', marginTop: 4, marginBottom: 2, gap: 2 },
  turnoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  turnoDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: '#fff' },
  turnoNombre: { fontFamily: fonts.display, fontSize: 30, letterSpacing: -1, color: colors.ink, flexShrink: 1, textAlign: 'center' },
  boardArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fichaPos: { position: 'absolute', width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  fichaTap: { width: 32, height: 32, borderRadius: 16, borderWidth: 2.5, borderColor: colors.ink, backgroundColor: 'rgba(255,255,255,0.55)' },
  footer: { paddingTop: 8, gap: 10 },
  hint: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.gray, textAlign: 'center' },
  dadoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12 },
  tirarWrap: { flex: 1 },
  tirarBtn: { height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  tirarText: { fontFamily: fonts.display, fontSize: 21, color: colors.white, letterSpacing: -0.3 },
  elegirHint: { fontFamily: fonts.bodyX, fontSize: 14, color: colors.purple, textAlign: 'center', paddingVertical: 18 },
  sinMovTexto: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.gray, textAlign: 'center', marginBottom: 4 },
  // dado
  dado: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 11,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignContent: 'space-between',
    justifyContent: 'space-between',
  },
  pip: { width: 8, height: 8, borderRadius: 4 },
  // especial overlay
  especialBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(13,11,26,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  especialCard: { alignSelf: 'stretch', backgroundColor: colors.white, borderRadius: 22, padding: 24, alignItems: 'center', gap: 14 },
  especialBadge: { fontFamily: fonts.bodyX, fontSize: 11, letterSpacing: 2, color: colors.purple },
  especialTexto: { fontFamily: fonts.display, fontSize: 24, letterSpacing: -0.6, color: colors.ink, textAlign: 'center' },
  // comer
  comerCentro: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, gap: 22 },
  comerBadge: { backgroundColor: 'rgba(239,68,68,0.18)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)', paddingVertical: 7, paddingHorizontal: 18, borderRadius: 30 },
  comerBadgeText: { fontFamily: fonts.display, fontSize: 13, letterSpacing: 2, color: '#FCA5A5' },
  comerFichas: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  comerEmoji: { fontSize: 30 },
  comerTitulo: { fontFamily: fonts.display, fontSize: 34, color: '#fff', letterSpacing: -1.2, textAlign: 'center' },
  comerSub: { fontFamily: fonts.body, fontSize: 15, color: 'rgba(255,255,255,0.6)', textAlign: 'center', maxWidth: 300 },
  // victoria
  victoriaCentro: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  victoriaTrofeo: { fontSize: 64 },
  victoriaFichas: { flexDirection: 'row', gap: 10, marginTop: 10 },
  victoriaOver: { fontFamily: fonts.bodyX, fontSize: 13, letterSpacing: 3, color: 'rgba(255,255,255,0.7)', marginTop: 16 },
  victoriaNombre: { fontFamily: fonts.display, fontSize: 46, letterSpacing: -1.8, color: '#fff', textAlign: 'center', marginTop: 6 },
  victoriaPill: { backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 30, paddingHorizontal: 20, paddingVertical: 11, marginTop: 16 },
  victoriaPillText: { fontFamily: fonts.bodyX, fontSize: 15, color: '#fff' },
});
