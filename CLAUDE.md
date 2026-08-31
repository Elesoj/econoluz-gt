@AGENTS.md

# ECONOLUZ GT — Guía del proyecto

Este archivo define el contexto, las reglas y las convenciones del proyecto.
Léelo completo antes de proponer o escribir código.

---

## 0. Estado de las decisiones (30/08/2026) — léelo antes que nada

El 30/08/2026 el dueño aprobó el rediseño del backend y del modelo de datos. La referencia
son estos dos documentos:

- `docs/superpowers/specs/2026-08-30-backend-relacional-v2-design.md` — el diseño global.
- `docs/superpowers/specs/2026-08-30-fundamentos-backend-design.md` — el primer subproyecto.

Ese rediseño **deroga reglas que todavía aparecen más abajo en este archivo**. Para que
nadie confunda lo que existe con lo que se decidió, lo afectado se reparte en tres
categorías.

### 0.1 Lo que existe hoy en el código y en producción

- El carrito avisa cuando se piden más unidades de las apuntadas en `products.stock` y
  ofrece «Dejar solo N» o «Quiero N y espero».
  `app/tienda/disponibilidad.server.ts` lo resuelve consultando la base de datos.
- El panel permite escribir existencias en el listado y en la ficha del producto.
- La columna `products.stock` existe y tiene valor en 24 de los 313 productos.

**Todo eso sigue funcionando y no se toca todavía.**

### 0.2 Decisiones futuras ya aprobadas por el dueño

- **ECONOLUZ no manejará stock, inventario, bodegas ni reservas.** La empresa no almacena
  mercancía: cada producto se le pide al proveedor cuando alguien lo compra. El modelo
  nuevo no tiene ninguna tabla de inventario, y **`stock` no debe reaparecer en la API
  nueva bajo ninguna forma**. Lo que ocupa su lugar es el plazo de entrega estimado, el
  estado «pendiente de confirmar con el proveedor» y el reembolso si no puede servirlo.

**Ninguna propuesta nueva puede reintroducir inventario.** Si un párrafo de este archivo
parece pedirlo, está derogado por esta sección.

### 0.3 Lo que solo se elimina después, en su tarea correspondiente

| Qué | Cuándo | Requisito |
|---|---|---|
| `products.stock`, `app/tienda/disponibilidad.server.ts`, el aviso del carrito y sus pruebas | Subproyecto 11 | Autorización expresa del dueño |
| `app/data/products.ts` como respaldo | Subproyecto 11 | Autorización expresa |

Leer esta documentación **no ejecuta** ninguna de esas retiradas ni basta como
autorización: ambas siguen necesitando el visto bueno expreso del dueño en su momento.

---

## 1. Qué es este proyecto

Rediseño completo del sitio web de **ECONOLUZ (Asesoría Profesional en Iluminación, S.A.)**,
empresa guatemalteca de iluminación fundada en 2006, con sede en Guatemala City
(21 Avenida 0-18, Vista Hermosa 2, Zona 15).

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
- **Qué necesita:** precio visible, foto grande, plazo de entrega, carrito, pago en línea, envío.
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

### Las dos salidas conviven, pero no en la misma tarjeta — decisión vigente

**El catálogo es una tienda; la cotización vive en `/asesoria`.** Las dos salidas siguen
existiendo, pero cada producto ofrece **una sola**: el que tiene precio se compra, y el
que no lo tiene lleva a la asesoría con su referencia puesta. Quien necesita doscientas
luminarias sigue teniendo su vía, porque nadie compra un proyecto con tarjeta.

**Redacción anterior, derogada el 26/08/2026:** «un mismo producto ofrece las dos
salidas». Estuvo vigente unas horas y el dueño la retiró al verla: dos botones que
empiezan igual —«Agregar a cotización» y «Agregar al carrito»— obligan al visitante a
elegir sin saber en qué se diferencian, y dejaban dos cestos abiertos a la vez.

Y **antes de eso**, la regla exigía separar las dos pistas en interfaces y componentes
distintos, con la tienda como sección aparte. También se descartó: obligaba a duplicar
el catálogo entero.

