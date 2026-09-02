# Credenciales federadas de Vercel a Firebase Admin — plan de implementación

> **Para quien ejecute esto con agentes:** SUB-SKILL OBLIGATORIA: usa
> `superpowers:subagent-driven-development` (recomendada) o
> `superpowers:executing-plans` para ejecutar tarea por tarea. Los pasos usan
> casillas (`- [ ]`) para poder marcarlos.

**Objetivo:** que una función de Vercel en el entorno Preview obtenga credenciales
temporales para Firebase Authentication mediante Workload Identity Federation, sin
que exista ninguna clave privada de cuenta de servicio, y demostrarlo con pruebas
ejecutadas.

**Arquitectura:** Vercel firma un testigo OIDC por despliegue; el Security Token
Service de Google lo acepta si cumple la condición de atributos del proveedor y lo
canjea por la suplantación de una cuenta de servicio con cuatro permisos sobre
Firebase Authentication. La regla de decisión y la adaptación a la interfaz
`Credential` viven en un módulo puro y probado; el módulo `.server.ts` solo cablea.
En local no cambia nada: se sigue usando `applicationDefault()`.

**Stack:** Next.js 16.3.1 (App Router), TypeScript estricto, `firebase-admin` 14.3.0,
`google-auth-library` 10.x, `@vercel/oidc` 3.x, pruebas con `node:test`.

**Diseño:** `docs/superpowers/specs/2026-09-01-vercel-firebase-wif-design.md`

## Restricciones globales

- **Rama `feat/identidad-clientes`, worktree `.worktrees/identidad-clientes`.** No se
  borran ni la rama ni el worktree.
- **Nada de push, fusión ni despliegue de producción.** El único despliegue permitido
  es `vercel deploy` a Preview, en la tarea 7, y ya está autorizado.
- **Nunca se escribe en la Neon de producción.**
- **No se reducen las políticas de seguridad de la organización.** Si una política
  bloquea, se para y se va al plan B del diseño §14.2.
- **No se piden ni se imprimen secretos, testigos ni cadenas de conexión.** Ningún
  script del plan imprime un testigo; las pruebas comprueban que no lo hacen.
- **Español de España** en comentarios, mensajes de commit y resúmenes. Nombres de
  variables, rutas y salidas literales de terminal no se traducen.
- **Ninguna clave privada.** Ni `cert()`, ni `FIREBASE_PRIVATE_KEY`, ni
  `FIREBASE_CLIENT_EMAIL`, ni JSON de cuenta de servicio.
- **La consola del dueño es Windows PowerShell 5.1 y no entiende `&&`.** Los comandos
  van en líneas separadas.
- **Convención del proyecto:** todo `X.server.ts` tiene un `X.ts` puro hermano con la
  lógica; las pruebas importan solo el puro.
- **Los `.md` se actualizan durante el trabajo, no al final.**

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `app/identidad/credencial.ts` — **nuevo** | Puro. Decide el modo, valida las variables, arma la configuración del cliente externo y adapta cualquier cliente a la interfaz `Credential`. Todo lo comprobable vive aquí |
| `app/identidad/credencialFederada.server.ts` — **nuevo** | Impuro y mínimo. Único archivo que importa `google-auth-library` y `@vercel/oidc`. Construye el cliente real y lo pasa al adaptador puro |
| `app/identidad/firebase.server.ts` — **modificado** | `obtenerCredencial()` aplica la regla del módulo puro |
| `tests/identidad-credencial.test.ts` — **nuevo** | Pruebas de unidad del módulo puro |
| `tests/identidad-frontera.test.ts` — **modificado** | Fronteras nuevas y guardián de la ruta de diagnóstico |
| `scripts/comprobar-federacion.mjs` — **nuevo** | Comprobación real contra el STS y Firebase, sin imprimir testigos |
| `app/api/identidad/diagnostico/route.ts` — **nuevo y temporal** | Solo para la prueba en Preview. **Se retira en la tarea 8** |
| `package.json` — **modificado** | Dos dependencias directas y el guion `identidad:federacion` |
| `.env.example`, `docs/OPERACION-FIREBASE.md`, `CLAUDE.md`, `docs/CONTINUAR-PANEL.md` | Documentación al día |

---

## Tarea 0: Comprobaciones bloqueantes — antes de crear ni escribir nada

**Es una puerta, no una tarea de código.** Si cualquiera de las tres falla, el plan se
detiene y se va al diseño §14.2. No hay commit.

Las tres son de solo lectura y las hace el dueño, **una a una**, guiado.

- [ ] **Paso 1: ¿La organización admite `oidc.vercel.com` como emisor?**

En PowerShell:

```powershell
gcloud resource-manager org-policies describe constraints/iam.workloadIdentityPoolProviders --effective --project=econoluz-dev-d30ab
```

Esperado, en el mejor caso: que la política **no esté configurada**, o que su lista
permitida incluya `https://oidc.vercel.com` o el emisor del equipo. Si devuelve una
lista que no lo incluye, **parar**. No se toca la política.

Alternativa por panel: consola de Google Cloud → *IAM y administración* → *Políticas
de la organización* → buscar «workloadIdentityPoolProviders».

- [ ] **Paso 2: ¿La cuenta del dueño puede crear los recursos?**

```powershell
gcloud projects get-iam-policy econoluz-dev-d30ab --flatten="bindings[].members" --format="table(bindings.role)" --filter="bindings.members:kramon1219@gmail.com"
```

Hacen falta, en la práctica: crear pools y proveedores de identidad
(`roles/iam.workloadIdentityPoolAdmin`), crear cuentas de servicio
(`roles/iam.serviceAccountAdmin`), crear roles personalizados (`roles/iam.roleAdmin`)
y conceder roles en el proyecto (`roles/resourcemanager.projectIamAdmin`). Si la
cuenta es **Owner** del proyecto, los cubre todos.

Si faltan, **parar** y pedírselos a quien administre la organización.

- [ ] **Paso 3: ¿El equipo de Vercel tiene la federación OIDC?**

En el panel de Vercel: proyecto → *Settings* → *Security* → sección **Secure backend
access with OIDC federation**. Anotar tres cosas, que **no son secretas** y hacen
falta después:

1. El **slug del equipo** (aparece en la URL del equipo).
2. El **nombre del proyecto** tal y como lo muestra Vercel.
3. Si la sección existe y permite elegir entre *Team* y *Global*.

Si la sección no existe, **parar**.

- [ ] **Paso 4: Anotar el resultado**

Escribir las tres respuestas en `docs/OPERACION-FIREBASE.md`, en una sección nueva
«3.1 Comprobaciones previas», con la fecha. Commit:

```bash
git add docs/OPERACION-FIREBASE.md
git commit -m "docs(identidad): anotar las comprobaciones previas de la federacion"
```

---

## Tarea 1: La regla de elección de credencial, sin respaldo privilegiado

**Archivos:**
- Crear: `app/identidad/credencial.ts`
- Crear: `tests/identidad-credencial.test.ts`
- Modificar: `package.json` (añadir el archivo de prueba a `test:datos`)

