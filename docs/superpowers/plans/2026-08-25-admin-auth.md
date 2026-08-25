# Plan de implementación del acceso seguro al panel

> **Para agentes de implementación:** SUB-HABILIDAD OBLIGATORIA: usar
> `superpowers:subagent-driven-development` (recomendado) o
> `superpowers:executing-plans` para ejecutar este plan tarea por tarea. Los pasos usan
> casillas `- [ ]` para registrar el avance.

**Objetivo:** Proteger `/admin` con varios usuarios, sesiones revocables en Neon,
renovación tras actividad y limitación persistente de intentos, sin dependencias nuevas.

**Arquitectura:** Las primitivas y políticas puras quedan separadas del adaptador Neon.
Una capa de aplicación recibe un repositorio inyectable; la DAL `server-only` adapta esa
lógica a cookies, redirecciones, páginas y Server Actions de Next.js. Un grupo de rutas
aporta la interfaz compartida, pero cada página y acción vuelve a autorizarse cerca de
los datos.

**Stack:** Next.js 16.3.1 App Router, React 19.2.4, TypeScript 5.9.3, Node 24,
`node:test`, Playwright 1.62.1, Postgres 18 en Neon y `node:crypto`.

**Especificación:** `docs/superpowers/specs/2026-08-25-admin-auth-design.md`

## Restricciones globales

- Trabajar únicamente en la rama `panel-admin` y desde `frontend/`.
- No añadir dependencias, borrar archivos, publicar, desplegar ni hacer push.
- Consultar `node_modules/next/dist/docs/` antes de usar una API de Next.js no cubierta
  por la especificación.
- Contraseñas con `scrypt`; tokens y claves anónimas con HMAC-SHA-256.
- Cookie `httpOnly`, `sameSite: "lax"`, `path: "/admin"` y `secure` solo en producción.
- Caducidad después de doce horas sin actividad; como máximo una escritura de renovación
  cada quince minutos.
- Cinco fallos en quince minutos por correo normalizado y origen; contador en Postgres.
- `verificarSesion()` debe ejecutarse en todas las páginas y acciones protegidas.
- Todo avance funcional actualiza `CLAUDE.md` y `docs/CONTINUAR-PANEL.md` en la misma
  tarea, no al final del proyecto.
- Los comentarios nuevos, commits y resúmenes se escriben en español.
- PowerShell 5.1 no admite `&&`; cada comando se ejecuta por separado.

---

## Estructura de archivos

### Archivos nuevos

- `app/admin/auth/types.ts`: contratos de usuario, sesión, intentos y repositorio.
- `app/admin/auth/crypto.ts`: `scrypt`, token aleatorio y HMAC-SHA-256.
- `app/admin/auth/policy.ts`: normalización, validación y ventanas temporales.
- `app/admin/auth/repository.ts`: adaptador SQL inyectable y comprobable.
- `app/admin/auth/repository.server.ts`: conexión Neon marcada `server-only`.
- `app/admin/auth/login.ts`: caso de uso de inicio de sesión, independiente de Next.
- `app/admin/auth/session.ts`: validación y renovación del token, independiente de Next.
- `app/admin/auth/authorization.server.ts`: cookies, DAL memoizada y redirección.
- `db/003_admin.sql`: usuarios, sesiones e intentos fallidos.
- `app/admin/layout.tsx`: metadata privada y envoltorio administrativo.
- `app/admin/entrar/page.tsx`: página pública de acceso.
- `app/admin/entrar/LoginForm.tsx`: estado y envío accesible del formulario.
- `app/admin/actions.ts`: Server Actions de entrada y salida.
- `app/admin/sesion/route.ts`: renovación autenticada por actividad.
- `app/admin/SessionActivity.tsx`: detector limitado de actividad real.
- `app/admin/(panel)/layout.tsx`: cabecera y redirección temprana.
- `app/admin/(panel)/page.tsx`: portada protegida del panel.
- `scripts/create-admin.mjs`: alta y cambio de contraseña desde terminal.
- `tests/admin-auth-crypto.test.ts`: comportamientos criptográficos.
- `tests/admin-auth-policy.test.ts`: ventanas, validación y cookie.
- `tests/admin-auth-repository.test.ts`: contrato observable del adaptador SQL.
- `tests/admin-auth-login.test.ts`: acceso, bloqueo y mensajes.
- `tests/admin-auth-session.test.ts`: validación, expiración y renovación.
- `tests/admin-create-script.test.ts`: alta repetible y recuperación por terminal.
- `tests/helpers/admin-auth.ts`: repositorio en memoria y fixtures compartidas.
- `tests/admin-auth.spec.ts`: rutas y presentación en navegador.

### Archivos modificados

- `package.json`: comandos `test:admin` y `admin:crear`.
- `.env.example`: documentación de `ADMIN_SESSION_SECRET`.
- `playwright.config.ts`: inclusión de `admin-auth.spec.ts`.
- `app/components/FloatingWhatsApp.tsx`: no renderizar en rutas `/admin`.
- `CLAUDE.md`: estado real del paso 1.b.
- `docs/CONTINUAR-PANEL.md`: casillas y decisiones implementadas.
- `docs/superpowers/specs/2026-08-25-admin-auth-design.md`: estado final.

