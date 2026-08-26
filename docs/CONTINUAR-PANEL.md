# Cómo continuar el panel de administración de ECONOLUZ

Documento de traspaso. Está escrito para que **otra persona u otro agente** (Codex,
por ejemplo) pueda seguir el trabajo sin haber estado en las conversaciones previas.

**Antes de escribir una sola línea de código, lee `frontend/CLAUDE.md` completo.**
Ahí están las reglas del proyecto, la marca, las convenciones y lo que no se toca.
Este documento no las repite: las da por leídas.

**Carpeta de trabajo: `frontend/`.** El panel y la anonimización del catálogo público ya
están integrados en `main` y publicados.

**Publicado el 26/08/2026:** `main` recibió los 50 commits y Vercel desplegó.
`econoluz-gt.vercel.app` sirve el catálogo con precios, la galería desde Neon y el panel
en `/admin`. `econoluzgt.com` sigue apuntando al WordPress viejo: ese cambio de DNS lo
hace el dueño.

---

## 0. Estado en dos minutos (última actualización: 26/08/2026)

> **Exposición del proveedor resuelta y desplegada (26/08/2026).**
> `publicProductPrivacy.ts` transforma solo lo que recibe el visitante: rutas neutras,
> nombres de línea anonimizados y «Microrriel magnético 48 V» en lugar de
> `Magnetrack Pro`. El panel conserva marca, serie, código y nombre del fabricante.
> `npm run catalogo:auditar` revisa 313 productos y 408 identificadores normalizados:
> 0 coincidencias. Las 326 imágenes originales siguen sin borrarse; las 326 copias
> neutras son idénticas byte a byte. Producción sirve las 326 rutas neutras y no enlaza
> ninguna ruta antigua. No hizo falta modificar Neon.

> **El carrito existe (26/08/2026), fusionado en `main` y sin desplegar.** Motor en
> `app/tienda/`, página `/carrito` con los totales calculados en el servidor, contador en
> la barra de navegación que solo aparece con algo dentro, y la tarjeta del catálogo con
> **un solo camino por producto**: con precio, «Agregar al carrito»; sin precio, «Agregar
> a cotización». Diseño en
> `docs/superpowers/specs/2026-08-26-tienda-carrito-design.md`, plan en
> `docs/superpowers/plans/2026-08-26-tienda-carrito.md`.
>
> **La casilla `sellable_online` se retiró del panel**: ahora tener precio es estar a la
> venta. La columna sigue en la base de datos, sin usar. Ver `CLAUDE.md` §2.

> **El catálogo dejó de cotizar (26/08/2026, sin desplegar).** Por decisión del dueño se
> retiró el cesto de cotización del catálogo —671 líneas de código y 1.581 de pruebas,
> borradas con su autorización—. Las tarjetas sin precio ofrecen **«Consultar precio»**,
> que lleva a `/asesoria?producto=ECO-…`; la página de asesoría sigue viva y enseña el
> producto consultado. El carrito pasó a **botón flotante** abajo a la derecha. Y cuando
> se piden más unidades de las que hay, la línea ofrece **«Dejar solo N»** o **«Quiero N y
> espero»**, y la espera aceptada queda marcada.
>
> **El inventario ya no baja al navegador.** Estuvo en el HTML de los 313 productos y
> llegó a producción; se corrigió el mismo día. El carrito ahora pregunta al servidor
> (`app/tienda/disponibilidad.server.ts`) solo por lo que lleva dentro. **Producción
> sigue sirviendo la versión con el fallo hasta que se despliegue esto.**
>
> **Ya no hay ninguna prueba en rojo**: 182 de unidad, 3 de privacidad y 67 de navegador.
> El fallo histórico de `catalog-quote.spec.ts:891` desapareció con el archivo borrado.

---

## 0.1 Qué hacer ahora (26/08/2026)

**Todo lo construido está en `main`.** No quedan ramas de trabajo a medias: `tienda-carrito`
y `ocultar-proveedores` están ambas fusionadas.

### Lo primero: desplegar

Hay trabajo terminado y probado **sin desplegar**, y una de las cosas que arregla está
viva en producción: el inventario visible en el HTML. Conviene publicarlo pronto.
Requiere confirmación expresa del dueño, como todo despliegue.

### Lo que puede hacerse ya, sin esperar a nadie

**La pieza B del paso 2: el checkout con datos fiscales (NIT).** No depende de la pasarela
de pago, así que se puede construir entera mientras el dueño tramita el alta del comercio.
Es lo siguiente en la lista de `CLAUDE.md` §11.

Antes de empezar, **brainstorming con el dueño**: no hay diseño escrito de esta pieza
todavía.

### Lo que espera una decisión del dueño

1. **Desplegar el carrito.** Está en `main` y probado, pero no publicado. Hay que
   recordárselo antes: **al desplegar, los 25 productos con precio (`ECO-ELE-0001` a
   `ECO-ELE-0025`) quedan a la venta automáticamente**, al precio que tengan ese día. Ya
   no hay una segunda casilla que lo frene. No hay migración de base de datos.
2. **Borrar las carpetas de imágenes antiguas.** `/catalogos/construlita/…`,
   `/highlum/…` y `/artlite/…` siguen respondiendo 200 en producción si alguien conoce
   la URL, aunque ninguna página las enlace. Borrarlas cierra la fuga del todo. **No
   borrar sin su autorización expresa.**

### Lo que el dueño tiene pendiente, sin código de por medio

1. **Contratar una pasarela de pago.** No sabe cómo se hace; se le explicó el 26/08/2026
   que empiece por su banco y pida presupuesto también a un procesador local, y qué cuatro
   preguntas hacer (entorno de pruebas, si el pago ocurre dentro de la web, cómo avisan del
   pago confirmado, comisión y plazo de depósito). **Bloquea la pieza C del paso 2.**
2. **Contratar un certificador FEL.** Bloquea la pieza D.
3. **Poner precios.** 25 de 313. Es la tarea más lenta del proyecto y no depende de nadie
   más.
4. **Apuntar el DNS de `econoluzgt.com`** a Vercel. Sigue sirviendo el WordPress viejo.

> **El catálogo público ya muestra los precios (26/08/2026).** Lo decidió el dueño: si
> va a ser una tienda B2C, el precio tiene que verse. `PublicProduct.priceGtq` es
> **opcional a propósito** —cuando el producto no tiene precio el campo no existe y la
> tarjeta dice «Precio a consultar»—, porque un `null` en los 313 cambiaría la forma de
> los objetos y rompería la huella congelada del catálogo sin que nada haya cambiado de
> verdad. El formato es `Q1,250.00` (`formatPrice` en `app/lib/formatters.ts`).
> `tests/catalog-precio.spec.ts` comprueba que ninguna tarjeta se queda sin decir nada
> del precio. Sigue sin haber carrito ni pago: el precio se ve, pero se compra por
> cotización.
>
> **Redacción anterior, ya derogada:** `publicProduct.ts` no deja cruzar
> `price_gtq` ni `stock` al navegador porque la tienda B2C no existe todavía: no hay
> dónde comprar. El panel los guarda para tenerlos listos cuando llegue el paso 2. El
> dueño lo esperó dos veces, así que **el propio panel lo avisa ahora** en el listado y en
> la ficha. Si algún día se decide enseñar precios antes de la tienda, el cambio es
> pequeño —añadir el campo a `PublicProduct` y pintarlo— pero **es una decisión de
> negocio, no técnica**: expone los precios a la competencia y hoy solo un producto de 313
> tiene precio cargado.

