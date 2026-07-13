// Shell HTML del export web de Expo Router (solo web; nativo no tiene HTML).
// Envuelve TODAS las páginas estáticas. Se renderiza en Node durante `expo export`.
//
// AdSense: el <script> de adsbygoogle.js SOLO se inyecta si está configurada la
// variable de entorno EXPO_PUBLIC_ADSENSE_CLIENT (ca-pub-…). Mientras esté vacía,
// no se carga ningún script de anuncios (placeholder inactivo). Ver WEB_ADSENSE.md.

import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

const ADSENSE_CLIENT = process.env.EXPO_PUBLIC_ADSENSE_CLIENT ?? '';

// Fondo de la página = color del "gutter" del encuadre web (evita flash blanco
// antes de montar y da continuidad al letterbox de escritorio).
const baseStyle = `
html, body { background-color: #E4DEF3; }
#root, body { height: 100%; }
`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        <meta
          name="description"
          content="La Previa: juegos para fiestas y previas. 15+ juegos para jugar en grupo directamente desde el navegador, gratis."
        />

        {/*
          Google AdSense — inactivo hasta rellenar EXPO_PUBLIC_ADSENSE_CLIENT.
          Cuando haya aprobación, definir esa variable y este script se inyecta solo.
        */}
        {ADSENSE_CLIENT ? (
          <script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
            crossOrigin="anonymous"
          />
        ) : null}

        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: baseStyle }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