---

### Task 1: Primitivas criptográficas y políticas

**Archivos:**

- Crear: `app/admin/auth/crypto.ts`
- Crear: `app/admin/auth/policy.ts`
- Crear: `tests/admin-auth-crypto.test.ts`
- Crear: `tests/admin-auth-policy.test.ts`
- Modificar: `docs/CONTINUAR-PANEL.md`

**Interfaces:**

- Produce: `hashPassword(password, salt?)`, `verifyPassword(password, salt, hash)`,
  `createSessionToken()`, `hashSessionToken(token, secret)`,
  `hashLoginAttemptKey(email, origin, secret)`.
- Produce: `normalizeEmail(value)`, `validateLoginInput(input)`,
  `getSessionExpiry(now)`, `shouldRenewSession(expiresAt, now)` y
  `getSessionCookieOptions(expiresAt, isProduction)`.

- [ ] **Paso 1: escribir las pruebas criptográficas que deben fallar**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createSessionToken,
  hashLoginAttemptKey,
  hashPassword,
  hashSessionToken,
  verifyPassword,
} from "../app/admin/auth/crypto";

test("una contraseña correcta verifica y otra contraseña no", async () => {
  const stored = await hashPassword("frase segura de prueba");
  assert.equal(await verifyPassword("frase segura de prueba", stored.salt, stored.hash), true);
  assert.equal(await verifyPassword("otra contraseña", stored.salt, stored.hash), false);
});

test("un hash malformado se rechaza sin lanzar una excepción", async () => {
  assert.equal(await verifyPassword("frase segura de prueba", "00", "ff"), false);
});

test("cada sesión recibe un token distinto de 32 bytes", () => {
  const first = createSessionToken();
  const second = createSessionToken();
  assert.notEqual(first, second);
  assert.equal(Buffer.from(first, "base64url").byteLength, 32);
});

test("la huella cambia con el secreto y nunca contiene el token", () => {
  const token = "token-controlado";
  const first = hashSessionToken(token, "a".repeat(64));
  const second = hashSessionToken(token, "b".repeat(64));
  assert.notEqual(first, second);
  assert.equal(first.includes(token), false);
});

test("correo y origen se anonimizan de forma estable", () => {
  const secret = "c".repeat(64);
  assert.equal(
    hashLoginAttemptKey(" ADMIN@EJEMPLO.COM ", "203.0.113.7", secret),
    hashLoginAttemptKey("admin@ejemplo.com", "203.0.113.7", secret),
  );
});
```

- [ ] **Paso 2: ejecutar las pruebas y confirmar RED**

Ejecutar:

```powershell
node --test --import ./scripts/register-ts.mjs tests/admin-auth-crypto.test.ts
```

Resultado esperado: fallo porque `app/admin/auth/crypto.ts` no existe.

- [ ] **Paso 3: implementar lo mínimo con `node:crypto`**

Usar `randomBytes(16)` para la sal, `randomBytes(32)` para el token, `promisify(scrypt)`,
salida hexadecimal y `timingSafeEqual` únicamente después de comprobar longitudes. La
HMAC debe incluir contexto (`session:` o `login-attempt:`) para separar usos del mismo
secreto.

- [ ] **Paso 4: ejecutar y confirmar GREEN**

```powershell
node --test --import ./scripts/register-ts.mjs tests/admin-auth-crypto.test.ts
```

Resultado esperado: todas las pruebas pasan sin avisos.

- [ ] **Paso 5: escribir las pruebas de política y confirmar RED**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getSessionCookieOptions,
  getSessionExpiry,
  normalizeEmail,
  shouldRenewSession,
  validateLoginInput,
} from "../app/admin/auth/policy";

test("normaliza el correo sin alterar su contenido útil", () => {
  assert.equal(normalizeEmail(" ADMIN@Ejemplo.COM "), "admin@ejemplo.com");
});

test("rechaza correo inválido y contraseña vacía", () => {
  assert.deepEqual(validateLoginInput({ email: "sin-arroba", password: "" }), {
    ok: false,
  });
});

test("la sesión vence doce horas después", () => {
  const now = new Date("2026-08-25T12:00:00.000Z");
  assert.equal(getSessionExpiry(now).toISOString(), "2026-08-26T00:00:00.000Z");
});

test("solo renueva al entrar en la ventana de quince minutos", () => {
  const expiresAt = new Date("2026-08-26T00:00:00.000Z");
  assert.equal(shouldRenewSession(expiresAt, new Date("2026-08-25T12:14:59.000Z")), false);
  assert.equal(shouldRenewSession(expiresAt, new Date("2026-08-25T12:15:00.000Z")), true);
});

test("secure depende del entorno y conserva las demás defensas", () => {
  const expiresAt = new Date("2026-08-26T00:00:00.000Z");
  assert.deepEqual(getSessionCookieOptions(expiresAt, false), {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/admin",
    expires: expiresAt,
  });
  assert.equal(getSessionCookieOptions(expiresAt, true).secure, true);
});
```