**La asesoría tiene página propia desde el 26/08/2026.** El formulario de proyecto vivía
dentro de `/catalogo` y ocupaba media página: el dueño señaló que ahí no cabe un
comprador individual, y tenía razón. Ahora está en **`/asesoria`**, y el catálogo cierra
con una franja que enlaza a ella. **Las dos salidas siguen conviviendo** —esto no
resucita la separación derogada—: lo que cambió es la jerarquía dentro del catálogo, no
que la cotización desaparezca.

`app/catalogo/ProjectAdvisory.tsx` es autónomo: su propio estado y su propia lectura de
la selección, que viaja entre páginas por el almacenamiento del navegador. La página
carga el catálogo entero porque la selección se guarda como referencias y cantidades.

Cuando exista el carrito habrá que rematar la jerarquía en la ficha de producto: comprar
como acción principal, cotizar disponible sin competir.

> Lo que sí sigue vigente: si una propuesta hace que el usuario dude entre "¿compro o
> cotizo?", está mal resuelta. Antes eso se conseguía separando; ahora hay que conseguirlo
> con jerarquía dentro de la misma ficha — una acción principal clara y la otra disponible
> sin competir con ella.

**Techo tensado** es una línea diferenciadora de la pista B. Ningún competidor local lo
ofrece integrado con iluminación. Debe tener presencia propia, no quedar escondido.

### Estado actual — la pista A ya tiene carrito

Lo construido es casi todo pista B: catálogo guiado, ficha técnica, lista de cotización
y salida por WhatsApp. **De la pista A ya existen el precio y el carrito**: el catálogo
muestra el precio en la tarjeta y en la ficha, y donde no hay precio cargado dice
«Precio a consultar». Siguen sin existir **checkout, pasarela de pago y facturación**.

#### El catálogo es una tienda — regla vigente (26/08/2026)

**El catálogo dejó de ofrecer cotización producto a producto.** Ya no hay cesto de
selección, ni cajón lateral, ni botón «Ver selección»: se retiraron por decisión del
dueño junto con sus 671 líneas de código y 1.581 de pruebas. Deroga la redacción
anterior de «§2 Las dos salidas conviven» en lo que toca al catálogo.

Lo que sí convive, y no se retira: la página `/asesoria` sigue siendo la vía para
proyectos grandes. Las tarjetas **sin precio** llevan a ella con
`?producto=ECO-…`, porque son 288 de 313 y sin esa salida se quedarían sin ninguna
acción posible.

#### Tener precio es estar a la venta — regla vigente (26/08/2026)

No hay ninguna casilla de «se vende en línea». **Un producto con precio se puede
comprar; uno sin precio, no.** La columna `sellable_online` existe en la base de datos
pero no se usa, y su casilla se retiró de la ficha del panel: obligaba a hacer dos cosas
para vender una, y con más de trescientos productos administrados por una sola persona,
cada casilla extra es una tarea multiplicada por trescientos y un producto más que puede
quedar a medio configurar sin que nadie lo note. Lo decidió el dueño al preguntar qué era
esa casilla. Se pierde poder enseñar un precio de referencia sin vender el producto; es
un caso que hoy no existe, y la columna sigue ahí por si vuelve a hacer falta.

**Consecuencia que hay que tener presente:** ponerle precio a un producto lo pone a la
venta en cuanto se despliega. No hay una segunda confirmación.

#### El carrito

Vive en `app/tienda/`, separado a propósito del motor de cotización de
`app/catalogo/quoteSelection.ts`: los dos flujos divergen desde el primer día y la
cotización no debe cargar con precios ni existencias. La página es `/carrito` y el
contador aparece en la barra de navegación **solo cuando hay algo dentro**.

**Ningún importe que venga del navegador se acepta como bueno.** El navegador guarda
referencia y cantidad, nunca precios: se resuelven contra el catálogo del servidor cada
vez que se pinta. Si el importe viajara en el navegador, cualquiera podría editar su
propio `localStorage` y comprar un panel por un quetzal. Esta regla se hereda al
checkout y al cobro. El dinero se suma en **centavos enteros** (`app/tienda/lineas.ts`);
`formatPrice` solo se usa al pintar.

