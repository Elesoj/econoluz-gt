# Identidad de clientes — plan de implementación

> **Para quien ejecute esto con agentes:** SUB-SKILL OBLIGATORIA: usa
> `superpowers:subagent-driven-development` (recomendado) o
> `superpowers:executing-plans` para ejecutar tarea por tarea. Los pasos llevan
> casilla (`- [ ]`) para poder marcarlos.

**Objetivo:** que un cliente pueda crear su cuenta, entrar, guardar sus direcciones y sus
datos fiscales, y borrarse de verdad, sin tocar el acceso del panel administrativo y sin
que cambie nada de lo que ve hoy el visitante.

**Arquitectura:** Firebase Authentication es la fuente de verdad de quién eres; Neon, de
lo que es tuyo. El punto de unión es `users.firebase_uid`, columna única que **no** es
clave primaria. Los tokens se verifican solo en servidor con `firebase-admin`, importado
desde un único archivo. Todo el acceso a Postgres pasa por `app/lib/datos`, como exige la
regla del subproyecto 1.

**Stack:** Next.js 16.3.1 (App Router), TypeScript strict, `firebase-admin` (dependencia
nueva), `@neondatabase/serverless` a través de `app/lib/datos`, `node:test` para unidad,
Playwright para navegador, Postgres 18 en Neon.

**Especificación:** `docs/superpowers/specs/2026-09-01-identidad-clientes-design.md`. El
plan argumenta desde ella: quien ejecute debe leer las dos, y también
`docs/superpowers/specs/2026-08-30-backend-relacional-v2-design.md` §5.2, §7.3, §7.4, §8.1
y §8.2.

## Restricciones globales

Aplican a **todas** las tareas. Copiadas de la especificación y de `CLAUDE.md`.

- **Español de España** en comentarios de código nuevos, mensajes de commit y resúmenes.
  No se traducen nombres de variables, funciones, rutas ni salidas de terminal.
- **Una sola dependencia nueva: `firebase-admin`.** Ninguna más. **`jose` no se usa para
  verificar tokens de Firebase** bajo ningún concepto.
- **`firebase-admin` se importa solo desde `app/identidad/firebase.server.ts`.**
- **No se toca el panel.** `admin_users`, `admin_sessions`, `admin_login_attempts` y todo
  `app/admin/**` quedan sin modificar. `git diff` sobre ellos debe salir vacío al terminar.
- **Todo acceso a Postgres desde `app/**` pasa por `app/lib/datos`.** La lista
  `EXCEPCIONES_TRANSITORIAS` de `tests/datos-frontera-controlador.test.ts` sigue vacía.
- **El catálogo no cambia.** 313 productos, **25 precios**, `modelo_catalogo = legacy` y
  `catalogo:auditar` en 0 coincidencias, antes y después.
- **Nada de stock, carrito persistente, checkout, pagos, FEL ni catálogo relacional.**
- **Ninguna contraseña, token, cookie ni cadena de conexión** aparece en el repositorio ni
  en los registros.
- **La IP nunca se guarda en claro.**
- **Las cuatro cuestiones abiertas de §13 de la especificación no se resuelven aquí.**
- **Toda migración y toda prueba real van contra la rama de Neon `identidad-clientes-dev`**,
  nunca contra producción.
- **La consola del dueño es Windows PowerShell 5.1 y no entiende `&&`.** Los comandos que
  se le den van en líneas separadas.
- **Playwright levanta su propio servidor en el puerto 3100.** Si hay un `npm run dev`
  abierto, falla: hay que cerrarlo antes.
- **No se despliega, no se fusiona y no se hace push sin autorización expresa del dueño.**

## Lo que el dueño tiene que hacer antes de empezar

Sin esto, las tareas 2 en adelante no pueden verificarse:

1. Crear el **proyecto de Firebase de desarrollo** y activar los proveedores de correo y
   Google, con la opción de **una cuenta por dirección de correo**.
2. Descargar la credencial de servicio y ponerla en `.env.local`.
3. Crear la **rama de Neon `identidad-clientes-dev`** y poner su `DATABASE_URL` y
   `DATABASE_URL_PUBLIC` en el `.env.local` del worktree.
4. Generar la pimienta: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   y guardarla como `AUTH_EVENT_IP_PEPPER`.

---

## Estructura de archivos

**Se crean:**

| Archivo | Responsabilidad |
|---|---|
| `app/identidad/firebase.server.ts` | La única puerta a `firebase-admin`: verificar, crear cookie, revocar y borrar |
| `app/identidad/sesion.ts` | Puro: nombre y opciones de la cookie, duración, renovación, normalización de correo |
| `app/identidad/sesion.server.ts` | Leer el cliente actual desde la cookie, con `cache()` |
| `app/identidad/huella.ts` | Puro: huella HMAC de la IP y familia del navegador |
| `app/identidad/aprovisionamiento.ts` | Puro: la sentencia de `upsert`, sus parámetros y la lectura del resultado |
| `app/identidad/aprovisionamiento.server.ts` | Ejecuta el `upsert` dentro de `escribir()` |
| `app/identidad/eventos.ts` | Puro: construir la fila de `auth_events` |
| `app/identidad/eventos.server.ts` | Escribirla |
| `app/identidad/direcciones.ts` | Puro: validación y sentencias de `user_addresses` |
| `app/identidad/direcciones.server.ts` | Sus lecturas y escrituras |
| `app/identidad/consentimientos.ts` / `.server.ts` | Aceptar y revocar versiones |
| `app/identidad/anonimizacion.ts` | Puro: los marcadores y las sentencias del borrado |
| `app/identidad/anonimizacion.server.ts` | El borrado completo, Firebase primero |
| `app/api/clientes/sesion/route.ts` | Canjear el ID token por cookie y cerrar sesión |
| `app/api/clientes/borrar/route.ts` | El borrado de cuenta |
| `app/cuenta/**` | Las pantallas |
| `db/009_identidad_clientes.sql` | Las cuatro tablas |
| `scripts/reconciliar-identidades.mjs` | El barrido que termina los borrados a medias |
| `tests/identidad-*.test.ts` | Las pruebas de unidad y estructurales |

**Se modifican:** `package.json` (dependencia y scripts), `scripts/verificar-permisos.mjs`
(las cuatro tablas nuevas), `.env.example`, `CLAUDE.md` y `docs/CONTINUAR-PANEL.md`.

---

## Tarea 1: La puerta única a `firebase-admin` y la frontera con el panel

**Archivos:**
- Crear: `app/identidad/firebase.server.ts`, `tests/identidad-frontera.test.ts`
- Modificar: `package.json`

**Interfaces:**
- Consume: nada.
- Produce: `verificarIdToken(idToken: string): Promise<IdentidadVerificada>`,
  `crearCookieDeSesion(idToken: string, msDuracion: number): Promise<string>`,
  `verificarCookieDeSesion(cookie: string): Promise<IdentidadVerificada>`,
  `revocarYBorrarUsuario(uid: string): Promise<void>`, y el tipo
  `IdentidadVerificada = { uid: string; email: string; emailVerificado: boolean; nombre: string; proveedor: string }`.

- [ ] **Paso 1: escribir la prueba estructural que falla**

`tests/identidad-frontera.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

const RAIZ = join(import.meta.dirname, "..");

function archivosDe(carpeta: string): string[] {
  if (!existsSync(carpeta)) return [];
  return readdirSync(carpeta, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = join(carpeta, entrada.name);
    if (entrada.isDirectory()) return archivosDe(ruta);
    return /\.tsx?$/.test(entrada.name) ? [ruta] : [];
  });
}

const aPosix = (ruta: string) => relative(RAIZ, ruta).split(sep).join("/");

test("solo firebase.server.ts importa firebase-admin", () => {
  const infractores = [...archivosDe(join(RAIZ, "app")), ...archivosDe(join(RAIZ, "scripts"))]
    .filter((ruta) => readFileSync(ruta, "utf8").includes("firebase-admin"))
    .map(aPosix)
    .filter((ruta) => ruta !== "app/identidad/firebase.server.ts");

  assert.deepEqual(
    infractores,
    [],
    `Solo app/identidad/firebase.server.ts puede importar firebase-admin. Lo importan ` +
      `además:\n${infractores.join("\n")}`,
  );
});

test("la identidad de clientes no importa nada del panel, ni al revés", () => {
  const clientes = [
    ...archivosDe(join(RAIZ, "app", "identidad")),
    ...archivosDe(join(RAIZ, "app", "cuenta")),
  ];
  const invasores = clientes
    .filter((ruta) => /from "[^"]*app\/admin|from "\.\.\/admin|from "\.\.\/\.\.\/admin/.test(readFileSync(ruta, "utf8")))
    .map(aPosix);

  assert.deepEqual(invasores, [], `Módulos de clientes que importan del panel:\n${invasores.join("\n")}`);

  const panel = archivosDe(join(RAIZ, "app", "admin"));
  const contaminados = panel
    .filter((ruta) => /identidad\/|app\/cuenta/.test(readFileSync(ruta, "utf8")))
    .map(aPosix);

  assert.deepEqual(contaminados, [], `Módulos del panel que importan de clientes:\n${contaminados.join("\n")}`);
});

test("nadie verifica tokens de Firebase con jose", () => {
  const conJose = archivosDe(join(RAIZ, "app"))
    .filter((ruta) => readFileSync(ruta, "utf8").includes('from "jose"'))
    .map(aPosix);

  assert.deepEqual(conJose, [], "Los tokens de Firebase se verifican con firebase-admin, nunca con jose.");
});
```

- [ ] **Paso 2: ejecutar y comprobar que pasa en vacío, y que muerde**

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/identidad-frontera.test.ts
```

Esperado: 3 en verde (todavía no hay nada que infrinja). **Comprobar que la prueba no es
trivial**: crear a mano `app/identidad/prueba.ts` con `import "firebase-admin";`, volver a
ejecutar, ver el fallo con el nombre del archivo, y borrar el archivo.

- [ ] **Paso 3: añadir la dependencia**

```bash
npm install firebase-admin
```

- [ ] **Paso 4: escribir la puerta única**

`app/identidad/firebase.server.ts`:

```ts
import "server-only";

import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

/**
 * La única puerta a `firebase-admin` en todo el proyecto.
 *
 * Es la misma regla que protege el controlador de Neon en `app/lib/datos`, y
 * por la misma razón: cuando la dependencia entra por un solo sitio, cambiarla
 * o simularla en pruebas es un trabajo acotado. `tests/identidad-frontera.test.ts`
 * lo vigila.
 *
 * La inicialización es perezosa: sin credenciales, el sitio tiene que arrancar
 * igual, como ya hacen el catálogo y `/api/leads`.
 */

export type IdentidadVerificada = {
  uid: string;
  email: string;
  emailVerificado: boolean;
  nombre: string;
  proveedor: string;
};

function credenciales() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  // La clave privada viaja con "\n" escapados en las variables de entorno.
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Faltan las credenciales de servicio de Firebase.");
  }

  return { projectId, clientEmail, privateKey };
}

let app: App | null = null;

function obtenerApp(): App {
  if (!app) {
    app = getApps()[0] ?? initializeApp({ credential: cert(credenciales()) });
  }
  return app;
}

const auth = () => getAuth(obtenerApp());

/** El proveedor con el que se autenticó esta vez, o "desconocido". */
function proveedorDe(claims: Record<string, unknown>): string {
  const firebase = claims.firebase as { sign_in_provider?: string } | undefined;
  return firebase?.sign_in_provider ?? "desconocido";
}

function aIdentidad(claims: Record<string, unknown>): IdentidadVerificada {
  return {
    uid: String(claims.uid ?? claims.sub ?? ""),
    email: String(claims.email ?? ""),
    emailVerificado: claims.email_verified === true,
    nombre: String(claims.name ?? ""),
    proveedor: proveedorDe(claims),
  };
}

export async function verificarIdToken(idToken: string): Promise<IdentidadVerificada> {
  // `true` comprueba que la cuenta no esté deshabilitada ni la sesión revocada.
  const claims = await auth().verifyIdToken(idToken, true);
  return aIdentidad(claims as unknown as Record<string, unknown>);
}

export async function crearCookieDeSesion(idToken: string, msDuracion: number) {
  return auth().createSessionCookie(idToken, { expiresIn: msDuracion });
}

export async function verificarCookieDeSesion(cookie: string): Promise<IdentidadVerificada> {
  const claims = await auth().verifySessionCookie(cookie, true);
  return aIdentidad(claims as unknown as Record<string, unknown>);
}

/**
 * Revoca las sesiones y borra la identidad. En este orden: si se borrara
 * primero, una sesión viva podría seguir usándose durante su último minuto.
 */
export async function revocarYBorrarUsuario(uid: string): Promise<void> {
  await auth().revokeRefreshTokens(uid);
  await auth().deleteUser(uid);
}
```

- [ ] **Paso 5: comprobar tipos, lint y la frontera**

```bash
npm run typecheck
```

```bash
npm run lint
```

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/identidad-frontera.test.ts
```

Esperado: sin errores y 3 pruebas en verde.

- [ ] **Paso 6: confirmar**

```bash
git add package.json package-lock.json app/identidad/firebase.server.ts tests/identidad-frontera.test.ts
git commit -m "feat(identidad): puerta unica a firebase-admin y frontera con el panel"
```

---

## Tarea 2: La migración `009` y los permisos del rol público

**Archivos:**
- Crear: `db/009_identidad_clientes.sql`
- Modificar: `scripts/verificar-permisos.mjs`

**Interfaces:**
- Consume: nada.
- Produce: las tablas `users`, `user_addresses`, `user_consents` y `auth_events`.

- [ ] **Paso 1: escribir la migración**

`db/009_identidad_clientes.sql`:

```sql
-- Identidad de clientes. Firebase guarda quién eres; esto, lo que es tuyo.
--
-- Estas tablas NO tienen nada que ver con `admin_users`: el panel es otro
-- sistema y no se relaciona con este por ninguna columna.

create table if not exists users (
  id                 bigserial   primary key,
  -- Identificador externo único, NUNCA clave primaria: si algún día Firebase
  -- se sustituye, cambia esta columna y no las claves foráneas del esquema.
  firebase_uid       text        not null unique,
  email              text        not null,
  email_verificado   boolean     not null default false,
  nombre             text        not null default '',
  telefono           text,
  nit                text,
  nombre_fiscal      text,
  estado             text        not null default 'activa',
  creado_en          timestamptz not null default now(),
  actualizado_en     timestamptz not null default now(),
  ultimo_acceso_en   timestamptz,
  anonimizado_en     timestamptz,

  constraint users_estado_valido check (estado in ('activa', 'anonimizada')),
  constraint users_email_minusculas check (email = lower(btrim(email))),
  -- Ni anonimizada sin fecha, ni con fecha pero todavía activa.
  constraint users_anonimizada_tiene_fecha
    check ((estado = 'anonimizada') = (anonimizado_en is not null))
);

-- Un correo, una cuenta activa. Firebase ya lo promete, pero esa garantía vive
-- en un servicio ajeno y una configuración cambiada por descuido la desactiva
-- sin que nada se queje. Es parcial porque quien se da de baja debe poder
-- volver a registrarse con el mismo correo.
create unique index if not exists users_email_activo
  on users (email) where estado = 'activa';

create table if not exists user_addresses (
  id             bigserial   primary key,
  user_id        bigint      not null references users(id) on delete cascade,
  destinatario   text        not null,
  telefono       text        not null,
  departamento   text        not null,
  municipio      text        not null,
  direccion      text        not null,
  -- En Guatemala buena parte de las entregas dependen de «portón negro frente
  -- a la tienda» más que del número de casa.
  referencias    text        not null default '',
  predeterminada boolean     not null default false,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

-- Una sola predeterminada por cliente, garantizado por la base y no por el
-- código: es la clase de invariante que se olvida en cuanto hay dos caminos
-- de escritura.
create unique index if not exists user_addresses_una_predeterminada
  on user_addresses (user_id) where predeterminada;

create index if not exists user_addresses_user_id_idx on user_addresses (user_id);

create table if not exists user_consents (
  id           bigserial   primary key,
  user_id      bigint      not null references users(id) on delete cascade,
  tipo         text        not null,
  -- Los textos legales se versionan por fecha: '2026-09-01'.
  version      text        not null,
  aceptado_en  timestamptz not null default now(),
  revocado_en  timestamptz,

  constraint user_consents_tipo_valido
    check (tipo in ('terminos', 'privacidad', 'comunicaciones'))
);

create index if not exists user_consents_user_id_idx on user_consents (user_id, tipo);

create table if not exists auth_events (
  id             bigserial   primary key,
  -- A nulo al borrar la cuenta: el evento sigue siendo útil aunque ya no haya
  -- a quién atribuirlo, y mantenerlo enganchado sería conservar identidad.
  user_id        bigint      references users(id) on delete set null,
  tipo           text        not null,
  proveedor      text,
  resultado      text        not null,
  -- HMAC con pimienta secreta. NUNCA la IP en claro.
  ip_huella      text,
  -- La familia del navegador, no la cadena completa.
  navegador      text,
  ocurrido_en    timestamptz not null default now(),

  constraint auth_events_tipo_valido
    check (tipo in ('registro', 'acceso', 'vinculacion', 'borrado', 'fallo')),
  constraint auth_events_resultado_valido
    check (resultado in ('correcto', 'fallido'))
);

create index if not exists auth_events_ocurrido_en_idx on auth_events (ocurrido_en desc);
create index if not exists auth_events_huella_idx on auth_events (ip_huella, ocurrido_en desc);
```

- [ ] **Paso 2: añadir las cuatro tablas a la prueba de permisos**

En `scripts/verificar-permisos.mjs`, dentro de `PROHIBIDAS`, después de `"audit_log"`:

```js
  "users",
  "user_addresses",
  "user_consents",
  "auth_events",
```

- [ ] **Paso 3: aplicar la migración en la rama de desarrollo**

Comprobar antes que `.env.local` apunta a `identidad-clientes-dev` y **no** a producción:

```bash
node -e "console.log(new URL(process.env.DATABASE_URL).host)" 
```

```bash
npm run db:migrar
```

Esperado: `APLICADA 009_identidad_clientes.sql`.

- [ ] **Paso 4: comprobar los invariantes contra la base real**

```bash
npm run test:permisos
```

Esperado: las cuatro tablas nuevas aparecen como **denegadas**.

Y las tres reglas que el código no puede olvidar, probadas de verdad. Guardar como
`scripts/verificar-identidad.mjs` y añadir `"identidad:verificar"` a `package.json`:

```js
// Comprueba contra la base los invariantes de la identidad de clientes.
// Todo dentro de una transaccion que se deshace: no deja rastro.
import { Client, neonConfig } from "@neondatabase/serverless";
neonConfig.webSocketConstructor = globalThis.WebSocket;

const cliente = new Client(process.env.DATABASE_URL);
await cliente.connect();
let fallos = 0;
const mal = (m) => { console.error(`  FALLA  ${m}`); fallos += 1; };
const bien = (m) => console.log(`  ok     ${m}`);

const alta = (uid, email) =>
  cliente.query("insert into users (firebase_uid, email) values ($1, $2) returning id", [uid, email]);

try {
  await cliente.query("begin");

  const { rows } = await alta("uid-uno", "persona@example.com");
  const id = rows[0].id;
  bien("se puede dar de alta una cuenta");

  try {
    await cliente.query("savepoint s1");
    await alta("uid-dos", "persona@example.com");
    mal("acepto dos cuentas activas con el mismo correo");
    await cliente.query("rollback to savepoint s1");
  } catch {
    await cliente.query("rollback to savepoint s1");
    bien("rechaza dos cuentas activas con el mismo correo");
  }

  await cliente.query(
    "update users set estado = 'anonimizada', anonimizado_en = now(), email = $2, firebase_uid = $3 where id = $1",
    [id, `borrado+${id}@invalid`, `borrado:${id}`],
  );
  await alta("uid-tres", "persona@example.com");
  bien("tras anonimizar, el mismo correo puede registrarse otra vez");

  try {
    await cliente.query("savepoint s2");
    await cliente.query("update users set estado = 'anonimizada' where id = $1", [id]);
    mal("acepto anonimizada sin fecha");
    await cliente.query("rollback to savepoint s2");
  } catch {
    await cliente.query("rollback to savepoint s2");
    bien("rechaza una cuenta anonimizada sin fecha");
  }

  const { rows: dir } = await cliente.query(
    `insert into user_addresses (user_id, destinatario, telefono, departamento, municipio, direccion, predeterminada)
     values ($1, 'Quien recibe', '4042 8790', 'Guatemala', 'Guatemala', '21 Avenida 0-18', true) returning id`,
    [id],
  );
  try {
    await cliente.query("savepoint s3");
    await cliente.query(
      `insert into user_addresses (user_id, destinatario, telefono, departamento, municipio, direccion, predeterminada)
       values ($1, 'Otra', '4042 8790', 'Guatemala', 'Mixco', 'Otra calle', true)`,
      [id],
    );
    mal("acepto dos direcciones predeterminadas");
    await cliente.query("rollback to savepoint s3");
  } catch {
    await cliente.query("rollback to savepoint s3");
    bien("rechaza dos direcciones predeterminadas del mismo cliente");
  }
  console.log(`  (direccion de prueba ${dir[0].id})`);

  console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} fallo(s).`);
  process.exitCode = fallos === 0 ? 0 : 1;
} finally {
  await cliente.query("rollback");
  await cliente.end();
  console.log("  rollback: la base queda como estaba");
}
```

```bash
npm run identidad:verificar
```

Esperado: cinco líneas `ok` y `Todo correcto.`

- [ ] **Paso 5: confirmar que el catálogo sigue intacto**

```bash
npm run catalogo:auditar
```

Esperado: 313 productos, 408 identificadores, 0 coincidencias.

- [ ] **Paso 6: confirmar**

```bash
git add db/009_identidad_clientes.sql scripts/verificar-permisos.mjs scripts/verificar-identidad.mjs package.json
git commit -m "feat(identidad): tablas de clientes, direcciones, consentimientos y eventos"
```

---

## Tarea 3: La política de la sesión, en puro

**Archivos:**
- Crear: `app/identidad/sesion.ts`, `tests/identidad-sesion.test.ts`

**Interfaces:**
- Consume: nada.
- Produce: `COOKIE_SESION_CLIENTE`, `DIAS_DE_SESION`, `MS_DE_SESION`,
  `normalizarCorreo(valor: unknown): string`,
  `opcionesDeCookie(expira: Date, produccion: boolean): OpcionesDeCookie`,
  `caducidadDesde(ahora: Date): Date`, `debeRenovarse(expira: Date, ahora: Date): boolean`.

- [ ] **Paso 1: escribir la prueba que falla**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COOKIE_SESION_CLIENTE,
  MS_DE_SESION,
  caducidadDesde,
  debeRenovarse,
  normalizarCorreo,
  opcionesDeCookie,
} from "../app/identidad/sesion";

test("la cookie del cliente no se llama como la del panel", () => {
  assert.notEqual(COOKIE_SESION_CLIENTE, "econoluz_admin");
  assert.match(COOKIE_SESION_CLIENTE, /cliente/);
});

test("el correo se normaliza a minúsculas y sin espacios", () => {
  assert.equal(normalizarCorreo("  Persona@Example.COM "), "persona@example.com");
  assert.equal(normalizarCorreo(""), "");
  assert.equal(normalizarCorreo(null), "");
  assert.equal(normalizarCorreo(42), "");
});

test("la sesión dura cinco días", () => {
  assert.equal(MS_DE_SESION, 5 * 24 * 60 * 60 * 1000);
  const ahora = new Date("2026-09-01T00:00:00.000Z");
  assert.equal(caducidadDesde(ahora).toISOString(), "2026-09-06T00:00:00.000Z");
});

test("la cookie es httpOnly, laxa y con ámbito de todo el sitio", () => {
  const opciones = opcionesDeCookie(new Date("2026-09-06T00:00:00.000Z"), true);
  assert.equal(opciones.httpOnly, true);
  assert.equal(opciones.sameSite, "lax");
  assert.equal(opciones.secure, true);
  // El panel usa "/admin"; el cliente necesita todo el sitio.
  assert.equal(opciones.path, "/");
});

test("fuera de producción la cookie no exige https, o no habría desarrollo local", () => {
  assert.equal(opcionesDeCookie(new Date(), false).secure, false);
});

test("se renueva cuando ha pasado más de la mitad de su vida", () => {
  const ahora = new Date("2026-09-03T00:00:00.000Z");
  // Caduca en cuatro días: solo ha pasado un día de cinco.
  assert.equal(debeRenovarse(new Date("2026-09-07T00:00:00.000Z"), ahora), false);
  // Caduca en un día: han pasado cuatro de cinco.
  assert.equal(debeRenovarse(new Date("2026-09-04T00:00:00.000Z"), ahora), true);
});

test("una sesión ya caducada no se renueva: se rehace entrando", () => {
  const ahora = new Date("2026-09-03T00:00:00.000Z");
  assert.equal(debeRenovarse(new Date("2026-09-01T00:00:00.000Z"), ahora), false);
});
```

- [ ] **Paso 2: ejecutar y comprobar que falla**

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/identidad-sesion.test.ts
```

Esperado: falla con «Cannot find module '../app/identidad/sesion'».

- [ ] **Paso 3: escribir la implementación**

```ts
/**
 * La política de la sesión del cliente. Módulo puro: sin cookies, sin red y
 * sin `server-only`, para poder probarlo con `node:test`.
 *
 * Nada de aquí toca la sesión del panel, que vive en `app/admin/auth` y usa
 * otra cookie, otro ámbito y otro mecanismo.
 */

export const COOKIE_SESION_CLIENTE = "econoluz_cliente";

/** Cinco días, decidido con el dueño el 01/09/2026. */
export const DIAS_DE_SESION = 5;
export const MS_DE_SESION = DIAS_DE_SESION * 24 * 60 * 60 * 1000;

export type OpcionesDeCookie = {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
  expires: Date;
};

export function normalizarCorreo(valor: unknown): string {
  return typeof valor === "string" ? valor.trim().toLowerCase() : "";
}

export function caducidadDesde(ahora: Date): Date {
  return new Date(ahora.getTime() + MS_DE_SESION);
}

/**
 * `sameSite: "lax"` y no `"strict"`: al volver del redirigido de Google, una
 * cookie estricta no viajaría y la sesión parecería no existir.
 *
 * `path: "/"` porque el cliente navega por todo el sitio, a diferencia del
 * panel, cuya cookie se limita a `/admin`.
 */
export function opcionesDeCookie(expira: Date, produccion: boolean): OpcionesDeCookie {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: produccion,
    path: "/",
    expires: expira,
  };
}

/**
 * Se renueva pasada la mitad de la vida: así el uso normal mantiene la sesión
 * viva sin renovarla en cada carga. Una sesión ya caducada no se renueva
 * —se rehace entrando—, que es lo que impide alargar indefinidamente una
 * sesión abandonada.
 */
export function debeRenovarse(expira: Date, ahora: Date): boolean {
  const restante = expira.getTime() - ahora.getTime();
  return restante > 0 && restante < MS_DE_SESION / 2;
}
```

- [ ] **Paso 4: ejecutar y comprobar que pasa**

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/identidad-sesion.test.ts
```

Esperado: 7 pruebas en verde.

- [ ] **Paso 5: confirmar**

```bash
git add app/identidad/sesion.ts tests/identidad-sesion.test.ts
git commit -m "feat(identidad): politica de la sesion del cliente"
```

