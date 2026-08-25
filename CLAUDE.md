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

El sitio atiende **dos modelos de negocio distintos con necesidades opuestas**, y el
catálogo tiene que servir a los dos **sobre el mismo producto**.

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
- **Regla de precio:** el precio unitario de tienda **no sirve** para decidir aquí. El
  volumen se cotiza.
- **Flujo:** armar lista de especificación → solicitar cotización → asesoría.
- **Salida esperada:** solicitud de cotización con datos completos del proyecto.

### Las dos salidas conviven — decisión vigente

**El catálogo va a ser una tienda B2C sin dejar de ser un catálogo de cotización.** Un
mismo producto ofrece las dos salidas: quien necesita dos luminarias las paga en línea,
y quien necesita doscientas pide cotización, porque nadie compra un proyecto con tarjeta.

Esto **sustituye a la regla anterior**, que exigía separar las dos pistas en interfaces,
flujos y componentes distintos, y describía la tienda como una sección aparte. Se
descartó: obligaba a duplicar el catálogo entero y a que el visitante eligiera bando
antes de haber visto un producto.

> Lo que sí sigue vigente: si una propuesta hace que el usuario dude entre "¿compro o
> cotizo?", está mal resuelta. Antes eso se conseguía separando; ahora hay que conseguirlo
> con jerarquía dentro de la misma ficha — una acción principal clara y la otra disponible
> sin competir con ella.

**Techo tensado** es una línea diferenciadora de la pista B. Ningún competidor local lo
ofrece integrado con iluminación. Debe tener presencia propia, no quedar escondido.

### Estado actual — la pista A todavía no existe

Lo que hay construido hoy es solo pista B: catálogo guiado, ficha técnica, lista de
cotización y salida por WhatsApp. De la pista A no hay nada: **ni precios, ni carrito,
ni checkout, ni pasarela de pago, ni autenticación.** Ningún producto tiene precio ni
existencias hoy: son datos que todavía no existen en ninguna parte, ni en el código.

**Los productos ya no viven en el código: viven en Postgres (Neon).** La tabla
`products` guarda los 313, y `/catalogo` los lee de ahí filtrando por `published`.
`app/data/products.ts` sigue existiendo, pero dejó de ser la fuente de verdad: ahora es
la red de seguridad si la base de datos no responde, y lo que protegen las pruebas de
base. Editarlo **no cambia lo que ve el visitante mientras Neon conteste**, pero sí
cambia el catálogo de respaldo y sí cambia cualquier entorno sin `DATABASE_URL` —el
desarrollo local, por ejemplo—. Para cambiar la web se edita la base de datos.

`POST /api/leads` guarda las solicitudes de asesoría en la misma base de datos, y está
verificado en producción. La galería de proyectos y el resto del contenido siguen en
`app/data/*.ts`.

Lo que falta para la autonomía es el **panel de administración**: hoy los productos
están en base de datos pero no hay ninguna pantalla para tocarlos. El plan paso a paso
está en `docs/CONTINUAR-PANEL.md`. **Toda la tienda B2C está por construir**, y con
ella los requisitos operativos de la sección 8 (FEL, pago, inventario, marco legal).

**La entrada al panel ya está escrita**, en la rama `panel-admin-auth` y todavía sin
fusionar: varios usuarios en Neon, contraseñas con `scrypt`, sesiones revocables con
HMAC-SHA-256, límite persistente de intentos y caducidad tras doce horas sin actividad.
`/admin` redirige a `/admin/entrar` si no hay sesión, y el panel queda fuera de los
buscadores. El diseño está en
`docs/superpowers/specs/2026-08-25-admin-auth-design.md` y el plan TDD en
`docs/superpowers/plans/2026-08-25-admin-auth.md`.

**El panel ya está activo en local (25/08/2026).** `db/003_admin.sql` está aplicado en
Neon, `ADMIN_SESSION_SECRET` está en `.env.local`, y el primer administrador se creó con
`npm run admin:crear`. Se comprobó entrando de verdad en `http://localhost:3000/admin`.

Su portada muestra el estado real del catálogo leído de Postgres —hoy **313 productos,
313 publicados, 0 con precio**—, que es la forma de ver de un vistazo lo que falta.

**Lo que sigue pendiente y bloquea el despliegue:** añadir el mismo
`ADMIN_SESSION_SECRET` a Vercel. Sin él, el panel no funcionará en el sitio publicado.
Y la rama sigue sin fusionar: nada de esto se ha subido ni desplegado.

Verificación de esa rama: `npm run test:admin` en verde, `typecheck` y `lint` limpios,
`build` correcto y la batería completa de Playwright con el único fallo histórico de
`catalog-quote.spec.ts:891`.

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

