// Verdad o Reto · Configuración — usa la pantalla compartida de niveles

import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';

import { ConfigNiveles } from '@/components/ConfigNiveles';
import { useSession } from '@/context/SessionContext';
import {
  DESBLOQUEO_LIMITE_VOR,
  NIVELES_VOR,
  ORDEN_NIVELES_VOR,
  cartasDeNivelesVoR,
} from '@/data/verdadOReto';

export default function VerdadORetoConfigScreen() {
  const router = useRouter();
  const { session } = useSession();

  useEffect(() => {
    if (session.modo === 'escalada') {
      const niveles = session.intensidad === 'picante'
        ? 'suave,medio,atrevido,limite'
        : 'suave,medio,atrevido';
      router.replace({ pathname: '/verdad-o-reto/jugar', params: { niveles } } as never);
    }
  }, [session.modo]);

  if (session.modo === 'escalada') return null;

  return (
    <ConfigNiveles
      overline="🎯 VERDAD O RETO"
      niveles={ORDEN_NIVELES_VOR.map((id) => ({
        id,
        nombre: NIVELES_VOR[id].nombre,
        descripcion: NIVELES_VOR[id].descripcion,
        dot: NIVELES_VOR[id].dot,
        emoji: NIVELES_VOR[id].emoji,
        esPlus18: NIVELES_VOR[id].esPlus18,
        nCartas: cartasDeNivelesVoR([id]).length,
      }))}
      desbloqueoId={DESBLOQUEO_LIMITE_VOR}
      duraciones={[30, 60, 100]}
      persistKeyDuracion="verdad-o-reto"
      duracionHint="De cada tipo: verdades y retos (selección aleatoria)"
      onEmpezar={(seleccion, duracion) =>
        router.push({
          pathname: '/verdad-o-reto/jugar',
          params: { niveles: seleccion.join(','), ...(duracion ? { duracion: String(duracion) } : {}) },
        })
      }
    />
  );
}