---

## Tarea 4: La huella de IP y la familia del navegador

**Archivos:**
- Crear: `app/identidad/huella.ts`, `tests/identidad-huella.test.ts`

**Interfaces:**
- Consume: nada.
- Produce: `huellaDeIp(ip: string | null, pimienta: string | undefined): string | null`,
  `familiaDeNavegador(userAgent: string | null): string | null`.

- [ ] **Paso 1: escribir la prueba que falla**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { familiaDeNavegador, huellaDeIp } from "../app/identidad/huella";

const PIMIENTA = "pimienta-de-prueba-que-no-es-la-real";

test("la huella no contiene la IP ni permite recuperarla", () => {
  const huella = huellaDeIp("190.56.100.25", PIMIENTA);
  assert.ok(huella);
  assert.equal(huella!.includes("190"), false);
  assert.equal(huella!.includes("."), false);
  assert.match(huella!, /^[0-9a-f]{32}$/);
});

test("la misma IP da la misma huella, e IPs distintas dan huellas distintas", () => {
  assert.equal(huellaDeIp("190.56.100.25", PIMIENTA), huellaDeIp("190.56.100.25", PIMIENTA));
  assert.notEqual(huellaDeIp("190.56.100.25", PIMIENTA), huellaDeIp("190.56.100.26", PIMIENTA));
});

test("cambiar la pimienta cambia la huella: sin ella no se puede reconstruir", () => {
  assert.notEqual(huellaDeIp("190.56.100.25", PIMIENTA), huellaDeIp("190.56.100.25", "otra"));
});

test("sin pimienta no se inventa una huella débil: no hay huella", () => {
  assert.equal(huellaDeIp("190.56.100.25", undefined), null);
  assert.equal(huellaDeIp("190.56.100.25", ""), null);
});

test("sin IP tampoco hay huella", () => {
  assert.equal(huellaDeIp(null, PIMIENTA), null);
  assert.equal(huellaDeIp("", PIMIENTA), null);
});

test("del navegador se guarda la familia, no la cadena entera", () => {
  const ua =
    "Mozilla/5.0 (Linux; Android 13; SM-A536E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
  const familia = familiaDeNavegador(ua);
  assert.equal(familia, "Chrome en Android");
  assert.equal(familia!.includes("SM-A536E"), false);
});

test("un navegador desconocido no rompe nada", () => {
  assert.equal(familiaDeNavegador("algo rarísimo"), "Otro");
  assert.equal(familiaDeNavegador(null), null);
});
```

- [ ] **Paso 2: ejecutar y comprobar que falla**

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/identidad-huella.test.ts
```

Esperado: falla con «Cannot find module '../app/identidad/huella'».

- [ ] **Paso 3: escribir la implementación**

```ts
import { createHmac } from "node:crypto";

/**
 * Lo que se puede guardar de quien entra, sin guardar quién es.
 *
 * La IP **nunca** se almacena en claro. Se guarda un HMAC con una pimienta
 * secreta, truncado, que sirve para lo único que necesitamos —ver que veinte
 * intentos fallidos vienen del mismo sitio— y no se puede revertir.
 *
 * Si la pimienta rota, las huellas anteriores dejan de ser comparables con las
 * nuevas. Es un coste aceptado y queda dicho para que nadie lo descubra por
 * sorpresa.
 */

/** 128 bits: de sobra para no colisionar, y la mitad de dato que guardar. */
const CARACTERES_DE_HUELLA = 32;

export function huellaDeIp(ip: string | null, pimienta: string | undefined): string | null {
  // Sin pimienta no se calcula una huella débil: se prefiere no tener ninguna
  // a tener una reversible con una tabla de las cuatro mil millones de IPv4.
  if (!ip || !pimienta) {
    return null;
  }

  return createHmac("sha256", pimienta).update(ip).digest("hex").slice(0, CARACTERES_DE_HUELLA);
}

const NAVEGADORES: readonly [RegExp, string][] = [
  [/Edg\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/Chrome\//, "Chrome"],
  [/Firefox\//, "Firefox"],
  [/Safari\//, "Safari"],
];

const SISTEMAS: readonly [RegExp, string][] = [
  [/Android/, "Android"],
  [/iPhone|iPad|iOS/, "iOS"],
  [/Windows/, "Windows"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/Linux/, "Linux"],
];

/**
 * La cadena completa del navegador es en sí misma una huella identificativa
 * —modelo de teléfono incluido—, así que solo se guarda la familia.
 */
export function familiaDeNavegador(userAgent: string | null): string | null {
  if (!userAgent) {
    return null;
  }

  const navegador = NAVEGADORES.find(([patron]) => patron.test(userAgent))?.[1];
  const sistema = SISTEMAS.find(([patron]) => patron.test(userAgent))?.[1];

  if (!navegador && !sistema) return "Otro";
  if (!sistema) return navegador!;
  if (!navegador) return sistema;
  return `${navegador} en ${sistema}`;
}
```

- [ ] **Paso 4: ejecutar y comprobar que pasa**

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/identidad-huella.test.ts
```

Esperado: 7 pruebas en verde. Ojo con el orden de `NAVEGADORES`: Edge y Opera se declaran
antes que Chrome porque sus cadenas también contienen `Chrome/`.

- [ ] **Paso 5: confirmar**

```bash
git add app/identidad/huella.ts tests/identidad-huella.test.ts
git commit -m "feat(identidad): huella de IP sin guardar la direccion"
```

---

## Tarea 5: El aprovisionamiento idempotente

**Archivos:**
- Crear: `app/identidad/aprovisionamiento.ts`,
  `app/identidad/aprovisionamiento.server.ts`,
  `tests/identidad-aprovisionamiento.test.ts`

**Interfaces:**
- Consume: `IdentidadVerificada` de `firebase.server.ts` (solo el tipo, importado con
  `import type`), `normalizarCorreo` de `sesion.ts`, `escribir` de `app/lib/datos`.
- Produce: `SQL_APROVISIONAR`, `parametrosDeAprovisionamiento(identidad): unknown[]`,
  `interpretarAprovisionamiento(filas): ClienteAprovisionado`, y
  `aprovisionarCliente(identidad): Promise<ClienteAprovisionado>` en el `.server.ts`.
  `type ClienteAprovisionado = { id: string; recienCreada: boolean }`.

- [ ] **Paso 1: escribir la prueba que falla**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SQL_APROVISIONAR,
  interpretarAprovisionamiento,
  parametrosDeAprovisionamiento,
} from "../app/identidad/aprovisionamiento";

const IDENTIDAD = {
  uid: "uid-de-firebase",
  email: "  Persona@Example.COM ",
  emailVerificado: true,
  nombre: "Quien Compra",
  proveedor: "google.com",
};

test("el correo llega normalizado a la base, o la restricción lo rechazaría", () => {
  assert.deepEqual(parametrosDeAprovisionamiento(IDENTIDAD), [
    "uid-de-firebase",
    "persona@example.com",
    true,
    "Quien Compra",
  ]);
});

test("la sentencia resuelve el conflicto por firebase_uid y no por correo", () => {
  assert.match(SQL_APROVISIONAR, /on conflict \(firebase_uid\)/);
  assert.equal(SQL_APROVISIONAR.includes("on conflict (email)"), false);
});

test("la sentencia no pisa datos que el cliente edita en su perfil", () => {
  // El nombre, el teléfono, el NIT y el nombre fiscal los mantiene el cliente:
  // si el `update` los sobrescribiera con lo que diga Firebase, cada acceso
  // borraría lo que acabara de escribir.
  for (const columna of ["telefono", "nit", "nombre_fiscal"]) {
    assert.equal(
      new RegExp(`set[\\s\\S]*${columna}\\s*=`).test(SQL_APROVISIONAR),
      false,
      `El upsert no debe tocar ${columna}`,
    );
  }
});

test("una fila recién creada se distingue de una que ya existía", () => {
  assert.deepEqual(interpretarAprovisionamiento([{ id: "7", recien_creada: true }]), {
    id: "7",
    recienCreada: true,
  });
  assert.deepEqual(interpretarAprovisionamiento([{ id: "7", recien_creada: false }]), {
    id: "7",
    recienCreada: false,
  });
});

test("un identificador numérico se devuelve como texto, sin perder precisión", () => {
  // `bigserial` puede superar el entero seguro de JavaScript.
  assert.equal(interpretarAprovisionamiento([{ id: 9007199254740993n, recien_creada: true }]).id,
    "9007199254740993");
});

test("una respuesta vacía es un error, no un usuario a medias", () => {
  assert.throws(() => interpretarAprovisionamiento([]), /aprovisionar/i);
});
```

- [ ] **Paso 2: ejecutar y comprobar que falla**

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/identidad-aprovisionamiento.test.ts
```

Esperado: falla con «Cannot find module '../app/identidad/aprovisionamiento'».

- [ ] **Paso 3: escribir el módulo puro**

```ts
import type { IdentidadVerificada } from "./firebase.server";
import { normalizarCorreo } from "./sesion";

/**
 * La fila de `users` que corresponde a una identidad de Firebase.
 *
 * El aprovisionamiento es perezoso a propósito: no hay un paso de «registro»
 * que pueda fallar a mitad y dejar una identidad en Firebase sin fila en Neon.
 * La fila aparece la primera vez que hace falta, y es idempotente: dos
 * pestañas entrando a la vez producen un usuario, no dos ni un error.
 */

export type ClienteAprovisionado = { id: string; recienCreada: boolean };

/**
 * `xmax = 0` es el modo habitual de distinguir en un `upsert` si la fila se
 * acaba de crear, pero se apoya en una columna interna de PostgreSQL y no en
 * el estándar. Se usa porque evita una consulta previa y la carrera que trae
 * consigo; la prueba de integración de la tarea 7 lo comprueba de verdad.
 *
 * El `update` **solo** toca lo que manda Firebase. El nombre, el teléfono, el
 * NIT y el nombre fiscal los mantiene el cliente en su perfil: sobrescribirlos
 * en cada acceso borraría lo que acabara de escribir.
 */
export const SQL_APROVISIONAR = `
  insert into users (firebase_uid, email, email_verificado, nombre)
  values ($1, $2, $3, $4)
  on conflict (firebase_uid) do update
    set email = excluded.email,
        email_verificado = excluded.email_verificado,
        ultimo_acceso_en = now(),
        actualizado_en = now()
  returning id, (xmax = 0) as recien_creada
`;

export function parametrosDeAprovisionamiento(identidad: IdentidadVerificada) {
  return [
    identidad.uid,
    // Normalizado aquí porque la restricción `users_email_minusculas` lo exige:
    // sin esto, un correo con mayúsculas rompería el alta en vez de guardarse.
    normalizarCorreo(identidad.email),
    identidad.emailVerificado,
    identidad.nombre,
  ];
}

export function interpretarAprovisionamiento(
  filas: readonly Record<string, unknown>[],
): ClienteAprovisionado {
  const fila = filas[0];
  if (!fila) {
    throw new Error("No se pudo aprovisionar la cuenta del cliente.");
  }

  return {
    // `bigserial` puede superar el entero seguro de JavaScript: se maneja como
    // texto de punta a punta, igual que ya hace el panel con sus identificadores.
    id: String(fila.id),
    recienCreada: fila.recien_creada === true,
  };
}
```

- [ ] **Paso 4: escribir el `.server.ts`**

```ts
import "server-only";

import { escribir } from "../lib/datos";
import type { IdentidadVerificada } from "./firebase.server";
import {
  SQL_APROVISIONAR,
  interpretarAprovisionamiento,
  parametrosDeAprovisionamiento,
  type ClienteAprovisionado,
} from "./aprovisionamiento";

/**
 * Va por `escribir` y no por `leer`: el aprovisionamiento y el evento que lo
 * acompaña son una sola operación, y si el segundo falla no puede quedar el
 * primero suelto.
 */
export async function aprovisionarCliente(
  identidad: IdentidadVerificada,
): Promise<ClienteAprovisionado> {
  return escribir(
    async (ejecutar) => {
      const filas = await ejecutar(SQL_APROVISIONAR, parametrosDeAprovisionamiento(identidad));
      return interpretarAprovisionamiento(filas);
    },
    { suceso: "aprovisionar-cliente" },
  );
}
```

- [ ] **Paso 5: ejecutar y comprobar que pasa**

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/identidad-aprovisionamiento.test.ts
```

```bash
npm run typecheck
```

Esperado: 6 pruebas en verde y sin errores de tipos.

- [ ] **Paso 6: confirmar**

```bash
git add app/identidad/aprovisionamiento.ts app/identidad/aprovisionamiento.server.ts tests/identidad-aprovisionamiento.test.ts
git commit -m "feat(identidad): aprovisionamiento perezoso e idempotente del cliente"
```

---

## Tarea 6: Los eventos de autenticación

**Archivos:**
- Crear: `app/identidad/eventos.ts`, `app/identidad/eventos.server.ts`,
  `tests/identidad-eventos.test.ts`

**Interfaces:**
- Consume: `huellaDeIp`, `familiaDeNavegador`, `leer`.
- Produce: `type TipoDeEvento`, `SQL_REGISTRAR_EVENTO`,
  `parametrosDeEvento(evento: EventoDeAutenticacion): unknown[]`,
  `SQL_CONTAR_FALLOS`, `MAXIMO_DE_FALLOS`, `MINUTOS_DE_VENTANA`,
  `hayDemasiadosFallos(filas): boolean`, y en el `.server.ts`
  `registrarEvento(evento): Promise<void>` y
  `demasiadosFallosRecientes(ip: string | null): Promise<boolean>`.

- [ ] **Paso 1: escribir la prueba que falla**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAXIMO_DE_FALLOS,
  SQL_CONTAR_FALLOS,
  SQL_REGISTRAR_EVENTO,
  hayDemasiadosFallos,
  parametrosDeEvento,
} from "../app/identidad/eventos";