> **Comportamiento actual, con retirada ya aprobada (§0.2).** Lo que sigue describe lo
> que hace hoy el carrito en producción. La empresa no maneja inventario, así que este
> aviso desaparecerá en el subproyecto 11. No construyas nada nuevo encima.

Las existencias **avisan y dejan elegir, nunca bloquean**: cuando se piden más
unidades de las apuntadas, la línea ofrece llevarse las disponibles o esperar por el
resto, y la espera aceptada queda marcada para poder contactar al cliente. Solo pasa
cuando hay un número apuntado —la casilla vacía significa «no se ha contado el
inventario», que no es lo mismo que cero—.

**El inventario NO baja al catálogo público.** Estuvo saliendo en el HTML de los 313
productos entre el 26/08/2026 y ese mismo día, y llegó a producción: cualquiera podía
leer las existencias enteras sin comprar nada. Ahora el carrito pregunta al servidor
(`app/tienda/disponibilidad.server.ts`) solo por lo que lleva dentro, y el número se
revela únicamente cuando no alcanza. `tests/tienda-carrito.spec.ts` lo vigila.

El precio se enseña **por decisión expresa del dueño (26/08/2026)**, aunque la tienda no
esté: si el catálogo va a ser B2C, quien compra una o dos piezas necesita ver el precio
antes de decidir. Se le advirtió de las dos pegas —la competencia ve las tarifas y hoy
casi ningún producto tiene precio cargado— y aun así lo prefirió así. Es reversible:
basta con dejar de pintar `priceGtq` en `ProductCard` y en la ficha.

**Los productos ya no viven en el código: viven en Postgres (Neon).** La tabla
`products` guarda los 313, y `/catalogo` los lee de ahí filtrando por `published`.
`app/data/products.ts` sigue existiendo, pero dejó de ser la fuente de verdad: ahora es
la red de seguridad si la base de datos no responde, y lo que protegen las pruebas de
base. Editarlo **no cambia lo que ve el visitante mientras Neon conteste**, pero sí
cambia el catálogo de respaldo y sí cambia cualquier entorno sin `DATABASE_URL` —el
desarrollo local, por ejemplo—. Para cambiar la web se edita la base de datos.

`POST /api/leads` guarda las solicitudes de asesoría en la misma base de datos, y está
verificado en producción. La galería de proyectos también vive ya en Neon; el resto del
contenido editorial del home sigue en `app/data/*.ts`.

**El panel de administración existe y funciona.** Su acceso está protegido con usuarios
en Neon, contraseñas con `scrypt`, sesiones revocables con HMAC-SHA-256, límite
persistente de intentos y caducidad tras doce horas sin actividad. `/admin` redirige a
`/admin/entrar` sin sesión, y el panel no es indexable. El diseño está en
`docs/superpowers/specs/2026-08-25-admin-auth-design.md` y el plan que se siguió en
`docs/superpowers/plans/2026-08-25-admin-auth.md`.

**Toda la tienda B2C sigue por construir**, y con ella los requisitos operativos de la
sección 8 (FEL, pago, marco legal).

**El panel ya está activo en local (25/08/2026).** `db/003_admin.sql` está aplicado en
Neon, `ADMIN_SESSION_SECRET` está en `.env.local`, y el primer administrador se creó con
`npm run admin:crear`. Se comprobó entrando de verdad en `http://localhost:3000/admin`.

**El panel de productos está terminado.** El dueño puede buscar entre los 313, escribir
precio y existencias directamente en el listado, publicar y despublicar, editar la ficha
completa de cualquier producto —nombre, descripción, foto, galería, clasificación y ficha
técnica— y **dar de alta productos nuevos**, con la referencia puesta automáticamente y
la foto subida desde el navegador a Vercel Blob. Las fichas de producto son de servidor,
que es lo que mantiene los datos del proveedor fuera del JavaScript descargable.

Su portada muestra el estado real del catálogo leído de Postgres —hoy **313 productos,
313 publicados, 0 con precio**—, que es la forma de ver de un vistazo lo que falta.