Los dos colores están definidos como tokens en `app/globals.css` (`--proyectos`,
`--tienda`, sus variantes fuertes y claras, más `--error` y `--foco`) y se usan en todo
el sitio. El azul marino sustituyó al negro como color oscuro; el rojo marca la acción
principal y los acentos.

### Cuánto color, y dónde no

El blanco sigue siendo el fondo dominante y la fotografía de obra sigue siendo la
protagonista: en iluminación arquitectónica, las imágenes venden más que cualquier
superficie de color.

- El **azul marino admite superficie**: barras, franjas de datos, secciones completas.
  Es oscuro y de baja luminosidad, así que se comporta casi como un neutro y deja
  respirar la fotografía. El sitio original lo usa exactamente así.
- El **rojo va siempre en piezas pequeñas**: el botón principal de cada pantalla, las
  etiquetas en mayúsculas, los filetes, los iconos, el ítem activo del menú. Nunca como
  fondo de una sección ni de un bloque grande.

Que haya dos colores no es permiso para usar el doble de color. Una pantalla con tres
botones rojos no tiene una acción principal: tiene tres, que es lo mismo que ninguna.

**Excepción sobre fotografía:** los velos y degradados que oscurecen una imagen se
quedan en negro con transparencia (`bg-black/55`, `rgba(0,0,0,…)`). Teñirlos de azul
le daría un tinte de color a las fotos de obra.

### Reparto del color, tomado del sitio original

Regla vigente desde que se decidió replicar la identidad de `econoluzgt.com`. Su
hoja de estilos usa exactamente los mismos dos hex que este documento ya fijaba
(`#E11133` 29 veces, `#001B59` 19 veces), así que el reparto de abajo no es una
interpretación: es el del sitio que la empresa ya tenía.

- **Blanco `#FFFFFF`** — el fondo. Es el color dominante y no se discute.
- **Azul marino `#001B59`** — títulos grandes, fondos de sección oscuros, la barra
  de navegación en su estado normal, contornos, estados seleccionados, contadores
  y acciones secundarias.
- **Rojo `#E11133`** — la acción principal de cada pantalla (una sola por vista),
  las etiquetas en mayúsculas sobre fondo claro, los filetes bajo los títulos, los
  iconos y el ítem activo del menú.

En el original el rojo aparece de las dos formas: como relleno del botón principal
con texto blanco, y como color de texto en botones secundarios sin fondo. Ambas
son legítimas aquí.

**Sustituye a la regla anterior**, que reservaba el rojo para una pista de tienda
B2C y el azul marino para la de proyectos. Esa separación se descartó: la tienda no
existe, y mantener el rojo apagado hasta que existiera dejaba el sitio sin la mitad
de su identidad. El código funcional lo lleva ahora el texto del botón, no su color.

**Límite de contraste que sigue vigente:** el rojo sobre azul marino da 3.33:1, así
que **nunca hay texto rojo sobre una sección azul marino**. Un botón rojo sí puede
ir sobre azul marino, porque como bloque sólido le basta con 3:1 y el texto blanco
encima da 4.85:1. Sobre secciones oscuras, el texto blanco no baja de `white/52`
(5.17:1 sobre azul marino); `white/46` se queda en 4.30:1 y no cumple.

### Tono visual

Sobrio, con aire, tipografía clara y jerarquía marcada. Las fotos de proyectos reales
(Borghetto, BMW, Torre Once, San Martin, Insigne, Casa Campo, La Estación, Quo, Veka,
Desigual, Geely, Perfiles LED) son el activo visual más fuerte del sitio: dales espacio.

---

## 4. Stack técnico

- Framework: Next.js `16.3.1` — **App Router**. Todo el código vive en `app/`;
  no existe `pages/`, ni `src/`, ni `middleware.ts`. La única ruta de API es
  `app/api/leads/route.ts`.
  La versión importa: `16.2.6` duplicaba el ancla de la URL al navegar entre secciones
  (`/#inicio#inicio`) y se subió a `16.3.1` para corregirlo. No bajar de ahí.
- Lenguaje: **TypeScript** `5.9.3` en modo `strict`, sobre React `19.2.4`.
  Alias de importación: `@/*` → raíz del proyecto.
- Estilos: **Tailwind CSS v4** (`4.3.0`) vía `@tailwindcss/postcss`.
  Configuración CSS-first: **no hay `tailwind.config.*`**; los tokens se declaran con
  `@import "tailwindcss"` y `@theme inline` dentro de `app/globals.css`.