const BASE = {
  userId: "7",
  tipo: "acceso" as const,
  proveedor: "google.com",
  resultado: "correcto" as const,
  ip: "190.56.100.25",
  userAgent: "Mozilla/5.0 (Linux; Android 13) Chrome/120.0.0.0 Mobile Safari/537.36",
  pimienta: "pimienta-de-prueba",
};

test("la IP no viaja a la base: viaja su huella", () => {
  const parametros = parametrosDeEvento(BASE);
  assert.equal(parametros.includes("190.56.100.25"), false);
  assert.match(String(parametros[4]), /^[0-9a-f]{32}$/);
});

test("del navegador solo va la familia", () => {
  assert.equal(parametrosDeEvento(BASE)[5], "Chrome en Android");
});

test("un evento sin usuario conocido se guarda igual", () => {
  const parametros = parametrosDeEvento({ ...BASE, userId: null, tipo: "fallo", resultado: "fallido" });
  assert.equal(parametros[0], null);
  assert.equal(parametros[1], "fallo");
  assert.equal(parametros[3], "fallido");
});

test("sin pimienta no se guarda huella, y el evento no se pierde por eso", () => {
  const parametros = parametrosDeEvento({ ...BASE, pimienta: undefined });
  assert.equal(parametros[4], null);
  assert.equal(parametros[1], "acceso");
});

test("la sentencia escribe en auth_events y no en otra tabla", () => {
  assert.match(SQL_REGISTRAR_EVENTO, /insert into auth_events/);
});

test("se cuentan los fallos por huella y dentro de una ventana de tiempo", () => {
  assert.match(SQL_CONTAR_FALLOS, /ip_huella = \$1/);
  assert.match(SQL_CONTAR_FALLOS, /resultado = 'fallido'/);
  assert.match(SQL_CONTAR_FALLOS, /ocurrido_en/);
});

test("por debajo del límite no se frena a nadie", () => {
  assert.equal(hayDemasiadosFallos([{ n: MAXIMO_DE_FALLOS - 1 }]), false);
});

test("alcanzado el límite, sí", () => {
  assert.equal(hayDemasiadosFallos([{ n: MAXIMO_DE_FALLOS }]), true);
  assert.equal(hayDemasiadosFallos([{ n: MAXIMO_DE_FALLOS + 10 }]), true);
});

test("sin datos no se bloquea: no saber no autoriza a frenar", () => {
  assert.equal(hayDemasiadosFallos([]), false);
});
```

- [ ] **Paso 2: ejecutar y comprobar que falla**

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/identidad-eventos.test.ts
```

Esperado: falla con «Cannot find module '../app/identidad/eventos'».

- [ ] **Paso 3: escribir el módulo puro**

```ts
import { familiaDeNavegador, huellaDeIp } from "./huella";

/**
 * Quién entró, cuándo y con qué proveedor. Sin datos que identifiquen a nadie
 * más allá de la cuenta: la IP se guarda como huella y del navegador solo su
 * familia.
 */

export type TipoDeEvento = "registro" | "acceso" | "vinculacion" | "borrado" | "fallo";
export type ResultadoDeEvento = "correcto" | "fallido";

export type EventoDeAutenticacion = {
  userId: string | null;
  tipo: TipoDeEvento;
  proveedor: string | null;
  resultado: ResultadoDeEvento;
  ip: string | null;
  userAgent: string | null;
  pimienta: string | undefined;
};

export const SQL_REGISTRAR_EVENTO = `
  insert into auth_events (user_id, tipo, proveedor, resultado, ip_huella, navegador)
  values ($1, $2, $3, $4, $5, $6)
`;

export function parametrosDeEvento(evento: EventoDeAutenticacion) {
  return [
    evento.userId,
    evento.tipo,
    evento.proveedor,
    evento.resultado,
    huellaDeIp(evento.ip, evento.pimienta),
    familiaDeNavegador(evento.userAgent),
  ];
}

/**
 * Detección de intentos repetidos, que pide la §7.5 de la especificación.
 *
 * Firebase ya limita los intentos por su cuenta; esto añade lo que Firebase no
 * ve: muchos fallos desde la misma huella en poco tiempo, sea cual sea la
 * cuenta que se esté probando.
 *
 * **No se reutiliza `admin_login_attempts`**: es del panel, y mezclarlos
 * rompería la frontera de la §3.1.
 */
export const MAXIMO_DE_FALLOS = 10;
export const MINUTOS_DE_VENTANA = 15;

export const SQL_CONTAR_FALLOS = `
  select count(*)::int as n
  from auth_events
  where ip_huella = $1
    and resultado = 'fallido'
    and ocurrido_en > now() - ($2 || ' minutes')::interval
`;

export function hayDemasiadosFallos(filas: readonly Record<string, unknown>[]): boolean {
  const n = Number(filas[0]?.n ?? 0);
  return Number.isFinite(n) && n >= MAXIMO_DE_FALLOS;
}
```

- [ ] **Paso 4: escribir el `.server.ts`**

```ts
import "server-only";

import { leer, registrar } from "../lib/datos";
import {
  MINUTOS_DE_VENTANA,
  SQL_CONTAR_FALLOS,
  SQL_REGISTRAR_EVENTO,
  hayDemasiadosFallos,
  parametrosDeEvento,
  type EventoDeAutenticacion,
} from "./eventos";
import { huellaDeIp } from "./huella";

/**
 * Registrar el evento **no puede tumbar el acceso**. Si la escritura falla, la
 * persona ya está autenticada y dejarla fuera por no poder anotar el suceso
 * sería cambiar un problema de auditoría por uno de servicio. Queda constancia
 * en el log del servidor.
 *
 * Es una sola sentencia, así que va por `leer`, igual que el resto de
 * escrituras de una sentencia del proyecto.
 */
export async function registrarEvento(
  evento: Omit<EventoDeAutenticacion, "pimienta">,
): Promise<void> {
  try {
    await leer(SQL_REGISTRAR_EVENTO, parametrosDeEvento({
      ...evento,
      pimienta: process.env.AUTH_EVENT_IP_PEPPER,
    }));
  } catch {
    registrar("error", "identidad-evento-no-registrado", { tipo: evento.tipo });
  }
}

/**
 * Si la consulta falla, se contesta que **no** hay demasiados fallos: no poder
 * comprobarlo no autoriza a dejar fuera a quien intenta entrar de buena fe.
 * Sin pimienta tampoco hay huella que contar, y la detección queda inactiva;
 * eso ya está dicho en `.env.example`.
 */
export async function demasiadosFallosRecientes(ip: string | null): Promise<boolean> {
  const huella = huellaDeIp(ip, process.env.AUTH_EVENT_IP_PEPPER);
  if (!huella) {
    return false;
  }

  try {
    const filas = await leer<Record<string, unknown>>(SQL_CONTAR_FALLOS, [
      huella,
      String(MINUTOS_DE_VENTANA),
    ]);
    return hayDemasiadosFallos(filas);
  } catch {
    return false;
  }
}
```

- [ ] **Paso 5: ejecutar y comprobar que pasa**

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/identidad-eventos.test.ts
```

Esperado: 9 pruebas en verde.

- [ ] **Paso 6: confirmar**

```bash
git add app/identidad/eventos.ts app/identidad/eventos.server.ts tests/identidad-eventos.test.ts
git commit -m "feat(identidad): registro de eventos de autenticacion"
```

---

## Tarea 7: La ruta de sesión y la prueba de integración del aprovisionamiento

**Archivos:**
- Crear: `app/api/clientes/sesion/route.ts`, `scripts/probar-aprovisionamiento.mjs`
- Modificar: `package.json`

**Interfaces:**
- Consume: `verificarIdToken`, `crearCookieDeSesion`, `aprovisionarCliente`,
  `registrarEvento`, `opcionesDeCookie`, `caducidadDesde`, `MS_DE_SESION`,
  `COOKIE_SESION_CLIENTE`.
- Produce: `POST /api/clientes/sesion` (canje) y `DELETE /api/clientes/sesion` (cierre).

- [ ] **Paso 1: escribir la ruta**

```ts
import { cookies, headers } from "next/headers";
import { aprovisionarCliente } from "@/app/identidad/aprovisionamiento.server";
import { demasiadosFallosRecientes, registrarEvento } from "@/app/identidad/eventos.server";
import { crearCookieDeSesion, verificarIdToken } from "@/app/identidad/firebase.server";
import {
  COOKIE_SESION_CLIENTE,
  MS_DE_SESION,
  caducidadDesde,
  opcionesDeCookie,
} from "@/app/identidad/sesion";

// `firebase-admin` necesita runtime de Node: no funciona en edge.
export const runtime = "nodejs";

const esProduccion = () => process.env.NODE_ENV === "production";

/**
 * Comprueba que la petición viene de nuestra propia web. Las Server Actions de
 * Next ya traen su protección; una ruta de API la lleva explícita.
 */
async function mismoOrigen(): Promise<boolean> {
  const cabeceras = await headers();
  const origen = cabeceras.get("origin");
  const anfitrion = cabeceras.get("host");
  if (!origen || !anfitrion) return false;
  try {
    return new URL(origen).host === anfitrion;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!(await mismoOrigen())) {
    return Response.json({ ok: false, error: "origen-no-valido" }, { status: 403 });
  }

  const cabeceras = await headers();
  const ip = cabeceras.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = cabeceras.get("user-agent");

  let idToken: unknown;
  try {
    idToken = (await request.json())?.idToken;
  } catch {
    idToken = undefined;
  }

  if (typeof idToken !== "string" || idToken.length === 0) {
    return Response.json({ ok: false, error: "falta-token" }, { status: 400 });
  }

  // Muchos fallos recientes desde la misma huella: se corta antes de gastar una
  // verificación contra Firebase. Firebase ya limita por cuenta; esto limita por
  // origen, que es lo que Firebase no ve.
  if (await demasiadosFallosRecientes(ip)) {
    return Response.json({ ok: false, error: "demasiados-intentos" }, { status: 429 });
  }

  let identidad;
  try {
    identidad = await verificarIdToken(idToken);
  } catch {
    // Un token inválido saca a quien lo trajo; no se distingue del caducado
    // para no dar pistas a quien esté probando tokens.
    await registrarEvento({
      userId: null,
      tipo: "fallo",
      proveedor: null,
      resultado: "fallido",
      ip,
      userAgent,
    });
    return Response.json({ ok: false, error: "token-no-valido" }, { status: 401 });
  }

  const cliente = await aprovisionarCliente(identidad);
  const cookie = await crearCookieDeSesion(idToken, MS_DE_SESION);
  const expira = caducidadDesde(new Date());

  const almacen = await cookies();
  almacen.set(COOKIE_SESION_CLIENTE, cookie, opcionesDeCookie(expira, esProduccion()));

  await registrarEvento({
    userId: cliente.id,
    tipo: cliente.recienCreada ? "registro" : "acceso",
    proveedor: identidad.proveedor,
    resultado: "correcto",
    ip,
    userAgent,
  });

  return Response.json({ ok: true, recienCreada: cliente.recienCreada });
}

export async function DELETE() {
  if (!(await mismoOrigen())) {
    return Response.json({ ok: false, error: "origen-no-valido" }, { status: 403 });
  }

  const almacen = await cookies();
  almacen.delete(COOKIE_SESION_CLIENTE);
  return Response.json({ ok: true });
}
```

- [ ] **Paso 2: escribir la prueba de integración del `upsert`**

`scripts/probar-aprovisionamiento.mjs`. Comprueba contra la base real las dos cosas que
las pruebas de unidad no pueden: que `xmax = 0` distingue de verdad, y que dos peticiones
simultáneas producen un usuario.

```js
// Comprueba el aprovisionamiento contra la rama de desarrollo.
// Deja la base como estaba: todo dentro de una transaccion deshecha.
import { Client, neonConfig } from "@neondatabase/serverless";
neonConfig.webSocketConstructor = globalThis.WebSocket;

const SQL = `
  insert into users (firebase_uid, email, email_verificado, nombre)
  values ($1, $2, $3, $4)
  on conflict (firebase_uid) do update
    set email = excluded.email,
        email_verificado = excluded.email_verificado,
        ultimo_acceso_en = now(),
        actualizado_en = now()
  returning id, (xmax = 0) as recien_creada
`;

const cliente = new Client(process.env.DATABASE_URL);
await cliente.connect();
let fallos = 0;
const mal = (m) => { console.error(`  FALLA  ${m}`); fallos += 1; };
const bien = (m) => console.log(`  ok     ${m}`);

try {
  await cliente.query("begin");
  const parametros = ["uid-de-prueba", "prueba@example.com", true, "Quien Prueba"];

  const primera = await cliente.query(SQL, parametros);
  primera.rows[0].recien_creada === true
    ? bien("el primer acceso se marca como recien creada")
    : mal("el primer acceso deberia marcarse como recien creada");

  const segunda = await cliente.query(SQL, parametros);
  segunda.rows[0].recien_creada === false
    ? bien("el segundo acceso NO se marca como recien creada")
    : mal("el segundo acceso no deberia marcarse como recien creada");

  primera.rows[0].id === segunda.rows[0].id
    ? bien("las dos veces devuelven el mismo usuario")
    : mal("se creo un usuario distinto en el segundo acceso");

  const { rows } = await cliente.query("select count(*)::int as n from users where firebase_uid = $1", [
    "uid-de-prueba",
  ]);
  rows[0].n === 1 ? bien("hay exactamente una fila") : mal(`hay ${rows[0].n} filas y deberia haber 1`);

  console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} fallo(s).`);
  process.exitCode = fallos === 0 ? 0 : 1;
} finally {
  await cliente.query("rollback");
  await cliente.end();
  console.log("  rollback: la base queda como estaba");
}
```

Añadir a `package.json`:

```json
"identidad:probar": "node --env-file-if-exists=.env.local ./scripts/probar-aprovisionamiento.mjs",
```

- [ ] **Paso 3: ejecutar la prueba de integración**

```bash
npm run identidad:probar
```

Esperado: cuatro `ok` y `Todo correcto.`

- [ ] **Paso 3 bis: comprobar que el límite de intentos corta**

Insertar diez fallos con la misma huella en la rama de desarrollo y comprobar que la
consulta los cuenta, todo dentro de una transacción deshecha. Añadir al final de
`scripts/verificar-identidad.mjs`, antes del `rollback`:

```js
  for (let i = 0; i < 10; i += 1) {
    await cliente.query(
      "insert into auth_events (tipo, resultado, ip_huella) values ('fallo', 'fallido', $1)",
      ["huelladeprueba0000000000000000000"],
    );
  }
  const { rows: fallos10 } = await cliente.query(
    `select count(*)::int as n from auth_events
     where ip_huella = $1 and resultado = 'fallido'
       and ocurrido_en > now() - ($2 || ' minutes')::interval`,
    ["huelladeprueba0000000000000000000", "15"],
  );
  fallos10[0].n === 10
    ? bien("la ventana cuenta los diez fallos de la misma huella")
    : mal(`conto ${fallos10[0].n} fallos y deberia contar 10`);
```

```bash
npm run identidad:verificar
```

- [ ] **Paso 4: comprobar tipos, lint y compilación**

```bash
npm run typecheck
```

```bash
npm run lint
```

```bash
npm run build
```

Esperado: sin errores, y `/api/clientes/sesion` aparece en la lista de rutas.

- [ ] **Paso 5: confirmar**

```bash
git add app/api/clientes/sesion/route.ts scripts/probar-aprovisionamiento.mjs package.json
git commit -m "feat(identidad): canje del token por cookie de sesion"
```

---

## Tarea 8: Leer el cliente actual en el servidor

**Archivos:**
- Crear: `app/identidad/sesion.server.ts`, `tests/identidad-lectura.test.ts`
- Modificar: `app/identidad/sesion.ts` (añadir `interpretarSesion`)

**Interfaces:**
- Consume: `verificarCookieDeSesion`, `COOKIE_SESION_CLIENTE`, `leer`.
- Produce: `leerSesionDeCliente(): Promise<SesionDeCliente>`,
  `leerClienteActual(): Promise<ClienteActual | null>`,
  `type ClienteActual = { id: string; uid: string; email: string; emailVerificado: boolean; nombre: string }`
  y `type SesionDeCliente = { estado: EstadoDeSesion; cliente: ClienteActual | null }`.
  En el módulo puro: `interpretarSesion(entrada): EstadoDeSesion` y `type EstadoDeSesion`.
  Las pantallas usan `leerClienteActual`; quien necesite distinguir «no hay sesión» de
  «Firebase no contesta» —el checkout, en el subproyecto 6— usa `leerSesionDeCliente`.

- [ ] **Paso 1: escribir la prueba que falla**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { interpretarSesion } from "../app/identidad/sesion";

test("sin cookie no hay sesión, y eso no es un error", () => {
  assert.deepEqual(interpretarSesion({ hayCookie: false, verificada: false, fallo: null }), {
    estado: "sin-sesion",
  });
});

test("una cookie que no verifica saca al visitante", () => {
  assert.deepEqual(
    interpretarSesion({ hayCookie: true, verificada: false, fallo: "invalida" }),
    { estado: "invalida" },
  );
});

test("un fallo del servicio NO cierra la sesión de todo el mundo", () => {
  // Es la misma distinción que ya hace el panel: token inválido y Firebase
  // caído son cosas distintas, y confundirlas echaría a todos cada vez que
  // Firebase tosa.
  assert.deepEqual(
    interpretarSesion({ hayCookie: true, verificada: false, fallo: "indisponible" }),
    { estado: "indisponible" },
  );
});

test("una cookie verificada da sesión", () => {
  assert.deepEqual(interpretarSesion({ hayCookie: true, verificada: true, fallo: null }), {
    estado: "valida",
  });
});
```

- [ ] **Paso 2: ejecutar y comprobar que falla**

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/identidad-lectura.test.ts
```

Esperado: falla con «interpretarSesion is not a function».

- [ ] **Paso 3: añadir la decisión al módulo puro**

Al final de `app/identidad/sesion.ts`:

```ts
export type EstadoDeSesion =
  | { estado: "sin-sesion" }
  | { estado: "invalida" }
  | { estado: "indisponible" }
  | { estado: "valida" };

/**
 * Distingue las tres formas de no tener sesión, porque no se tratan igual:
 * sin cookie es navegación anónima normal, una cookie que no verifica saca al
 * visitante, y un fallo del servicio no puede cerrar la sesión de todos.
 */
export function interpretarSesion(entrada: {
  hayCookie: boolean;
  verificada: boolean;
  fallo: "invalida" | "indisponible" | null;
}): EstadoDeSesion {
  if (!entrada.hayCookie) return { estado: "sin-sesion" };
  if (entrada.verificada) return { estado: "valida" };
  return { estado: entrada.fallo === "indisponible" ? "indisponible" : "invalida" };
}
```

- [ ] **Paso 4: escribir el `.server.ts`**

```ts
import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";
import { leer } from "../lib/datos";
import { verificarCookieDeSesion } from "./firebase.server";
import { COOKIE_SESION_CLIENTE, interpretarSesion, type EstadoDeSesion } from "./sesion";

export type ClienteActual = {
  id: string;
  uid: string;
  email: string;
  emailVerificado: boolean;
  nombre: string;
};

export type SesionDeCliente = { estado: EstadoDeSesion; cliente: ClienteActual | null };

/**
 * La lectura completa: el estado y, si lo hay, quién es.
 *
 * `cache()` de React evita repetir la verificación dentro de un mismo render
 * —cada una consulta a Firebase para comprobar que la cuenta no está
 * deshabilitada ni la sesión revocada—, exactamente como ya hace
 * `authorization.server.ts` en el panel.
 */
export const leerSesionDeCliente = cache(async (): Promise<SesionDeCliente> => {
  const almacen = await cookies();
  const cookie = almacen.get(COOKIE_SESION_CLIENTE)?.value;
  if (!cookie) {
    return { estado: interpretarSesion({ hayCookie: false, verificada: false, fallo: null }), cliente: null };
  }

  try {
    const identidad = await verificarCookieDeSesion(cookie);
    const filas = await leer<{ id: string; nombre: string; email: string; email_verificado: boolean }>(
      "select id, nombre, email, email_verificado from users where firebase_uid = $1 and estado = 'activa'",
      [identidad.uid],
    );

    const fila = filas[0];
    if (!fila) {
      // Identidad viva en Firebase sin fila activa en Neon: cuenta borrada a
      // medias o anonimizada. No se aprovisiona aquí por si acaso; lo resuelve
      // el barrido de reconciliación.
      return { estado: interpretarSesion({ hayCookie: true, verificada: false, fallo: "invalida" }), cliente: null };
    }

    return {
      estado: interpretarSesion({ hayCookie: true, verificada: true, fallo: null }),
      cliente: {
        id: String(fila.id),
        uid: identidad.uid,
        email: fila.email,
        emailVerificado: fila.email_verificado,
        nombre: fila.nombre,
      },
    };
  } catch (fallo) {
    // Un token inválido y un Firebase que no contesta son cosas distintas: la
    // primera saca al visitante, la segunda es un fallo del servicio y no puede
    // cerrar la sesión de todo el mundo. Es la misma distinción que ya hace
    // `validateSessionToken` en el panel.
    const codigo = (fallo as { code?: string }).code ?? "";
    const esDeToken = codigo.startsWith("auth/");
    return {
      estado: interpretarSesion({
        hayCookie: true,
        verificada: false,
        fallo: esDeToken ? "invalida" : "indisponible",
      }),
      cliente: null,
    };
  }
});

/**
 * Quién está navegando, o `null`. Es lo que usan las pantallas: a una página
 * pública le da igual por qué no hay sesión.
 */
export async function leerClienteActual(): Promise<ClienteActual | null> {
  return (await leerSesionDeCliente()).cliente;
}
```

- [ ] **Paso 5: ejecutar y comprobar que pasa**

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/identidad-lectura.test.ts
```

```bash
npm run typecheck
```

Esperado: 4 pruebas en verde y sin errores de tipos.

- [ ] **Paso 6: confirmar**

```bash
git add app/identidad/sesion.ts app/identidad/sesion.server.ts tests/identidad-lectura.test.ts
git commit -m "feat(identidad): lectura del cliente actual en el servidor"
```

---

## Tarea 9: Direcciones

**Archivos:**
- Crear: `app/identidad/direcciones.ts`, `app/identidad/direcciones.server.ts`,
  `tests/identidad-direcciones.test.ts`

**Interfaces:**
- Consume: `leer`, `escribir`.
- Produce: `validarDireccion(entrada: unknown): ResultadoDeValidacion`,
  `SQL_LISTAR_DIRECCIONES`, `SQL_INSERTAR_DIRECCION`, `SQL_QUITAR_PREDETERMINADA`,
  y en el `.server.ts` `listarDirecciones(userId)`, `guardarDireccion(userId, direccion)`.

- [ ] **Paso 1: escribir la prueba que falla**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { validarDireccion } from "../app/identidad/direcciones";

const VALIDA = {
  destinatario: "Quien Recibe",
  telefono: "4042 8790",
  departamento: "Guatemala",
  municipio: "Guatemala",
  direccion: "21 Avenida 0-18, Vista Hermosa 2, Zona 15",
  referencias: "Portón negro frente a la tienda",
  predeterminada: true,
};

test("una dirección completa es válida", () => {
  const resultado = validarDireccion(VALIDA);
  assert.equal(resultado.ok, true);
  assert.equal(resultado.ok && resultado.direccion.municipio, "Guatemala");
});

test("faltan los campos imprescindibles y se dice cuáles", () => {
  const resultado = validarDireccion({ ...VALIDA, destinatario: "  ", municipio: "" });
  assert.equal(resultado.ok, false);
  assert.deepEqual(resultado.ok === false && resultado.faltan, ["destinatario", "municipio"]);
});

test("las referencias son opcionales, porque no todo el mundo las necesita", () => {
  const { referencias, ...sinReferencias } = VALIDA;
  assert.equal(validarDireccion(sinReferencias).ok, true);
});

test("los textos se recortan, para que no entren con espacios de sobra", () => {
  const resultado = validarDireccion({ ...VALIDA, destinatario: "  Quien Recibe  " });
  assert.equal(resultado.ok && resultado.direccion.destinatario, "Quien Recibe");
});

test("un texto desmesurado se rechaza en vez de llegar a la base", () => {
  const resultado = validarDireccion({ ...VALIDA, direccion: "x".repeat(1000) });
  assert.equal(resultado.ok, false);
});

test("lo que no es un objeto no revienta la validación", () => {
  assert.equal(validarDireccion(null).ok, false);
  assert.equal(validarDireccion("texto").ok, false);
});
```

- [ ] **Paso 2: ejecutar y comprobar que falla**

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/identidad-direcciones.test.ts
```

Esperado: falla con «Cannot find module '../app/identidad/direcciones'».

- [ ] **Paso 3: escribir el módulo puro**

```ts
/**
 * Las direcciones de entrega del cliente.
 *
 * `referencias` es opcional pero existe desde el primer día: en Guatemala
 * buena parte de las entregas dependen de «portón negro frente a la tienda»
 * más que del número de casa, y añadir el campo después obligaría a volver a
 * preguntar a todos los clientes ya registrados.
 */

export type DireccionValidada = {
  destinatario: string;
  telefono: string;
  departamento: string;
  municipio: string;
  direccion: string;
  referencias: string;
  predeterminada: boolean;
};

export type ResultadoDeValidacion =
  | { ok: true; direccion: DireccionValidada }
  | { ok: false; faltan: string[] };

const OBLIGATORIOS = ["destinatario", "telefono", "departamento", "municipio", "direccion"] as const;
const LARGO_MAXIMO = 300;

const texto = (valor: unknown) => (typeof valor === "string" ? valor.trim() : "");

export function validarDireccion(entrada: unknown): ResultadoDeValidacion {
  if (typeof entrada !== "object" || entrada === null) {
    return { ok: false, faltan: [...OBLIGATORIOS] };
  }

  const datos = entrada as Record<string, unknown>;
  const faltan = OBLIGATORIOS.filter((campo) => {
    const valor = texto(datos[campo]);
    return valor.length === 0 || valor.length > LARGO_MAXIMO;
  });

  if (faltan.length > 0) {
    return { ok: false, faltan };
  }

  const referencias = texto(datos.referencias);
  if (referencias.length > LARGO_MAXIMO) {
    return { ok: false, faltan: ["referencias"] };
  }

  return {
    ok: true,
    direccion: {
      destinatario: texto(datos.destinatario),
      telefono: texto(datos.telefono),
      departamento: texto(datos.departamento),
      municipio: texto(datos.municipio),
      direccion: texto(datos.direccion),
      referencias,
      predeterminada: datos.predeterminada === true,
    },
  };
}

export const SQL_LISTAR_DIRECCIONES = `
  select id, destinatario, telefono, departamento, municipio, direccion, referencias, predeterminada
  from user_addresses
  where user_id = $1
  order by predeterminada desc, id
`;

/**
 * Quitar la marca antes de poner la nueva: el índice parcial
 * `user_addresses_una_predeterminada` rechaza dos a la vez, así que las dos
 * sentencias tienen que ir en la misma transacción o la segunda fallaría.
 */
export const SQL_QUITAR_PREDETERMINADA = `
  update user_addresses set predeterminada = false, actualizado_en = now()
  where user_id = $1 and predeterminada
`;