**El panel de proyectos está terminado y activo en Neon.** Permite crear, editar,
ordenar, publicar y ocultar proyectos; ordenar y retirar fotografías de forma reversible;
y subir varias imágenes directamente a Vercel Blob. `app/data/projects.ts` se conserva
como respaldo si Neon no responde. La web pública mantiene el mismo diseño y orden.

**Publicado el 26/08/2026.** El dueño autorizó el despliegue: los 50 commits se
fusionaron en `main` y se subieron a GitHub, y Vercel desplegó solo. `econoluz-gt.vercel.app`
sirve ya el catálogo con precios, la galería desde Neon y el panel en `/admin`.
`ADMIN_SESSION_SECRET` se añadió a Vercel como *Secret* del entorno Production antes de
subir, para que el primer despliegue lo tuviera.

La rama de trabajo era `panel-admin`; tras la fusión, **`main` es la rama viva**. El
siguiente bloque grande —la tienda— va en su propia rama, como pide la sección 10.

Verificación del 25/08/2026: `npm run test:admin` **129/129**, `typecheck` y `lint`
limpios, `build` correcto y Playwright **95/96**, con el único fallo histórico de
`catalog-quote.spec.ts:891`. Neon contiene 12 proyectos publicados y las 104 fotos
originales visibles; además queda oculta la imagen Blob de la prueba real.

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
  Marketplace de Vercel (región AWS US East 1). Ocho tablas: `leads`, `products`,
  `admin_users`, `admin_sessions`, `admin_login_attempts`, `projects`, `project_images`
  y `schema_migrations`. Las migraciones se aplican con `npm run db:migrar`, que es
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
      publicProductContract.ts    contrato público seguro para componentes cliente
      publicProductPrivacy.ts     anonimiza textos y rutas solo al salir al público
      catalogBrands.internal.ts   marcas del proveedor — NUNCA llega al cliente
      catalogSeries.internal.ts   series del proveedor — NUNCA llega al cliente
      productReferences.ts        referencias públicas de producto
      projects.ts                 galería de obra ejecutada
      projectRow.ts               traducción reversible proyecto <-> filas
      projects.server.ts          lectura pública desde Neon, caché y respaldo local
      projectsQuery.ts            consulta y reconstrucción del contrato público
      siteData.ts                 navegación, contacto, home, FAQ, proveedores
    lib/formatters.ts             formateo de números y moneda
    admin/                        el panel, detrás de autenticación
      layout.tsx                  metadata `noindex` del panel entero
      entrar/                     pantalla de acceso pública
      (panel)/                    zona protegida: portada, productos y proyectos
      sesion/route.ts             renovación de la sesión por actividad
      auth/                       criptografía, políticas, repositorio y la DAL
      productos/                  consultas, validación, fotos y Server Actions
      proyectos/                  consultas, validación, orden, fotos y subidas Blob
      panelStats.ts               las cifras del catálogo que abren la portada
  db/                             migraciones SQL, se aplican en orden con db:migrar
    001_leads.sql                 solicitudes de asesoría
    002_products.sql              catálogo de productos, comentado campo por campo
    003_admin.sql                 usuarios, sesiones e intentos de acceso del panel
    004_projects.sql              galería de proyectos y sus fotografías
  scripts/                        utilidades de línea de comandos (ver "Comandos")
  docs/CONTINUAR-PANEL.md         hoja de traspaso: qué falta y cómo hacerlo
  tests/                          Playwright: catálogo, cotización y fronteras de datos
  public/
    logo_econoluz.png
    catalogos/                    imágenes de producto; las rutas públicas usan
                                  arquitectonico/, lineal/ y electrico/
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

**Resuelto y desplegado el 26/08/2026:**
`publicProductPrivacy.ts` transforma únicamente la proyección pública. Las imágenes
salen por `arquitectonico/`, `lineal/` y `electrico/`; los nombres de línea se retiran;
y `Magnetrack Pro` pasa a «Microrriel magnético 48 V», incluido su identificador de
filtro. `npm run catalogo:auditar` normaliza mayúsculas, tildes, espacios y guiones y
devuelve **0 coincidencias**. El producto interno y las columnas `supplier_*` no se
tocan: el panel conserva marca, serie, código y nombre del fabricante.