Resultado RED esperado: falta `policy.ts`.

- [ ] **Paso 6: implementar política, ejecutar ambas pruebas y actualizar el traspaso**

```powershell
node --test --import ./scripts/register-ts.mjs tests/admin-auth-crypto.test.ts tests/admin-auth-policy.test.ts
```

Marcar en `CONTINUAR-PANEL.md` que primitivas y políticas están implementadas y anotar
el comando ejecutado.

- [ ] **Paso 7: commit**

```powershell
git add app/admin/auth/crypto.ts app/admin/auth/policy.ts tests/admin-auth-crypto.test.ts tests/admin-auth-policy.test.ts docs/CONTINUAR-PANEL.md
git commit -m "feat: añade las primitivas seguras del panel"
```

---

### Task 2: Esquema y repositorio de autenticación

**Archivos:**

- Crear: `app/admin/auth/types.ts`
- Crear: `app/admin/auth/repository.ts`
- Crear: `app/admin/auth/repository.server.ts`
- Crear: `db/003_admin.sql`
- Crear: `tests/admin-auth-repository.test.ts`
- Crear: `tests/helpers/admin-auth.ts`
- Modificar: `docs/CONTINUAR-PANEL.md`

**Interfaces:**

- Produce: `AdminAuthRepository`, con métodos para buscar usuario activo, crear y
  revocar sesiones, validar y renovar sesión, consultar/consumir/limpiar intentos,
  actualizar el último acceso y limpiar filas caducadas.
- Los nombres exactos del contrato son `findActiveUserByEmail`,
  `createSessionForUser`, `findValidSession`, `renewSession`, `deleteSession`,
  `deleteSessionsForUser`, `findCurrentLoginAttempt`, `recordLoginFailure`, `clearLoginAttempt`,
  `deleteExpiredData` y `upsertAdminUser`.
- `findCurrentLoginAttempt(keyHash, now)` lee sin escribir el intento dentro de la
  ventana vigente y devuelve su contador y bloqueo, o `null` si no existe o ya venció.
  El caso de uso lo consulta antes de verificar la contraseña: solo un bloqueo cuyo
  `blockedUntil` sea posterior a `now` rechaza de inmediato; cuatro fallos no impiden
  un acierto posterior, que limpia el contador.
- Produce: `createAdminAuthRepository(query)` en `repository.ts`, comprobable con un
  ejecutor controlado, y `getAdminAuthRepository()` en `repository.server.ts` para Neon.
- Produce para pruebas: `TEST_NOW`, `TEST_SECRET`, `TEST_TOKEN`,
  `createControlledQuery(options)`, `createStoredSession(overrides)` y
  `createInMemoryAuthFixture(seed)` desde `tests/helpers/admin-auth.ts`. `seed` admite
  exactamente `withoutUser`, `userPassword`, `previousFailures`,
  `activeSessionToken`, `sessionExpiresAt` y `failQueries`. La fixture implementa el
  contrato completo y conserva usuarios, sesiones e intentos en estructuras reales,
  sin métodos exclusivos dentro del código de producción.

- [ ] **Paso 1: definir el contrato y escribir la prueba RED del adaptador**

La prueba debe usar el repositorio real con un ejecutor SQL controlado que solo responda
si recibe los parámetros correctos. Debe comprobar mediante el resultado observable que:

```ts
test("solo reconstruye usuarios activos con todos sus campos de autenticación", async () => {
  const repository = createAdminAuthRepository(createControlledQuery({
    expectedParams: ["admin@econoluz.test"],
    rows: [{
      id: "7",
      email: "admin@econoluz.test",
      name: "Administración",
      password_hash: "ab".repeat(64),
      salt: "cd".repeat(16),
      active: true,
    }],
  }));

  assert.deepEqual(await repository.findActiveUserByEmail("admin@econoluz.test"), {
    id: "7",
    email: "admin@econoluz.test",
    name: "Administración",
    passwordHash: "ab".repeat(64),
    salt: "cd".repeat(16),
  });
});
```

Completar el archivo con estos resultados observables usando `createControlledQuery`:

```ts
test("una consulta sin sesión vigente devuelve null", async () => {
  const repository = createAdminAuthRepository(createControlledQuery({
    expectedParams: ["huella", "2026-08-25T12:00:00.000Z"],
    rows: [],
  }));
  assert.equal(await repository.findValidSession("huella", TEST_NOW), null);
});

test("una renovación no revive una sesión vencida", async () => {
  const repository = createAdminAuthRepository(createControlledQuery({
    expectedParams: ["huella", "2026-08-26T00:15:00.000Z", "2026-08-25T12:15:00.000Z"],
    rows: [],
  }));
  assert.equal(
    await repository.renewSession(
      "huella",
      new Date("2026-08-26T00:15:00.000Z"),
      new Date("2026-08-25T12:15:00.000Z"),
    ),
    false,
  );
});

test("el adaptador devuelve el bloqueo calculado atómicamente por Postgres", async () => {
  const blockedUntil = new Date("2026-08-25T12:15:00.000Z");
  const repository = createAdminAuthRepository(createControlledQuery({
    expectedParams: ["clave-anónima", "2026-08-25T12:00:00.000Z", 5, 900],
    rows: [{ failure_count: 5, blocked_until: blockedUntil.toISOString() }],
  }));
  assert.deepEqual(await repository.recordLoginFailure("clave-anónima", TEST_NOW), {
    failureCount: 5,
    blockedUntil,
  });
});
```

