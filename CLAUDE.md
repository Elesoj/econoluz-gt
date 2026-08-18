@AGENTS.md

# ECONOLUZ GT — Guía del proyecto

Este archivo define el contexto, las reglas y las convenciones del proyecto.
Léelo completo antes de proponer o escribir código.

---

## 1. Qué es este proyecto

Rediseño completo del sitio web de **ECONOLUZ (Asesoría Profesional en Iluminación, S.A.)**,
empresa guatemalteca de iluminación fundada en 2006, con sede en Guatemala City
(21 Avenida 0-18, Vista Hermosa 2, Zona 15) y presencia en Quetzaltenango.

El sitio anterior (`econoluzgt.com`) está construido en WordPress + Elementor y funciona
como landing page informativa. Este proyecto lo reemplaza por completo.

### Reposicionamiento estratégico

ECONOLUZ está migrando de **proveedor de iluminación commodity** hacia
**soluciones integradas de iluminación arquitectónica y techo tensado**, dirigidas a
arquitectos, desarrolladores y el sector construcción.

El sitio debe reflejar ese posicionamiento: técnico, curado, con criterio de especificación.
No es una ferretería en línea; es una casa de iluminación que además vende al detalle.

---

## 2. Los dos públicos — regla crítica

El sitio atiende **dos modelos de negocio distintos que NO deben mezclarse**
en la misma interfaz, el mismo flujo ni los mismos componentes de decisión.

### Pista A — TIENDA (B2C, transaccional)

- **Quién:** cliente individual, compra 1 a 5 luminarias para su casa.
- **Qué necesita:** precio visible, foto grande, disponibilidad, carrito, pago en línea, envío.
- **Decisión:** rápida, visual, guiada por precio y estética.
- **Navegación:** filtros por ambiente (sala, cocina, dormitorio, exterior), estilo y precio.
- **Salida esperada:** compra completada en línea.

### Pista B — PROYECTOS (B2B, especificación)

- **Quién:** arquitecto, diseñador, desarrollador, constructora, contratista.
- **Qué necesita:** ficha técnica (lúmenes, IRC, temperatura de color, ángulo de apertura,
  IP, vida útil, archivos IES/fotométricos), garantía, tiempos de entrega, referencias de obra.
- **Decisión:** lenta, técnica, comparativa, con presupuesto de proyecto.
- **Regla de precio:** en esta pista **NO se muestran precios**. Se cotiza.
- **Flujo:** armar lista de especificación → solicitar cotización → asesoría.
- **Salida esperada:** solicitud de cotización con datos completos del proyecto.

> Si una propuesta de diseño o de código hace que un usuario dude entre "¿compro o cotizo?",
> está mal resuelta. La separación debe ser evidente desde el home.

**Techo tensado** es una línea diferenciadora de la pista B. Ningún competidor local lo
ofrece integrado con iluminación. Debe tener presencia propia, no quedar escondido.

### Estado actual — la pista A todavía no existe

Lo que hay construido hoy es solo pista B: catálogo guiado, ficha técnica, lista de
cotización y salida por WhatsApp. De la pista A no hay nada: **ni precios, ni carrito,
ni checkout, ni pasarela de pago, ni autenticación, ni base de datos.**

El sitio es estático. Todos los datos viven en `app/data/*.ts` y la única salida de
cualquier formulario es un mensaje de WhatsApp. **Toda la tienda B2C está por construir**,
y con ella los requisitos operativos de la sección 8 (FEL, pago, inventario, marco legal).

---

## 3. Marca y reglas visuales

### Colores

La marca son **dos colores sobre base neutra**, ambos extraídos del logo
(`public/logo_econoluz.png`): azul marino y rojo.

- Azul marino de marca: `#001B59` — color dominante del logo (77 % de sus píxeles opacos:
  la bombilla, "LAMPARAS", "LUZ" y la barra inferior).
  Como fondo de botón con texto blanco: **16.1:1**, pasa AAA.
- Rojo de marca: `#E11133` — el rojo de "ECONO" (23 % de los píxeles opacos).
  Como fondo de botón con texto blanco: **4.85:1**, pasa AA para texto de cualquier tamaño;
  no llega a AAA. Si en algún control hace falta más margen, la variante oscura
  `#B80D28` da 6.7:1 sin cambiar el tono percibido.
- Neutro oscuro (base): `#0A0A0A` — fondo de secciones oscuras, hero y footer.
  Superficies elevadas sobre él: `#171717` y `#262626`.
- Neutro claro / fondo: `#FFFFFF` — fondo por defecto.
  Superficie alterna `#FAFAFA`, bordes y separadores `#E5E5E5`.
- Texto primario / secundario:
  - Sobre fondo claro: primario `#171717`, secundario `#525252`, terciario `#737373`
  - Sobre fondo oscuro: primario `#FFFFFF`, secundario `#D4D4D4`, terciario `#A1A1A1`