**El panel funciona y se usa.** Hay un administrador dado de alta y se ha entrado desde el
navegador. Lo construido:

| | Estado |
|---|---|
| Los 313 productos en Postgres (Neon) | ✅ |
| El catálogo público los lee de la base de datos | ✅ |
| **b.** Entrada al panel: usuarios, sesiones, límite de intentos | ✅ activo en local |
| **c.** Panel de productos: listado, edición en línea, ficha completa y alta | ✅ |
| **d.** Subida de fotos a Vercel Blob | ✅ almacén creado y probado |
| **e.** Galería de proyectos | ✅ activa en Neon y probada |

Rutas del panel: `/admin` (portada con cifras del catálogo), `/admin/entrar`,
`/admin/productos` (listado con edición en línea), `/admin/productos/nuevo` y
`/admin/productos/<referencia>` (ficha completa), `/admin/proyectos`,
`/admin/proyectos/nuevo` y `/admin/proyectos/<id>`.

**Comprobaciones:** `npm run test:admin` (129 pruebas de unidad), `npm run typecheck`,
`npm run lint`, `npm run build` y `npx playwright test` (95/96). La batería de navegador tiene
**un fallo histórico conocido** en `tests/catalog-quote.spec.ts:891` (§10.2): es anterior
a todo este trabajo y no debe confundirse con una regresión.

> **Ojo con Playwright:** levanta su propio servidor y Next no arranca dos del mismo
> proyecto. Si hay un `npm run dev` abierto, las pruebas de navegador fallan con
> «Process from config.webServer was not able to start». Cerrar el `dev` primero.

> **Ojo al tocar `app/globals.css` con `npm run dev` abierto.** El servidor de desarrollo
> puede seguir sirviendo el CSS anterior aunque el archivo ya esté cambiado, y da la
> impresión de que la modificación no funciona. Se comprobó con `npm run build`: la regla
> estaba en el CSS compilado y no en el que servía el `dev`. **Reiniciar el `dev`** y
> recargar sin caché.

> **Ojo con el worktree y ESLint.** `.worktrees/` vive dentro de `frontend/` y lleva su
> propia copia del código y de `node_modules`. `eslint.config.mjs` lo excluye a propósito;
> sin esa exclusión, `npm run lint` analiza el proyecto dos veces y saca cientos de
> errores que no son del código.

**Lo que falta, por orden:**

1. **Operativo, del dueño:** añadir `ADMIN_SESSION_SECRET` y `BLOB_READ_WRITE_TOKEN` a
   Vercel y confirmar cuándo se hace push o se despliega la rama `panel-admin`.
2. **Paso 2 — la tienda B2C**, que es otro proyecto entero.

**Lo que el dueño ya hizo y no hay que repetir:** generar `ADMIN_SESSION_SECRET` local,
aplicar las migraciones en Neon, crear su usuario administrador y crear el almacén Blob
(`econoluz-gt-blob`, región iad1, acceso público) con su `BLOB_READ_WRITE_TOKEN` ya en
`.env.local`.

---

## 1. Dónde estamos

El objetivo del paso 1 es que **el dueño del proyecto pueda cargar y editar los
productos y proyectos él mismo**, sin depender de un programador. **Ese objetivo está
cumplido en local**: ambos viven en Postgres y tienen pantallas de administración.
`app/data/projects.ts` queda únicamente como respaldo público si Neon no responde.

### Hecho y verificado

- **Los 313 productos están en Postgres (Neon)**, tabla `products`. La migración se
  verificó campo por campo contra la huella congelada del catálogo.
- **El catálogo público los lee de la base de datos** (`app/data/catalog.server.ts`),
  filtrando por `published` y ordenando por `position`. Comprobado despublicando un
  producto y viendo que la página generada pasaba de 313 a 312.
- **La captura de solicitudes de asesoría funciona en producción.** Se envió una
  solicitud real al sitio publicado y quedó guardada (`stored: "db"`).

- **La entrada al panel funciona** (paso b, 25/08/2026). `/admin` pide usuario y
  contraseña, la sesión vive en Neon y se puede cerrar. Verificado entrando en local.
  El detalle está en §5.bis.
- **El panel de productos está terminado**: listado, ficha, alta, publicación, precio,
  existencias y subida de fotos.
- **La galería de proyectos está terminada**: 12 proyectos y 104 fotografías originales
  visibles en Neon, con alta, edición, orden, publicación, ocultación reversible y subida
  múltiple directa a Blob. La imagen de la prueba real quedó registrada y oculta.

### Falta

- **Operativo:** añadir `ADMIN_SESSION_SECRET` y `BLOB_READ_WRITE_TOKEN` a Vercel y
  confirmar el push o despliegue de `panel-admin`.

Después de eso empieza el **paso 2**, la tienda B2C, que es otro proyecto entero
(carrito, checkout con NIT, cobro, factura FEL, existencias).

---

## 2. Decisiones ya tomadas — no volver a abrirlas

Estas las decidió el dueño del proyecto o se justificaron ante él. Cambiarlas exige
volver a preguntarle, no decidirlo por cuenta propia.

| Tema | Decisión |
|---|---|
| Tienda y cotización | **Conviven** sobre el mismo producto. La regla vieja de "no mezclar las dos pistas" está derogada (ver `CLAUDE.md` §2). |
| Quién carga el contenido | **El dueño, desde el panel.** Es la razón de ser de todo este trabajo. |
| Fotos | **Vercel Blob.** Se descartó seguir metiéndolas en el repositorio porque eso le quitaba la autonomía. |
| Alcance del panel v1 | Productos **y** galería de proyectos. Los textos del home quedan fuera. |
| Precios | Las columnas ya existen y el panel debe permitir rellenarlas, **aunque la tienda no exista todavía**. Poner precio a 313 productos es la tarea más lenta del proyecto y tiene que poder empezarla ya. |
| Acceso al panel | **Tabla de usuarios**, no una contraseña en la configuración, para que pueda dar de alta a alguien de la oficina sin pedírselo a un programador. |
| Caché | Modelo anterior (`unstable_cache` + etiqueta). **No activar `cacheComponents`**: cambia cómo se dibuja el sitio entero y esa reforma no pertenece a esta tarea. |

---

## 3. El entorno, en concreto

### Carpeta de trabajo — importa más de lo que parece

**El repositorio es `frontend/`, no la carpeta que lo contiene.** La carpeta padre
(`Proyecto Econoluz/`) no es un repositorio git: solo guarda `frontend/`, la carpeta
`Imagenes/` con el original del logo, y una carpeta `app/` vacía que sobró de un
movimiento antiguo.

Esto tiene una consecuencia práctica: las herramientas que cargan instrucciones solas
buscan **desde la raíz del proyecto hasta la carpeta de trabajo**, y no bajan a
subcarpetas arbitrarias. Si se abre la carpeta padre en vez de `frontend/`, no
encuentran `frontend/AGENTS.md` y se empieza a programar sin ninguna de estas reglas.

Hay puntero en la carpeta padre (`AGENTS.md` y `CLAUDE.md`, con el mismo contenido) por
si eso pasa, pero **viven fuera del repositorio y no viajan con un clon**. Lo fiable es
abrir `frontend/` directamente como carpeta de trabajo.

> Estas instrucciones se cargan **una vez al empezar la sesión**. Si se edita
> `AGENTS.md` con una sesión ya abierta, hay que abrir una nueva para que surtan efecto.

### Base de datos

Postgres 18 en **Neon**, creada desde el Marketplace de Vercel, región AWS US East 1.
La conexión está en `frontend/.env.local` (ignorada por git) y en Vercel como
`DATABASE_URL`.