**Interfaces:**
- Consume: nada.
- Produce: `VARIABLES_DE_FEDERACION: readonly string[]`,
  `type ModoDeCredencial = "adc" | "federada"`,
  `elegirModo(env: Record<string, string | undefined>): ModoDeCredencial`.

- [ ] **Paso 1: Escribir las pruebas que fallan**

Crear `tests/identidad-credencial.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { VARIABLES_DE_FEDERACION, elegirModo } from "../app/identidad/credencial";

const COMPLETO = {
  VERCEL: "1",
  GCP_PROJECT_NUMBER: "123456789012",
  GCP_WORKLOAD_IDENTITY_POOL_ID: "vercel",
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: "vercel",
  GCP_SERVICE_ACCOUNT_EMAIL: "econoluz-identidad-preview@econoluz-dev-d30ab.iam.gserviceaccount.com",
  GCP_AUDIENCE:
    "https://iam.googleapis.com/projects/123456789012/locations/global/workloadIdentityPools/vercel/providers/vercel",
};

test("fuera de Vercel se usan las credenciales predeterminadas", () => {
  assert.equal(elegirModo({}), "adc");
});

test("fuera de Vercel no importa que falten las variables de federacion", () => {
  assert.equal(elegirModo({ GCP_PROJECT_NUMBER: "123456789012" }), "adc");
});

test("en Vercel con todas las variables se usa la credencial federada", () => {
  assert.equal(elegirModo(COMPLETO), "federada");
});

/**
 * La regla más importante del módulo: en Vercel no hay respaldo. Caer hacia
 * applicationDefault() sería elegir el camino más privilegiado justo cuando falta
 * configuración, que es exactamente lo que prohíbe la regla del proyecto.
 */
for (const variable of VARIABLES_DE_FEDERACION) {
  test(`en Vercel, sin ${variable}, se lanza en vez de caer hacia ADC`, () => {
    const incompleto: Record<string, string | undefined> = { ...COMPLETO };
    delete incompleto[variable];

    assert.throws(
      () => elegirModo(incompleto),
      (error: Error) => error.message.includes(variable),
      `Sin ${variable} tiene que lanzar, y el mensaje tiene que nombrarla.`,
    );
  });
}

test("el mensaje de error nombra todas las variables que faltan, no solo la primera", () => {
  assert.throws(
    () => elegirModo({ VERCEL: "1" }),
    (error: Error) => VARIABLES_DE_FEDERACION.every((v) => error.message.includes(v)),
  );
});
```

- [ ] **Paso 2: Ejecutar y verlas fallar**

```powershell
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/identidad-credencial.test.ts
```

Esperado: FALLA, porque `app/identidad/credencial.ts` no existe.

- [ ] **Paso 3: Implementar lo mínimo**

Crear `app/identidad/credencial.ts`:

```ts
/**
 * La regla de qué credencial usa el servidor para hablar con Firebase, y nada más.
 *
 * Vive aparte de `firebase.server.ts` por la misma razón que `sesion.ts` vive aparte
 * de `sesion.server.ts`: lo que se puede probar sin red ni credenciales, se prueba.
 */

export type ModoDeCredencial = "adc" | "federada";

/** Ninguna es secreta: son identificadores públicos del proyecto de Google. */
export const VARIABLES_DE_FEDERACION = [
  "GCP_PROJECT_NUMBER",
  "GCP_WORKLOAD_IDENTITY_POOL_ID",
  "GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID",
  "GCP_SERVICE_ACCOUNT_EMAIL",
  "GCP_AUDIENCE",
] as const;

/**
 * En Vercel **no hay respaldo**. Si falta configuración, se lanza: caer hacia
 * `applicationDefault()` sería tomar el camino más privilegiado precisamente cuando
 * algo está mal configurado, y nadie se enteraría. Es la misma regla que gobierna
 * `app/data/origenPublico.ts` con el rol público de Neon.
 */
export function elegirModo(env: Record<string, string | undefined>): ModoDeCredencial {
  if (!env.VERCEL) {
    return "adc";
  }

  const faltan = VARIABLES_DE_FEDERACION.filter((variable) => !env[variable]);
  if (faltan.length > 0) {
    throw new Error(
      "En Vercel la identidad de clientes se autentica con credenciales federadas y no hay " +
        `respaldo posible. Faltan: ${faltan.join(", ")}. ` +
        "Ver docs/superpowers/specs/2026-09-01-vercel-firebase-wif-design.md, sección 7.",
    );
  }

  return "federada";
}
```

- [ ] **Paso 4: Ejecutar y verlas pasar**

```powershell
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/identidad-credencial.test.ts
```

Esperado: PASA, 8 pruebas.

- [ ] **Paso 5: Romperla a propósito para comprobar que la prueba sirve**

Cambiar temporalmente el `if (!env.VERCEL)` por `return "adc";` incondicional y
volver a ejecutar. Esperado: FALLAN las de federación. Deshacer el cambio.

- [ ] **Paso 6: Añadir el archivo a `test:datos`**

En `package.json`, dentro del guion `test:datos`, añadir
`tests/identidad-credencial.test.ts` justo después de `tests/identidad-frontera.test.ts`.

```powershell
npm run test:datos
```

Esperado: PASA, con 8 pruebas más que antes.

- [ ] **Paso 7: Commit**

```bash
git add app/identidad/credencial.ts tests/identidad-credencial.test.ts package.json
git commit -m "feat(identidad): elegir credencial sin respaldo privilegiado en Vercel"
```

---

## Tarea 2: La configuración del cliente externo y el adaptador a `Credential`

**Archivos:**
- Modificar: `app/identidad/credencial.ts`
- Modificar: `tests/identidad-credencial.test.ts`

**Interfaces:**
- Consume: `VARIABLES_DE_FEDERACION`, `elegirModo` de la tarea 1.
- Produce:
  - `configuracionFederada(env): ConfiguracionFederada` — el objeto que se le pasa a
    `ExternalAccountClient.fromJSON`.
  - `type ClienteFederado = { getAccessToken(): Promise<{ token?: string | null }>; credentials: { expiry_date?: number | null } }`
  - `type CredencialDeFirebase = { getAccessToken(): Promise<{ access_token: string; expires_in: number }> }`
  - `adaptarCredencial(crearCliente: () => ClienteFederado, ahora?: () => number): CredencialDeFirebase`

**Nota de frontera:** este módulo **no importa el tipo `Credential` de
`firebase-admin`**, ni siquiera como importación de tipos, porque
`tests/identidad-frontera.test.ts` prohíbe que cualquier archivo distinto de
`firebase.server.ts` mencione `firebase-admin`. Se declara la forma estructuralmente,
que es todo lo que `initializeApp` necesita.

- [ ] **Paso 1: Escribir las pruebas que fallan**

Ampliar la importación de la cabecera de `tests/identidad-credencial.test.ts` para que
quede así:

```ts
import {
  VARIABLES_DE_FEDERACION,
  adaptarCredencial,
  configuracionFederada,
  elegirModo,
} from "../app/identidad/credencial";
```

y añadir estas pruebas al final del archivo:

```ts
test("la configuracion apunta al proveedor y a la cuenta de servicio esperados", () => {
  const config = configuracionFederada(COMPLETO);

  assert.equal(config.type, "external_account");
  assert.equal(config.subject_token_type, "urn:ietf:params:oauth:token-type:jwt");
  assert.equal(config.token_url, "https://sts.googleapis.com/v1/token");
  assert.equal(config.audience, COMPLETO.GCP_AUDIENCE);
  assert.equal(
    config.service_account_impersonation_url,
    "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/" +
      `${COMPLETO.GCP_SERVICE_ACCOUNT_EMAIL}:generateAccessToken`,
  );
});

test("la configuracion no lleva ninguna clave privada", () => {
  const texto = JSON.stringify(configuracionFederada(COMPLETO));
  assert.equal(texto.includes("private_key"), false);
  assert.equal(texto.includes("BEGIN PRIVATE KEY"), false);
});

test("la credencial devuelve el testigo de acceso y su vida en segundos", async () => {
  const ahora = 1_000_000_000_000;
  const credencial = adaptarCredencial(
    () => ({
      getAccessToken: async () => ({ token: "testigo-de-acceso" }),
      credentials: { expiry_date: ahora + 3_600_000 },
    }),
    () => ahora,
  );

  assert.deepEqual(await credencial.getAccessToken(), {
    access_token: "testigo-de-acceso",
    expires_in: 3600,
  });
});

test("el cliente se construye una sola vez aunque se pida el testigo varias veces", async () => {
  let construcciones = 0;
  const credencial = adaptarCredencial(() => {
    construcciones += 1;
    return {
      getAccessToken: async () => ({ token: "testigo" }),
      credentials: { expiry_date: Date.now() + 60_000 },
    };
  });

  await credencial.getAccessToken();
  await credencial.getAccessToken();
  assert.equal(construcciones, 1);
});

test("un canje sin testigo falla en vez de devolver una credencial vacia", async () => {
  const credencial = adaptarCredencial(() => ({
    getAccessToken: async () => ({ token: null }),
    credentials: { expiry_date: Date.now() + 60_000 },
  }));

  await assert.rejects(() => credencial.getAccessToken(), /no devolvi/i);
});

test("un testigo sin caducidad falla en vez de inventarse una vida", async () => {
  const credencial = adaptarCredencial(() => ({
    getAccessToken: async () => ({ token: "testigo" }),
    credentials: {},
  }));

  await assert.rejects(() => credencial.getAccessToken(), /caducidad/i);
});

test("una caducidad ya pasada da cero, nunca un numero negativo", async () => {
  const ahora = 1_000_000_000_000;
  const credencial = adaptarCredencial(
    () => ({
      getAccessToken: async () => ({ token: "testigo" }),
      credentials: { expiry_date: ahora - 5_000 },
    }),
    () => ahora,
  );

  const { expires_in } = await credencial.getAccessToken();
  assert.equal(expires_in, 0);
});
```

- [ ] **Paso 2: Ejecutar y verlas fallar**

```powershell
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/identidad-credencial.test.ts
```

Esperado: FALLA con «`configuracionFederada` is not exported» o equivalente.

- [ ] **Paso 3: Implementar lo mínimo**

Añadir a `app/identidad/credencial.ts`:

```ts
export type ConfiguracionFederada = {
  type: "external_account";
  audience: string;
  subject_token_type: "urn:ietf:params:oauth:token-type:jwt";
  token_url: "https://sts.googleapis.com/v1/token";
  service_account_impersonation_url: string;
};

/**
 * Lo que se le pasa a `ExternalAccountClient.fromJSON`, sin el proveedor del testigo,
 * que es lo único impuro y vive en `credencialFederada.server.ts`.
 *
 * `audience` sale tal cual de la variable de entorno, con `https://`, porque es la
 * audiencia predeterminada del proveedor y tiene que coincidir con la que se le pide
 * a Vercel. Ver la trampa documentada en el diseño, sección 8.1.
 */
export function configuracionFederada(
  env: Record<string, string | undefined>,
): ConfiguracionFederada {
  if (elegirModo(env) !== "federada") {
    throw new Error("configuracionFederada solo se usa cuando el modo es federada.");
  }

  return {
    type: "external_account",
    audience: env.GCP_AUDIENCE as string,
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    token_url: "https://sts.googleapis.com/v1/token",
    service_account_impersonation_url:
      "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/" +
      `${env.GCP_SERVICE_ACCOUNT_EMAIL}:generateAccessToken`,
  };
}

export type ClienteFederado = {
  getAccessToken(): Promise<{ token?: string | null }>;
  credentials: { expiry_date?: number | null };
};

/**
 * La forma que `initializeApp` espera. No se importa de `firebase-admin` a propósito:
 * la frontera del proyecto reserva ese import para `firebase.server.ts`, y esto es
 * todo lo que el SDK necesita.
 */
export type CredencialDeFirebase = {
  getAccessToken(): Promise<{ access_token: string; expires_in: number }>;
};

export function adaptarCredencial(
  crearCliente: () => ClienteFederado,
  ahora: () => number = Date.now,
): CredencialDeFirebase {
  let cliente: ClienteFederado | null = null;

  return {
    async getAccessToken() {
      cliente ??= crearCliente();

      const { token } = await cliente.getAccessToken();
      if (!token) {
        throw new Error("El intercambio federado no devolvió ningún testigo de acceso.");
      }

      const caducidad = cliente.credentials.expiry_date;
      if (typeof caducidad !== "number") {
        throw new Error(
          "El intercambio federado no devolvió caducidad del testigo de acceso; sin ella no " +
            "se puede saber cuánto vale.",
        );
      }

      return {
        access_token: token,
        expires_in: Math.max(0, Math.floor((caducidad - ahora()) / 1000)),
      };
    },
  };
}
```

- [ ] **Paso 4: Ejecutar y verlas pasar**

```powershell
npm run test:datos
```

Esperado: PASA, con las 7 pruebas nuevas.

- [ ] **Paso 5: Comprobar tipos**

```powershell
npm run typecheck
```

Esperado: sin errores.

- [ ] **Paso 6: Commit**

```bash
git add app/identidad/credencial.ts tests/identidad-credencial.test.ts
git commit -m "feat(identidad): configurar el cliente federado y adaptarlo a Credential"
```

---

## Tarea 3: El cableado real y las fronteras nuevas

**Archivos:**
- Crear: `app/identidad/credencialFederada.server.ts`
- Modificar: `app/identidad/firebase.server.ts`
- Modificar: `tests/identidad-frontera.test.ts`
- Modificar: `package.json` (dependencias directas)

**Interfaces:**
- Consume: `configuracionFederada`, `adaptarCredencial`, `elegirModo` de las tareas 1 y 2.
- Produce: `credencialFederada(): CredencialDeFirebase`, que `firebase.server.ts` usa.

- [ ] **Paso 1: Escribir las pruebas de frontera que fallan**

Añadir a `tests/identidad-frontera.test.ts`:

```ts
/**
 * Las bibliotecas de la federación entran por un solo archivo, igual que
 * `firebase-admin` entra por `firebase.server.ts` y el controlador de Neon por
 * `app/lib/datos`. Cuando la dependencia tiene una sola puerta, cambiarla o
 * simularla es un trabajo acotado.
 */