Todos estos valores son los de la escala `neutral` de Tailwind v4 que el código ya usa
(`neutral-950/900/800/200/50`, más `black` y `white`), así que se pueden escribir como
clases utilitarias sin definir tokens nuevos. `#FFFFFF` y `#171717` ya están fijados como
`--background` y `--foreground` en `app/globals.css`. Contraste sobre su fondo:
`#525252` 7.8:1, `#737373` 4.7:1, `#D4D4D4` 13.4:1, `#A1A1A1` 7.7:1 — todos pasan AA.

**Límites de contraste que hay que respetar** (los dos colores de marca son oscuros, así
que funcionan sobre blanco pero no sobre la base oscura):

| Uso | Ratio | Veredicto |
|---|---|---|
| Botón `#001B59` + texto blanco | 16.1:1 | AAA |
| Botón `#E11133` + texto blanco | 4.85:1 | AA |
| Texto `#001B59` sobre `#FFFFFF` | 16.1:1 | AAA |
| Texto `#E11133` sobre `#FFFFFF` | 4.85:1 | AA |
| Texto `#E11133` sobre `#0A0A0A` | 4.08:1 | **falla AA** — solo texto grande |
| Texto `#001B59` sobre `#0A0A0A` | 1.23:1 | **inservible** — no usar nunca |

Para secciones de fondo oscuro, usar las variantes claras en lugar de los hex de marca:
`#F2415F` (rojo, 5.4:1 sobre `#0A0A0A`) y `#5B7FD4` (azul, 5.1:1 sobre `#0A0A0A`).
Son variantes de pantalla, no colores de marca: no aparecen en logo ni en material impreso.

**Regla de uso de las variantes:** `#F2415F` y `#5B7FD4` se usan para **texto,
iconos y bordes** sobre fondo oscuro, nunca como relleno de botón. Sobre secciones
oscuras los botones primarios van en blanco o con borde, para no tener dos rojos de marca
distintos conviviendo en la misma pantalla.

Hoy **no hay ningún token de marca definido en el proyecto**: el código es blanco, negro y
escala `neutral`. Ni el rojo ni el azul marino se usan todavía en ninguna parte.

### Regla de uso del color

Azul marino y rojo son **colores de acento y de acción**. Ninguno de los dos es fondo
dominante. La base del sitio es neutra: blanco y negro con la escala `neutral`.

- Sí: botones, estados hover, subrayados, indicadores activos, filetes, iconografía,
  encabezados de ficha, detalles.
- No: fondos de sección completos, bloques grandes, headers sólidos —
  ni en rojo ni en azul marino.

**Razón:** en iluminación arquitectónica premium, la fotografía de obra es el protagonista.
Un fondo neutro deja respirar las imágenes y hace que el color de marca resalte más
precisamente por usarse poco. Cualquiera de los dos en grandes áreas saturadas compite
con las fotos y abarata la percepción de la marca. Que ahora haya dos colores no es
permiso para usar el doble de color: es el mismo presupuesto de color, repartido.

El azul marino admite algo más de superficie que el rojo — una barra, un pie de ficha,
una franja de datos técnicos — porque es oscuro y de baja luminosidad, más cercano a un
neutro. El rojo no: siempre en piezas pequeñas.

### El color codifica la pista, no decora

Regla funcional, no estética. Cada color de marca pertenece a una de las dos pistas
de la sección 2:

- **Rojo `#E11133` → pista A (TIENDA).** Comprar, precio, agregar al carrito, checkout,
  cualquier acción transaccional B2C.
- **Azul marino `#001B59` → pista B (PROYECTOS).** Ficha técnica, especificación,
  agregar a la lista, solicitar cotización, asesoría, techo tensado.

Un botón rojo siempre lleva a comprar; uno azul marino siempre lleva a cotizar.
El usuario debe poder aprender ese código en la primera pantalla y confiar en él después.

Consecuencias prácticas:

- Si un componente necesita los dos colores a la vez, probablemente esté mezclando las
  dos pistas y hay que separarlo.
- Los neutros son el vehículo compartido: todo lo que sirve a ambas pistas
  (navegación, tipografía, tarjetas, fondos) se resuelve en neutro.
- El color no puede ser el único indicador de la pista. Debe ir acompañado de texto
  ("Comprar" / "Cotizar") para que funcione en daltonismo rojo-verde y en escala de grises.

### Tono visual

Sobrio, con aire, tipografía clara y jerarquía marcada. Las fotos de proyectos reales
(Borghetto, BMW, Torre Once, San Martin, Insigne, Casa Campo, La Estación, Quo, Veka,
Desigual, Geely, Perfiles LED) son el activo visual más fuerte del sitio: dales espacio.

