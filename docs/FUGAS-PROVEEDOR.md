# Fugas del proveedor en el catálogo público — diagnóstico

**Fecha:** 26/08/2026
**Estado:** diagnóstico. **No se ha modificado nada.** Esperando decisión del dueño.

## Resumen en un minuto

El catálogo público sí filtra datos del proveedor, y la fuga más grave **no está en
los textos, sino en las rutas de las imágenes**: cada foto del catálogo se sirve desde
una carpeta que lleva el nombre de la marca del fabricante. Está vivo ahora mismo en
`econoluz-gt.vercel.app`.

De las 62 apariciones que el informe de `npm run catalogo:auditar` cuenta en las
descripciones, **solo 38 son fugas reales**; el resto son palabras corrientes del
sector o del español que coinciden por casualidad con el nombre que el fabricante le
puso a una línea.

Y la auditoría **tiene un punto ciego**: no detecta los nombres de serie escritos sin
espacios, como la carpeta `magnetrackpro`, que aparece 29 veces en el HTML.

## 1. Las rutas de imagen — fuga real y grave

Cada producto se sirve así:

```
/catalogos/construlita/alto_montaje/eco-industrial-001.webp
/catalogos/highlum/lamparas_exteriorwebp/eco-alto-montaje-001_resultado.webp
/catalogos/artlite/placas/eco-placa-001.webp
/catalogos/construlita/magnetrackpro/...
```

Los nombres de archivo ya están saneados (`eco-industrial-001`), pero **el nivel de
carpeta es la marca del fabricante**. Comprobado con `curl` sobre el sitio real:

| Página | Apariciones en el HTML |
|--------|------------------------|
| `/catalogo` en producción | 240 `construlita`, 110 `highlum`, 41 `artlite` |
| Portada en producción | 10 `construlita`, 10 `highlum` |
| Carpeta `magnetrackpro` | 29 más, que la auditoría no cuenta |

No hace falta ser técnico para verlo: basta con clic derecho sobre una foto y
«copiar dirección de la imagen». Un competidor, o un cliente que quiera comprar
directamente al fabricante, tiene ahí el nombre completo.

### Qué costaría arreglarlo

Es más barato de lo que parece, porque **ninguna imagen está todavía en Vercel Blob**:
las 313 principales y las 78 de galería están en `public/`, versionadas en git.

| | |
|---|---|
| Archivos a mover | 326 (18 MB) en tres carpetas |
| Rutas a cambiar en el código | 391, en `app/data/products.ts` |
| Filas a actualizar en Neon | 313 en `image`, 64 en `images` |
| Huella congelada | Hay que regenerarla: `tests/fixtures/catalog-baseline.json` guarda hashes SHA-256 del catálogo entero, y las rutas entran en el hash |

**Los nombres de archivo no colisionan dentro de cada carpeta, pero sí entre marcas**
(`eco-arquitectonico-001.webp` existe en más de una), así que no se pueden aplanar todas
en una sola carpeta: hay que conservar dos niveles.

Propuesta de nombres, que describen el contenido sin nombrar a nadie:

| Hoy | Propuesta | Qué contiene |
|-----|-----------|--------------|
| `construlita/` | `arquitectonico/` | downlights, arbotantes, minipostes, proyectores, viales |
| `highlum/` | `lineal/` | perfiles de aluminio, tiras, tubos |
| `artlite/` | `electrico/` | placas, apagadores, contactos |
| `construlita/magnetrackpro/` | `arquitectonico/microrriel/` | el sistema de riel magnético |

### Orden seguro de ejecución

Para que no haya ni un minuto con las fotos rotas:

1. **Copiar** (no mover) las imágenes a las carpetas nuevas y desplegar. Durante un rato
   existen las dos rutas y todo sigue funcionando.
2. Actualizar `image` e `images` en Neon con un `replace`.
3. Comprobar el sitio ya servido desde las rutas nuevas.
4. Solo entonces, **y preguntando antes**, borrar las carpetas viejas. Mientras existan,
   quien tenga una URL antigua guardada la sigue viendo, pero ya no se enlazan desde
   ninguna página.

## 2. Los textos — 38 fugas reales

Son nombres de línea del fabricante, y quitarlos **no le quita nada al cliente**: en
todos los casos la frase se sostiene sola.