`deleteExpiredData(now)` se cubre con un ejecutor que devuelve una fila resumen
`{ deleted_sessions: 2, deleted_attempts: 3 }`; la aserción literal debe recibir
exactamente `{ deletedSessions: 2, deletedAttempts: 3 }`.

- [ ] **Paso 2: confirmar RED**

```powershell
node --test --import ./scripts/register-ts.mjs tests/admin-auth-repository.test.ts
```

Resultado esperado: faltan el contrato y el repositorio.

- [ ] **Paso 3: crear la migración y el adaptador mínimo**

`db/003_admin.sql` debe crear las tres tablas de la especificación, restricciones de
correo en minúsculas y contadores no negativos, claves foráneas con cascada e índices
por expiración y usuario. `repository.ts` solo recibe una función `query(text, params)`
y nunca importa `server-only`, por lo que `node:test` ejecuta el adaptador real.
`repository.server.ts` sí importa `server-only`, crea
`neon(connectionString).query(text, params)` y nunca se importa desde las pruebas.
Ninguno interpola correo, origen ni token.

- [ ] **Paso 4: confirmar GREEN y ejecutar comprobaciones estáticas**

```powershell
node --test --import ./scripts/register-ts.mjs tests/admin-auth-repository.test.ts
npm run typecheck
npm run lint
```

No ejecutar todavía `npm run db:migrar`: modifica Neon y requiere una confirmación
operativa específica al final.

- [ ] **Paso 5: actualizar documentación y commit**

```powershell
git add app/admin/auth/types.ts app/admin/auth/repository.ts app/admin/auth/repository.server.ts db/003_admin.sql tests/admin-auth-repository.test.ts tests/helpers/admin-auth.ts docs/CONTINUAR-PANEL.md
git commit -m "feat: prepara usuarios y sesiones en Neon"
```

---

### Task 3: Caso de uso de inicio de sesión y bloqueo

**Archivos:**

- Crear: `app/admin/auth/login.ts`
- Crear: `tests/admin-auth-login.test.ts`
- Modificar: `docs/CONTINUAR-PANEL.md`

**Interfaces:**

- Consume: `AdminAuthRepository`, primitivas y políticas de las tareas 1 y 2.
- Produce: `loginAdmin({ email, password, origin }, repository, now, secret)` con
  resultados discriminados `success`, `invalid`, `blocked` o `unavailable`.
- Tras validar la forma de la entrada y calcular la clave anónima, consulta
  `findCurrentLoginAttempt` antes de verificar la contraseña. Si el bloqueo sigue
  vigente devuelve `blocked`; si no, verifica credenciales, registra solo los fallos y
  limpia el contador únicamente después de un acierto.

- [x] **Paso 1: escribir pruebas RED con un repositorio en memoria completo**

Casos mínimos:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { loginAdmin } from "../app/admin/auth/login";
import {
  TEST_NOW,
  TEST_SECRET,
  createInMemoryAuthFixture,
} from "./helpers/admin-auth";

test("un acceso correcto crea sesión, limpia fallos y actualiza el último acceso", async () => {
  const fixture = await createInMemoryAuthFixture({ userPassword: "frase segura de prueba" });
  const result = await loginAdmin(
    { email: " ADMIN@EJEMPLO.COM ", password: "frase segura de prueba", origin: "203.0.113.7" },
    fixture.repository,
    TEST_NOW,
    TEST_SECRET,
  );
  assert.equal(result.status, "success");
  assert.equal(fixture.state.sessions.length, 1);
  assert.equal(fixture.state.attempts.size, 0);
});

test("cuatro fallos no bloquean una contraseña correcta y el acierto los limpia", async () => {
  const fixture = await createInMemoryAuthFixture({
    userPassword: "frase segura de prueba",
    previousFailures: 4,
  });
  const result = await loginAdmin(
    { email: "admin@ejemplo.com", password: "frase segura de prueba", origin: "203.0.113.7" },
    fixture.repository,
    TEST_NOW,
    TEST_SECRET,
  );
  assert.equal(result.status, "success");
  assert.equal(fixture.state.attempts.size, 0);
});

test("correo inexistente y contraseña errónea producen el mismo estado público", async () => {
  const unknown = await createInMemoryAuthFixture({ withoutUser: true });
  const wrong = await createInMemoryAuthFixture({ userPassword: "frase segura de prueba" });
  const input = { email: "admin@ejemplo.com", password: "incorrecta", origin: "203.0.113.7" };
  assert.equal((await loginAdmin(input, unknown.repository, TEST_NOW, TEST_SECRET)).status, "invalid");
  assert.equal((await loginAdmin(input, wrong.repository, TEST_NOW, TEST_SECRET)).status, "invalid");
});