---

## 4. Stack técnico

- Framework: Next.js `16.2.6` — **App Router**. Todo el código vive en `app/`;
  no existe `pages/`, ni `src/`, ni rutas de API, ni `middleware.ts`.
- Lenguaje: **TypeScript** `5.9.3` en modo `strict`, sobre React `19.2.4`.
  Alias de importación: `@/*` → raíz del proyecto.
- Estilos: **Tailwind CSS v4** (`4.3.0`) vía `@tailwindcss/postcss`.
  Configuración CSS-first: **no hay `tailwind.config.*`**; los tokens se declaran con
  `@import "tailwindcss"` y `@theme inline` dentro de `app/globals.css`.
- Tipografía: `Geist` y `Geist Mono` cargadas con `next/font/google` en `app/layout.tsx`.
- Gestor de paquetes: **npm** (`package-lock.json`; no hay lockfile de pnpm ni yarn).
- Lint: ESLint 9 con `eslint-config-next` (`core-web-vitals` + `typescript`) — `npm run lint`.
- Deploy: Vercel (`econoluz-gt.vercel.app`)
- Base de datos: `TODO — aún no definida`
- Pasarela de pago: `TODO — pendiente de decidir`
- Certificador FEL: `TODO — pendiente de decidir`

### Estructura de carpetas

El repositorio git está en `frontend/`, no en la carpeta que lo contiene.

```text
frontend/
  app/                            App Router: rutas, componentes y datos
    layout.tsx                    layout raíz, metadata global y fuentes
    page.tsx                      home
    globals.css                   Tailwind, tokens CSS y utilidades propias
    favicon.ico
    calculadora-led/page.tsx      calculadora de ahorro LED
    catalogo/page.tsx             catálogo guiado y flujo de cotización
    politica-devoluciones/page.tsx
    components/                   UI compartida (11 componentes)
                                  AnimatedStat, ContactCTA, FloatingWhatsApp,
                                  LedSavingsCalculator, ProductCard,
                                  ProductTechnicalDrawer, ProjectSlider,
                                  QuoteDrawer, SectionHeader, SiteFooter, SiteNavbar
    data/                         datos estáticos; no hay backend ni base de datos
      products.ts                 catálogo de productos, specs y filtros
      catalogTaxonomy.ts          taxonomía de tipos y aplicaciones
      projects.ts                 galería de obra ejecutada
      siteData.ts                 navegación, contacto, home, FAQ, marcas
    lib/formatters.ts             formateo de números y moneda
  public/
    logo_econoluz.png
    catalogos/<marca>/<familia>/  imágenes de producto (artlite, construlita, highlum)
    proyectos/<obra>/             fotografía de obra ejecutada
    proveedores/                  logos de marcas representadas
    file|globe|next|vercel|window.svg   assets de create-next-app, sin usar
  AGENTS.md                       reglas de Next.js autogeneradas (se incluye desde aquí)
  next.config.ts  tsconfig.json  postcss.config.mjs  eslint.config.mjs
```

Fuera de `frontend/`, la carpeta hermana `Imagenes/` guarda el original del logo.
No entra en el build ni está en el repositorio.

### Regla crítica de versión

Esta versión de Next.js tiene cambios que rompen compatibilidad: las APIs,
convenciones y estructura de archivos pueden diferir de tus datos de
entrenamiento. Antes de escribir código, consulta la guía correspondiente en
`node_modules/next/dist/docs/`. Atiende los avisos de deprecación.

---

## 5. Convenciones de contenido

- **Idioma:** español de Guatemala. Nada de español neutro forzado ni traducciones literales.
- **Moneda:** Quetzales, formato `GTQ 1,250.00` o `Q1,250.00` (usar uno solo de forma consistente).
- **Teléfonos:** formato local de 8 dígitos con espacio (`2311 1846`, `4042 8790`).
  Los enlaces `tel:` y `wa.me` sí llevan código de país (`+502`).
- **Fechas:** formato `DD/MM/AAAA`.
- **Medidas:** sistema métrico (m², metros, lúmenes, watts, Kelvin).
- **Tono de copy:** técnico pero legible. Evitar superlativos vacíos
  ("los mejores", "líderes del mercado"). Preferir dato concreto.

---

## 6. Reglas de código

- No introducir dependencias nuevas sin justificarlas primero.
- Componentes reutilizables entre las dos pistas donde tenga sentido, pero
  **sin acoplar la lógica de compra con la lógica de cotización**.
- Todo formulario debe persistir el dato antes de abrir WhatsApp
  (ver "Deuda técnica conocida").
- Accesibilidad: contraste suficiente, textos alternativos en imágenes,
  navegación por teclado funcional.