- Tipografía: `Geist` y `Geist Mono` cargadas con `next/font/google` en `app/layout.tsx`.
- Gestor de paquetes: **npm** (`package-lock.json`; no hay lockfile de pnpm ni yarn).
- Lint: ESLint 9 con `eslint-config-next` (`core-web-vitals` + `typescript`) — `npm run lint`.
- Pruebas: **Playwright** (`playwright.config.ts`, carpeta `tests/`). El navegador es
  `channel: "msedge"`; **chromium no está instalado**, así que un `npx playwright test`
  que asuma chromium falla. Levanta su propio servidor en el puerto `3100`.
- Deploy: Vercel (`econoluz-gt.vercel.app`), automático al empujar a `main` en GitHub
  (`Elesoj/econoluz-gt`). **El dominio `econoluzgt.com` todavía apunta al WordPress viejo**;
  cambiar el DNS es tarea del dueño del proyecto, no del código.
- Base de datos: **Postgres 18 en Neon**, con `@neondatabase/serverless`, creada desde el
  Marketplace de Vercel (región AWS US East 1). Tablas: `leads`, `products` y
  `schema_migrations`. Las migraciones se aplican con `npm run db:migrar`, que es
  repetible. `DATABASE_URL` está en `.env.local` (ignorado por git) y en Vercel.
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
    politica-devoluciones/page.tsx
    catalogo/                     catálogo guiado y flujo de cotización
      page.tsx                    servidor: arma el payload público
      CatalogClient.tsx           cliente: filtros, buscador, paginación
      catalogState.ts  useCatalogNavigation.ts  quoteSelection.ts
      useQuoteSelection.ts  quotePersistence.ts  floatingQuoteStore.ts
      publicQuoteMessage.ts       texto de la cotización que sale por WhatsApp
    api/leads/route.ts            única ruta de API: guarda el lead en Neon
    components/                   UI compartida (12 componentes + ui/)
                                  AnimatedStat, ContactCTA, FloatingWhatsApp,
                                  LedSavingsCalculator, ProductCard,
                                  ProductTechnicalDrawer, ProjectSlider,
                                  QuoteDrawer, SectionHeader, SiteFooter,
                                  SiteNavbar, SupplierMarquee
      ui/                         Button, FilterChip
    data/
      products.ts                 los 313 productos escritos a mano (~9 900 líneas).
                                  YA NO es la fuente de verdad: manda la base de datos.
                                  Es la red si Neon no responde y la base de las pruebas.
      productRow.ts               traducción producto <-> fila, y listas de columnas
      publicProduct.ts            recorta el producto interno a lo que ve el navegador
      catalog.server.ts           lee el catálogo de Postgres, con caché por etiqueta
                                  (CATALOG_CACHE_TAG) y vuelta al código si falla
      catalogTaxonomy.ts          taxonomía pública de tipos y aplicaciones
      catalogBrands.internal.ts   marcas del proveedor — NUNCA llega al cliente
      catalogSeries.internal.ts   series del proveedor — NUNCA llega al cliente
      productReferences.ts        referencias públicas de producto
      projects.ts                 galería de obra ejecutada
      siteData.ts                 navegación, contacto, home, FAQ, proveedores
    lib/formatters.ts             formateo de números y moneda
  db/                             migraciones SQL, se aplican en orden con db:migrar
    001_leads.sql                 solicitudes de asesoría
    002_products.sql              catálogo de productos, comentado campo por campo
  scripts/                        utilidades de línea de comandos (ver "Comandos")
  docs/CONTINUAR-PANEL.md         hoja de traspaso: qué falta y cómo hacerlo
  tests/                          Playwright: catálogo, cotización y fronteras de datos
  public/
    logo_econoluz.png
    catalogos/<marca>/<familia>/  imágenes de producto (artlite, construlita, highlum)
    proyectos/<obra>/             fotografía de obra ejecutada
    proveedores/                  logos de marcas representadas
    file|globe|next|vercel|window.svg   assets de create-next-app, sin usar
  AGENTS.md                       reglas de Next.js autogeneradas (se incluye desde aquí)
  next.config.ts  tsconfig.json  postcss.config.mjs  eslint.config.mjs
  playwright.config.ts  .env.example