Tablas actuales: `leads`, `products`, `schema_migrations`.

### Comandos

```bash
npm run db:migrar          # aplica los .sql de db/ que falten, repetible
npm run catalogo:importar  # mete los 313 productos del código y verifica el resultado
npm run catalogo:verificar # ensayo de la migración sin tocar la base de datos
npm run catalogo:auditar   # busca nombres de proveedor en el catálogo público
npm run test:proveedores   # comprueba privacidad pública y datos internos intactos
npm run typecheck          # tsc --noEmit
npm run lint
npx playwright test        # batería completa (usa msedge; chromium NO está instalado)
```

> **Ojo con la consola.** El dueño usa **Windows PowerShell 5.1**, que **no entiende
> `&&`**. Los comandos hay que dárselos en líneas separadas.

### Scripts

- `scripts/register-ts.mjs` + `ts-resolver.mjs` — permiten que Node ejecute los `.ts`
  del proyecto sin compilar ni añadir dependencias. Cualquier script nuevo que
  importe datos del proyecto necesita `--import ./scripts/register-ts.mjs`.
- `scripts/migrate.mjs` — aplica migraciones. Nunca imprime la cadena de conexión.
- `scripts/import-products.mjs` — importación repetible.
- `scripts/compare-catalog.mjs` — la comparación que usan tanto el ensayo como la
  importación real. Si hay que comparar catálogos, usar esto, no escribir otra.
- `scripts/audit-supplier-leaks.mjs` — auditoría de la regla de proveedores.

### Archivos clave

```
app/data/products.ts        catálogo original. YA NO es la fuente de verdad, pero
                            sigue siendo la red si la base de datos no responde, y
                            es lo que protegen las pruebas de base. No borrarlo.
app/data/productRow.ts      traducción producto <-> fila, y las listas de columnas.
app/data/catalog.server.ts  lectura del catálogo desde Postgres, con caché y red.
app/data/publicProduct.ts   LA FRONTERA. Decide qué ve el navegador.
db/002_products.sql         el esquema de productos, comentado campo por campo.
```

---

## 4. Reglas que no se pueden romper

### 4.1 El catálogo público no expone los datos del proveedor

Es la regla de negocio más importante del proyecto y el dueño ha tenido que repetirla
dos veces: el cliente no debe poder identificar al fabricante e irse a comprarle
directamente. Conviene tener clara la diferencia entre lo garantizado y lo pendiente,
porque no es lo mismo romper una cosa que la otra.

**Garantizado, y con pruebas que lo comprueban.** Los campos internos —`sku`, `brand`,
`supplierBrand`, `supplierCode`, `productCode`, la serie— **no cruzan al catálogo
público**. Viven en los `*.internal.ts` y en las columnas `supplier_*`, y
`publicProduct.ts` decide qué pasa. No basta con no pintarlos en pantalla: **tampoco
pueden aparecer en el JavaScript compilado**, y
`tests/catalog-production-boundary.spec.ts` revisa los chunks del build buscándolos.
**Esto no se puede romper.**

**Resuelto y desplegado el 26/08/2026.** La proyección pública
anonimiza rutas, textos, ficha técnica y el identificador de la aplicación antes de que
los datos lleguen al navegador. La transformación no reescribe Neon ni el producto
interno, de modo que el panel sigue enseñando la información necesaria al personal.
`npm run catalogo:auditar` devuelve 0 coincidencias; `npm run test:proveedores` protege
la separación en pruebas.

**Alcance.** La prohibición se refiere al **catálogo público y a los visitantes sin
sesión**. El panel, detrás de autenticación, tiene que enseñar esos datos a quien
administra: son justamente los que edita.

> **Trampa concreta al construir el panel.** El panel SÍ tiene que enseñar los datos
> del proveedor: para eso es interno. Pero si el formulario de edición es un
> componente de cliente que los recibe por props, esos nombres acaban en un chunk de
> JavaScript y la prueba de frontera falla. **Los formularios del panel deben ser
> componentes de servidor** con `<form action={accionDeServidor}>` e inputs no
> controlados (`defaultValue`). Ejecutar `npx playwright test
> tests/catalog-production-boundary.spec.ts` después de tocar el panel.

### 4.2 Invalidar la caché al guardar

`app/data/catalog.server.ts` exporta `CATALOG_CACHE_TAG`. **Toda acción del panel que
escriba en `products` tiene que invalidar esa etiqueta** al terminar. Sin eso, el
usuario guarda, ve el mensaje de éxito, va a la web y no ha cambiado nada — y pensará
que el panel está roto.

Cuál de las dos funciones usar **no es indiferente** en Next 16.3.1:

```ts
import { updateTag } from "next/cache";

updateTag(CATALOG_CACHE_TAG); // desde una Server Action
```

- **Desde una Server Action** (que es como debe guardar el panel): `updateTag(tag)`.
  Expira la entrada de inmediato, así que el usuario ve su propio cambio al instante.
  Es justo lo que hace falta aquí.
- **Desde un Route Handler** o cualquier otro sitio: `updateTag` **lanza un error** —
  solo funciona dentro de Server Actions. Ahí, para invalidar de inmediato:

  ```ts
  revalidateTag(CATALOG_CACHE_TAG, { expire: 0 });
  ```

- **`revalidateTag(tag, "max")` no vale cuando hay que ver el cambio ya.** Marca la
  entrada como caducada pero sigue sirviendo la versión vieja mientras refresca por
  detrás. Es lo correcto para un refresco periódico en segundo plano, y lo incorrecto
  para alguien que acaba de pulsar «guardar».
- **`revalidateTag(tag)` con un solo argumento está obsoleto** y avisa por consola.
  Hace lo mismo que `updateTag`, pero no hay razón para usarlo.

Funciona con `unstable_cache`, que es lo que usa el catálogo, aunque la documentación
de `updateTag` hable de `use cache`: comprobado en
`node_modules/next/dist/server/web/spec-extension/revalidate.js`, donde `updateTag(tag)`
llama exactamente al mismo código interno que `revalidateTag(tag)` sin perfil.

### 4.3 Las columnas del panel son del usuario

`price_gtq`, `stock`, `sellable_online` y `published` las administra la persona.
`scripts/import-products.mjs` las respeta a propósito. Cualquier script nuevo que
escriba en `products` debe hacer lo mismo.

### 4.4 El panel también tiene que parecer de ECONOLUZ

El dueño rechazó expresamente el diseño anterior del sitio con estas palabras: **«no
quiero un diseño tan estándar o que parezca tan hecho por IA»**. El sitio estaba en
blanco, negro y grises con tipografía grande y bordes finos, que es exactamente el
minimalismo por defecto al que tiende cualquier generación automática. Lo detectó él
solo y lo tiró.

Un panel de administración es donde ese riesgo es mayor, porque la tentación de sacar
una tabla gris genérica es enorme. **No lo hagas.** El panel usa la misma identidad que
el resto del sitio: azul marino `#001B59` y rojo `#E11133` sobre blanco, con los tokens
que ya existen en `app/globals.css` (`--proyectos`, `--tienda` y sus variantes). Las
reglas de reparto están en `CLAUDE.md` §3 y siguen valiendo aquí: **el rojo solo en la
acción principal de cada pantalla** —una sola por vista— y en etiquetas, filetes e
iconos; el azul marino sí admite superficie.

No hace falta inventar un lenguaje visual nuevo: reutiliza los componentes de
`app/components/ui/` y los patrones del catálogo. Lo que no vale es un panel que podría
ser de cualquier empresa.