export const SQL_INSERTAR_DIRECCION = `
  insert into user_addresses
    (user_id, destinatario, telefono, departamento, municipio, direccion, referencias, predeterminada)
  values ($1, $2, $3, $4, $5, $6, $7, $8)
  returning id
`;
```

- [ ] **Paso 4: escribir el `.server.ts`**

```ts
import "server-only";

import { escribir, leer } from "../lib/datos";
import {
  SQL_INSERTAR_DIRECCION,
  SQL_LISTAR_DIRECCIONES,
  SQL_QUITAR_PREDETERMINADA,
  type DireccionValidada,
} from "./direcciones";

export async function listarDirecciones(userId: string) {
  return leer<Record<string, unknown>>(SQL_LISTAR_DIRECCIONES, [userId]);
}

/**
 * Va por `escribir` porque son dos sentencias que deben ir juntas: si la
 * primera quitara la marca y la segunda fallara, el cliente se quedaría sin
 * dirección predeterminada sin haber hecho nada malo.
 */
export async function guardarDireccion(userId: string, direccion: DireccionValidada) {
  return escribir(
    async (ejecutar) => {
      if (direccion.predeterminada) {
        await ejecutar(SQL_QUITAR_PREDETERMINADA, [userId]);
      }

      const filas = await ejecutar(SQL_INSERTAR_DIRECCION, [
        userId,
        direccion.destinatario,
        direccion.telefono,
        direccion.departamento,
        direccion.municipio,
        direccion.direccion,
        direccion.referencias,
        direccion.predeterminada,
      ]);

      return String(filas[0]?.id ?? "");
    },
    { suceso: "guardar-direccion" },
  );
}
```

- [ ] **Paso 5: ejecutar y comprobar que pasa**

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/identidad-direcciones.test.ts
```

```bash
npm run typecheck
```

Esperado: 6 pruebas en verde.

- [ ] **Paso 6: confirmar**

```bash
git add app/identidad/direcciones.ts app/identidad/direcciones.server.ts tests/identidad-direcciones.test.ts
git commit -m "feat(identidad): direcciones de entrega del cliente"
```

---

## Tarea 10: Consentimientos versionados

**Archivos:**
- Crear: `app/identidad/consentimientos.ts`, `app/identidad/consentimientos.server.ts`,
  `tests/identidad-consentimientos.test.ts`

**Interfaces:**
- Consume: `leer`.
- Produce: `type TipoDeConsentimiento`, `esVersionValida(valor: unknown): boolean`,
  `SQL_ACEPTAR`, `SQL_REVOCAR`, `SQL_VIGENTES`,
  `estaVigente(filas, tipo, version): boolean`; y en el `.server.ts`
  `aceptarConsentimiento(userId, tipo, version)` y `revocarConsentimiento(userId, tipo)`.

- [ ] **Paso 1: escribir la prueba que falla**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { esVersionValida, estaVigente } from "../app/identidad/consentimientos";

test("la versión es una fecha, que es como se publican los textos legales", () => {
  assert.equal(esVersionValida("2026-09-01"), true);
  assert.equal(esVersionValida("v1"), false);
  assert.equal(esVersionValida("2026-13-01"), false);
  assert.equal(esVersionValida(""), false);
  assert.equal(esVersionValida(null), false);
});

test("una aceptación sin revocar está vigente", () => {
  const filas = [{ tipo: "terminos", version: "2026-09-01", revocado_en: null }];
  assert.equal(estaVigente(filas, "terminos", "2026-09-01"), true);
});

test("una aceptación revocada ya no vale", () => {
  const filas = [{ tipo: "terminos", version: "2026-09-01", revocado_en: new Date() }];
  assert.equal(estaVigente(filas, "terminos", "2026-09-01"), false);
});

test("aceptar la versión de enero no acepta la de marzo", () => {
  const filas = [{ tipo: "terminos", version: "2026-01-01", revocado_en: null }];
  assert.equal(estaVigente(filas, "terminos", "2026-03-01"), false);
});

test("cada tipo se cuenta por separado", () => {
  const filas = [{ tipo: "privacidad", version: "2026-09-01", revocado_en: null }];
  assert.equal(estaVigente(filas, "terminos", "2026-09-01"), false);
});
```

- [ ] **Paso 2: ejecutar y comprobar que falla**

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/identidad-consentimientos.test.ts
```

Esperado: falla con «Cannot find module '../app/identidad/consentimientos'».

- [ ] **Paso 3: escribir el módulo puro**

```ts
/**
 * Qué aceptó el cliente y en qué versión.
 *
 * Cada aceptación es una fila nueva y revocar no borra, solo pone fecha: la
 * prueba de que alguien aceptó los términos de enero no puede desaparecer
 * cuando cambien los de marzo, porque es justo lo que habría que enseñar si
 * esa persona reclamara.
 */

export type TipoDeConsentimiento = "terminos" | "privacidad" | "comunicaciones";

/** Los textos legales se versionan por fecha de publicación: `2026-09-01`. */
export function esVersionValida(valor: unknown): boolean {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    return false;
  }
  const fecha = new Date(`${valor}T00:00:00.000Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
}

export const SQL_ACEPTAR = `
  insert into user_consents (user_id, tipo, version) values ($1, $2, $3) returning id
`;

export const SQL_REVOCAR = `
  update user_consents set revocado_en = now()
  where user_id = $1 and tipo = $2 and revocado_en is null
`;

export const SQL_VIGENTES = `
  select tipo, version, revocado_en from user_consents where user_id = $1
`;

export function estaVigente(
  filas: readonly Record<string, unknown>[],
  tipo: TipoDeConsentimiento,
  version: string,
): boolean {
  return filas.some(
    (fila) => fila.tipo === tipo && fila.version === version && fila.revocado_en == null,
  );
}
```

- [ ] **Paso 4: escribir el `.server.ts`**

```ts
import "server-only";

import { leer } from "../lib/datos";
import {
  SQL_ACEPTAR,
  SQL_REVOCAR,
  SQL_VIGENTES,
  type TipoDeConsentimiento,
} from "./consentimientos";

export async function aceptarConsentimiento(
  userId: string,
  tipo: TipoDeConsentimiento,
  version: string,
) {
  await leer(SQL_ACEPTAR, [userId, tipo, version]);
}

export async function revocarConsentimiento(userId: string, tipo: TipoDeConsentimiento) {
  await leer(SQL_REVOCAR, [userId, tipo]);
}

export async function leerConsentimientos(userId: string) {
  return leer<Record<string, unknown>>(SQL_VIGENTES, [userId]);
}
```

- [ ] **Paso 5: ejecutar y comprobar que pasa**

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/identidad-consentimientos.test.ts
```

Esperado: 5 pruebas en verde.

- [ ] **Paso 6: confirmar**

```bash
git add app/identidad/consentimientos.ts app/identidad/consentimientos.server.ts tests/identidad-consentimientos.test.ts
git commit -m "feat(identidad): consentimientos versionados por fecha"
```

---

## Tarea 11: El borrado de cuenta

**Archivos:**
- Crear: `app/identidad/anonimizacion.ts`, `app/identidad/anonimizacion.server.ts`,
  `app/api/clientes/borrar/route.ts`, `tests/identidad-anonimizacion.test.ts`

**Interfaces:**
- Consume: `revocarYBorrarUsuario`, `verificarIdToken`, `escribir`, `registrarEvento`.
- Produce: `correoAnonimo(id)`, `uidAnonimo(id)`, `SQL_ANONIMIZAR_USUARIO`,
  `SQL_BORRAR_DIRECCIONES`, `SQL_DESLIGAR_EVENTOS`, y
  `borrarCuenta(userId, uid): Promise<void>`.

- [ ] **Paso 1: escribir la prueba que falla**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SQL_ANONIMIZAR_USUARIO,
  SQL_BORRAR_DIRECCIONES,
  SQL_DESLIGAR_EVENTOS,
  correoAnonimo,
  uidAnonimo,
} from "../app/identidad/anonimizacion";

test("el correo anónimo no puede recibir correo de verdad", () => {
  // `.invalid` está reservado por el RFC 2606 y no existe.
  assert.equal(correoAnonimo("7"), "borrado+7@invalid");
  assert.match(correoAnonimo("7"), /@invalid$/);
});

test("dos cuentas borradas no chocan entre sí", () => {
  assert.notEqual(correoAnonimo("7"), correoAnonimo("8"));
  assert.notEqual(uidAnonimo("7"), uidAnonimo("8"));
});

test("el identificador anónimo no se parece a un uid de Firebase", () => {
  assert.equal(uidAnonimo("7"), "borrado:7");
});

test("la anonimización vacía todo lo personal y marca el estado", () => {
  for (const columna of ["nombre", "telefono", "nit", "nombre_fiscal", "email", "firebase_uid"]) {
    assert.match(SQL_ANONIMIZAR_USUARIO, new RegExp(`${columna}\\s*=`));
  }
  assert.match(SQL_ANONIMIZAR_USUARIO, /estado\s*=\s*'anonimizada'/);
  assert.match(SQL_ANONIMIZAR_USUARIO, /anonimizado_en\s*=\s*now\(\)/);
});

test("las direcciones se borran con un delete explícito", () => {
  // El `on delete cascade` no actúa: la fila de `users` no se borra.
  assert.match(SQL_BORRAR_DIRECCIONES, /delete from user_addresses/);
});

test("los eventos se desligan pero no se borran", () => {
  assert.match(SQL_DESLIGAR_EVENTOS, /update auth_events/);
  assert.match(SQL_DESLIGAR_EVENTOS, /user_id\s*=\s*null/);
  assert.equal(SQL_DESLIGAR_EVENTOS.includes("delete"), false);
});

test("los consentimientos no se tocan: son la prueba de lo que aceptó", () => {
  assert.equal(SQL_ANONIMIZAR_USUARIO.includes("user_consents"), false);
  assert.equal(SQL_BORRAR_DIRECCIONES.includes("user_consents"), false);
  assert.equal(SQL_DESLIGAR_EVENTOS.includes("user_consents"), false);
});
```

- [ ] **Paso 2: ejecutar y comprobar que falla**

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/identidad-anonimizacion.test.ts
```

Esperado: falla con «Cannot find module '../app/identidad/anonimizacion'».

- [ ] **Paso 3: escribir el módulo puro**

```ts
/**
 * El borrado de cuenta, que Apple y Google exigen a toda aplicación que
 * permita crearla.
 *
 * No borra la contabilidad: la fila de `users` sobrevive anonimizada para no
 * romper las claves foráneas de pedidos y facturas. Lo que desaparece es la
 * identidad —en Firebase, de verdad— y todo dato personal de este lado.
 */

/** `.invalid` está reservado por el RFC 2606: nadie recibirá correo por error. */
export function correoAnonimo(id: string): string {
  return `borrado+${id}@invalid`;
}

/** Determinista y único, sin parecerse a un `uid` real de Firebase. */
export function uidAnonimo(id: string): string {
  return `borrado:${id}`;
}

export const SQL_ANONIMIZAR_USUARIO = `
  update users
  set email = $2,
      firebase_uid = $3,
      nombre = '',
      telefono = null,
      nit = null,
      nombre_fiscal = null,
      email_verificado = false,
      estado = 'anonimizada',
      anonimizado_en = now(),
      actualizado_en = now()
  where id = $1 and estado = 'activa'
`;

/**
 * Explícito: el `on delete cascade` de la tabla no actúa, porque la fila de
 * `users` no se borra.
 */
export const SQL_BORRAR_DIRECCIONES = `delete from user_addresses where user_id = $1`;

/**
 * El evento sigue siendo útil aunque ya no haya a quién atribuirlo, y
 * mantenerlo enganchado sería conservar identidad sin motivo.
 */
export const SQL_DESLIGAR_EVENTOS = `update auth_events set user_id = null where user_id = $1`;
```

- [ ] **Paso 4: escribir el `.server.ts`**

```ts
import "server-only";

import { escribir } from "../lib/datos";
import { revocarYBorrarUsuario } from "./firebase.server";
import {
  SQL_ANONIMIZAR_USUARIO,
  SQL_BORRAR_DIRECCIONES,
  SQL_DESLIGAR_EVENTOS,
  correoAnonimo,
  uidAnonimo,
} from "./anonimizacion";

/**
 * Primero Firebase y después Neon, y el orden es deliberado.
 *
 * Si falla el segundo paso queda una fila con datos pero sin identidad viva:
 * un fallo recuperable, que el barrido de reconciliación detecta y termina. Al
 * revés quedaría una identidad activa sin sus datos, que es el peligroso,
 * porque esa persona seguiría pudiendo entrar.
 */
export async function borrarCuenta(userId: string, uid: string): Promise<void> {
  await revocarYBorrarUsuario(uid);

  await escribir(
    async (ejecutar) => {
      await ejecutar(SQL_BORRAR_DIRECCIONES, [userId]);
      await ejecutar(SQL_DESLIGAR_EVENTOS, [userId]);
      await ejecutar(SQL_ANONIMIZAR_USUARIO, [userId, correoAnonimo(userId), uidAnonimo(userId)]);
    },
    { suceso: "borrar-cuenta" },
  );
}
```

- [ ] **Paso 5: escribir la ruta**

`app/api/clientes/borrar/route.ts`:

```ts
import { cookies, headers } from "next/headers";
import { borrarCuenta } from "@/app/identidad/anonimizacion.server";
import { registrarEvento } from "@/app/identidad/eventos.server";
import { verificarIdToken } from "@/app/identidad/firebase.server";
import { leerClienteActual } from "@/app/identidad/sesion.server";
import { COOKIE_SESION_CLIENTE } from "@/app/identidad/sesion";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const cabeceras = await headers();
  const origen = cabeceras.get("origin");
  const anfitrion = cabeceras.get("host");
  if (!origen || !anfitrion || new URL(origen).host !== anfitrion) {
    return Response.json({ ok: false, error: "origen-no-valido" }, { status: 403 });
  }

  const cliente = await leerClienteActual();
  if (!cliente) {
    return Response.json({ ok: false, error: "sin-sesion" }, { status: 401 });
  }

  // Reautenticación: el navegador vuelve a autenticarse contra Firebase y
  // manda un token recién emitido. Evita el clic accidental y que alguien con
  // una sesión abierta ajena —un teléfono desbloqueado— destruya la cuenta.
  let idToken: unknown;
  try {
    idToken = (await request.json())?.idToken;
  } catch {
    idToken = undefined;
  }

  if (typeof idToken !== "string") {
    return Response.json({ ok: false, error: "falta-reautenticacion" }, { status: 400 });
  }

  const recien = await verificarIdToken(idToken).catch(() => null);
  if (!recien || recien.uid !== cliente.uid) {
    return Response.json({ ok: false, error: "reautenticacion-no-valida" }, { status: 401 });
  }

  await registrarEvento({
    userId: cliente.id,
    tipo: "borrado",
    proveedor: recien.proveedor,
    resultado: "correcto",
    ip: cabeceras.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: cabeceras.get("user-agent"),
  });

  await borrarCuenta(cliente.id, cliente.uid);

  const almacen = await cookies();
  almacen.delete(COOKIE_SESION_CLIENTE);

  return Response.json({ ok: true });
}
```

El evento se escribe **antes** del borrado a propósito: después, `user_id` ya estaría
desligado y el evento quedaría sin dueño desde el principio.

- [ ] **Paso 6: ejecutar y comprobar que pasa**

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/identidad-anonimizacion.test.ts
```

```bash
npm run typecheck
```

Esperado: 7 pruebas en verde.

- [ ] **Paso 7: comprobar el borrado contra la base real**

Añadir a `scripts/verificar-identidad.mjs`, antes del `rollback` final, un bloque que dé
de alta un cliente con dirección y consentimiento, ejecute las tres sentencias del borrado
y compruebe el resultado:

```js
  const { rows: alta2 } = await alta("uid-para-borrar", "borrame@example.com");
  const idB = alta2[0].id;
  await cliente.query(
    `insert into user_addresses (user_id, destinatario, telefono, departamento, municipio, direccion)
     values ($1, 'Quien Recibe', '4042 8790', 'Guatemala', 'Guatemala', 'Calle')`,
    [idB],
  );
  await cliente.query("insert into user_consents (user_id, tipo, version) values ($1, 'terminos', '2026-09-01')", [idB]);
  await cliente.query("insert into auth_events (user_id, tipo, resultado) values ($1, 'acceso', 'correcto')", [idB]);

  await cliente.query("delete from user_addresses where user_id = $1", [idB]);
  await cliente.query("update auth_events set user_id = null where user_id = $1", [idB]);
  await cliente.query(
    `update users set email = $2, firebase_uid = $3, nombre = '', telefono = null, nit = null,
       nombre_fiscal = null, email_verificado = false, estado = 'anonimizada',
       anonimizado_en = now(), actualizado_en = now()
     where id = $1 and estado = 'activa'`,
    [idB, `borrado+${idB}@invalid`, `borrado:${idB}`],
  );

  const { rows: tras } = await cliente.query("select * from users where id = $1", [idB]);
  const fila = tras[0];
  const limpio =
    fila.nombre === "" && fila.telefono === null && fila.nit === null &&
    fila.nombre_fiscal === null && !fila.email.includes("borrame") && fila.estado === "anonimizada";
  limpio ? bien("tras el borrado no queda dato personal en users") : mal("quedaron datos personales en users");

  const { rows: dirs } = await cliente.query("select count(*)::int as n from user_addresses where user_id = $1", [idB]);
  dirs[0].n === 0 ? bien("las direcciones se borraron") : mal("quedaron direcciones");

  const { rows: cons } = await cliente.query("select count(*)::int as n from user_consents where user_id = $1", [idB]);
  cons[0].n === 1 ? bien("el consentimiento se conserva como prueba") : mal("se perdio el consentimiento");

  const { rows: evs } = await cliente.query("select count(*)::int as n from auth_events where user_id = $1", [idB]);
  evs[0].n === 0 ? bien("los eventos quedaron desligados") : mal("los eventos siguen enganchados");