test("el quinto fallo bloquea y una contraseña correcta no omite un bloqueo vigente", async () => {
  const fixture = await createInMemoryAuthFixture({
    userPassword: "frase segura de prueba",
    previousFailures: 4,
  });
  const wrong = { email: "admin@ejemplo.com", password: "incorrecta", origin: "203.0.113.7" };
  const correct = { ...wrong, password: "frase segura de prueba" };
  assert.equal((await loginAdmin(wrong, fixture.repository, TEST_NOW, TEST_SECRET)).status, "blocked");
  assert.equal((await loginAdmin(correct, fixture.repository, TEST_NOW, TEST_SECRET)).status, "blocked");
});
```

El repositorio falso debe conservar todas las estructuras del contrato y simular las
ventanas temporales; las aserciones recaen sobre el resultado real de `loginAdmin` y sus
efectos de dominio, no sobre llamadas de un mock.

```ts
test("una entrada malformada no toca el repositorio", async () => {
  const fixture = await createInMemoryAuthFixture({ userPassword: "frase segura de prueba" });
  const before = structuredClone(fixture.state);
  const result = await loginAdmin(
    { email: "sin-arroba", password: "", origin: "203.0.113.7" },
    fixture.repository,
    TEST_NOW,
    TEST_SECRET,
  );
  assert.equal(result.status, "invalid");
  assert.deepEqual(fixture.state, before);
});

test("un fallo de Neon se convierte en indisponibilidad sin filtrar detalles", async () => {
  const fixture = await createInMemoryAuthFixture({ failQueries: true });
  const result = await loginAdmin(
    { email: "admin@ejemplo.com", password: "frase segura de prueba", origin: "203.0.113.7" },
    fixture.repository,
    TEST_NOW,
    TEST_SECRET,
  );
  assert.deepEqual(result, { status: "unavailable" });
});
```

- [x] **Paso 2: confirmar RED, implementar lo mínimo y confirmar GREEN**

```powershell
node --test --import ./scripts/register-ts.mjs tests/admin-auth-login.test.ts
node --test --import ./scripts/register-ts.mjs tests/admin-auth-login.test.ts
```

La primera ejecución debe fallar por ausencia del caso de uso; la segunda debe pasar.
El camino de correo desconocido debe ejecutar `verifyPassword` con una credencial
ficticia válida para no crear una diferencia trivial de tiempo.

- [x] **Paso 3: ejecutar toda la unidad y actualizar documentación**

```powershell
node --test --import ./scripts/register-ts.mjs tests/admin-auth-crypto.test.ts tests/admin-auth-policy.test.ts tests/admin-auth-repository.test.ts tests/admin-auth-login.test.ts
```

- [x] **Paso 4: commit**

```powershell
git add app/admin/auth/login.ts tests/admin-auth-login.test.ts docs/CONTINUAR-PANEL.md
git commit -m "feat: limita y valida el acceso al panel"
```

**Notas de implementación (25/08/2026):** el resultado `success` devuelve también
`token`, `expiresAt` y `userName`, porque la Task 5 necesita esos tres datos para
escribir la cookie sin volver a consultar Neon. El bloqueo se evalúa con
`getBlockedUntil`, que acepta la marca `blocked_until` **o** el contador agotado dentro
de la ventana, y se consulta antes de verificar la contraseña para no consumir intentos
mientras el bloqueo está vigente. La fixture compartida se corrigió para que sembrar
cinco fallos deje también la marca de bloqueo, como hace `recordLoginFailure`.

---

### Task 4: Sesión, renovación y DAL de autorización

**Archivos:**

- Crear: `app/admin/auth/session.ts`
- Crear: `app/admin/auth/authorization.server.ts`
- Crear: `app/admin/sesion/route.ts`
- Crear: `tests/admin-auth-session.test.ts`
- Modificar: `.env.example`
- Modificar: `docs/CONTINUAR-PANEL.md`

**Interfaces:**

- Produce: `validateSessionToken(token, repository, now, secret)` y
  `renewSessionToken(token, repository, now, secret)` como núcleo comprobable.
- Produce: `verificarSesion()` memoizada para páginas,
  `verificarSesionParaAccion()` para mutaciones, `crearCookieSesion()` y
  `revocarSesionActual()`.
- Produce: `POST /admin/sesion`, que solo renueva tokens válidos.

- [x] **Paso 1: escribir pruebas RED de sesión**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { renewSessionToken, validateSessionToken } from "../app/admin/auth/session";
import {
  TEST_NOW,
  TEST_SECRET,
  TEST_TOKEN,
  createInMemoryAuthFixture,
} from "./helpers/admin-auth";

test("una sesión vigente devuelve únicamente la identidad segura", async () => {
  const fixture = await createInMemoryAuthFixture({ activeSessionToken: TEST_TOKEN });
  const result = await validateSessionToken(TEST_TOKEN, fixture.repository, TEST_NOW, TEST_SECRET);
  assert.deepEqual(result, {
    status: "valid",
    user: { id: "7", name: "Administración" },
    expiresAt: new Date("2026-08-26T00:00:00.000Z"),
  });
});

test("una sesión caducada se elimina y nunca se renueva", async () => {
  const fixture = await createInMemoryAuthFixture({
    activeSessionToken: TEST_TOKEN,
    sessionExpiresAt: new Date("2026-08-25T11:59:59.000Z"),
  });
  const result = await renewSessionToken(TEST_TOKEN, fixture.repository, TEST_NOW, TEST_SECRET);
  assert.deepEqual(result, { status: "invalid" });
  assert.equal(fixture.state.sessions.length, 0);
});

test("la actividad amplía la sesión doce horas sin escribir antes de quince minutos", async () => {
  const fixture = await createInMemoryAuthFixture({ activeSessionToken: TEST_TOKEN });
  const minute14 = new Date("2026-08-25T12:14:59.000Z");
  const minute15 = new Date("2026-08-25T12:15:00.000Z");
  assert.equal((await renewSessionToken(TEST_TOKEN, fixture.repository, minute14, TEST_SECRET)).renewed, false);
  assert.equal((await renewSessionToken(TEST_TOKEN, fixture.repository, minute15, TEST_SECRET)).renewed, true);
  assert.equal(fixture.state.sessions[0].expiresAt.toISOString(), "2026-08-26T00:15:00.000Z");
});
```