### 4.5 Del propio `CLAUDE.md`

- No publicar ni desplegar nada sin confirmación explícita.
- No borrar archivos sin preguntar antes.
- Antes de una tarea grande, proponer el plan y esperar aprobación.
- Si se detecta un problema fuera del alcance, decirlo, no arreglarlo por cuenta propia.
- Responder siempre en español de España; comentarios, commits y resúmenes en español.

---

## 5. Paso b — La entrada al panel

**Objetivo:** que `/admin` no se pueda abrir sin usuario y contraseña.

**Diseño aprobado el 25/08/2026.** La especificación completa, incluida la estructura
de archivos, los flujos, los errores y las pruebas, está en
`docs/superpowers/specs/2026-08-25-admin-auth-design.md`. Si este resumen y aquella
especificación discrepan, manda la especificación más reciente.

El plan TDD para implementarlo tarea por tarea está en
`docs/superpowers/plans/2026-08-25-admin-auth.md`. Cada tarea actualiza este documento
y termina en un commit propio.

**Task 1 completada (25/08/2026):** las primitivas criptográficas y las políticas de
acceso viven en `app/admin/auth/crypto.ts` y `app/admin/auth/policy.ts`. Se verificaron
con `node --test --import ./scripts/register-ts.mjs tests/admin-auth-crypto.test.ts tests/admin-auth-policy.test.ts`.

**Task 2 completada (25/08/2026):** `app/admin/auth/types.ts` define el contrato de
usuarios, sesiones, intentos y limpieza; `repository.ts` lo adapta con consultas SQL
parametrizadas e inyectables; y `repository.server.ts` deja la conexión a Neon aislada
en un módulo `server-only`. La migración `db/003_admin.sql` crea `admin_users`,
`admin_sessions` y `admin_login_attempts`, con restricciones, cascadas e índices para
sesiones y limpieza. Las pruebas enfocadas del repositorio pasaron (9/9), junto con
`npm run typecheck` y `npm run lint`. **`db/003_admin.sql` no se aplicó:** queda
pendiente la autorización operativa para ejecutar `npm run db:migrar` contra Neon.

**Corrección posterior de Task 2 (25/08/2026):** el contrato incluye
`findCurrentLoginAttempt(keyHash, now)`, una lectura no destructiva del contador y del
bloqueo de la ventana vigente. El caso de uso de entrada debe consultarla antes de
verificar la contraseña: con cuatro fallos, una contraseña correcta entra y limpia el
contador; con cinco y un bloqueo vigente, la contraseña correcta se rechaza sin poder
omitirlo. La fixture ya reproduce que crear una sesión solo funciona para un usuario
activo existente. `db/003_admin.sql` sigue sin aplicarse.

**Task 3 completada (25/08/2026):** `app/admin/auth/login.ts` contiene `loginAdmin`, el
caso de uso de entrada, independiente de Next.js y con el repositorio inyectado. Devuelve
un resultado discriminado —`success`, `invalid`, `blocked` o `unavailable`— y en el
acierto deja la sesión ya creada, así que la capa de Next solo tendrá que escribir la
cookie con el `token` y el `expiresAt` que recibe. Tres decisiones que conviene no
deshacer sin motivo:

- **Un correo desconocido también ejecuta `verifyPassword`**, contra una credencial
  señuelo generada al cargar el módulo. Sin eso, un correo que no existe respondería
  mucho antes que uno que sí, y esa diferencia de tiempo revela qué cuentas hay dadas
  de alta.
- **El bloqueo se decide por la marca `blocked_until` o por el contador**, no solo por
  la marca. Si una fila llegara con el contador agotado y la marca sin rellenar, mirar
  únicamente la marca dejaría la puerta abierta a la fuerza bruta.
- **El bloqueo se consulta antes de verificar la contraseña y no consume intentos**, de
  modo que quien está bloqueado no alarga su propio bloqueo por reintentar.

Se verificó con `node --test --import ./scripts/register-ts.mjs
tests/admin-auth-login.test.ts` (9/9) y con la unidad completa de autenticación (31/31),
más `npm run typecheck` y `npm run lint`. `db/003_admin.sql` sigue sin aplicarse.

**Task 4 completada (25/08/2026):** `app/admin/auth/session.ts` valida y renueva el
token sin depender de Next.js, y `app/admin/auth/authorization.server.ts` lo adapta a
cookies, memoización y redirecciones. La cookie se llama **`econoluz_admin`** (nombre
elegido en esta tarea; no estaba fijado en la especificación).

- **`verificarSesion()`** es la frontera de las páginas: memoizada con `cache` de React,
  así que varias llamadas en un mismo render no consultan Neon varias veces. Sin cookie
  ni siquiera abre conexión.
- **`verificarSesionParaAccion()`** es la de las Server Actions: vuelve a comprobar
  junto a la escritura y renueva la cookie si toca, en vez de fiarse de lo que el layout
  comprobó al cargar la página.
- **`revocarSesionActual()`** borra primero la fila y después la cookie. Si Neon no
  contesta, la cookie se retira igual y la fila caduca sola.
- **`POST /admin/sesion`** renueva por actividad: `204` si sigue en pie, `401` si el
  token no vale y `503` si falla la infraestructura. No devuelve identidad ni caducidad,
  para que nada de eso quede al alcance del JavaScript del navegador.
- **Una sesión inválida y un fallo de Neon son cosas distintas.** Confundirlas cerraría
  la sesión de todo el mundo cada vez que la base de datos tosiera.
- La renovación efectiva ocurre como mucho cada quince minutos, y se aprovecha para
  borrar sesiones e intentos caducados: así las tablas no crecen sin límite sin pagar
  una escritura por carga de página.

`ADMIN_SESSION_SECRET` está documentada en `.env.example`, incluido el comando exacto
para generarla. **Sin ella el panel no arranca, a propósito.** Verificado con la unidad
completa de autenticación (38/38), `npm run typecheck`, `npm run lint`, `npm run build`
—`/admin/sesion` sale como ruta dinámica— y
`npx playwright test tests/catalog-production-boundary.spec.ts` (4/4).
`db/003_admin.sql` sigue sin aplicarse.

**Task 5 completada (25/08/2026):** ya hay pantallas. `/admin` redirige a
`/admin/entrar` sin sesión, el panel declara `robots: noindex` y el botón flotante de
WhatsApp desaparece dentro de `/admin` sin cambiar nada en el sitio público.

- **`app/admin/entrar/`** es la pantalla de acceso: azul marino de superficie, tarjeta
  blanca y una sola acción roja —«Entrar»—, según §4.4. El formulario es un componente
  de cliente, pero solo recibe el estado público del intento: nunca token, sal, hash ni
  dato de proveedor.
- **Los tres desenlaces comparten mensaje.** Credenciales equivocadas y correo
  inexistente dicen exactamente lo mismo; el bloqueo añade «inténtalo dentro de unos
  minutos» sin revelar si la cuenta existe. Hay una prueba que lo comprueba.
- **`app/admin/(panel)/`** es la zona protegida. El layout llama a `verificarSesion()`
  para redirigir pronto y poner el nombre en la cabecera, y la página **vuelve a
  llamarla**, porque la frontera está junto a los datos y no en el layout.
- **`SessionActivity`** renueva la sesión con teclado, puntero y envíos de formulario,
  como mucho una vez cada quince minutos. No recibe ni un dato de negocio: es cliente, y
  todo lo que recibiera acabaría en el JavaScript descargado.