```

### El catálogo público no expone los datos del proveedor

Regla de negocio, no de estilo: el cliente **no debe poder identificar al fabricante** ni
irse a comprarle directamente.

**Lo que está garantizado hoy:** los campos internos del proveedor —`sku`, `brand`,
`supplierBrand`, `supplierCode`, `productCode`, la serie— **no cruzan al catálogo
público**. Viven en los archivos `*.internal.ts` y en las columnas `supplier_*` de la
base de datos, y `publicProduct.ts` decide qué pasa. No basta con ocultarlos en
pantalla: tampoco pueden aparecer en el JavaScript que se descarga, y
`tests/catalog-production-boundary.spec.ts` revisa los chunks compilados precisamente
para eso.

**Lo que todavía no está resuelto:** quedan nombres heredados del proveedor dentro de
las rutas de las imágenes, de los textos de las descripciones y de la taxonomía —30
nombres en unas 556 apariciones, ver la sección 7—. Es deuda conocida y documentada,
no un descuido: la regla describe la intención y el mecanismo, no un estado ya
alcanzado.

**Alcance de la prohibición:** se refiere al **catálogo público y a cualquier visitante
sin sesión**. El panel de administración, detrás de autenticación, necesariamente envía
esos datos al navegador de quien administra, porque son los que tiene que editar. Lo que
no puede ocurrir es que acaben en un chunk compartido que se descargue en las páginas
públicas.

Al añadir cualquier vista nueva —filtro, ficha, buscador, resumen de cotización,
pantalla del panel— hay que comprobar que no reabre esa puerta.

Fuera de `frontend/`, la carpeta hermana `Imagenes/` guarda el original del logo.
No entra en el build ni está en el repositorio. Hay también una carpeta `app/` vacía,
resto de un movimiento antiguo.

**Abre `frontend/` como carpeta de trabajo, no la carpeta que la contiene.** Las
herramientas que cargan instrucciones solas las buscan desde la raíz del proyecto hasta
la carpeta de trabajo, sin bajar a subcarpetas: abriendo la carpeta padre no encuentran
`AGENTS.md` y se programa sin ninguna de estas reglas. Hay punteros en la carpeta padre
por si acaso, pero están fuera del repositorio y no viajan con un clon.

### Comandos

```bash
npm run dev                # servidor de desarrollo
npm run build              # compilación de producción
npm run typecheck          # tsc --noEmit
npm run lint
npx playwright test        # batería completa

