# La Previa — Web

## Estructura de archivos
```
/
├── index.html          ← Landing page principal
├── privacidad.html     ← Política de privacidad
└── README.md           ← Este archivo
```

## Cómo subir a GitHub Pages (gratis)

1. Crea un repositorio en GitHub llamado `laprevia-web` (o el nombre que prefieras)
2. Sube los dos archivos HTML al repositorio
3. Ve a Settings → Pages → Source: "Deploy from a branch" → Branch: main / root
4. En unos minutos tendrás la web en `tuusuario.github.io/laprevia-web`

## Cómo usar con dominio propio (recomendado)

1. Compra el dominio en Namecheap, Porkbun o similar:
   - laprevia.app (~15€/año)
   - laprevia.es (~5€/año)
   - lapreviaapp.com (~12€/año)

2. En GitHub Pages, ve a Settings → Pages → Custom domain
   Escribe tu dominio y guarda

3. En tu registrador de dominio, añade estos registros DNS:
   - Tipo A → 185.199.108.153
   - Tipo A → 185.199.109.153
   - Tipo A → 185.199.110.153
   - Tipo A → 185.199.111.153
   - Tipo CNAME → www → tuusuario.github.io

4. Espera 24-48h a que se propague el DNS

## Antes de publicar — actualizar estos enlaces

En index.html, busca los href="#" de los botones de descarga:
- Botón App Store → reemplazar # con el link real de la App Store cuando esté publicada
- Botón Google Play → reemplazar # con el link real de Google Play cuando esté publicada

En index.html, la sección de screenshots tiene placeholders con emojis.
Cuando tengas capturas reales de la app, puedes reemplazar las screenshot-frame por
etiquetas <img> con las capturas reales.

## URL de política de privacidad para las tiendas

Una vez subida, la URL que hay que poner en Google Play Console y App Store Connect es:
https://tudominio.com/privacidad

(o https://tuusuario.github.io/laprevia-web/privacidad si no usas dominio propio)