- **`estadoAccesoInicial` no puede vivir en `actions.ts`:** un módulo `"use server"`
  solo puede exportar funciones asíncronas. El estado inicial se quedó en `LoginForm`.

Verificado con `npx playwright test tests/admin-auth.spec.ts` (5/5), `npm run build`
—`/admin`, `/admin/entrar` y `/admin/sesion` salen como rutas dinámicas—,
`npx playwright test tests/catalog-production-boundary.spec.ts` (4/4), `npm run
typecheck` y `npm run lint`. **Nadie puede entrar todavía:** falta aplicar
`db/003_admin.sql`, definir `ADMIN_SESSION_SECRET` y crear el primer usuario (Task 6).

**Task 6 completada (25/08/2026):** `scripts/create-admin.mjs`, expuesto como
`npm run admin:crear`, da de alta a quien administra y sirve también para cambiar una
contraseña olvidada: repetir el mismo correo la reemplaza y **cierra sus sesiones
abiertas**, que es justo lo que hace falta si la contraseña se cambió porque alguien
pudo verla.

- Pide nombre y correo a la vista, y la contraseña **sin mostrarla**. El modo de la
  terminal se restaura siempre, incluso al cancelar con Ctrl+C: dejarla sin eco obliga
  a cerrarla.
- Mínimo doce caracteres. `scrypt` frena la fuerza bruta, no la adivinanza.
- Sin `DATABASE_URL` avisa con una sola línea y sale con código 1, sin imprimir ningún
  valor del entorno ni la cadena de conexión.
- No hay pantalla pública de registro a propósito: dar de alta exige la terminal del
  proyecto y la cadena de conexión.

Comandos nuevos en `package.json`: **`npm run admin:crear`** y **`npm run test:admin`**,
que ejecuta de una vez las seis baterías de autenticación (44 pruebas). Verificado con
`npm run test:admin` (44/44), `npm run typecheck` y `npm run lint`. No se añadió ninguna
dependencia.

**Corrección posterior de Task 6 (25/08/2026):** el script moría con `Cannot find
package 'server-only'` **justo después de pedir la contraseña**, en el primer intento
real de alta. La causa: importaba `app/admin/auth/repository.server.ts`, que empieza con
`import "server-only"`. Ese paquete **no está instalado**; Next lo resuelve con un alias
propio, así que la web funciona y el build pasa, pero un script lanzado con `node` no lo
encuentra. Ahora el script arma el repositorio con `createCliRepository`, usando el
adaptador puro `repository.ts` y `neon` directamente, y **se conecta antes de preguntar
nada**, para que un fallo así no llegue después de escribir la contraseña dos veces.
`tests/admin-create-script.test.ts` incluye la prueba que reproduce el fallo.

> **Regla que se deduce de esto:** cualquier script de terminal que necesite datos del
> proyecto debe importar los módulos puros, **nunca los `*.server.ts`**. Estos últimos
> solo saben vivir dentro de Next.

**Corrección visual del panel (25/08/2026):** en la primera prueba real, el logo estaba
puesto sobre fondo azul marino y **se veía solo la palabra «ECONO» en rojo**: el resto
del logotipo es `#001B59`, el mismo color que el fondo, y desaparecía. Es el caso de
contraste 1.23:1 que `CLAUDE.md` §3 marca como inservible.

**Norma que se estaba incumpliendo:** en toda la web el logo va **siempre sobre blanco**
—`SiteFooter` es `bg-white` y `SiteNavbar` es `bg-white/92`—, nunca sobre una superficie
de color. Ahora el panel hace lo mismo: en `/admin/entrar` el logo vive dentro de la
tarjeta blanca, y la cabecera del panel pasó a ser blanca con filete inferior, como la
barra del sitio público, con la etiqueta «PANEL» en rojo y el botón «Salir» en contorno
azul marino. La etiqueta roja de la portada se retiró para no duplicar el acento en la
misma vista.

**La portada del panel muestra el estado real del catálogo (25/08/2026).** El dueño
señaló que la pantalla quedaba «todo blanco», que es exactamente el riesgo del §4.4.
La causa de fondo no era el color: era que la página no tenía nada que enseñar.

Ahora la portada abre con una **franja de azul marino a todo el ancho** —el azul sí
admite superficie, §3— con el saludo y tres cifras leídas de Postgres: productos en el
catálogo, publicados en la web y con precio puesto, cada una con su filete rojo encima.
Hoy son **313, 313 y 0**, comprobado contra Neon. Debajo, las secciones sobre gris muy
claro con filete azul marino.

- `app/admin/panelStats.ts` hace la consulta y es puro, así que se prueba sin base de
  datos (`tests/admin-panel-stats.test.ts`). Convierte los `count()` a número: Postgres
  los devuelve como texto porque son `bigint`.
- `app/admin/panelStats.server.ts` conecta con Neon. **Si no hay `DATABASE_URL` o la
  consulta falla, devuelve `null` y la portada se dibuja igual** con un aviso discreto:
  entrar y navegar no puede depender de que las cifras se puedan leer.
- El layout del panel ya no impone ancho ni márgenes; cada pantalla decide, porque las
  franjas de color van a todo el ancho y el contenido no.

---

## 5.bis El paso b, terminado en código y pendiente de activar (25/08/2026)

**El código está completo y verificado; nadie puede entrar todavía.** Las dos cosas son
ciertas a la vez y conviene no confundirlas: faltan tres pasos operativos que no se
resuelven programando.

> **Hecho el 25/08/2026.** Los pasos 1 a 4 de abajo se ejecutaron y el acceso funciona
> en local. Se dejan escritos porque hay que repetirlos en cualquier equipo nuevo, y
> porque el paso 5 —Vercel— sigue pendiente.

### Lo que hay que hacer para activarlo, en este orden

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

1. Pegar ese valor en `frontend/.env.local` como `ADMIN_SESSION_SECRET="..."`. Sin él el
   panel no arranca, a propósito.
2. `npm run db:migrar` — aplica `db/003_admin.sql` y crea `admin_users`,
   `admin_sessions` y `admin_login_attempts`. Es repetible.
3. `npm run admin:crear` — pide nombre, correo y contraseña. **La contraseña se escribe
   en la terminal del dueño y no se pide por chat ni se registra en ninguna salida.**
4. Comprobar a mano: entrar, recargar el panel, salir, y volver a `/admin` para
   confirmar que redirige. **Comprobar también** que una página del panel sigue exigiendo
   sesión aunque el layout ya la haya comprobado: es lo único de la revisión por
   mutaciones que las pruebas no cubren, porque sin base de datos local no se puede
   montar una sesión válida en el navegador.
5. Añadir el mismo secreto a Vercel y desplegar **solo con autorización expresa**.

> **Nota histórica:** en la primera entrega estos pasos aún no se habían ejecutado. El
> dueño los completó después; `db/003_admin.sql`, el usuario y el secreto local están
> activos. `db/004_projects.sql` también quedó aplicado el 25/08/2026.

### Resultados de la verificación

`npm run test:admin` 44/44 · `npm run typecheck` limpio · `npm run lint` limpio ·
`npm run build` correcto, con `/admin`, `/admin/entrar` y `/admin/sesion` como rutas
dinámicas · `tests/admin-auth.spec.ts` 5/5 · `tests/catalog-production-boundary.spec.ts`
4/4 · batería completa **92 pasan y 1 falla**, que es el fallo histórico
`catalog-quote.spec.ts:891` descrito en §10.2, idéntico al de siempre.

En aquella entrega la rama era `panel-admin-auth`, dentro de
`.worktrees/panel-admin-auth`. Después se integró localmente en `panel-admin`. No se ha
hecho push ni se ha desplegado nada.