test("dentro de app/, solo credencialFederada.server.ts importa las bibliotecas de federacion", () => {
  const infractores = archivosDe(join(RAIZ, "app"))
    .filter((ruta) => {
      const fuente = readFileSync(ruta, "utf8");
      return /from "google-auth-library|from "@vercel\/oidc/.test(fuente);
    })
    .map(aPosix)
    .filter((ruta) => ruta !== "app/identidad/credencialFederada.server.ts");

  assert.deepEqual(
    infractores,
    [],
    `Solo app/identidad/credencialFederada.server.ts puede importarlas. Además lo hacen:\n${infractores.join("\n")}`,
  );
});

test("el modulo puro de la credencial no menciona firebase-admin", () => {
  const fuente = readFileSync(join(RAIZ, "app", "identidad", "credencial.ts"), "utf8");
  assert.equal(
    /firebase-admin/.test(fuente),
    false,
    "credencial.ts declara la forma de Credential por su cuenta; importarla rompería la frontera.",
  );
});

test("firebase.server.ts no tiene salida hacia ADC cuando esta en Vercel", () => {
  const fuente = readFileSync(join(RAIZ, "app", "identidad", "firebase.server.ts"), "utf8");
  assert.match(fuente, /elegirModo/, "La elección tiene que venir del módulo puro y probado.");
  assert.equal(
    /VERCEL[\s\S]{0,200}applicationDefault/.test(fuente),
    false,
    "En Vercel no puede haber ninguna caída hacia applicationDefault().",
  );
});

test("las bibliotecas de federacion son dependencias directas, no transitivas", () => {
  const paquete = JSON.parse(readFileSync(join(RAIZ, "package.json"), "utf8"));
  assert.ok(
    paquete.dependencies["google-auth-library"],
    "google-auth-library se importa explícitamente: no puede depender de que la traiga firebase-admin.",
  );
  assert.ok(
    paquete.dependencies["@vercel/oidc"],
    "@vercel/oidc se importa explícitamente: no puede depender de que la traiga @vercel/blob.",
  );
});
```

- [ ] **Paso 2: Ejecutar y verlas fallar**

```powershell
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/identidad-frontera.test.ts
```

Esperado: FALLAN las cuatro nuevas. Las antiguas siguen pasando.

- [ ] **Paso 3: Instalar las dos dependencias como directas**

```powershell
npm install google-auth-library @vercel/oidc
```

Comprobar después que `package.json` las lista en `dependencies` y que
`package-lock.json` no ha cambiado de versión mayor para nada más.

- [ ] **Paso 4: Crear `app/identidad/credencialFederada.server.ts`**

```ts
import "server-only";

import { getVercelOidcToken } from "@vercel/oidc";
import { ExternalAccountClient } from "google-auth-library";

import {
  adaptarCredencial,
  configuracionFederada,
  type ClienteFederado,
  type CredencialDeFirebase,
} from "./credencial";

/**
 * La única puerta a `google-auth-library` y `@vercel/oidc` de todo el proyecto.
 * `tests/identidad-frontera.test.ts` lo vigila.
 *
 * Aquí solo hay cableado: la configuración y la adaptación a la interfaz que espera
 * `firebase-admin` viven en `credencial.ts`, que sí se puede probar sin red.
 *
 * **`getVercelOidcToken()` no se puede llamar en el nivel de módulo.** Dentro de una
 * función de Vercel el testigo llega en la cabecera `x-vercel-oidc-token` de la
 * petición, no en una variable de entorno. Por eso se pasa como función y se invoca
 * cuando toca renovar, siempre dentro de una petición.
 */
function crearCliente(): ClienteFederado {
  const configuracion = configuracionFederada(process.env);
  const audiencia = configuracion.audience;

  const cliente = ExternalAccountClient.fromJSON({
    ...configuracion,
    subject_token_supplier: {
      getSubjectToken: () => getVercelOidcToken({ audience: audiencia }),
    },
  });

  if (!cliente) {
    throw new Error(
      "google-auth-library no reconoció la configuración de cuenta externa. " +
        "Revisa GCP_AUDIENCE y GCP_SERVICE_ACCOUNT_EMAIL.",
    );
  }

  return cliente as unknown as ClienteFederado;
}

let credencial: CredencialDeFirebase | null = null;

export function credencialFederada(): CredencialDeFirebase {
  credencial ??= adaptarCredencial(crearCliente);
  return credencial;
}
```

- [ ] **Paso 5: Enganchar en `app/identidad/firebase.server.ts`**

Sustituir el `obtenerCredencial()` actual por:

```ts
function obtenerCredencial(): Credential {
  if (!credencial) {
    credencial =
      elegirModo(process.env) === "federada"
        ? (credencialFederada() as Credential)
        : applicationDefault();
  }
  return credencial;
}
```

y añadir arriba:

```ts
import { elegirModo } from "./credencial";
import { credencialFederada } from "./credencialFederada.server";
```

Actualizar además el comentario de cabecera del archivo: donde hoy dice que producción
«todavía no está resuelto», ahora describe la federación y remite al diseño. **No se
deja tachada la redacción antigua: se reescribe.**

- [ ] **Paso 6: Ejecutar las pruebas y verlas pasar**

```powershell
npm run test:datos
```

```powershell
npm run typecheck
```

```powershell
npm run lint
```

Esperado: todo en verde.

- [ ] **Paso 7: Romper la frontera a propósito**

Añadir temporalmente `import { ExternalAccountClient } from "google-auth-library";` a
`app/identidad/sesion.ts` y volver a ejecutar `npm run test:datos`. Esperado: FALLA la
prueba de frontera nombrando ese archivo. Deshacer.

- [ ] **Paso 8: Comprobar que el sitio sigue construyéndose**

```powershell
npm run build
```

Esperado: correcto. La inicialización es perezosa, así que no hace falta ninguna
credencial para construir.

- [ ] **Paso 9: Commit**

```bash
git add app/identidad/credencialFederada.server.ts app/identidad/firebase.server.ts tests/identidad-frontera.test.ts package.json package-lock.json
git commit -m "feat(identidad): autenticar firebase-admin en Vercel con identidad federada"
```

---

## Tarea 4: El comprobador de la federación

**Archivos:**
- Crear: `scripts/comprobar-federacion.mjs`
- Modificar: `package.json` (guion `identidad:federacion`)
- Modificar: `tests/identidad-frontera.test.ts`

**Interfaces:**
- Consume: nada del código de `app/`; el script se conecta por su cuenta, igual que
  `comprobar-adc.mjs`, porque no puede importar un módulo con `server-only`.
- Produce: `npm run identidad:federacion`.

- [ ] **Paso 1: Escribir la prueba estructural que falla**

Añadir a `tests/identidad-frontera.test.ts`, y **añadir también
`"scripts/comprobar-federacion.mjs"` a la lista `SCRIPTS_QUE_PUEDEN`**:

```ts
test("el comprobador de federacion no imprime ningun testigo", () => {
  const ruta = join(RAIZ, "scripts", "comprobar-federacion.mjs");
  assert.equal(existsSync(ruta), true, "Falta el script de comprobación de la federación.");

  const fuente = readFileSync(ruta, "utf8");

  for (const prohibido of [
    /console\.log\([^)]*\btoken\b/i,
    /console\.log\([^)]*access_token/i,
    /console\.log\([^)]*getSubjectToken/i,
  ]) {
    assert.equal(
      prohibido.test(fuente),
      false,
      `El script no puede imprimir testigos: ${prohibido}`,
    );
  }

  assert.match(fuente, /expires_in|segundos/, "Sí debe informar de cuánto vive la credencial.");
});
```

- [ ] **Paso 2: Ejecutar y verla fallar**

```powershell
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/identidad-frontera.test.ts
```

Esperado: FALLA porque el script no existe, y además falla la lista de scripts
autorizados por no coincidir con la realidad.

- [ ] **Paso 3: Crear `scripts/comprobar-federacion.mjs`**

```js
// Comprueba que la identidad federada de Vercel sirve de verdad contra Firebase.
//
// Hace el camino entero: coge el testigo OIDC de Vercel, lo canjea en el Security
// Token Service de Google, suplanta la cuenta de servicio y hace una llamada real de
// solo lectura a Firebase Authentication.
//
// NO imprime el testigo OIDC, ni el federado, ni el de acceso. Solo dice si sirven.
//
// Uso, con el entorno de Vercel descargado a un archivo aparte:
//   vercel env pull .env.vercel.local
//   npm run identidad:federacion

