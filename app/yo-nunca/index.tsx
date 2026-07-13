// Yo Nunca · Configuración — usa la pantalla compartida de niveles

import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';

import { ConfigNiveles } from '@/components/ConfigNiveles';
import { useSession } from '@/context/SessionContext';
import {
  DESBLOQUEO_LIMITE,
  NIVELES_YO_NUNCA,
  ORDEN_NIVELES,
  cartasDeNiveles,
} from '@/data/yoNunca';

export default function YoNuncaConfigScreen() {
  const router = useRouter();
  const { session } = useSession();

  useEffect(() => {
    if (session.modo === 'escalada') {
      const niveles = session.intensidad === 'picante'
        ? 'suave,medio,atrevido,limite'
        : 'suave,medio,atrevido';
      router.replace({ pathname: '/yo-nunca/jugar', params: { niveles } } as never);
    }
  }, [session.modo]);

  if (session.modo === 'escalada') return null;

  return (
    <ConfigNiveles
      overline="🙊 YO NUNCA"
      niveles={ORDEN_NIVELES.map((id) => ({
        id,
        nombre: NIVELES_YO_NUNCA[id].nombre,
        descripcion: NIVELES_YO_NUNCA[id].descripcion,
        dot: NIVELES_YO_NUNCA[id].dot,
        emoji: NIVELES_YO_NUNCA[id].emoji,
        esPlus18: NIVELES_YO_NUNCA[id].esPlus18,
        nCartas: cartasDeNiveles([id]).length,
      }))}
      desbloqueoId={DESBLOQUEO_LIMITE}
      duraciones={[30, 60, 100]}
      persistKeyDuracion="yo-nunca"
      duracionHint="Cartas por partida (selección aleatoria)"
      onEmpezar={(seleccion, duracion) =>
        router.push({
          pathname: '/yo-nunca/jugar',
          params: { niveles: seleccion.join(','), ...(duracion ? { duracion: String(duracion) } : {}) },
        })
      }
    />
  );
}