Los encabezados del plan usan la palabra técnica `Task` porque el extractor de
`subagent-driven-development` la necesita literalmente para generar el brief aislado
de cada subagente; el contenido, los commits y los informes permanecen en español.

La ejecución original con subagentes se hizo en el worktree aislado
`.worktrees/panel-admin-auth`; esa integración local ya terminó. Esto no implicó push
ni despliegue.

### Qué construir

1. **Migración `db/003_admin.sql`:**
   - `admin_users`: `id`, `email` (único, en minúsculas), `password_hash`, `salt`,
     `name`, `created_at`, `last_login_at`, `active`.
   - `admin_sessions`: `token_hash` (clave primaria), `user_id`, `created_at`,
     `expires_at`. Guardar el **hash** del token, no el token: si alguien lee la
     tabla, no puede suplantar a nadie.
   - `admin_login_attempts`: contador y ventana de bloqueo identificados mediante una
     clave anónima. Es lo que permite limitar intentos en Vercel sin depender de la
     memoria de una instancia.

2. **Dos hashes distintos, y no es lo mismo:**
   - **Contraseñas: `crypto.scrypt`.** Es lento a propósito, que es justo lo que hace
     falta contra una contraseña que una persona pudo elegir mal. De la biblioteca
     estándar: **no añadir bcrypt ni argon2**, `CLAUDE.md` §6 pide justificar cada
     dependencia y aquí no hay nada que justificar. Comparar con `timingSafeEqual`.
     Ojo con `maxmem` si se suben los parámetros por encima de los de fábrica.
   - **Token de sesión: HMAC-SHA-256, NO scrypt.** El token es aleatorio y de mucha
     entropía, así que no hace falta ralentizar nada. La HMAC usa
     `ADMIN_SESSION_SECRET` y da sentido al secreto de sesión exigido para el panel.
     Usar scrypt aquí costaría más de cien milisegundos de CPU **en cada carga de cada
     página del panel**, que es un error de rendimiento fácil de cometer copiando el
     hash de las contraseñas.

3. **`scripts/create-admin.mjs`** — crea el primer usuario desde la terminal, porque
   no puede haber una pantalla pública de registro. Pedir correo y contraseña por
   consola, **sin mostrar la contraseña mientras se escribe**. Debe servir también para
   cambiar una contraseña olvidada.

4. **`app/admin/entrar/page.tsx`** — formulario de acceso con acción de servidor.
   Cookie `httpOnly`, `sameSite: "lax"`, con caducidad, y `secure` **condicionado al
   entorno**: con `secure: true` fijo, el navegador no guarda la cookie en
   `http://localhost` y el acceso parece roto en desarrollo sin ningún error visible.

5. **La frontera de seguridad es la capa de datos, no el layout.** Esto es importante
   y es fácil equivocarse:

   - `app/admin/entrar` **no puede** quedar dentro de un layout que redirija a
     `/admin/entrar`: sería una redirección circular.
   - Y aunque se resuelva con un grupo de rutas —`app/admin/(panel)/` con su propio
     layout, dejando `entrar` fuera—, **el layout sigue sin ser la frontera**. La guía
     de Next lo dice sin rodeos: un layout no se vuelve a renderizar al navegar, así
     que la sesión no se comprueba en cada cambio de ruta; y **no controla si el resto
     de la ruta se renderiza**, de modo que el segmento hijo se ejecuta igual y sus
     datos pueden acabar en la carga RSC. Ver
     `node_modules/next/dist/docs/01-app/02-guides/authentication.md`, «Layouts and
     auth checks».

   Lo que sí es frontera: **una función `verificarSesion()` en un módulo
   `server-only`**, memoizada con `cache` de React para que no consulte Neon una vez
   por componente, que **llaman todas las páginas del panel y todas las acciones de
   servidor**. El layout protegido se queda, pero como comodidad —redirigir pronto y
   pintar la cabecera—, no como guardia.

6. **Salir**: acción que borra la fila de sesión y la cookie. Borrar la fila importa:
   si solo se borra la cookie, el token sigue siendo válido para quien lo tuviera.

### Cuidados

- Las rutas bajo `/admin` dependen de cookies: no se pueden prerenderizar. Marcarlas
  como dinámicas.
- Limitar los intentos fallidos (por ejemplo, cinco en quince minutos por correo y
  origen). Un formulario de acceso público sin freno se prueba a fuerza bruta.
  **El contador tiene que vivir en Postgres, no en memoria**: en Vercel cada petición
  puede caer en una instancia distinta, así que un `Map` en memoria cuenta mal y no
  frena nada, sin dar ningún error que lo delate.
- No decir nunca "ese correo no existe" ni "contraseña incorrecta" por separado: un
  único mensaje para los dos casos.
- El `/admin` no debe aparecer en `sitemap` ni ser indexable (`robots: noindex`).
- **Renovar la caducidad de la sesión con la actividad.** La sesión vence tras doce
  horas **sin actividad**. Un componente mínimo, que no recibe datos de negocio,
  renueva la cookie y Neon cuando detecta teclado, puntero o envío de formulario. El
  servidor no escribe más de una renovación cada quince minutos y una pestaña abierta
  sin interacción no mantiene viva la sesión. Esto evita que caduque mientras se cargan
  precios o se rellena un formulario largo.
- Borrar las sesiones caducadas, o la tabla crece sin límite. Basta con limpiarlas al
  validar.

### Cómo saber que está terminado

- Abrir `/admin` sin sesión redirige a `/admin/entrar`.
- Con credenciales correctas entra; con incorrectas no, y el mensaje es el mismo.
- Cerrar sesión invalida la cookie **y** la fila en `admin_sessions`.
- `npm run typecheck`, `npm run lint` y `npx playwright test` siguen igual.

---

## 6. Paso c — El panel de productos

**Objetivo:** que el dueño cree, edite, publique y ponga precio sin tocar código.

### Pantallas

1. **`app/admin/page.tsx`** — listado: buscador por nombre y referencia, filtro por
   tipo, estado de publicación, precio y existencias visibles de un vistazo,
   paginación. Son 313 productos: sin buscador es inservible.
2. **`app/admin/productos/[id]/page.tsx`** — edición.
3. **`app/admin/productos/nuevo/page.tsx`** — alta.
4. **`app/admin/actions.ts`** — acciones de servidor: `guardarProducto`,
   `crearProducto`, `publicar`, `despublicar`. **Todas terminan en
   `updateTag(CATALOG_CACHE_TAG)`** — ver §4.2 para por qué esa función y no otra.

### El formulario

Campos, agrupados como en `db/002_products.sql`:

- **Público:** nombre, descripción, imagen principal, galería.
- **Clasificación:** tipo de producto y aplicación, elegidos de
  `app/data/catalogTaxonomy.ts` — **no como texto libre**, o el catálogo guiado deja
  de encontrar el producto. Acabado y familia sí son texto.
- **Proveedor (interno):** marca, serie, código, nombre y descripción del fabricante.
- **Tienda:** precio en quetzales, existencias, si se vende en línea.
- **Publicado**: sí o no.

### Validación

Reproducir lo que ya comprueba `validateCatalog` en `tests/helpers/catalog-baseline.ts`:

- La aplicación tiene que **pertenecer** al tipo de producto elegido, o el producto
  queda inalcanzable desde los filtros.
- `econoluz_reference` única.
- La imagen tiene que existir.
- Precio y existencias no negativos (ya lo impone la base de datos, pero el
  formulario debe avisar antes, no reventar al guardar).