Las 326 imágenes originales siguen en sus carpetas antiguas porque no se borra ningún
archivo sin permiso. Producción ya sirve y enlaza las 326 rutas neutras; los originales
se retirarán únicamente después de recibir autorización expresa.

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
npm run test:proveedores   # frontera pública neutra e información interna intacta
npm run proyectos:verificar # ensayo reversible de los 12 proyectos y 104 fotos
npm run proyectos:importar  # importa a Neon de forma idempotente y relee el resultado
npm run proyectos:probar    # prueba cambios reales en Neon y los restaura siempre

npm run test:admin         # las pruebas de unidad del panel (129)
npm run admin:crear        # da de alta un administrador o le cambia la contraseña
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
- **Ningún importe que venga del navegador se acepta como bueno.** El navegador guarda
  referencias y cantidades; los precios se resuelven siempre contra el catálogo del
  servidor. Vale para el carrito, el checkout y el cobro.
- **El dinero se suma en centavos enteros**, nunca en coma flotante. `formatPrice` solo
  al pintar.
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
3. **Exposición pública del proveedor: resuelta y desplegada el 26/08/2026.** La salida
   pública transforma rutas, nombres, descripciones, taxonomía y
   ficha técnica sin modificar el producto interno. La auditoría revisa 313 productos y
   408 identificadores normalizados y devuelve 0 coincidencias. La prueba específica
   confirma además que el panel conserva Artlite, Construlita, Highlum y Magnetrack Pro.
   Ver `docs/FUGAS-PROVEEDOR.md`.

   **Queda un cabo suelto:** las carpetas de imágenes antiguas
   (`/catalogos/construlita/…`) siguen existiendo y **responden 200 en producción** si
   alguien conoce la URL —comprobado el 26/08/2026—, aunque ninguna página las enlaza ya.
   Borrarlas cierra la fuga del todo y **necesita autorización expresa del dueño**.
4. **Una prueba falla desde antes de la migración.**
   `tests/catalog-quote.spec.ts:891` falla de forma determinista. **Comprobado otra vez el
   26/08/2026** haciendo `git checkout main` y ejecutándola sin nada del trabajo nuevo:
   falla igual. En la batería de ese día pasan las otras 103 y las 169 de unidad. No
   perder tiempo creyendo que es una regresión.
5. **Falta `og:image`** y el `twitter:card` está en `summary` en lugar de
   `summary_large_image`. Casi todo se comparte por WhatsApp en Guatemala.
6. **Regresión de SEO.** El sitio viejo posiciona para "lámparas LED Guatemala".
   El título nuevo ("Catálogo de iluminación por cotización") no lo busca nadie.
   Hay que conservar las palabras clave reales y mapear redirects 301 desde las
   URLs viejas de WordPress.
7. **`app/components/ui/FilterChip.tsx` quedó sin usar** al retirar el filtro de series.
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
- **Plazo de entrega y confirmación del proveedor:** ECONOLUZ no almacena mercancía, así
  que **no hay inventario que gestionar ni sincronizar**. Cada producto se le pide al
  proveedor cuando alguien lo compra. Lo que sí hay que resolver es el plazo de entrega
  que se le promete al cliente y qué ocurre cuando el proveedor no puede servir algo ya
  pagado: el pedido queda «pendiente de confirmar con el proveedor», y si no puede
  servirse se cancela y se reembolsa. Ver §0.2.
  *(Nota: hasta el 30/08/2026 este punto pedía definir la sincronización con un
  inventario interno. Quedó derogado.)*

---

## 9. Qué NO tocar

- Los assets de proyectos en `/public/proyectos/` — 104 archivos de fotografía propia de
  obra ejecutada, en 12 carpetas (`bmw`, `borghetto`, `casaycampo`, `desigual`, `geely`,
  `insigne`, `laestacion`, `once`, `perfilesled`, `quo`, `sanmartin`, `veka`).
  `app/data/projects.ts` arma las rutas con el nombre de carpeta y de archivo literales:
  renombrar cualquiera de los dos rompe la galería sin que falle el build.