npm run db:migrar          # aplica las migraciones de db/ que falten, repetible
npm run catalogo:importar  # sube los productos del código a Neon y verifica el resultado
npm run catalogo:verificar # ensayo de la migración, sin tocar la base de datos
npm run catalogo:auditar   # busca nombres de proveedor en el catálogo público
```

Los scripts de `scripts/` importan los datos `.ts` del proyecto sin compilar, gracias
al gancho `register-ts.mjs`. Cualquier script nuevo que haga lo mismo necesita
`--import ./scripts/register-ts.mjs`.

**La consola es Windows PowerShell 5.1 y no entiende `&&`.** Los comandos que se le den
al dueño del proyecto van en líneas separadas.

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

1. **Contadores del home: resuelto.** Mostraban cero porque dos de las cuatro cifras no
   eran números ("Eficiencia", "Cobertura") y el contador animado las llevaba a `0`.
   Ahora la banda repite las cifras del sitio original —`+500` lámparas, `11` marcas,
   `9` proveedores, `+1,000` clientes satisfechos— y `AnimatedStat` deja pasar sin animar
   cualquier valor que no tenga dígitos, en vez de convertirlo en cero.
2. **Captura de leads: resuelta, con el aviso por correo pendiente.** El formulario
   de asesoría ya guarda el lead en Postgres (Neon) mediante `POST /api/leads` antes
   de abrir WhatsApp, así que deja de perderse si el usuario no tiene WhatsApp, si el
   salto falla o si nunca llega a pulsar enviar.

   **Pendiente: la notificación por correo.** El envío con Resend está implementado
   pero desactivado, porque el dominio del correo corporativo lo controla un tercero
   al que no tenemos acceso y no se puede verificar el remitente. Mientras falten
   `RESEND_API_KEY`, `LEADS_EMAIL_FROM` y `LEADS_EMAIL_TO`, el envío se omite, queda
   constancia en el log del servidor y **el lead se guarda igual**: el usuario ve la
   confirmación normal, no un error. Cuando se recupere el control del dominio basta
   con definir esas tres variables en Vercel; no hay que tocar código.

   Hasta entonces, las solicitudes solo se ven consultando la tabla `leads`. Conviene
   revisarla a diario o el lead se guarda pero nadie se entera. Queda ahí una solicitud
   de prueba (`id = 1`, «PRUEBA TECNICA - no es un cliente») que sirvió para comprobar
   que producción guardaba de verdad; se puede borrar cuando el dueño quiera.
3. **El catálogo público todavía nombra a los proveedores.** `npm run catalogo:auditar`
   lo lista: **30 nombres distintos en unas 556 apariciones**, en dos formas.

   - **Las rutas de las fotos** (`/catalogos/construlita/…`, `/highlum/…`, `/artlite/…`)
     llevan la marca en el nombre de la carpeta, en los 313 productos. El nombre del
     archivo sí está anonimizado; la carpeta no. Se ve con clic derecho sobre una foto.
     Se arregla con código.
   - **Los textos**: «Magnetrack Pro», «Nanovia», «Corvus», «Vialed», «Wallpack»,
     «Softglow»… en 62 descripciones y 22 fichas técnicas. Y «Magnetrack Pro» y
     «Wallpacks» son además **categorías visibles del filtro**. Esto será mucho más
     fácil de corregir cuando exista el panel y el dueño pueda editar los textos él.

   El dueño ya lo sabe. Es contenido, no un fallo: **no cambiarlo sin hablarlo con él.**
4. **Una prueba falla desde antes de la migración.**
   `tests/catalog-quote.spec.ts:891` falla de forma determinista. Comprobado sobre el
   código anterior a la base de datos: falla igual. Las otras 87 pasan. No perder tiempo
   creyendo que es una regresión.
5. **Falta `og:image`** y el `twitter:card` está en `summary` en lugar de
   `summary_large_image`. Casi todo se comparte por WhatsApp en Guatemala.
6. **Regresión de SEO.** El sitio viejo posiciona para "lámparas LED Guatemala".
   El título nuevo ("Catálogo de iluminación por cotización") no lo busca nadie.
   Hay que conservar las palabras clave reales y mapear redirects 301 desde las
   URLs viejas de WordPress.
7. **Xela está subrepresentado.** El sitio anterior tenía páginas dedicadas
   que probablemente generan tráfico local; ahora solo hay menciones en el footer.
8. **`app/components/ui/FilterChip.tsx` quedó sin usar** al retirar el filtro de series.
   No se borró porque la sección 9 prohíbe borrar archivos sin preguntar antes.

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
- Los logos de `/public/proveedores/` — 11 marcas representadas. Los usa la cinta
  `SupplierMarquee` del home, con las rutas literales de `siteData.ts`.
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
- **Quiero cargar y corregir el contenido yo mismo**, sin pedírselo a un programador.
  Cualquier dato que yo vaya a mantener —productos, precios, existencias, fotos— no
  debería nacer escrito dentro del código.
- Recuérdame en qué punto del plan general estamos, no solo el plan de la tarea de hoy.
- **Mantén los `.md` al día mientras trabajas, no al final.** Actualizar este archivo y
  `docs/CONTINUAR-PANEL.md` forma parte de terminar un paso, igual que pasar las
  pruebas. Trabajo a caballo entre herramientas y con límite de tokens: si la
  documentación describe un estado que ya no existe, quien retome el proyecto —otra
  persona u otro agente— actuará sobre información falsa.

---

## 11. Hoja de ruta

El orden importa: cada paso desbloquea al siguiente.

**Publicar lo que ya existe.** `DATABASE_URL` ya está en Vercel y las solicitudes de
asesoría se guardan de verdad en producción, comprobado enviando una al sitio publicado.
**Sigue pendiente apuntar el DNS de `econoluzgt.com` a Vercel**: hoy ese dominio todavía
sirve el WordPress viejo y solo `econoluz-gt.vercel.app` tiene el sitio nuevo. Es una
tarea de paneles, no de código, y la hace el dueño del proyecto.

**Paso 1 — Productos en base de datos y panel de administración.** En curso.

- ~~Los 313 productos a Postgres~~, verificados campo por campo contra la huella
  congelada del catálogo.
- ~~Que `/catalogo` los lea de la base de datos~~, comprobado despublicando un producto
  y viendo que la página pasaba de 313 a 312.
- La entrada al panel está implementada y probada en la rama `panel-admin-auth`, a
  falta de aplicar la migración, definir el secreto de sesión y crear el primer usuario.
  Después faltan el panel de productos, la subida de fotos a Vercel Blob y la galería
  de proyectos.
  **El plan detallado de cada uno está en
  `docs/CONTINUAR-PANEL.md`**, escrito para poder retomarse sin contexto previo.

**Paso 2 — Tienda.** Precio y compra conviviendo con la cotización: carrito, checkout con
NIT, cobro, factura FEL y existencias. Depende del paso 1, porque sin panel no hay dónde
cargar precios ni stock.

**En paralelo, y sin código de por medio:** contratar certificador FEL, decidir el medio
de cobro, redactar los textos legales de venta en línea y —lo más lento— fijar los precios.

**La cotización no se retira en ningún momento.**