### Referencia de los productos nuevos

`db/002_products.sql` crea `econoluz_reference_seq`, que arranca en **314** (el
último número usado es el 313). El formato es `ECO-<PREFIJO>-<NNNN>` con el número a
cuatro cifras.

**El prefijo hay que decidirlo, no deducirlo.** El reparto histórico no es una regla:

| Tipo de producto | Prefijo | Cuántos |
|---|---|---|
| `placas_accesorios` | `ECO-ELE` | 41 |
| `iluminacion_industrial` | `ECO-IND` | 26 |
| `iluminacion_arquitectonica` | `ECO-CAT` | 72 |
| `iluminacion_exterior` | `ECO-CAT` | 66 |
| `tiras_led` | `ECO-CAT` | 89 |
| `emergencia_senalizacion` | `ECO-CAT` | 3 |
| `sistemas_lineales_tubos` | `ECO-TUB` **y** `ECO-CAT` | 12 y 4 |

La última fila es la que rompe la regla: el mismo tipo tiene dos prefijos. El prefijo
no significa nada funcionalmente, solo forma parte de un identificador único.
**Recomendación:** fijar la tabla de arriba con `sistemas_lineales_tubos → ECO-TUB` y
dejarlo escrito en el código. **Preguntar al dueño antes**, porque esas referencias
son lo que él cita al cotizar y puede tener criterio propio.

### Estado del paso c (25/08/2026) — primera entrega

**Decisiones tomadas con el dueño:**

- Se empieza por el **listado con precio, existencias y publicado editables en la propia
  fila**, no por la ficha completa. Razón: poner precio a 313 productos entrando y
  saliendo de cada ficha es inviable, y ésa es la tarea más larga que tiene por delante.
- **El prefijo de las referencias nuevas no se fija en el código.** El dueño explicó que
  los prefijos actuales salieron de las carpetas de catálogo de cada proveedor, y al
  comprobarlo contra la base de datos se vio que **no hay una regla única**: `ECO-ELE` es
  todo artlite/placas, `ECO-IND` es industrial de dos marcas, `ECO-TUB` son los lineales
  de highlum y los 4 lineales de construlita se quedaron en `ECO-CAT`. Como la norma
  nunca existió, la pantalla de alta **sugerirá** el prefijo según el tipo y dejará
  cambiarlo antes de guardar.

**Construido:** `/admin/productos`, con buscador por nombre y referencia, filtro por tipo
y por estado (todos, publicados, sin publicar, sin precio), paginación de 25 en 25 y
edición en línea de precio, existencias y publicado. Un único botón guarda toda la página.

- **Toda la pantalla es de servidor**, sin un solo componente de cliente: es lo que exige
  §4.1 para que los datos internos no acaben en un chunk de JavaScript.
- **La fila se identifica por `econoluz_reference`, no por `id`.** La columna `id` es un
  texto del estilo `construlita-cuasar`: **lleva dentro el nombre del fabricante**, así
  que ni se lee de la base de datos. Hay una prueba que lo comprueba.
- **Solo se escriben las filas que cambiaron**, comparando con el valor original que
  viaja en el formulario.
- Al guardar se llama a `updateTag(CATALOG_CACHE_TAG)`, que es lo que hace que la web
  pública muestre el cambio al momento (§4.2).
- Lo escrito se acepta como se escribe de verdad: `1,250.50`, `Q 1250` o vacío. **Vacío
  significa «todavía sin precio», que no es lo mismo que cero.** Las existencias son
  enteras. Un error en una fila no impide guardar las demás; el aviso dice cuáles
  fallaron.

Verificado: `npm run test:admin` 60/60, `typecheck`, `lint` y `build` limpios
—`/admin/productos` sale como ruta dinámica— y las 9 pruebas de frontera y de acceso.

**Falta por comprobar en persona:** cambiar un precio en el panel y verlo en `/catalogo`
sin volver a desplegar. Es la prueba de que la invalidación de caché funciona, y necesita
una sesión abierta, así que la hace el dueño.

**Ficha completa de edición (25/08/2026).** `/admin/productos/<referencia>` edita un
producto entero: nombre, descripción, foto, galería, clasificación, ficha técnica, datos
del fabricante, precio, existencias y publicación. Se llega pulsando el nombre en el
listado.

- **La foto se sube desde el navegador a Vercel Blob.** El almacén ya existe
  (`econoluz-gt-blob`, región iad1, acceso público) y se comprobó subiendo, leyendo sin
  credenciales y borrando un archivo de prueba. Dependencia nueva: `@vercel/blob`, que es
  la única forma soportada y estaba aprobada en el paso d.
- **El nombre del archivo subido se genera con la referencia pública**
  (`productos/eco-cat-0132-a1b2c3d4.webp`) y **descarta el nombre original**. Los archivos
  del proveedor se llaman como el proveedor, y la URL de una foto se ve con clic derecho:
  es justo la deuda de `/catalogos/<marca>/` y no tiene sentido repetirla en lo nuevo.
- Se aceptan webp, jpg, png y avif hasta 4 MB. `next.config.ts` sube el límite de cuerpo
  de las Server Actions a 5 MB —el de fábrica es 1 MB y rechazaría cualquier foto real— y
  declara `*.public.blob.vercel-storage.com` en `images.remotePatterns`, sin lo cual
  `next/image` se niega a servir las fotos nuevas.
- El campo de ruta sigue aceptando **las dos formas**: una ruta local de las que ya
  existen o una URL del almacén. Cualquier otro dominio se rechaza.
- **Lo que todavía no se edita:** el acabado, y la marca y la serie del proveedor. Son
  parejas de identificador y etiqueta que otros módulos dan por buenas, y cambiarlas desde
  un campo de texto las desemparejaría. Se muestran, pero en gris.

Verificado: `npm run test:admin` 81/81, `typecheck`, `lint` y `build` limpios, con
`/admin/productos/[referencia]` como ruta dinámica.

**Alta de productos nuevos (25/08/2026).** `/admin/productos/nuevo`, con botón en la
cabecera del listado. Pide lo imprescindible —nombre, descripción, foto, tipo, aplicación,
familia y ficha técnica— y al guardar lleva a la ficha del producto recién creado, que es
donde se completan precio, existencias y datos del fabricante.

- **La referencia se pone sola** con `nextval('econoluz_reference_seq')`, la secuencia que
  creó `db/002_products.sql` arrancando en 314. Pedirle un número a una secuencia es
  atómico: dos altas simultáneas no pueden recibir el mismo.
- **El prefijo se sugiere, no se impone.** El campo se deja vacío y se usa el del tipo
  (`placas_accesorios → ELE`, `iluminacion_industrial → IND`,
  `sistemas_lineales_tubos → TUB`, el resto `CAT`), pero se puede escribir otro. Esa
  decisión está razonada arriba: no existe una regla histórica que recuperar.
- **El identificador interno del producto nuevo es su referencia en minúsculas**
  (`eco-tub-0314`). Los 313 antiguos lo tienen con el nombre del proveedor dentro
  (`construlita-cuasar`); lo nuevo no repite eso.
- **La posición es la última más diez**, respetando los huecos que deja
  `POSITION_STEP` para poder intercalar sin renumerar.
- **Nace sin publicar salvo que se marque la casilla**, para que un producto a medio
  rellenar no aparezca en la web.
- La foto del alta se sube con el nombre `productos/nuevo-<aleatorio>.<ext>`, porque
  todavía no hay referencia cuando se sube. Al cambiarla después desde la ficha, el
  archivo pasa a llevar la referencia. Es cosmético: ningún nombre lleva datos del
  proveedor.