- [x] **Paso 2: confirmar RED, implementar núcleo y confirmar GREEN**

```powershell
node --test --import ./scripts/register-ts.mjs tests/admin-auth-session.test.ts
node --test --import ./scripts/register-ts.mjs tests/admin-auth-session.test.ts
```

- [x] **Paso 3: adaptar a Next.js**

`authorization.server.ts` debe importar `server-only`, usar `await cookies()` y envolver
la lectura memoizada con `cache`. Una cookie ausente redirige sin consultar Neon. Las
funciones que escriben cookies solo se invocan desde Server Actions o Route Handlers.
`redirect()` queda fuera de `try/catch`.

El Route Handler responde `204` al renovar, `401` para token inválido y `503` ante fallo
de infraestructura, sin devolver identidad ni expiración. Añadir a `.env.example` el
comando exacto para generar `ADMIN_SESSION_SECRET`.

- [x] **Paso 4: ejecutar unidad, typecheck y lint**

```powershell
node --test --import ./scripts/register-ts.mjs tests/admin-auth-crypto.test.ts tests/admin-auth-policy.test.ts tests/admin-auth-repository.test.ts tests/admin-auth-login.test.ts tests/admin-auth-session.test.ts
npm run typecheck
npm run lint
```

- [x] **Paso 5: actualizar documentación y commit**

```powershell
git add app/admin/auth/session.ts app/admin/auth/authorization.server.ts app/admin/sesion/route.ts tests/admin-auth-session.test.ts .env.example docs/CONTINUAR-PANEL.md
git commit -m "feat: protege y renueva las sesiones del panel"
```

**Notas de implementación (25/08/2026):** la cookie se llama `econoluz_admin`. La prueba
de renovación del paso 1 se adaptó para estrechar el resultado discriminado antes de leer
`renewed`: tal como estaba escrita se ejecutaba en Node pero `npm run typecheck` la
rechazaba. La limpieza de filas caducadas se colgó de la renovación efectiva —como mucho
una cada quince minutos— en lugar de cada validación, para no pagar una escritura por
carga de página.

---

### Task 5: Pantallas de acceso, salida y actividad

**Archivos:**

- Crear: `app/admin/layout.tsx`
- Crear: `app/admin/entrar/page.tsx`
- Crear: `app/admin/entrar/LoginForm.tsx`
- Crear: `app/admin/actions.ts`
- Crear: `app/admin/SessionActivity.tsx`
- Crear: `app/admin/(panel)/layout.tsx`
- Crear: `app/admin/(panel)/page.tsx`
- Crear: `tests/admin-auth.spec.ts`
- Modificar: `app/components/FloatingWhatsApp.tsx`
- Modificar: `playwright.config.ts`
- Modificar: `docs/CONTINUAR-PANEL.md`

**Interfaces:**

- Consume: `loginAdmin`, `verificarSesion`, funciones de cookie y revocación.
- Produce: UI pública `/admin/entrar`, portada protegida `/admin`, salida y detector de
  actividad sin props de negocio.

- [x] **Paso 1: escribir Playwright RED para el límite público observable**

```ts
import { expect, test } from "@playwright/test";

test("redirige al acceso y mantiene el panel fuera de buscadores", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/entrar$/);
  await expect(page.getByRole("heading", { name: "Acceso al panel" })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("el acceso no muestra herramientas comerciales públicas", async ({ page }) => {
  await page.goto("/admin/entrar");
  await expect(page.getByRole("link", { name: "Contactar por WhatsApp" })).toHaveCount(0);
});

test("el formulario es identificable y navegable por teclado", async ({ page }) => {
  await page.goto("/admin/entrar");
  await expect(page.getByLabel("Correo electrónico")).toBeVisible();
  await expect(page.getByLabel("Contraseña")).toHaveAttribute("type", "password");
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
});
```