- Rendimiento: las imágenes **ya están optimizadas** (430 archivos, 24 MB en total,
  ninguna supera 210 KB) y los `sizes` actuales son correctos. No hace falta
  recomprimir nada. Al añadir imágenes nuevas, mantener `next/image` con `sizes`
  coherentes con el layout real, y **nunca cargar rutas crudas de `/public`
  saltándose el optimizador** (es lo que hace hoy el precargado de `ProjectSlider`,
  que descarga cada foto dos veces).
- Mobile first. En Guatemala la mayoría del tráfico llega desde celular.

---

## 7. Deuda técnica conocida

Problemas ya identificados en la versión actual. No los repitas y ayúdame a resolverlos:

1. **Los contadores del home muestran cero** ("+0 Referencias", "0 Eficiencia",
   "0 Cobertura", "+0 Clientes satisfechos"). Además, métricas como "Eficiencia: 0%"
   no comunican nada — reemplazar por datos duros y verificables.
2. **No hay captura de leads.** El formulario de asesoría solo arma un mensaje de
   WhatsApp. Si el usuario cancela o no tiene WhatsApp, el lead se pierde sin dejar
   registro. Debe guardarse primero (base de datos o correo) y luego abrir WhatsApp.
3. **Falta `og:image`** y el `twitter:card` está en `summary` en lugar de
   `summary_large_image`. Casi todo se comparte por WhatsApp en Guatemala.
4. **Regresión de SEO.** El sitio viejo posiciona para "lámparas LED Guatemala".
   El título nuevo ("Catálogo de iluminación por cotización") no lo busca nadie.
   Hay que conservar las palabras clave reales y mapear redirects 301 desde las
   URLs viejas de WordPress.
5. **Xela está subrepresentado.** El sitio anterior tenía páginas dedicadas
   que probablemente generan tráfico local; ahora solo hay menciones en el footer.

---

## 8. Requisitos operativos de Guatemala

Aplican a la pista de tienda y condicionan el diseño del checkout:

- **Factura electrónica (FEL/SAT):** toda venta requiere factura electrónica.
  El checkout debe capturar NIT y nombre fiscal como mínimo.
- **Pasarela de pago:** evaluar opciones locales y dejar transferencia bancaria
  con confirmación manual como alternativa.
- **Marco legal:** términos y condiciones, política de privacidad, política de envíos
  y política de devoluciones específica para compra en línea (la actual fue redactada
  para otro contexto). Obligaciones de información al consumidor ante DIACO.
- **Inventario:** definir si la tienda sincroniza con el inventario interno o mantiene
  el suyo. No debe poderse vender producto inexistente.

---

## 9. Qué NO tocar

- Los assets de proyectos en `/public/proyectos/` — 104 archivos de fotografía propia de
  obra ejecutada, en 12 carpetas (`bmw`, `borghetto`, `casaycampo`, `desigual`, `geely`,
  `insigne`, `laestacion`, `once`, `perfilesled`, `quo`, `sanmartin`, `veka`).
  `app/data/projects.ts` arma las rutas con el nombre de carpeta y de archivo literales:
  renombrar cualquiera de los dos rompe la galería sin que falle el build.
- Las imágenes de catálogo en `/public/catalogos/` — 326 archivos organizados por
  `marca/familia` y referenciados con ruta literal desde `app/data/products.ts`.
  Mismo riesgo: mover o renombrar rompe el catálogo en silencio.
  Los PDF fuente están excluidos del repositorio por `.gitignore` (`/public/catalogos/*.pdf`).
- Los logos de `/public/proveedores/` — 10 marcas representadas. Hoy no los referencia
  ningún componente, pero no son basura: no borrarlos por parecer huérfanos.
- El logo (`/public/logo_econoluz.png`) — no recortar, recolorear ni regenerar.
- El bloque de `AGENTS.md` entre `BEGIN:nextjs-agent-rules` y `END:nextjs-agent-rules`
  lo genera Next.js y lo sobrescribe. Las reglas propias van en este archivo.
- Archivos generados: `.next/`, `node_modules/`, `next-env.d.ts`.
- Datos de contacto, direcciones y horarios (`app/data/siteData.ts`: teléfonos, WhatsApp,
  dirección): solo se cambian si yo lo indico expresamente.
- No publicar ni desplegar nada sin confirmación explícita.
- No borrar archivos sin preguntar antes.

---

## 10. Cómo quiero trabajar

- Antes de una tarea grande, propón el plan y espera mi aprobación.
- Si detectas un problema fuera del alcance de lo que pedí, dímelo, no lo arregles por tu cuenta.
- Prefiero evaluación honesta y directa antes que confirmación de lo que ya pensé.
  Si una idea mía es mala, dilo y explica por qué.
- Trabajo por ramas de git: cada bloque grande (tienda, proyectos, migración SEO)
  en su propia rama.