```

```bash
npm run identidad:verificar
```

Esperado: los cinco `ok` anteriores más estos cuatro, y `Todo correcto.`

- [ ] **Paso 8: confirmar**

```bash
git add app/identidad/anonimizacion.ts app/identidad/anonimizacion.server.ts app/api/clientes/borrar/route.ts tests/identidad-anonimizacion.test.ts scripts/verificar-identidad.mjs
git commit -m "feat(identidad): borrado de cuenta con anonimizacion"
```

---

## Tarea 12: El barrido de reconciliación

**Archivos:**
- Crear: `scripts/reconciliar-identidades.mjs`
- Modificar: `package.json`

**Interfaces:**
- Consume: nada del código de `app/**`. El barrido es un script y **no puede importar
  `anonimizacion.server.ts`**, que lleva `server-only` y no se resuelve fuera del
  empaquetador de Next; repite las tres sentencias, igual que `scripts/migrate.mjs` repite
  su propia conexión. Si esas sentencias cambian, hay que cambiarlas en los dos sitios: la
  prueba de la tarea 11 vigila las de `app/**` y el paso 2 de esta tarea, las de aquí.
- Produce: el comando `npm run identidad:reconciliar`.

- [ ] **Paso 1: escribir el script**

```js
// Termina los borrados que se quedaron a medias.
//
// Busca cuentas `activa` cuya identidad ya no existe en Firebase y las
// anonimiza. El trabajo se DEDUCE DEL ESTADO de los datos, no de una cola: en
// serverless, cualquier trabajo diferido que dependa de que un proceso llegue
// al final se pierde cuando la funcion se apaga, mientras que una consulta
// como esta es idempotente y se recupera sola.
//
// Uso:
//   npm run identidad:reconciliar
//   npm run identidad:reconciliar -- --aplicar
//
// Sin --aplicar solo informa; nunca escribe por sorpresa.

import { Client, neonConfig } from "@neondatabase/serverless";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

neonConfig.webSocketConstructor = globalThis.WebSocket;

const aplicar = process.argv.includes("--aplicar");

const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
if (!process.env.DATABASE_URL || !privateKey) {
  console.error("Faltan DATABASE_URL o las credenciales de Firebase.");
  process.exit(1);
}

const app =
  getApps()[0] ??
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
  });
const auth = getAuth(app);

const cliente = new Client(process.env.DATABASE_URL);
await cliente.connect();

// Nunca imprimir la cadena de conexion: lleva la contraseña.
console.log(`Base de datos:  ${new URL(process.env.DATABASE_URL).host}`);
console.log(`Modo:           ${aplicar ? "APLICAR" : "solo informar"}`);
console.log("");

try {
  const { rows } = await cliente.query(
    "select id, firebase_uid from users where estado = 'activa' order by id",
  );

  let huerfanas = 0;

  for (const fila of rows) {
    let existe = true;
    try {
      await auth.getUser(fila.firebase_uid);
    } catch {
      existe = false;
    }

    if (existe) continue;
    huerfanas += 1;
    console.log(`  huerfana    usuario ${fila.id}`);

    if (aplicar) {
      await cliente.query("begin");
      try {
        await cliente.query("delete from user_addresses where user_id = $1", [fila.id]);
        await cliente.query("update auth_events set user_id = null where user_id = $1", [fila.id]);
        await cliente.query(
          `update users set email = $2, firebase_uid = $3, nombre = '', telefono = null, nit = null,
             nombre_fiscal = null, email_verificado = false, estado = 'anonimizada',
             anonimizado_en = now(), actualizado_en = now()
           where id = $1 and estado = 'activa'`,
          [fila.id, `borrado+${fila.id}@invalid`, `borrado:${fila.id}`],
        );
        await cliente.query("commit");
        console.log(`  anonimizada usuario ${fila.id}`);
      } catch (error) {
        await cliente.query("rollback");
        throw error;
      }
    }
  }

  console.log("");
  console.log(
    huerfanas === 0
      ? "No hay identidades huerfanas."
      : `${huerfanas} huerfana(s)${aplicar ? " anonimizada(s)" : "; repite con --aplicar"}.`,
  );
} finally {
  await cliente.end();
}
```

Añadir a `package.json`:

```json
"identidad:reconciliar": "node --env-file-if-exists=.env.local ./scripts/reconciliar-identidades.mjs",
```

- [ ] **Paso 2: comprobar que informa y no escribe**

```bash
npm run identidad:reconciliar
```

Esperado: `No hay identidades huerfanas.` sobre una base limpia, y **modo «solo
informar»** en la cabecera.

- [ ] **Paso 3: comprobar la frontera**

El script vive en `scripts/`, así que **la prueba de la tarea 1 lo permite**: solo exige
que dentro de `app/**` nadie más importe `firebase-admin`. Confirmarlo:

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/identidad-frontera.test.ts
```

Esperado: 3 en verde. **Si falla**, la prueba está mirando `scripts/` y hay que ajustar su
filtro para que la excepción sea explícita y esté comentada, igual que se hizo con
`scripts/migrate.mjs` en `tests/datos-frontera-controlador.test.ts`.

- [ ] **Paso 4: confirmar**

```bash
git add scripts/reconciliar-identidades.mjs package.json
git commit -m "feat(identidad): barrido que termina los borrados a medias"
```

---

## Tarea 13: Las pantallas de `/cuenta`

**Archivos:**
- Crear: `app/cuenta/page.tsx`, `app/cuenta/entrar/page.tsx`,
  `app/cuenta/direcciones/page.tsx`, `app/cuenta/ClienteFirebase.tsx`,
  `tests/cuenta.spec.ts`

**Interfaces:**
- Consume: `leerClienteActual`, `listarDirecciones`, `validarDireccion`,
  `guardarDireccion`, la configuración pública de Firebase.
- Produce: las tres rutas.

**Antes de escribir una línea de interfaz**, leer `CLAUDE.md` §3: azul marino `#001B59`
para superficie y títulos, rojo `#E11133` **solo** para la acción principal —una por
pantalla—, blanco de fondo dominante. Y §5: español de Guatemala, teléfonos de ocho
dígitos con espacio, `Q1,250.00` para importes.

- [ ] **Paso 1: la pantalla de entrada**

`app/cuenta/entrar/page.tsx` es un componente de servidor que redirige si ya hay sesión y,
si no, pinta `ClienteFirebase`, que es el único componente de cliente: autentica contra
Firebase con el SDK del navegador y manda el token a `POST /api/clientes/sesion`.

```tsx
import { redirect } from "next/navigation";
import { leerClienteActual } from "@/app/identidad/sesion.server";
import ClienteFirebase from "../ClienteFirebase";

export const metadata = { title: "Entrar · ECONOLUZ" };

export default async function EntrarPage() {
  if (await leerClienteActual()) {
    redirect("/cuenta");
  }

  return (
    <main className="mx-auto w-full max-w-md px-4 py-16">
      <h1 className="text-2xl font-semibold text-[#001B59]">Entrar a tu cuenta</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Con tu correo o con Google. La necesitas para comprar y para guardar tus
        direcciones de entrega.
      </p>
      <ClienteFirebase />
    </main>
  );
}
```

- [ ] **Paso 2: añadir el SDK del navegador**

```bash
npm install firebase
```

Es la segunda y última dependencia del subproyecto. **No es `firebase-admin`**: son
paquetes distintos, y este solo autentica en el navegador. La frontera de la tarea 1
prohíbe `firebase-admin` fuera de `firebase.server.ts`, no este.

- [ ] **Paso 3: el componente de cliente**

`app/cuenta/ClienteFirebase.tsx`:

```tsx
"use client";

import { useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  GoogleAuthProvider,
  fetchSignInMethodsForEmail,
  getAuth,
  linkWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  type UserCredential,
} from "firebase/auth";

const configuracion = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
};

function auth() {
  const app = getApps()[0] ?? initializeApp(configuracion);
  return getAuth(app);
}

export default function ClienteFirebase() {
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [debeEnlazar, setDebeEnlazar] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  // Canjea el token por la cookie de sesión y recarga: a partir de ahí manda el servidor.
  async function abrirSesion(credencial: UserCredential) {
    const idToken = await credencial.user.getIdToken();
    const respuesta = await fetch("/api/clientes/sesion", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ idToken }),
    });

    if (!respuesta.ok) {
      setError(
        respuesta.status === 429
          ? "Demasiados intentos. Espera unos minutos y vuelve a probar."
          : "No pudimos abrir tu sesión. Intenta de nuevo.",
      );
      return;
    }

    window.location.assign("/cuenta");
  }

  async function conCorreo(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);
    setOcupado(true);
    try {
      await abrirSesion(await signInWithEmailAndPassword(auth(), correo, clave));
    } catch {
      // Mismo mensaje para correo inexistente y contraseña equivocada: decir
      // cuál de las dos falla revela qué correos tienen cuenta.
      setError("Correo o contraseña incorrectos.");
    } finally {
      setOcupado(false);
    }
  }

  /*
   * Vinculación de proveedores, sección 5.2 de la especificación: si el correo
   * ya tiene cuenta con contraseña, se pide esa contraseña y se vincula Google
   * a la cuenta existente, en vez de crear una segunda. El resultado es un
   * único uid con dos proveedores y una sola fila en users.
   */
  async function conGoogle() {
    setError(null);
    setOcupado(true);
    try {
      await abrirSesion(await signInWithPopup(auth(), new GoogleAuthProvider()));
    } catch (fallo) {
      const codigo = (fallo as { code?: string }).code;
      if (codigo !== "auth/account-exists-with-different-credential") {
        setError("No pudimos entrar con Google. Intenta de nuevo.");
        setOcupado(false);
        return;
      }

      const correoEnConflicto = (fallo as { customData?: { email?: string } }).customData?.email;
      const metodos = correoEnConflicto
        ? await fetchSignInMethodsForEmail(auth(), correoEnConflicto)
        : [];

      if (!metodos.includes("password")) {
        setError("Ese correo ya tiene cuenta con otro método de acceso.");
        setOcupado(false);
        return;
      }

      setCorreo(correoEnConflicto ?? "");
      setDebeEnlazar(true);
      setError("Ese correo ya tiene cuenta con contraseña. Escríbela y enlazamos tu acceso con Google.");
      setOcupado(false);
    }
  }

  // Enlaza Google a la cuenta de contraseña ya existente.
  async function enlazarGoogle(evento: React.FormEvent) {
    evento.preventDefault();
    setOcupado(true);
    try {
      const credencial = await signInWithEmailAndPassword(auth(), correo, clave);
      const google = await signInWithPopup(auth(), new GoogleAuthProvider());
      const deGoogle = GoogleAuthProvider.credentialFromResult(google);
      if (deGoogle) {
        await linkWithCredential(credencial.user, deGoogle);
      }
      await abrirSesion(credencial);
    } catch {
      setError("No pudimos enlazar las dos formas de entrar.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="mt-8 space-y-6">
      <button
        type="button"
        onClick={conGoogle}
        disabled={ocupado}
        className="w-full rounded border border-[#001B59] px-4 py-3 text-[#001B59] disabled:opacity-50"
      >
        Continuar con Google
      </button>

      <form onSubmit={debeEnlazar ? enlazarGoogle : conCorreo} className="space-y-3">
        <label className="block text-sm text-neutral-700">
          Correo
          <input
            type="email"
            required
            value={correo}
            onChange={(evento) => setCorreo(evento.target.value)}
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm text-neutral-700">
          Contraseña
          <input
            type="password"
            required
            value={clave}
            onChange={(evento) => setClave(evento.target.value)}
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
          />
        </label>
        {/* La acción principal de la pantalla, y la única en rojo. Ver CLAUDE.md seccion 3. */}
        <button
          type="submit"
          disabled={ocupado}
          className="w-full rounded bg-[#E11133] px-4 py-3 font-medium text-white disabled:opacity-50"
        >
          {debeEnlazar ? "Enlazar y entrar" : "Entrar"}
        </button>
      </form>

      {error ? <p className="text-sm text-[#E11133]">{error}</p> : null}
    </div>
  );
}
```

- [ ] **Paso 4: la portada de la cuenta**

`app/cuenta/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { leerClienteActual } from "@/app/identidad/sesion.server";

export const metadata = { title: "Mi cuenta · ECONOLUZ" };

export default async function CuentaPage() {
  const cliente = await leerClienteActual();
  if (!cliente) {
    redirect("/cuenta/entrar");
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-16">
      <h1 className="text-2xl font-semibold text-[#001B59]">Mi cuenta</h1>

      <dl className="mt-6 space-y-2 text-sm">
        <div className="flex gap-2">
          <dt className="text-neutral-500">Nombre</dt>
          <dd>{cliente.nombre || "Sin nombre"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-neutral-500">Correo</dt>
          <dd>{cliente.email}</dd>
        </div>
      </dl>

      {/* El correo verificado hace falta para pagar, no para navegar: la
          factura FEL se envía por correo, y uno inventado significa una
          factura emitida que no llega a nadie. Lo exigirá el checkout. */}
      {cliente.emailVerificado ? null : (
        <p className="mt-4 rounded border border-[#E11133] p-3 text-sm text-[#001B59]">
          Tu correo todavía no está verificado. Podrás navegar y armar tu carrito, pero
          necesitarás verificarlo antes de completar una compra.
        </p>
      )}

      <Link href="/cuenta/direcciones" className="mt-8 inline-block text-[#001B59] underline">
        Mis direcciones de entrega
      </Link>
    </main>
  );
}
```

- [ ] **Paso 5: las direcciones**

`app/cuenta/direcciones/page.tsx`, con su Server Action:

```tsx
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { validarDireccion } from "@/app/identidad/direcciones";
import { guardarDireccion, listarDirecciones } from "@/app/identidad/direcciones.server";
import { leerClienteActual } from "@/app/identidad/sesion.server";

export const metadata = { title: "Mis direcciones · ECONOLUZ" };

async function guardar(datos: FormData) {
  "use server";

  const cliente = await leerClienteActual();
  if (!cliente) {
    redirect("/cuenta/entrar");
  }

  const resultado = validarDireccion({
    destinatario: datos.get("destinatario"),
    telefono: datos.get("telefono"),
    departamento: datos.get("departamento"),
    municipio: datos.get("municipio"),
    direccion: datos.get("direccion"),
    referencias: datos.get("referencias"),
    predeterminada: datos.get("predeterminada") === "on",
  });

  // Sin campos válidos no se escribe nada. La pantalla vuelve a pintarse con
  // los datos que el navegador conserva.
  if (!resultado.ok) {
    return;
  }

  await guardarDireccion(cliente.id, resultado.direccion);
  revalidatePath("/cuenta/direcciones");
}

export default async function DireccionesPage() {
  const cliente = await leerClienteActual();
  if (!cliente) {
    redirect("/cuenta/entrar");
  }

  const direcciones = await listarDirecciones(cliente.id);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-16">
      <h1 className="text-2xl font-semibold text-[#001B59]">Mis direcciones de entrega</h1>

      <ul className="mt-6 space-y-4">
        {direcciones.map((direccion) => (
          <li key={String(direccion.id)} className="rounded border border-neutral-200 p-4 text-sm">
            <p className="font-medium">{String(direccion.destinatario)}</p>
            <p className="text-neutral-600">
              {String(direccion.direccion)}, {String(direccion.municipio)},{" "}
              {String(direccion.departamento)}
            </p>
            {direccion.referencias ? (
              <p className="text-neutral-500">{String(direccion.referencias)}</p>
            ) : null}
            {direccion.predeterminada ? (
              <p className="mt-1 text-xs uppercase text-[#001B59]">Predeterminada</p>
            ) : null}
          </li>
        ))}
        {direcciones.length === 0 ? (
          <li className="text-sm text-neutral-500">Todavía no has guardado ninguna.</li>
        ) : null}
      </ul>

      <form action={guardar} className="mt-10 space-y-3">
        <h2 className="text-lg font-medium text-[#001B59]">Agregar una dirección</h2>
        {[
          ["destinatario", "Quién recibe"],
          ["telefono", "Teléfono"],
          ["departamento", "Departamento"],
          ["municipio", "Municipio"],
          ["direccion", "Dirección"],
        ].map(([nombre, etiqueta]) => (
          <label key={nombre} className="block text-sm text-neutral-700">
            {etiqueta}
            <input
              name={nombre}
              required
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
            />
          </label>
        ))}
        <label className="block text-sm text-neutral-700">
          Referencias para encontrarla
          <input
            name="referencias"
            placeholder="Portón negro frente a la tienda"
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input type="checkbox" name="predeterminada" />
          Usar como predeterminada
        </label>
        <button type="submit" className="rounded bg-[#E11133] px-4 py-3 font-medium text-white">
          Guardar dirección
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Paso 6: la prueba de navegador**

`tests/cuenta.spec.ts` comprueba lo que no depende de Firebase:

```ts
import { expect, test } from "@playwright/test";

test("sin sesión, la cuenta lleva a la pantalla de entrada", async ({ page }) => {
  await page.goto("/cuenta");
  await expect(page).toHaveURL(/\/cuenta\/entrar/);
});

test("la pantalla de entrada ofrece correo y Google, y no Facebook todavía", async ({ page }) => {
  await page.goto("/cuenta/entrar");
  await expect(page.getByRole("button", { name: /google/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /facebook/i })).toHaveCount(0);
});

test("la cuenta del cliente no da acceso al panel", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/entrar/);
});
```

- [ ] **Paso 7: ejecutar la batería de navegador**

Cerrar cualquier `npm run dev` abierto antes.

```bash
npx playwright test
```

Esperado: las 67 anteriores más las 3 nuevas, **70 en verde**.

- [ ] **Paso 8: confirmar**

```bash
git add app/cuenta package.json package-lock.json tests/cuenta.spec.ts
git commit -m "feat(identidad): pantallas de la cuenta del cliente"
```

---

## Tarea 14: Cierre, configuración y documentación

**Archivos:**
- Modificar: `.env.example`, `package.json`, `CLAUDE.md`, `docs/CONTINUAR-PANEL.md`

- [ ] **Paso 1: documentar las variables nuevas, sin valores**

En `.env.example`, un bloque nuevo:

```bash
# --- Identidad de clientes (Firebase) — OBLIGATORIAS para /cuenta ----------
# Credenciales de servicio del proyecto de Firebase. Se descargan de la consola
# y NO se guardan en el repositorio. La clave privada lleva los saltos de línea
# escapados como \n.
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=

# Configuración pública del cliente: llega al navegador a propósito, no es un
# secreto. Sin ella, la pantalla de entrada no puede autenticar.
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=

# Pimienta de la huella de IP en auth_events. Sin ella no se guarda huella
# —nunca se guarda la IP en claro—, así que la detección de intentos repetidos
# deja de funcionar, pero nada más se rompe. Generar con:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Si rota, las huellas anteriores dejan de ser comparables con las nuevas.
AUTH_EVENT_IP_PEPPER=
```

- [ ] **Paso 2: registrar las pruebas nuevas**

Añadir a `test:datos` en `package.json` los seis archivos nuevos:

```
tests/identidad-frontera.test.ts tests/identidad-sesion.test.ts tests/identidad-huella.test.ts tests/identidad-aprovisionamiento.test.ts tests/identidad-eventos.test.ts tests/identidad-lectura.test.ts tests/identidad-direcciones.test.ts tests/identidad-consentimientos.test.ts tests/identidad-anonimizacion.test.ts
```

- [ ] **Paso 3: ejecutar todo**

```bash
npm run test:datos
```

```bash
npm run test:admin
```

```bash
npm run test:proveedores
```

```bash
npm run test:permisos
```

```bash
npm run identidad:verificar
```

```bash
npm run identidad:probar
```

```bash
npm run typecheck
```

```bash
npm run lint
```

```bash
npm run build
```

```bash
npm run catalogo:auditar
```

```bash
npx playwright test
```

- [ ] **Paso 4: comprobar los catorce criterios de aceptación**

Recorrer uno por uno la sección 10 de la especificación y anotar la evidencia. El criterio
8 exige además:

```bash
git diff main --stat -- app/admin db/003_admin.sql
```

Esperado: **salida vacía**. El panel no se ha tocado.

Y el criterio 13:

```bash
node --env-file-if-exists=.env.local -e "const {neon}=require('@neondatabase/serverless');const s=neon(process.env.DATABASE_URL);s.query('select valor from app_settings where clave=$1',['modelo_catalogo']).then(r=>console.log(r[0].valor))"
```

Esperado: `legacy`.

- [ ] **Paso 5: actualizar la documentación**

`CLAUDE.md`: la carpeta `app/identidad/` y las pantallas `/cuenta` en el árbol de §4, las
tablas nuevas en la lista de la base de datos, los comandos nuevos, y una regla en §6:
**la identidad de clientes y la del panel no se mezclan, y `firebase-admin` solo se
importa desde `app/identidad/firebase.server.ts`**.

`docs/CONTINUAR-PANEL.md`: estado del subproyecto 2, lo verificado con sus cifras, y las
**cuatro cuestiones abiertas de §13 de la especificación, que siguen abiertas**: la
validación del plazo de retención fiscal con un asesor de Guatemala, los textos legales
con su versión, cuándo se activa Facebook, y qué hacer si alguien borra su cuenta con un
pedido en curso.

- [ ] **Paso 6: confirmar**

```bash
git add .env.example package.json CLAUDE.md docs/CONTINUAR-PANEL.md
git commit -m "docs: cerrar el subproyecto 2 de identidad de clientes"
```

- [ ] **Paso 7: punto de revisión con el dueño**

Presentarle los catorce criterios con su evidencia, la batería completa, y **lo que hace
falta antes de desplegar**: crear el proyecto de Firebase de producción, guardar sus
secretos y `AUTH_EVENT_IP_PEPPER` en Vercel, aplicar la migración `009` en la rama
principal de Neon, y publicar los textos legales con su versión. **No fusionar, no
desplegar y no empezar el subproyecto 5 sin su autorización expresa.**

---

## Criterios de aceptación

Los catorce de la sección 10 de la especificación, sin cambios. Se recorren en la tarea 14
y cada uno se cierra con su evidencia.

## Qué queda fuera, y no se empieza aquí

El catálogo relacional (subproyecto 3), el carrito persistente (5), el checkout (6), los
pagos (7), la facturación FEL (8), los envíos (9) y la API v1 completa (10). Tampoco se
activa Facebook ni se resuelve ninguna de las cuatro cuestiones abiertas de §13 de la
especificación.

**App Check no se activa aquí**, y no hay ninguna tarea que lo haga. La §7.4 de la
especificación lo deja «preparado y no obligatorio»: es configuración en la consola de
Firebase, no cambia el modelo de datos ni el código, y activarlo antes de que exista
tráfico real solo añadiría una forma nueva de que fallara el acceso.

**La exigencia de correo verificado se prepara, no se aplica.** `leerClienteActual`
devuelve `emailVerificado` y la portada de la cuenta lo avisa, pero **nada bloquea
todavía**: quien lo exigirá es el checkout, en el subproyecto 6. Aquí navegar y armar el
carrito no lo necesitan, exactamente como dice la §7.2.

**La anonimización de pedidos tampoco entra**: su política está fijada en la §6.3 de la
especificación —doce meses para lo logístico— pero no hay pedidos que anonimizar hasta el
subproyecto 6, y el barrido correspondiente se construye allí.