- [x] **Paso 2: añadir la prueba al `testMatch` y confirmar RED**

```powershell
npx playwright test tests/admin-auth.spec.ts
```

Resultado esperado: `/admin` no existe y la prueba falla con 404.

- [x] **Paso 3: implementar rutas y formulario mínimo**

La Server Action de entrada devuelve únicamente `{ status, email }` para errores y
establece la cookie al acertar. `LoginForm` puede usar `useActionState`; nunca recibe
hash, sal, token ni datos del proveedor. La página debe usar una sola acción roja, azul
marino como superficie y los tokens existentes.

El grupo `(panel)` llama `verificarSesion()` tanto en su layout como en su página. La
acción `salir` vuelve a verificar, revoca fila y cookie y redirige. `SessionActivity`
escucha teclado, puntero y envío, limita peticiones en cliente y llama a
`POST /admin/sesion` sin cuerpo.

`FloatingWhatsApp` ya es cliente: usar `usePathname()` para devolver `null` cuando la
ruta empiece por `/admin`, conservando intactas las rutas públicas.

- [x] **Paso 4: confirmar GREEN y ejecutar la frontera de producción**

```powershell
npx playwright test tests/admin-auth.spec.ts
npx playwright test tests/catalog-production-boundary.spec.ts
npm run typecheck
npm run lint
```

- [x] **Paso 5: actualizar documentación y commit**

```powershell
git add app/admin app/components/FloatingWhatsApp.tsx tests/admin-auth.spec.ts playwright.config.ts docs/CONTINUAR-PANEL.md
git commit -m "feat: crea la entrada protegida al panel"
```

**Notas de implementación (25/08/2026):** la cookie de sesión es `econoluz_admin`. El
estado inicial del formulario se define en `LoginForm` y no en `actions.ts`, porque un
módulo `"use server"` solo puede exportar funciones asíncronas. La acción `salir` no
exige sesión válida antes de revocar: solo puede destruir la sesión de quien manda la
cookie, y exigirla complicaría el caso de una sesión ya rota sin proteger de nada. Se
añadieron dos pruebas al paso 1: el mensaje genérico ante credenciales equivocadas y que
el WhatsApp flotante sigue en el sitio público.

---

### Task 6: Script para crear y recuperar administradores

**Archivos:**

- Crear: `scripts/create-admin.mjs`
- Crear: `tests/admin-create-script.test.ts`
- Modificar: `package.json`
- Modificar: `docs/CONTINUAR-PANEL.md`

**Interfaces:**

- Consume: `hashPassword` y `DATABASE_URL`.
- Produce: `npm run admin:crear`, interactivo, sin eco de contraseña y repetible por
  correo.

- [x] **Paso 1: escribir prueba RED ejecutando el script como proceso hijo**

Separar el flujo reusable en funciones exportadas sin ejecutar prompts al importar. La
prueba invoca el script con un repositorio controlado y una entrada controlada para
comprobar el resultado real:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyPassword } from "../app/admin/auth/crypto";
import {
  requireDatabaseUrl,
  saveAdmin,
  validatePasswordConfirmation,
} from "../scripts/create-admin.mjs";
import {
  createInMemoryAuthFixture,
  createStoredSession,
} from "./helpers/admin-auth";

test("crear de nuevo el mismo correo cambia la contraseña e invalida sus sesiones", async () => {
  const fixture = await createInMemoryAuthFixture({ withoutUser: true });
  await saveAdmin({ name: "Administración", email: " ADMIN@EJEMPLO.COM ", password: "primera frase segura" }, fixture.repository);
  fixture.state.sessions.push(createStoredSession({ userId: "1", tokenHash: "sesion-anterior" }));
  await saveAdmin({ name: "Administración", email: "admin@ejemplo.com", password: "segunda frase segura" }, fixture.repository);
  assert.equal(fixture.state.users.length, 1);
  assert.equal(fixture.state.sessions.length, 0);
  assert.equal(await verifyPassword("segunda frase segura", fixture.state.users[0].salt, fixture.state.users[0].passwordHash), true);
});
```

Añadir estos casos literales al mismo archivo:

```ts
test("rechaza una contraseña de menos de doce caracteres", async () => {
  const fixture = await createInMemoryAuthFixture({ withoutUser: true });
  await assert.rejects(
    () => saveAdmin(
      { name: "Administración", email: "admin@ejemplo.com", password: "demasiado" },
      fixture.repository,
    ),
    /doce caracteres/,
  );
  assert.equal(fixture.state.users.length, 0);
});

test("rechaza una confirmación distinta antes de abrir la base de datos", () => {
  assert.equal(validatePasswordConfirmation("frase segura larga", "otra frase segura"), false);
});