import { getVercelOidcToken } from "@vercel/oidc";
import { ExternalAccountClient } from "google-auth-library";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const VARIABLES = [
  "FIREBASE_PROJECT_ID",
  "GCP_PROJECT_NUMBER",
  "GCP_WORKLOAD_IDENTITY_POOL_ID",
  "GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID",
  "GCP_SERVICE_ACCOUNT_EMAIL",
  "GCP_AUDIENCE",
];

const faltan = VARIABLES.filter((v) => !process.env[v]);
if (faltan.length > 0) {
  console.error(`Faltan variables: ${faltan.join(", ")}`);
  console.error("Descarga el entorno de Vercel a un archivo aparte, NUNCA sobre .env.local:");
  console.error("  vercel env pull .env.vercel.local");
  console.error("y cárgalo con --env-file=.env.vercel.local");
  process.exit(1);
}

const projectId = process.env.FIREBASE_PROJECT_ID;
const audiencia = process.env.GCP_AUDIENCE;
const cuenta = process.env.GCP_SERVICE_ACCOUNT_EMAIL;

console.log(`Proyecto:       ${projectId}`);
console.log(`Cuenta:         ${cuenta}`);
console.log("Credenciales:   identidad federada (Workload Identity Federation)");
console.log("");

// 1. ¿Hay testigo OIDC de Vercel?
try {
  const testigo = await getVercelOidcToken({ audience: audiencia });
  // Nunca se imprime el testigo. Solo que existe y de qué entorno dice venir.
  const carga = JSON.parse(Buffer.from(testigo.split(".")[1], "base64url").toString());
  console.log(`  ok     hay testigo OIDC de Vercel (entorno: ${carga.environment})`);
} catch (error) {
  console.error("  FALLA  no hay testigo OIDC de Vercel.");
  console.error("  Enlaza el proyecto y descarga el entorno:");
  console.error("    vercel link");
  console.error("    vercel env pull .env.vercel.local");
  console.error(`  Motivo: ${error?.message ?? "desconocido"}`);
  process.exit(1);
}