**Con esto el paso c está terminado.** El dueño puede crear, editar, publicar, poner
precio y subir fotos sin tocar código.

**Siguiente:** el paso e quedó terminado; el siguiente bloque de producto es la tienda
B2C del paso 2, después de la decisión operativa de publicar el panel.

### Cómo saber que está terminado

- Cambiar el nombre de un producto en el panel y verlo cambiado en `/catalogo` **sin
  volver a desplegar**. Esto es la prueba de que la invalidación funciona.
- Despublicar un producto y verlo desaparecer del catálogo.
- Crear un producto nuevo con referencia automática y encontrarlo en los filtros.
- `npx playwright test tests/catalog-production-boundary.spec.ts` sigue pasando —
  esto es lo que demuestra que los datos del proveedor no se escaparon al navegador.

---

## 7. Paso d — Subida de fotos

**Objetivo:** dar de alta un producto con su foto sin pasar por un programador.

1. **Crear el almacén Blob en Vercel** (`vercel.com` → proyecto → Storage → Blob).
   Genera `BLOB_READ_WRITE_TOKEN`, que hay que copiar también a `.env.local`.
2. **Dependencia nueva: `@vercel/blob`.** Es la única forma soportada de subir, y el
   almacenamiento ya lo eligió el dueño, así que la justificación está hecha
   (`CLAUDE.md` §6).
3. **`next.config.ts`**: añadir el dominio del blob a `images.remotePatterns`, o
   `next/image` se negará a servir las fotos nuevas.
4. **Convivencia**: las 326 imágenes actuales siguen en `/public/catalogos/` y la
   base de datos guarda su ruta tal cual. El panel debe aceptar **las dos formas**:
   ruta local existente y URL del blob.
5. Limitar tamaño y tipo al subir, y comprimir. `CLAUDE.md` §6 dice que ninguna
   imagen actual pasa de 210 KB; no romper eso subiendo fotos de 8 MB.

> **No borrar** nada de `/public/catalogos/`, `/public/proyectos/` ni
> `/public/proveedores/`. `CLAUDE.md` §9 lo prohíbe expresamente y las rutas son
> literales: renombrar rompe el catálogo sin que falle el build.

---

## 8. Paso e — La galería de proyectos

**Terminado el 25/08/2026.** Se implementó y comprobó el tratamiento completo:

1. `db/004_projects.sql` crea `projects` y `project_images` sin borrado en cascada.
2. `app/data/projectRow.ts` conserva identidad, contenido y orden de forma reversible.
3. `npm run proyectos:verificar` confirma 12 proyectos y 104 fotografías antes de
   tocar la base de datos.
4. `npm run proyectos:importar` importa de forma idempotente, relee Neon y compara el
   resultado. Se ejecutó dos veces: 12 proyectos, 104 fotos, 12 publicados y 104 visibles.
5. La portada lee Neon con `PROJECTS_CACHE_TAG` y vuelve a `app/data/projects.ts` si la
   base falla o está vacía, sin cambiar el diseño de `ProjectSlider`.
6. `/admin/proyectos`, `/admin/proyectos/nuevo` y `/admin/proyectos/<id>` permiten alta,
   edición, orden, publicación y retirada reversible de fotos. No existe botón de borrar.
7. La carga múltiple va directamente del navegador a Vercel Blob; la ruta de token exige
   sesión, limita a cuatro formatos y 4 MB, y el registro es idempotente.

**Prueba real:** `npm run proyectos:probar` cambió y restauró el título de Agencia BMW,
ocultó y restauró una foto (8 → 7 → 8) y despublicó y republicó el proyecto mediante
Neon. También se subió una imagen real con nombre UUID, se registró y se dejó oculta.
El navegador integrado no estaba disponible en la sesión, por lo que no se afirma una
prueba manual de clics; las rutas y la frontera de sesión sí se comprobaron con Playwright.

---

## 9. Lo que no puede hacer quien programe

Estas cosas **no se resuelven escribiendo código**: las tiene que hacer el dueño del
proyecto en un panel web o decidirlas él. Conviene pedírselas al empezar el paso
correspondiente y no descubrirlas a mitad, porque bloquean.

| Hace falta para | Qué tiene que hacer el dueño |
|---|---|
| Paso b — entrada al panel | Elegir **su correo y su contraseña** de administrador. Se dan de alta con `scripts/create-admin.mjs`, no con una pantalla pública de registro. |
| Paso b — sesiones | Generar `ADMIN_SESSION_SECRET` y ponerlo en `.env.local` **y en Vercel**. Se genera con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. |
| Paso c — referencias | **Decidir el prefijo** de las referencias nuevas (§6, «Referencia de los productos nuevos»). El reparto actual no es una regla y esas referencias son las que él cita al cotizar. |
| Paso d — fotos | El almacén Blob y el token local ya existen. Falta copiar `BLOB_READ_WRITE_TOKEN` a Vercel antes de desplegar. |
| Que el sitio nuevo sea el oficial | **Apuntar el DNS de `econoluzgt.com` a Vercel.** Hoy ese dominio sigue sirviendo el WordPress viejo. |
| La tienda (paso 2) | Contratar certificador FEL, decidir el medio de cobro, redactar los textos legales de venta en línea y **fijar los precios**. Nada de eso lo puede hacer un programador. |

Además, **nada se publica ni se despliega sin que él lo confirme.**

---

## 10. Problemas conocidos, anteriores a este trabajo

No los causó la migración. Están documentados para que nadie pierda tiempo
investigándolos ni los confunda con una regresión.

### 10.1 Nombres de proveedor visibles en el catálogo público — resuelto y desplegado

El dueño autorizó ocultarlos y desplegarlos el 26/08/2026. `main` sirve las
imágenes desde `arquitectonico/`, `lineal/` y `electrico/`, retira los nombres de línea
de los campos públicos y renombra la familia `Magnetrack Pro` como «Microrriel magnético
48 V». Los datos originales permanecen detrás de sesión en el panel.

No se han borrado las carpetas antiguas. Las 326 rutas neutras ya se verificaron en
producción; falta pedir permiso antes de retirar los originales. El diagnóstico y el
procedimiento están en `docs/FUGAS-PROVEEDOR.md`.

### 10.2 Una prueba que falla

`tests/catalog-quote.spec.ts:891` (`rebases an action before the restoration frame and
persists it before frames flush`) falla de forma determinista. **Se comprobó
guardando los cambios a un lado y ejecutándola sobre el código anterior: falla igual.**
No tiene que ver con la base de datos ni con el catálogo. En la batería completa del
25/08/2026, las otras **95** pasaron.

### 10.3 Otras

- `econoluzgt.com` sigue apuntando al WordPress viejo. Solo
  `econoluz-gt.vercel.app` tiene el sitio nuevo. Es un cambio de DNS que hace el dueño.
- El aviso por correo de las solicitudes está implementado pero desactivado a
  propósito: el dominio del correo lo controla un tercero. Ver `CLAUDE.md` §7.
- Queda en la tabla `leads` una solicitud de prueba (`id=1`, «PRUEBA TECNICA - no es
  un cliente») que se envió para comprobar que producción guardaba bien. Se puede
  borrar cuando el dueño quiera.
- `app/components/ui/FilterChip.tsx` quedó sin usar al quitar el filtro de series.
  No se borró porque `CLAUDE.md` prohíbe borrar archivos sin preguntar.
- `AGENTS.md` lo reescribe `next dev` en cada arranque. Es normal; se commitea con el
  resto y ya está.