test("la ausencia de DATABASE_URL no expone ningún valor de entorno", () => {
  assert.throws(() => requireDatabaseUrl({}), /^Error: Falta DATABASE_URL\.$/);
});
```

- [x] **Paso 2: confirmar RED, implementar y confirmar GREEN**

```powershell
node --test --import ./scripts/register-ts.mjs tests/admin-create-script.test.ts
node --test --import ./scripts/register-ts.mjs tests/admin-create-script.test.ts
```

La lectura secreta debe restaurar siempre el modo de terminal incluso si se cancela. No
guardar ni imprimir contraseña, hash, sal o cadena de conexión.

- [x] **Paso 3: añadir comandos estables y ejecutar toda la unidad**

Añadir a `package.json`:

```json
"test:admin": "node --test --import ./scripts/register-ts.mjs tests/admin-auth-crypto.test.ts tests/admin-auth-policy.test.ts tests/admin-auth-repository.test.ts tests/admin-auth-login.test.ts tests/admin-auth-session.test.ts tests/admin-create-script.test.ts",
"admin:crear": "node --env-file-if-exists=.env.local --import ./scripts/register-ts.mjs ./scripts/create-admin.mjs"
```

Ejecutar:

```powershell
npm run test:admin
npm run typecheck
npm run lint
```

- [x] **Paso 4: actualizar documentación y commit**

```powershell
git add scripts/create-admin.mjs tests/admin-create-script.test.ts package.json package-lock.json docs/CONTINUAR-PANEL.md
git commit -m "feat: permite crear administradores por terminal"
```

`package-lock.json` solo se añade si npm lo modificó realmente; no ejecutar instalación
porque no hay dependencias nuevas.

**Notas de implementación (25/08/2026):** el repositorio de Neon se carga con `import()`
diferido dentro de `main()`, para que importar el script desde las pruebas no arrastre
`server-only` ni el driver. La ejecución directa se detecta con
`pathToFileURL(process.argv[1])` y no comparando sufijos: la ruta del proyecto lleva un
espacio y en la URL aparece como `%20`. Las teclas de control se comparan con escapes
(``, ``) en lugar de caracteres literales, que son invisibles en el fuente y
se pierden al copiar. Los comandos nuevos llevan `--disable-warning=MODULE_TYPELESS_PACKAGE_JSON`
como los demás del proyecto.

---

### Task 7: Verificación integral y documentación de entrega

**Archivos:**

- Modificar: `CLAUDE.md`
- Modificar: `docs/CONTINUAR-PANEL.md`
- Modificar: `docs/superpowers/specs/2026-08-25-admin-auth-design.md`

**Interfaces:**

- Consume: todos los entregables anteriores.
- Produce: paso 1.b documentado con resultados reproducibles y operaciones pendientes
  separadas del código.

- [x] **Paso 1: ejecutar verificación automática completa**

```powershell
npm run test:admin
npm run typecheck
npm run lint
npm run build
npx playwright test tests/admin-auth.spec.ts
npx playwright test tests/catalog-production-boundary.spec.ts
npx playwright test
```

Registrar el número exacto de pruebas. La única tolerancia es el fallo histórico
`tests/catalog-quote.spec.ts:891`, siempre que vuelva a ser exactamente el mismo. Si
aparece cualquier otro fallo, detener la entrega y depurarlo con
`superpowers:systematic-debugging`.

- [x] **Paso 2: revisión de seguridad por mutaciones mentales**

Comprobar que al cambiar cada una de estas condiciones falla al menos una prueba:

- aceptar una contraseña distinta;
- omitir el HMAC o usar otro secreto;
- renovar una sesión caducada;
- no incrementar el quinto fallo;
- confiar solo en el layout;
- dejar `secure: true` en desarrollo;
- volver a mostrar WhatsApp en `/admin`.

- [x] **Paso 3: actualizar los tres documentos**

Marcar la implementación como terminada en el código pero pendiente de activación real.
Documentar los commits y resultados. Mantener expresamente pendientes:

1. generar y guardar `ADMIN_SESSION_SECRET`;
2. aplicar `db/003_admin.sql` con `npm run db:migrar`;
3. crear el primer usuario con `npm run admin:crear`;
4. comprobar acceso, renovación y salida contra Neon;
5. añadir el secreto a Vercel y desplegar solo con autorización explícita.

- [x] **Paso 4: commit de documentación y estado limpio**

```powershell
git add CLAUDE.md docs/CONTINUAR-PANEL.md docs/superpowers/specs/2026-08-25-admin-auth-design.md
git commit -m "docs: deja preparado el acceso para activarlo"
git status --short --branch
```

Resultado esperado: árbol limpio en `panel-admin`. No hacer push ni desplegar.

- [x] **Paso 5: pedir autorización antes de tocar Neon**

Presentar al dueño los resultados automáticos y pedir confirmación específica para
generar el secreto local, aplicar la migración y crear el administrador. La contraseña
se introduce directamente en su terminal; nunca se solicita por chat ni se registra en
salidas de herramientas.