// 2. ¿Google lo acepta y entrega una credencial temporal?
const cliente = ExternalAccountClient.fromJSON({
  type: "external_account",
  audience: audiencia,
  subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
  token_url: "https://sts.googleapis.com/v1/token",
  service_account_impersonation_url:
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${cuenta}:generateAccessToken`,
  subject_token_supplier: {
    getSubjectToken: () => getVercelOidcToken({ audience: audiencia }),
  },
});

try {
  await cliente.getAccessToken();
  const segundos = Math.max(0, Math.floor((cliente.credentials.expiry_date - Date.now()) / 1000));
  console.log(`  ok     Google acepta la identidad federada (la credencial vale ${segundos} s)`);
} catch (error) {
  console.error("  FALLA  Google rechaza la identidad federada.");
  console.error("  Repasa la condición de atributos del proveedor y el enlace del principal.");
  console.error(`  Motivo: ${error?.message ?? "desconocido"}`);
  process.exit(1);
}

// 3. ¿Firebase Authentication acepta esa credencial? Tener testigo no es tener permiso.
const credencial = {
  getAccessToken: async () => {
    await cliente.getAccessToken();
    return {
      access_token: cliente.credentials.access_token,
      expires_in: Math.max(0, Math.floor((cliente.credentials.expiry_date - Date.now()) / 1000)),
    };
  },
};

try {
  const app = initializeApp({ credential: credencial, projectId });
  await getAuth(app).listUsers(1);
  console.log("  ok     Firebase Authentication acepta la credencial temporal");
} catch (error) {
  console.error("  FALLA  Firebase Authentication no acepta la credencial.");
  console.error("  Suele ser el rol: la cuenta necesita firebaseauth.users.get.");
  console.error(`  Codigo: ${error?.errorInfo?.code ?? error?.code ?? "sin codigo"}`);
  process.exit(1);
}

console.log("");
console.log("Todo correcto: la identidad federada funciona de extremo a extremo.");
```

- [ ] **Paso 4: Añadir el guion a `package.json`**

Junto a los demás `identidad:*`:

```json
"identidad:federacion": "node --env-file-if-exists=.env.vercel.local --env-file-if-exists=.env.local ./scripts/comprobar-federacion.mjs",
```

El orden importa: `.env.vercel.local` primero para que aporte `VERCEL_OIDC_TOKEN`, y
`.env.local` después para `FIREBASE_PROJECT_ID`.

- [ ] **Paso 5: Ejecutar las pruebas y verlas pasar**

```powershell
npm run test:datos
```

Esperado: PASA. El script todavía no se ejecuta contra Google: eso es la tarea 6.

- [ ] **Paso 6: Añadir `.env.vercel.local` a la lista de archivos ignorados**

Comprobar que `.gitignore` ya lo cubre con `.env*`. Si es así, no se toca nada; si no,
añadirlo.

```powershell
git check-ignore -v .env.vercel.local
```

Esperado: que `.gitignore` línea 37 (`.env*`) lo ignore.

- [ ] **Paso 7: Commit**

```bash
git add scripts/comprobar-federacion.mjs tests/identidad-frontera.test.ts package.json
git commit -m "feat(identidad): comprobador de la federacion que no imprime testigos"
```

---

## Tarea 5: Crear los recursos en Google Cloud — manual, guiado, uno a uno

**Punto de revisión con el dueño antes de empezar.** Aquí se crean recursos externos
por primera vez. Cada paso se le da suelto y se espera a que confirme.

Valores confirmados en la tarea 0, ya no son incógnitas:

| Dato | Valor |
|---|---|
| `[NUM]` — número del proyecto de Google | `629521051305` |
| `[EQUIPO]` — slug del equipo de Vercel | `joseangel-s-projects` |
| `[PROYECTO]` — nombre del proyecto de Vercel | `econoluz-gt` |
| Emisor | `https://oidc.vercel.com/joseangel-s-projects` |
| `[TEAM_ID]`, `[PROJECT_ID]` | se leen en el paso 2 |

La CLI de Vercel **no está instalada**, así que todos los comandos `vercel …` de este plan
se ejecutan como `npx vercel …`.

- [ ] **Paso 0: Activar las tres API que faltan**

La tarea 0 comprobó que `identitytoolkit.googleapis.com` está activa pero estas tres no, y
sin ellas la federación no se puede ni crear ni usar:

```powershell
gcloud services enable iam.googleapis.com sts.googleapis.com iamcredentials.googleapis.com --project=econoluz-dev-d30ab
```

`gcloud` no está en el `PATH`; la ruta completa es
`C:\Users\PC\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd`.

Activar una API no crea ningún recurso ni tiene coste por sí misma, pero **modifica el
proyecto de Google Cloud**, así que va dentro de esta tarea y no antes.

- [ ] **Paso 1: Fijar el modo de emisor en Vercel**

Panel de Vercel → proyecto → *Settings* → *Security* → **Secure backend access with
OIDC federation** → **Team** → *Save*.

Anotar el emisor resultante: `https://oidc.vercel.com/[EQUIPO]`.

- [ ] **Paso 2: Obtener el identificador del equipo y del proyecto**

Hacen falta `owner_id` (`team_…`) y `project_id` (`prj_…`), que son los estables. La
forma más simple de leerlos es descargar un testigo de desarrollo y mirar sus
afirmaciones —**sin imprimir el testigo**—:

```powershell
npx vercel link
```

```powershell
npx vercel env pull .env.vercel.local
```

```powershell
node -e "const t=require('fs').readFileSync('.env.vercel.local','utf8').match(/VERCEL_OIDC_TOKEN=\""?([^\""\r\n]+)/)[1];const c=JSON.parse(Buffer.from(t.split('.')[1],'base64url'));console.log({iss:c.iss,aud:c.aud,sub:c.sub,owner_id:c.owner_id,project_id:c.project_id,environment:c.environment})"
```

Imprime solo las afirmaciones, nunca el testigo. Anotar `owner_id`, `project_id`, `sub`
y `iss`.

> **Aviso:** `vercel env pull` **sobrescribe `.env.local` si no se le da un nombre de
> archivo**. Aquí siempre se le da `.env.vercel.local`. Perder `.env.local` significaría
> perder `DATABASE_URL`, `ADMIN_SESSION_SECRET` y `AUTH_EVENT_IP_PEPPER`.

- [ ] **Paso 3: Crear el pool**

```powershell
gcloud iam workload-identity-pools create vercel --project=econoluz-dev-d30ab --location=global --display-name="Vercel"
```

- [ ] **Paso 4: Crear el proveedor OIDC, con la condición ampliada temporalmente**

La condición incluye `development` **solo para la prueba positiva de la tarea 6**. Se
estrecha en la tarea 7.

```powershell
gcloud iam workload-identity-pools providers create-oidc vercel --project=econoluz-dev-d30ab --location=global --workload-identity-pool=vercel --display-name="Vercel" --issuer-uri="https://oidc.vercel.com/[EQUIPO]" --attribute-mapping="google.subject=assertion.sub,attribute.owner_id=assertion.owner_id,attribute.project_id=assertion.project_id,attribute.environment=assertion.environment" --attribute-condition="assertion.owner_id == '[TEAM_ID]' && assertion.project_id == '[PROJECT_ID]' && (assertion.environment == 'preview' || assertion.environment == 'development')"
```

**No se pasa `--allowed-audiences`**: se usa la audiencia predeterminada del proveedor,
por la decisión del diseño §4.2.

- [ ] **Paso 5: Anotar el número del proyecto y la audiencia**

```powershell
gcloud projects describe econoluz-dev-d30ab --format="value(projectNumber)"
```

La audiencia es:

```
https://iam.googleapis.com/projects/[NUM]/locations/global/workloadIdentityPools/vercel/providers/vercel
```

- [ ] **Paso 6: Crear el rol personalizado con los cuatro permisos**

```powershell
gcloud iam roles create econoluzIdentidadServidor --project=econoluz-dev-d30ab --title="ECONOLUZ identidad servidor" --description="Lo minimo que el servidor necesita de Firebase Authentication" --permissions=firebaseauth.users.get,firebaseauth.users.createSession,firebaseauth.users.update,firebaseauth.users.delete --stage=GA
```

- [ ] **Paso 7: Crear la cuenta de servicio**

```powershell
gcloud iam service-accounts create econoluz-identidad-preview --project=econoluz-dev-d30ab --display-name="ECONOLUZ identidad (Preview)"
```

- [ ] **Paso 8: Darle el rol personalizado sobre el proyecto**

```powershell
gcloud projects add-iam-policy-binding econoluz-dev-d30ab --member="serviceAccount:econoluz-identidad-preview@econoluz-dev-d30ab.iam.gserviceaccount.com" --role="projects/econoluz-dev-d30ab/roles/econoluzIdentidadServidor"
```

- [ ] **Paso 9: Permitir que la identidad federada la suplante**

Dos enlaces mientras dure la prueba positiva: el de `preview`, que es el definitivo, y
el de `development`, que se retira en la tarea 7.

```powershell
gcloud iam service-accounts add-iam-policy-binding econoluz-identidad-preview@econoluz-dev-d30ab.iam.gserviceaccount.com --project=econoluz-dev-d30ab --role="roles/iam.workloadIdentityUser" --member="principal://iam.googleapis.com/projects/[NUM]/locations/global/workloadIdentityPools/vercel/subject/owner:[EQUIPO]:project:[PROYECTO]:environment:preview"
```

```powershell
gcloud iam service-accounts add-iam-policy-binding econoluz-identidad-preview@econoluz-dev-d30ab.iam.gserviceaccount.com --project=econoluz-dev-d30ab --role="roles/iam.workloadIdentityUser" --member="principal://iam.googleapis.com/projects/[NUM]/locations/global/workloadIdentityPools/vercel/subject/owner:[EQUIPO]:project:[PROYECTO]:environment:development"
```

- [ ] **Paso 10: Dejarlo escrito**

Actualizar `docs/OPERACION-FIREBASE.md`: la sección 3, que hoy dice «sin resolver y
bloquea el despliegue», se **reescribe** describiendo lo que se ha creado, con los
valores reales, y la tabla de la sección 4 se pone al día. No se deja tachado el texto
antiguo.

```bash
git add docs/OPERACION-FIREBASE.md
git commit -m "docs(identidad): documentar los recursos de la identidad federada"
```

---

## Tarea 6: Prueba positiva — Google acepta el testigo y Firebase la credencial

**Archivos:** ninguno. Es ejecución y registro del resultado.

- [ ] **Paso 1: Refrescar el entorno de Vercel**

```powershell
npx vercel env pull .env.vercel.local
```

- [ ] **Paso 2: Añadir las variables de GCP al archivo local de prueba**

A mano, en `.env.vercel.local`, con los valores anotados en la tarea 5. Ninguna es
secreta:

```
GCP_PROJECT_NUMBER=[NUM]
GCP_WORKLOAD_IDENTITY_POOL_ID=vercel
GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID=vercel
GCP_SERVICE_ACCOUNT_EMAIL=econoluz-identidad-preview@econoluz-dev-d30ab.iam.gserviceaccount.com
GCP_AUDIENCE=https://iam.googleapis.com/projects/[NUM]/locations/global/workloadIdentityPools/vercel/providers/vercel
```

- [ ] **Paso 3: Ejecutar la comprobación**

```powershell
npm run identidad:federacion
```

Esperado, las tres líneas:

```
  ok     hay testigo OIDC de Vercel (entorno: development)
  ok     Google acepta la identidad federada (la credencial vale NNNN s)
  ok     Firebase Authentication acepta la credencial temporal
```

- [ ] **Paso 4: Anotar los segundos observados**

Ese número es **la medida real** de cuánto dura el testigo de acceso de Google en esta
configuración. Se escribe en el diseño, sección 16, punto 3, sustituyendo el «sin
comprobar» por el valor y la fecha.

- [ ] **Paso 5: Si falla el segundo punto**

No pasar al siguiente sin entenderlo. Por orden de probabilidad:

1. La condición de atributos no coincide con las afirmaciones reales. Compararlas con
   lo que imprimió el paso 2 de la tarea 5.
2. La forma del campo `audience`: probar `//iam.googleapis.com/projects/…` en la
   configuración del cliente, dejando `https://…` en `getVercelOidcToken`. Es la
   trampa documentada en el diseño §8.1.
3. El emisor no coincide porque el modo no quedó en *Team*.

- [ ] **Paso 6: Si falla el tercer punto**

Es el rol, no las credenciales. Comprobar que el enlace del paso 8 de la tarea 5 se
aplicó, y si el error nombra un permiso que no está entre los cuatro, añadirlo **al rol
personalizado y solo ese**, y anotarlo en el diseño §6.3.

- [ ] **Paso 7: Commit de la anotación**

```bash
git add docs/superpowers/specs/2026-09-01-vercel-firebase-wif-design.md
git commit -m "docs(identidad): anotar la vida real de la credencial temporal"
```

---

## Tarea 7: Prueba negativa — un entorno no autorizado es rechazado

**Archivos:** ninguno hasta el último paso.

Esta es la tarea que convierte «debería funcionar» en «se ha comprobado».

- [ ] **Paso 1: Estrechar la condición del proveedor a su forma definitiva**

```powershell
gcloud iam workload-identity-pools providers update-oidc vercel --project=econoluz-dev-d30ab --location=global --workload-identity-pool=vercel --attribute-condition="assertion.owner_id == '[TEAM_ID]' && assertion.project_id == '[PROJECT_ID]' && assertion.environment == 'preview'"
```

- [ ] **Paso 2: Retirar el enlace de `development`**

```powershell
gcloud iam service-accounts remove-iam-policy-binding econoluz-identidad-preview@econoluz-dev-d30ab.iam.gserviceaccount.com --project=econoluz-dev-d30ab --role="roles/iam.workloadIdentityUser" --member="principal://iam.googleapis.com/projects/[NUM]/locations/global/workloadIdentityPools/vercel/subject/owner:[EQUIPO]:project:[PROYECTO]:environment:development"
```

- [ ] **Paso 3: Repetir exactamente la comprobación de la tarea 6, sin cambiar nada más**

```powershell
npm run identidad:federacion
```

Esperado: el primer punto sigue en `ok` —el testigo de Vercel existe— y **el segundo
FALLA**. Ese fallo es el resultado correcto: demuestra que un entorno no autorizado no
obtiene credenciales.

- [ ] **Paso 4: Registrar el mensaje literal del rechazo**

Copiar el mensaje de error tal cual y añadirlo al diseño, sección 10.3, como evidencia.
No parafrasearlo: el texto literal es lo que servirá para reconocer este fallo en el
futuro.

- [ ] **Paso 5: Comprobar que la propagación no engaña**

Los cambios de IAM pueden tardar en propagarse. Si el paso 3 sigue dando `ok`, esperar
y repetir antes de dar por buena la condición. **Un `ok` aquí no es un éxito: es una
prueba que todavía no ha demostrado nada.**

- [ ] **Paso 6: Commit**

```bash
git add docs/superpowers/specs/2026-09-01-vercel-firebase-wif-design.md
git commit -m "docs(identidad): registrar el rechazo de un entorno no autorizado"
```

---

## Tarea 8: Prueba en un despliegue Preview real

**Punto de revisión con el dueño antes de empezar.** Es el único despliegue del plan.

**Archivos:**
- Crear: `app/api/identidad/diagnostico/route.ts` (**temporal**)

- [ ] **Paso 1: Revisar las variables de Preview en Vercel — lo primero, y no opcional**

Panel de Vercel → proyecto → *Settings* → *Environment Variables*, filtrando por
**Preview**. Comprobar que `DATABASE_URL` de Preview apunta a la rama
`identidad-clientes-dev` de Neon **y no a la principal**. Si apunta a la principal, se
corrige antes de seguir.

Es el riesgo con peor consecuencia de todo el plan: un despliegue Preview del código de
identidad escribiendo en la base de datos de producción.

- [ ] **Paso 2: Añadir las seis variables al ámbito Preview**

Las cinco de GCP de la tarea 6, más `FIREBASE_PROJECT_ID=econoluz-dev-d30ab`. Ninguna
como *Secret*: no lo son. También `NEXT_PUBLIC_FIREBASE_*` y `AUTH_EVENT_IP_PEPPER` si
no estuvieran ya en Preview.

- [ ] **Paso 3: Comprobar la protección de los despliegues Preview**

*Settings* → *Deployment Protection*. Anotar si el Preview queda accesible en internet.
Si lo queda, el dueño decide si sigue adelante: la ruta de diagnóstico no expone datos
de ningún cliente, pero `/cuenta` sí funcionaría contra el proyecto de desarrollo.

- [ ] **Paso 4: Crear la ruta de diagnóstico temporal**

`app/api/identidad/diagnostico/route.ts`:

```ts
import { comprobarCredenciales } from "@/app/identidad/firebase.server";

// `firebase-admin` necesita runtime de Node: no funciona en edge.
export const runtime = "nodejs";

/**
 * RUTA TEMPORAL. Existe solo para demostrar, desde dentro de una función de Vercel,
 * que el testigo OIDC llega por la cabecera y que Firebase acepta la credencial que
 * se obtiene con él.
 *
 * **Se retira en la tarea 9**, y a partir de ahí `tests/identidad-frontera.test.ts`
 * impide que vuelva a aparecer.
 *
 * No devuelve ningún testigo ni ningún dato de ningún cliente.
 */
export async function GET() {
  try {
    const { projectId, segundosDeVida } = await comprobarCredenciales();
    return Response.json({ ok: true, projectId, segundosDeVida });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "desconocido" },
      { status: 500 },
    );
  }
}
```

- [ ] **Paso 5: Comprobar que compila y que las pruebas siguen verdes**

```powershell
npm run typecheck
```

```powershell
npm run lint
```

```powershell
npm run test:datos
```

- [ ] **Paso 6: Commit antes de desplegar**

```bash
git add app/api/identidad/diagnostico/route.ts
git commit -m "test(identidad): ruta temporal para comprobar la federacion en Preview"
```

- [ ] **Paso 7: Desplegar a Preview desde la CLI, sin push**

```powershell
npx vercel deploy
```

Sin `--prod`. Esto **no** hace push, **no** toca GitHub y **no** toca `main`. Anotar la
URL que devuelve.

- [ ] **Paso 8: Consultar la ruta de diagnóstico**

```powershell
curl.exe https://[URL-DEL-PREVIEW]/api/identidad/diagnostico
```

Esperado:

```json
{"ok":true,"projectId":"econoluz-dev-d30ab","segundosDeVida":NNNN}
```

Un `ok: true` con `segundosDeVida` positivo demuestra las dos cosas que faltaban: que
el testigo llegó por la cabecera dentro de una función, y que Firebase Authentication
aceptó la credencial obtenida con él.

- [ ] **Paso 9: Si devuelve `ok: false`**

Leer el mensaje. Si nombra variables que faltan, es el paso 2. Si es un rechazo del
STS, la condición no admite `preview`: repasar la tarea 7, paso 1. Los registros de la
función están en el panel de Vercel, en el despliegue.

- [ ] **Paso 10: Mirar los registros de auditoría de Google**

Consola de Google Cloud → *Logging* → *Explorador de registros*, filtrando por el
proyecto y buscando las llamadas al Security Token Service y a
`iamcredentials.googleapis.com`. Anotar en el diseño, sección 12.3, qué tipo de
registro las recoge y si hizo falta activar algo, sustituyendo el «sin comprobar».

- [ ] **Paso 11: Commit de las anotaciones**

```bash
git add docs/superpowers/specs/2026-09-01-vercel-firebase-wif-design.md docs/OPERACION-FIREBASE.md
git commit -m "docs(identidad): registrar la prueba en Preview y la auditoria"
```

---

## Tarea 9: Retirar la ruta temporal y cerrar

**Archivos:**
- Borrar: `app/api/identidad/diagnostico/route.ts`
- Modificar: `tests/identidad-frontera.test.ts`
- Modificar: `.env.example`, `docs/OPERACION-FIREBASE.md`, `CLAUDE.md`,
  `docs/CONTINUAR-PANEL.md`

- [ ] **Paso 1: Escribir el guardián que falla mientras la ruta exista**

Añadir a `tests/identidad-frontera.test.ts`:

```ts
/**
 * La ruta de diagnóstico fue temporal y ya cumplió. Esta prueba existe para que no
 * vuelva por descuido: expone el estado de las credenciales del servidor sin ninguna
 * autenticación, y en Preview eso fue aceptable solo porque era una prueba acotada.
 */
test("no queda ninguna ruta de diagnostico de identidad", () => {
  assert.equal(
    existsSync(join(RAIZ, "app", "api", "identidad", "diagnostico", "route.ts")),
    false,
    "La ruta de diagnóstico era temporal y tiene que estar retirada.",
  );
});
```

- [ ] **Paso 2: Ejecutar y verla fallar**

```powershell
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/identidad-frontera.test.ts
```

Esperado: FALLA, porque la ruta todavía está.

- [ ] **Paso 3: Borrar la ruta**

**Pedir confirmación al dueño antes de borrar**, por la regla del proyecto de no borrar
archivos sin preguntar.

```bash
git rm app/api/identidad/diagnostico/route.ts
```

Si la carpeta `app/api/identidad/` queda vacía, desaparece sola con git.

- [ ] **Paso 4: Ejecutar y verla pasar**

```powershell
npm run test:datos
```

- [ ] **Paso 5: Batería completa**

```powershell
npm run test:datos
```

```powershell
npm run test:admin
```

```powershell
npm run test:proveedores
```

```powershell
npm run typecheck
```

```powershell
npm run lint
```

```powershell
npm run build
```

```powershell
npx playwright test
```

Esperado: todo verde. **Si algo falla, se arregla antes de cerrar; no se anota como
«ya fallaba».** La única excepción conocida y documentada es
`tests/catalog-quote.spec.ts:891`, que falla desde antes de la migración.

- [ ] **Paso 6: `npm run identidad:adc` sigue funcionando**

```powershell
npm run identidad:adc
```

Esperado: correcto. Demuestra que el desarrollo local no se ha roto, que era una
condición del encargo.

- [ ] **Paso 7: Poner los `.md` al día**

- `.env.example`: la sección de Firebase deja de decir que la identidad federada «no
  existe y bloquea el despliegue». Se **reescribe** describiendo las seis variables de
  Preview y aclarando que ninguna es secreta. No se deja el texto viejo tachado.
- `docs/OPERACION-FIREBASE.md`: secciones 3, 4 y 5 al día, con los valores reales y el
  procedimiento de revocación y rollback del diseño §11.2 y §12.2.
- `CLAUDE.md`: §4 (identidad de clientes ya no está bloqueada por la federación; lo que
  queda es crear el proyecto de Firebase de producción) y §11 (estado del subproyecto 2).
- `docs/CONTINUAR-PANEL.md`: sección «0.1 Qué hacer ahora» con el estado real y el
  siguiente paso.

- [ ] **Paso 8: Commit final**

```bash
git add -A
git commit -m "chore(identidad): retirar la ruta de diagnostico y cerrar la federacion"
```

- [ ] **Paso 9: Informe al dueño, sin dar por hecho lo que no se ha hecho**

Resumir: qué se creó en Google Cloud, qué se probó y con qué resultado literal, qué
sigue sin comprobar, y **qué falta para poder desplegar producción** —que es crear el
proyecto de Firebase de producción y repetir las tareas 5 a 8 contra él—.

**No hay push, ni fusión, ni despliegue de producción.** La rama y el worktree se
conservan.

---

## Criterios de aceptación

| # | Criterio | Cómo se comprueba |
|---|---|---|
| 1 | Local sigue usando ADC | `npm run identidad:adc` correcto, tarea 9 paso 6 |
| 2 | Vercel usa identidad federada | Tarea 8 paso 8: `ok: true` desde el Preview |
| 3 | No hay ruta de respaldo por claves privadas | Pruebas de la tarea 1 y de frontera de la tarea 3 |
| 4 | Un entorno no autorizado es rechazado | Tarea 7 paso 3: rechazo real, con el mensaje registrado |
| 5 | Firebase Authentication acepta las credenciales temporales | Tarea 6 paso 3 y tarea 8 paso 8 |
| 6 | Permisos mínimos, sin Owner, Editor ni `firebaseauth.admin` | Rol personalizado de cuatro permisos, tarea 5 paso 6 |
| 7 | Preview y Production separados | Condición de atributos sobre `environment`, tarea 7 paso 1 |
| 8 | Ninguna variable secreta añadida | Las seis son identificadores públicos, tarea 8 paso 2 |
| 9 | Ruta de diagnóstico retirada | Prueba guardiana de la tarea 9 |
| 10 | Producción intacta | Ningún paso toca `main`, GitHub, la Neon principal ni un despliegue de producción |