| Nombre | Textos | Ejemplo actual → propuesta |
|--------|--------|----------------------------|
| Magnetrack Pro | 11 + la etiqueta de familia de 29 productos | ver abajo, es el caso difícil |
| Vialed | 5 | «Luminario vial **Vialed** para proyectos exteriores…» → «Luminario vial para proyectos exteriores…» |
| Vialed UL | 3 | «Luminario vial **Vialed UL** para alumbrado público, con certificación UL…» → «Luminario vial certificado UL para alumbrado público…» |
| Corvus | 3 | «Miniposte **Corvus** para iluminación exterior peatonal…» → «Miniposte para iluminación exterior peatonal…» |
| Nanovia | 3 | «Luminario vial **Nanovia** de cuerpo compacto…» → «Luminario vial de cuerpo compacto…» |
| LED Infinite D2 / D3 COB / D5 Neon | 6 (2 en nombres visibles) | «Tira LED **LED Infinite D3 COB** 110 V» → «Tira LED COB 110 V» |
| Nanovia UL | 1 | «Luminario vial **Nanovia UL** de 40 W…» → «Luminario vial certificado UL de 40 W…» |
| Evolight | 1 | «Familia de luminarias viales **Evolight** de diseño ultra delgado…» → «Luminarias viales de diseño ultra delgado…» |
| Softglow | 1 | «Bolardo **Softglow** de diseño moderno…» → «Bolardo de diseño moderno…» |
| Downled | 1 | «Luminario **Downled** de empotrar…» → «Luminario de empotrar…» |
| Goleta Pro | 1 | etiqueta «Empotrado en piso **Goleta Pro**» → «Empotrado en piso» |
| Roadlight | 1 | etiqueta «Empotrado en piso **Roadlight**» → «Empotrado en piso de alto tránsito» |
| Cubic Bolardo | 1 | etiqueta «**Cubic** Bolardo anti deslumbramiento» → «Bolardo anti deslumbramiento» |

### El caso difícil: Magnetrack Pro

Es el único que **no se puede borrar sin más**. Son 29 productos —luminarias, tapas,
placas de interconexión, drivers— que pertenecen todos al mismo sistema de microrrieles
magnéticos de 48 V, y el cliente necesita entender que encajan entre sí. Si a cada pieza
se le quita el nombre, quedan 29 accesorios sueltos que nadie sabe combinar.

Además es la **etiqueta de familia** visible en los filtros del catálogo, no solo texto
de descripción.

Hay dos salidas, y **es una decisión comercial, no técnica**:

- **Describirlo**: «sistema de microrriel magnético de 48 V». Es exacto, neutro y no
  hay que inventar nada. Queda algo largo como etiqueta de filtro.
- **Bautizarlo**: darle un nombre propio de ECONOLUZ, por ejemplo «Riel Magnético
  ECONOLUZ». Queda mejor en el filtro y construye marca propia, pero hay que decidir el
  nombre y usarlo de forma consistente.

## 3. Falsos positivos — no tocar

Estas 24 apariciones las cuenta la auditoría pero **no son fugas**: son vocabulario del
sector o del español, que el fabricante casualmente usó como nombre de línea. Cambiarlas
empeoraría las descripciones sin proteger nada.

| Palabra | Por qué no es una fuga |
|---------|------------------------|
| **Bronce** (25) | Es un color. «Acabado bronce» es español corriente. |
| **Wallpack** | Término estándar del sector para la luminaria de muro exterior, como «downlight». |
| **Uplight** | Genérico: luz rasante dirigida hacia arriba. |
| **Landscape** | Genérico: iluminación de jardín y paisaje. |
| **Slim** | Genérico: delgado. |
| **Bright** | Aparece dentro de «High Bright SMD LED», que es una especificación técnica. |
| **Canopy CCT**, **Spotlight COB**, **Module** | Vocabulario técnico (marquesina, foco con chip COB, módulo). Si preocupan, basta con escribirlos en minúscula para que no parezcan nombre propio. |

## 4. La auditoría misma tiene un punto ciego

`scripts/audit-supplier-leaks.mjs` busca los nombres **tal cual están escritos** en los
datos del proveedor. No encuentra:

- Las variantes sin espacios: la carpeta `magnetrackpro` frente al nombre «Magnetrack Pro».
- Las variantes sin tildes o con otra caja, si las hubiera.

Conviene que el script normalice —minúsculas, sin tildes, sin espacios ni guiones—
antes de comparar. Es un cambio pequeño y evita volver a dar por limpio algo que no lo está.

## 5. Qué hace falta decidir

1. ¿Se renombran las carpetas de imágenes? Es la fuga grave y la que más trabajo lleva.
2. ¿Cómo se llama el sistema de microrriel: descrito o con nombre propio de ECONOLUZ?
3. ¿Se reescriben los otros 27 textos? Es barato y no se pierde nada.
4. ¿Se arregla el punto ciego de la auditoría?

Nada de esto se toca hasta que el dueño lo apruebe.