- Las imágenes de catálogo en `/public/catalogos/`: las 326 originales organizadas por
  proveedor y sus 326 copias públicas neutras. `app/data/products.ts` conserva las rutas
  internas y `publicProductPrivacy.ts` decide la ruta que recibe el visitante. No borrar
  las originales hasta verificar el despliegue y recibir autorización expresa.
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
  Cualquier dato que yo vaya a mantener —productos, precios, fotos— no
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

**Paso 1 — Productos en base de datos y panel de administración.** Terminado en local.

- ~~Los 313 productos a Postgres~~, verificados campo por campo contra la huella
  congelada del catálogo.
- ~~Que `/catalogo` los lea de la base de datos~~, comprobado despublicando un producto
  y viendo que la página pasaba de 313 a 312.
- ~~La entrada al panel~~, activa y usada: usuarios en Neon, sesiones revocables y
  límite de intentos.
- ~~El panel de productos~~: listado con edición en línea, ficha completa y alta de
  productos nuevos.
- ~~La subida de fotos~~ a Vercel Blob, con el almacén ya creado y probado.
- ~~La galería de proyectos~~: 12 proyectos y 104 fotos visibles en Neon, edición,
  orden, publicación, retirada reversible y subida múltiple desde el panel.
  **El plan detallado de cada uno está en
  `docs/CONTINUAR-PANEL.md`**, escrito para poder retomarse sin contexto previo.

**Desplegado el 26/08/2026** en `econoluz-gt.vercel.app`, con autorización expresa del
dueño. Sigue pendiente apuntar el DNS de `econoluzgt.com`.

La anonimización del proveedor también se fusionó en `main` y se verificó en producción
el 26/08/2026: 326 rutas neutras, 0 rutas antiguas enlazadas y 0 identificadores sensibles
en el HTML y los recursos públicos revisados. Las carpetas originales siguen presentes
hasta recibir permiso separado para borrarlas.

**Paso 2 — Tienda.** Precio y compra conviviendo con la cotización. Se descompone en
cuatro piezas, y solo la primera está hecha:

- ~~**A. El carrito.**~~ Terminado y **fusionado en `main` el 26/08/2026**, todavía sin
  desplegar. Diseño en `docs/superpowers/specs/2026-08-26-tienda-carrito-design.md`,
  plan en `docs/superpowers/plans/2026-08-26-tienda-carrito.md`.
- **B. Checkout con datos fiscales (NIT).** No depende de nadie de fuera de la empresa,
  pero sí de cuatro subproyectos anteriores: 2 (identidad), 3 (catálogo relacional),
  5 (carrito persistente) y 9 (envíos). Es el subproyecto 6.
- **C. El cobro.** **Bloqueado**: depende de contratar una pasarela de pago, trámite que
  el dueño todavía no ha empezado. Puede llevar semanas. Eligió cobro con tarjeta.
- **D. Factura FEL.** Bloqueado: depende de contratar un certificador.

*(Nota: hubo una pieza E, «descuento de existencias». Se retiró el 30/08/2026 porque no
hay existencias que descontar, ver §0.2.)*

### El paso 2 se reorganizó el 30/08/2026

Las piezas B, C y D siguen siendo necesarias, pero **ya no se construyen sueltas sobre el
backend actual**. El diseño aprobado las reparte en diez subproyectos, cada uno con su
especificación, su plan, sus pruebas y un punto de revisión con el dueño:

1. Fundamentos y capa de datos · 2. Identidad de clientes · 3. Catálogo relacional v2 ·
5. Carrito persistente · 6. Checkout y pedidos · 7. Pasarela de pago (bloqueado) ·
8. Facturación FEL (bloqueado) · 9. Envíos · 10. API v1 y preparación móvil ·
11. Migración final y retirada del modelo antiguo.

**No existe un subproyecto 4:** era inventario y reservas, y desapareció con la decisión
de §0.2.

**Lo siguiente que se puede construir es el subproyecto 1**, no la pieza B. El orden y el
motivo están en la sección 10 del diseño global. Nada de eso empieza sin autorización
expresa del dueño para el plan y, después, para la implementación.

**En paralelo, y sin código de por medio:** contratar la pasarela de pago y el
certificador FEL, redactar los textos legales de venta en línea y —lo más lento— fijar
los precios (hoy 25 de 313).

**La cotización no se retira en ningún momento.**
