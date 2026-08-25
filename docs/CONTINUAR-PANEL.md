# Cómo continuar el panel de administración de ECONOLUZ

Documento de traspaso. Está escrito para que **otra persona u otro agente** (Codex,
por ejemplo) pueda seguir el trabajo sin haber estado en las conversaciones previas.

**Antes de escribir una sola línea de código, lee `frontend/CLAUDE.md` completo.**
Ahí están las reglas del proyecto, la marca, las convenciones y lo que no se toca.
Este documento no las repite: las da por leídas.

Rama de trabajo: **`panel-admin`**. Nada de esto está publicado ni fusionado a `main`.

---

## 1. Dónde estamos

El objetivo del paso 1 es que **el dueño del proyecto pueda cargar y editar los
productos él mismo**, sin depender de un programador. Hoy los productos ya no viven
en el código, pero todavía no hay ninguna pantalla para tocarlos.

### Hecho y verificado

- **Los 313 productos están en Postgres (Neon)**, tabla `products`. La migración se
  verificó campo por campo contra la huella congelada del catálogo.
- **El catálogo público los lee de la base de datos** (`app/data/catalog.server.ts`),
  filtrando por `published` y ordenando por `position`. Comprobado despublicando un
  producto y viendo que la página generada pasaba de 313 a 312.
- **La captura de solicitudes de asesoría funciona en producción.** Se envió una
  solicitud real al sitio publicado y quedó guardada (`stored: "db"`).

### Falta

- **b.** La entrada al panel (usuario, contraseña, sesión).
- **c.** El panel de productos (listar, crear, editar, publicar, precio, existencias).
- **d.** Subida de fotos a Vercel Blob.
- **e.** La galería de proyectos, con el mismo tratamiento que los productos.

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

**Deuda conocida, no garantizada.** Siguen apareciendo nombres heredados del proveedor
dentro de las rutas de las imágenes, de los textos de las descripciones y de la
taxonomía: 30 nombres en unas 556 apariciones (§10.1). Está documentado y el dueño lo
sabe. No confundir una cosa con la otra: la regla describe la intención y el mecanismo,
no un estado ya alcanzado.

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

---

## 5.bis El paso b, terminado en código y pendiente de activar (25/08/2026)

**El código está completo y verificado; nadie puede entrar todavía.** Las dos cosas son
ciertas a la vez y conviene no confundirlas: faltan tres pasos operativos que no se
resuelven programando.

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

> Los pasos 2 y 3 escriben en Neon. No se ejecutaron: el dueño no ha autorizado tocar la
> base de datos, y el paso 3 necesita una contraseña que solo él debe escribir.

### Resultados de la verificación

`npm run test:admin` 44/44 · `npm run typecheck` limpio · `npm run lint` limpio ·
`npm run build` correcto, con `/admin`, `/admin/entrar` y `/admin/sesion` como rutas
dinámicas · `tests/admin-auth.spec.ts` 5/5 · `tests/catalog-production-boundary.spec.ts`
4/4 · batería completa **92 pasan y 1 falla**, que es el fallo histórico
`catalog-quote.spec.ts:891` descrito en §10.2, idéntico al de siempre.

La rama es `panel-admin-auth`, en el worktree `.worktrees/panel-admin-auth`. **No está
fusionada a `panel-admin` ni a `main`, no se ha hecho push y no se ha desplegado nada.**

Los encabezados del plan usan la palabra técnica `Task` porque el extractor de
`subagent-driven-development` la necesita literalmente para generar el brief aislado
de cada subagente; el contenido, los commits y los informes permanecen en español.

La ejecución con subagentes fue autorizada en un worktree aislado:
`.worktrees/panel-admin-auth`, rama temporal `panel-admin-auth`. La rama `panel-admin`
no recibirá la implementación hasta que el trabajo completo esté probado, revisado y
el dueño autorice expresamente su integración local. Esto no implica push ni despliegue.

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

Mismo tratamiento que los productos, y **en el mismo orden**, que es el que demostró
funcionar:

1. `db/004_projects.sql` con el esquema, mirando `app/data/projects.ts` para saber
   qué campos hacen falta.
2. Traducción reversible proyecto ↔ fila, al estilo de `app/data/productRow.ts`.
3. Un script de verificación que convierta, simule el viaje por Postgres, reconstruya
   y compare **antes** de tocar la base de datos.
4. Importar y volver a comprobar leyendo de Neon.
5. Cambiar la lectura de la galería a la base de datos, con su etiqueta de caché.
6. Las pantallas del panel.

Lo que hizo que la migración de productos saliera limpia fue **no dar por buena una
importación porque el `insert` no diera error**, sino releer la base de datos y
comparar el resultado. Repetir eso aquí.

Ojo: `app/data/projects.ts` arma las rutas con el nombre de carpeta y de archivo
literales de `/public/proyectos/`. Hay 104 fotos en 12 carpetas.

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
| Paso d — fotos | **Crear el almacén Blob** en Vercel (Storage → Blob) y copiar `BLOB_READ_WRITE_TOKEN` a `.env.local`. |
| Que el sitio nuevo sea el oficial | **Apuntar el DNS de `econoluzgt.com` a Vercel.** Hoy ese dominio sigue sirviendo el WordPress viejo. |
| La tienda (paso 2) | Contratar certificador FEL, decidir el medio de cobro, redactar los textos legales de venta en línea y **fijar los precios**. Nada de eso lo puede hacer un programador. |

Además, **nada se publica ni se despliega sin que él lo confirme.**

---

## 10. Problemas conocidos, anteriores a este trabajo

No los causó la migración. Están documentados para que nadie pierda tiempo
investigándolos ni los confunda con una regresión.

### 10.1 Nombres de proveedor visibles en el catálogo público

`npm run catalogo:auditar` lo lista. **30 nombres distintos en unas 556 apariciones**,
en dos formas:

- **Las rutas de las fotos** llevan el nombre del proveedor: `/catalogos/construlita/…`,
  `/catalogos/highlum/…`, `/catalogos/artlite/…`. Los 313 productos. El nombre del
  archivo sí está anonimizado; la carpeta no. Se ve con clic derecho sobre cualquier
  foto. **Requiere código** (reescritura de rutas o mover archivos).
- **Los textos**: «Magnetrack Pro», «Nanovia», «Corvus», «Vialed», «Wallpack»,
  «Softglow»… en 62 descripciones y 22 fichas técnicas. Y **«Magnetrack Pro» y
  «Wallpacks» son categorías visibles del filtro** del catálogo. Esto es mucho más
  fácil de corregir **después** del panel, porque entonces el dueño puede editar los
  textos él mismo.

El dueño ya sabe que existe. **No arreglarlo sin hablarlo con él**: es un cambio de
contenido, no un bug.

### 10.2 Una prueba que falla

`tests/catalog-quote.spec.ts:891` (`rebases an action before the restoration frame and
persists it before frames flush`) falla de forma determinista. **Se comprobó
guardando los cambios a un lado y ejecutándola sobre el código anterior: falla igual.**
No tiene que ver con la base de datos ni con el catálogo. Las otras 87 pasan.

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
