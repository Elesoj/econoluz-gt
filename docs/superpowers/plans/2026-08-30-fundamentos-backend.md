# Fundamentos del backend y capa de acceso a datos — plan de implementación

> **Para quien ejecute esto con agentes:** SUB-SKILL OBLIGATORIA: usa
> `superpowers:subagent-driven-development` (recomendado) o
> `superpowers:executing-plans` para ejecutar tarea por tarea. Los pasos llevan
> casilla (`- [ ]`) para poder marcarlos.

**Objetivo:** sustituir los once accesos sueltos a Neon por una única capa con
transacciones, errores tipados y registro, y levantar la frontera de privacidad a nivel de
base de datos, **sin que cambie nada de lo que ve el visitante**.

**Arquitectura:** una carpeta `app/lib/datos/` es la única que importa el controlador de
Neon. Ofrece dos caminos: lecturas por HTTP y escrituras dentro de transacción sobre una
conexión agrupada. Encima de eso, una tabla de proyección pública ya saneada
(`public_products`) que escribe el camino privilegiado, y un rol de PostgreSQL que solo
puede leer esa tabla. El proyecto ya usa inyección de dependencias en sus módulos de
datos —los módulos puros reciben un ejecutor `(text, params) => filas` y el `.server.ts`
conecta— y este plan **generaliza ese patrón, no lo sustituye**.

**Stack:** Next.js 16.3.1 (App Router), TypeScript strict, `@neondatabase/serverless`,
`node:test` para unidad, Playwright para navegador, Postgres 18 en Neon.

**Especificación:** `docs/superpowers/specs/2026-08-30-fundamentos-backend-design.md`
(el diseño global que la sostiene es
`docs/superpowers/specs/2026-08-30-backend-relacional-v2-design.md`). El plan argumenta
desde la especificación: quien ejecute debe leer las dos.

## Estado de ejecución (31/08/2026)

> **Este bloque manda sobre las casillas sin marcar que quedan en el plan original.**
> Las casillas describen el procedimiento previsto; no se fueron editando durante las
> rondas de implementación y revisión. No repetir una tarea que esta tabla marque como
> terminada.

| Bloque | Estado | Evidencia principal |
|---|---|---|
| Plan y worktree | ✅ Terminado | Plan en `19d0106`; rama `feat/fundamentos-backend` |
| Tareas 1–6 | ✅ Terminadas y revisadas | Capa de datos, 16 commits sobre la base del plan |
| Cobertura de `escribir()` | ✅ Terminada | `cdc1864` y corrección antifuga `ed5e7f7` |
| Tarea 7, implementación local | ✅ Terminada y revisada | `e2a7220` y ronda de arreglo `ebd8011` |
| Tarea 7, integración en Neon | ✅ Terminada y verificada | Rama aislada `fundamentos-backend-dev`: migración 005, dos reproyecciones 313/0, privacidad e idempotencia |
| Tarea 8 | ✅ Terminada y verificada | Migración 006 y prueba real del rol en `fundamentos-backend-dev` |
| Tareas 9–12 | ⏳ No empezadas | El siguiente paso es la tarea 9: `app_settings` y `audit_log` |

La revisión de la tarea 7 cambió detalles respecto a los ejemplos originales de abajo:
la conversión a centavos vive en `app/lib/dinero.ts`, el `upsert` compartido en
`app/data/proyeccionPublicaSql.ts`, los dos escritores usan esa misma sentencia, los
campos JSON llevan conversión explícita a `jsonb` y `price_cents` es `bigint`. **El código
del commit `ebd8011` es la referencia ejecutable; no copiar sobre él los fragmentos
anteriores del plan.**

Verificación local tras la revisión: `test:datos` 39/39, `test:admin` 196/196,
`typecheck` y `lint` limpios, `build` correcto. Playwright completó las 67 pruebas sin
fallos de prueba, pero su proceso quedó colgado durante el apagado del servidor en
Windows y se interrumpió después de la prueba 67.

Integración de la tarea 7 verificada el 31/08/2026 exclusivamente en la rama aislada de
Neon `fundamentos-backend-dev`: `005_proyeccion_publica.sql` aplicada; dos ejecuciones de
`catalogo:reproyectar` con **313 proyectados y 0 retirados**; huella del contenido estable
sin contar `updated_at`; 313 filas y los mismos 25 precios, con una huella idéntica a la
conexión principal; ninguna columna prohibida; y **0 coincidencias** al buscar en la
proyección real los 408 identificadores del proveedor.
La batería fresca dio `test:datos` 39/39, `test:admin` 196/196, `test:proveedores` 3/3,
`typecheck` y `lint` limpios, y `catalogo:auditar` 313/408/0.

Integración de la tarea 8 verificada el 31/08/2026 exclusivamente en
`fundamentos-backend-dev`: `006_rol_publico.sql` aplicada; rol sin atributos elevados ni
membresías; `USAGE` sin `CREATE` sobre el esquema; `SELECT` sobre `public_products`; y 0
tablas adicionales y 0 secuencias accesibles. La prueba con la credencial pública confirmó
`current_user = econoluz_publico`, denegó las ocho tablas protegidas existentes, confirmó
que `app_settings` y `audit_log` todavía no existen, leyó la proyección y no encontró
objetos sin clasificar. La contraseña y `DATABASE_URL_PUBLIC` solo existen fuera del
repositorio.

### Próximo punto de control

Empezar la tarea 9: crear `app_settings` y `audit_log`, manteniendo
`modelo_catalogo = legacy` y sin activar ningún camino nuevo. Aplicar y probar primero en
`fundamentos-backend-dev`, nunca en producción. No se ha hecho push, fusión ni despliegue.

## Restricciones globales

Aplican a **todas** las tareas. Están copiadas de la especificación y de `CLAUDE.md`.

- **Español de España** en comentarios de código nuevos, mensajes de commit y resúmenes.
  No se traducen nombres de variables, funciones, rutas ni salidas de terminal.
- **Ninguna dependencia nueva.** `firebase-admin` y `jose` pertenecen al subproyecto 2.
  Este subproyecto se hace con lo que ya hay en `package.json`.
- **No se toca nada de stock, carrito, pagos ni FEL.** `products.stock`,
  `app/tienda/disponibilidad.server.ts` y el aviso del carrito siguen intactos: su
  retirada es el subproyecto 11 y necesita autorización expresa del dueño.
- **No se retira ni se desactiva la frontera de privacidad actual.**
  `app/data/publicProduct.ts` y `app/data/publicProductPrivacy.ts` siguen activos y sin
  modificar. La proyección los **usa**.
- **`relational_v2` no se activa.** La bandera de `app_settings` queda en `legacy` al
  terminar. Activarla es del subproyecto 3 y requiere autorización expresa.
- **La regla de importación del controlador alcanza solo a `app/**`.** `scripts/**` queda
  excluido a propósito: `scripts/migrate.mjs` crea el esquema del que depende la capa.
- **El dinero se guarda en centavos enteros.** Nunca `numeric` ni coma flotante en las
  columnas nuevas.
- **Un precio publicable es un número finito y mayor que cero.** Cero significaría regalar
  el producto; `NaN` e `Infinity` envenenarían el total del carrito. La regla ya está en
  `main` desde el commit `2b32049`, en `app/data/publicProduct.ts` y en
  `app/tienda/lineas.ts`, y **la proyección pública no puede tener una regla distinta**.
  Un producto publicado con precio válido está a la venta; sin precio, la tarjeta dice
  «Consultar precio». No hay ninguna otra casilla que autorice la venta.
- **Ninguna contraseña ni cadena de conexión** aparece en migraciones, en el repositorio
  ni en registros.
- **La consola del dueño es Windows PowerShell 5.1 y no entiende `&&`.** Los comandos que
  se le den van en líneas separadas.
- **Playwright levanta su propio servidor en el puerto 3100.** Si hay un `npm run dev`
  abierto, las pruebas de navegador fallan: hay que cerrarlo antes.
- **Las pruebas de integración van contra una rama de Neon aislada**, nunca contra
  producción.
- **No se despliega ni se hace push sin confirmación expresa del dueño.**

---

## Estructura de archivos

**Se crean:**

| Archivo | Responsabilidad |
|---|---|
| `app/lib/datos/errores.ts` | Los cuatro errores tipados y la traducción desde errores de Postgres |
| `app/lib/datos/registro.ts` | Registro estructurado con identificador de petición, sin datos personales |
| `app/lib/datos/conexion.ts` | Las dos conexiones y las dos cadenas, creadas de forma perezosa |
| `app/lib/datos/consulta.ts` | Consultar por HTTP con tiempo máximo y tipado |
| `app/lib/datos/transaccion.ts` | `enTransaccion`, con `BEGIN`/`COMMIT`/`ROLLBACK` y liberación garantizada |
| `app/lib/datos/index.ts` | La superficie pública de la capa; es lo único que importa el resto de `app/**` |
| `app/data/proyeccionPublica.ts` | Traducción pura producto interno → fila de `public_products` y vuelta |
| `app/data/proyeccionPublica.server.ts` | Escritura y lectura de la proyección contra Neon |
| `app/lib/ajustes.ts` | Lectura pura de `app_settings` con validación de valores |
| `app/lib/ajustes.server.ts` | Lectura con caché breve contra Neon |
| `db/005_proyeccion_publica.sql` | La tabla de proyección |
| `db/006_rol_publico.sql` | El rol y sus permisos, sin contraseñas |
| `db/007_app_settings.sql` | La configuración persistente |
| `db/008_audit_log.sql` | La auditoría de cambios administrativos |
| `scripts/reproyectar-catalogo.mjs` | Reconstrucción total e idempotente de la proyección |
| `scripts/verificar-permisos.mjs` | La prueba de permisos contra la base real |
| `docs/OPERACION-ROL-PUBLICO.md` | Creación, contraseña, rotación, configuración y verificación |
| `tests/datos-errores.test.ts` | Errores tipados |
| `tests/datos-consulta.test.ts` | Consulta y tiempo máximo |
| `tests/datos-transaccion.test.ts` | Transacciones y gestión del pool |
| `tests/datos-frontera-controlador.test.ts` | La regla estructural sobre `app/**` |
| `tests/datos-migrador.test.ts` | Verificación del comportamiento transaccional del migrador |
| `tests/proyeccion-publica.test.ts` | Paridad de los 313 y privacidad de la proyección |
| `tests/ajustes.test.ts` | Lectura y validación de la bandera |

**Se modifican:** los once accesos actuales (tarea 10), `.env.example`, `package.json`
(sólo `scripts`), `CLAUDE.md` y `docs/CONTINUAR-PANEL.md` (tarea 12).

---

## Tarea 1: Errores tipados

**Archivos:**
- Crear: `app/lib/datos/errores.ts`
- Prueba: `tests/datos-errores.test.ts`

**Interfaces:**
- Consume: nada.
- Produce: `ErrorDeDatos` (clase, con `causa: CausaDeError` y `cause`),
  `type CausaDeError = "no-encontrado" | "conflicto" | "permiso-denegado" | "indisponible"`,
  `traducirErrorDePostgres(error: unknown): ErrorDeDatos`.

- [ ] **Paso 1: escribir la prueba que falla**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { ErrorDeDatos, traducirErrorDePostgres } from "../app/lib/datos/errores";

test("una violación de unicidad es un conflicto, no un fallo de servicio", () => {
  const error = traducirErrorDePostgres(Object.assign(new Error("duplicate key"), { code: "23505" }));
  assert.equal(error.causa, "conflicto");
});

test("un permiso denegado se distingue de todo lo demás", () => {
  const error = traducirErrorDePostgres(Object.assign(new Error("permission denied"), { code: "42501" }));
  assert.equal(error.causa, "permiso-denegado");
});

test("lo que no se reconoce es indisponibilidad, que es lo prudente", () => {
  assert.equal(traducirErrorDePostgres(new Error("socket colgado")).causa, "indisponible");
});

test("el error original se conserva para el registro del servidor", () => {
  const original = new Error("detalle interno");
  assert.equal(traducirErrorDePostgres(original).cause, original);
});

test("el mensaje no arrastra el texto de Postgres", () => {
  const error = traducirErrorDePostgres(new Error("relation \"users\" does not exist"));
  assert.ok(!error.message.includes("users"));
});
```

- [ ] **Paso 2: ejecutar la prueba y comprobar que falla**

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/datos-errores.test.ts
```

Esperado: falla con «Cannot find module '../app/lib/datos/errores'».

- [ ] **Paso 3: escribir la implementación mínima**

```ts
/**
 * Los errores de la capa de datos.
 *
 * Distinguir «no encontrado» de «la base no responde» importa: lo primero es una
 * respuesta legítima y lo segundo es un fallo del servicio. El panel ya hacía esa
 * distinción a mano; aquí se generaliza.
 *
 * El mensaje nunca arrastra el texto original de Postgres, que lleva nombres de
 * tablas y columnas. El detalle completo viaja en `cause`, que solo se registra
 * en el servidor y nunca sale en una respuesta.
 */

export type CausaDeError =
  | "no-encontrado"
  | "conflicto"
  | "permiso-denegado"
  | "indisponible";

const MENSAJES: Record<CausaDeError, string> = {
  "no-encontrado": "No se encontró el dato solicitado.",
  conflicto: "El dato ya existe o entra en conflicto con otro.",
  "permiso-denegado": "La conexión no tiene permiso para esa operación.",
  indisponible: "La base de datos no está disponible.",
};

export class ErrorDeDatos extends Error {
  readonly causa: CausaDeError;

  constructor(causa: CausaDeError, cause?: unknown) {
    super(MENSAJES[causa], { cause });
    this.name = "ErrorDeDatos";
    this.causa = causa;
  }
}

// Códigos SQLSTATE. 23505 es unicidad, 23503 clave ajena, 42501 permiso denegado.
const CAUSA_POR_CODIGO: Record<string, CausaDeError> = {
  "23505": "conflicto",
  "23503": "conflicto",
  "42501": "permiso-denegado",
};

export function traducirErrorDePostgres(error: unknown): ErrorDeDatos {
  if (error instanceof ErrorDeDatos) {
    return error;
  }

  const codigo =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "";

  return new ErrorDeDatos(CAUSA_POR_CODIGO[codigo] ?? "indisponible", error);
}
```

- [ ] **Paso 4: ejecutar la prueba y comprobar que pasa**

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/datos-errores.test.ts
```

Esperado: 5 pruebas en verde.

- [ ] **Paso 5: confirmar**

```bash
git add app/lib/datos/errores.ts tests/datos-errores.test.ts
git commit -m "feat(datos): errores tipados de la capa de acceso"
```

---

## Tarea 2: Registro estructurado

**Archivos:**
- Crear: `app/lib/datos/registro.ts`
- Prueba: `tests/datos-registro.test.ts`

**Interfaces:**
- Consume: `CausaDeError` de la tarea 1.
- Produce: `nuevoIdPeticion(): string`,
  `registrar(nivel: "info" | "error", suceso: string, datos?: Record<string, string | number | boolean>): void`.

- [ ] **Paso 1: escribir la prueba que falla**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { formatearRegistro, nuevoIdPeticion } from "../app/lib/datos/registro";

test("cada identificador de petición es distinto y legible", () => {
  const a = nuevoIdPeticion();
  const b = nuevoIdPeticion();
  assert.notEqual(a, b);
  assert.match(a, /^[0-9a-f]{16}$/);
});

test("el registro es una línea JSON con nivel, suceso y momento", () => {
  const linea = JSON.parse(formatearRegistro("info", "consulta", { ms: 12 }, new Date(0)));
  assert.equal(linea.nivel, "info");
  assert.equal(linea.suceso, "consulta");
  assert.equal(linea.ms, 12);
  assert.equal(linea.momento, "1970-01-01T00:00:00.000Z");
});

test("los datos que no son escalares no se registran", () => {
  const linea = JSON.parse(
    formatearRegistro("error", "consulta", { ok: true, correo: { a: 1 } as never }, new Date(0)),
  );
  assert.equal(linea.ok, true);
  assert.equal("correo" in linea, false);
});
```

- [ ] **Paso 2: ejecutar la prueba y comprobar que falla**

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/datos-registro.test.ts
```

Esperado: falla con «Cannot find module '../app/lib/datos/registro'».

- [ ] **Paso 3: escribir la implementación mínima**

```ts
import { randomBytes } from "node:crypto";

/**
 * Registro estructurado de la capa de datos.
 *
 * Una línea JSON por suceso, para poder buscarla después por `idPeticion`. Solo
 * se aceptan valores escalares: así ningún objeto con datos personales acaba en
 * el log por descuido al pasarlo entero.
 */

export type NivelDeRegistro = "info" | "error";

export function nuevoIdPeticion() {
  return randomBytes(8).toString("hex");
}

export function formatearRegistro(
  nivel: NivelDeRegistro,
  suceso: string,
  datos: Record<string, string | number | boolean> = {},
  momento = new Date(),
) {
  const escalares = Object.fromEntries(
    Object.entries(datos).filter(([, valor]) =>
      ["string", "number", "boolean"].includes(typeof valor),
    ),
  );

  return JSON.stringify({ nivel, suceso, momento: momento.toISOString(), ...escalares });
}

export function registrar(
  nivel: NivelDeRegistro,
  suceso: string,
  datos?: Record<string, string | number | boolean>,
) {
  const linea = formatearRegistro(nivel, suceso, datos);
  if (nivel === "error") {
    console.error(linea);
  } else {
    console.log(linea);
  }
}
```

- [ ] **Paso 4: ejecutar la prueba y comprobar que pasa**

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/datos-registro.test.ts
```

Esperado: 3 pruebas en verde.

- [ ] **Paso 5: confirmar**

```bash
git add app/lib/datos/registro.ts tests/datos-registro.test.ts
git commit -m "feat(datos): registro estructurado con identificador de peticion"
```

---

## Tarea 3: Conexión y consulta por HTTP

**Archivos:**
- Crear: `app/lib/datos/conexion.ts`, `app/lib/datos/consulta.ts`
- Prueba: `tests/datos-consulta.test.ts`

**Interfaces:**
- Consume: `ErrorDeDatos`, `traducirErrorDePostgres` (tarea 1); `registrar` (tarea 2).
- Produce:
  - `type Ejecutor = (texto: string, parametros?: readonly unknown[]) => Promise<Record<string, unknown>[]>`
  - `consultar<T>(ejecutor: Ejecutor, texto: string, parametros?: readonly unknown[], opciones?: { msMaximo?: number }): Promise<T[]>`
  - `ejecutorDeLectura(): Ejecutor` — usa `DATABASE_URL`
  - `ejecutorPublico(): Ejecutor | null` — usa `DATABASE_URL_PUBLIC`; `null` si falta
  - `hayConexionPublica(): boolean`

- [ ] **Paso 1: escribir la prueba que falla**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { consultar } from "../app/lib/datos/consulta";
import { ErrorDeDatos } from "../app/lib/datos/errores";

test("devuelve las filas tal cual las da el ejecutor", async () => {
  const filas = await consultar(async () => [{ n: 1 }], "select 1");
  assert.deepEqual(filas, [{ n: 1 }]);
});

test("pasa los parámetros sin tocarlos", async () => {
  let recibidos: readonly unknown[] | undefined;
  await consultar(
    async (_texto, parametros) => {
      recibidos = parametros;
      return [];
    },
    "select $1",
    ["ECO-ELE-0001"],
  );
  assert.deepEqual(recibidos, ["ECO-ELE-0001"]);
});

test("un fallo del ejecutor sale como ErrorDeDatos, no como error crudo", async () => {
  await assert.rejects(
    () => consultar(async () => { throw new Error("socket colgado"); }, "select 1"),
    (error: unknown) => error instanceof ErrorDeDatos && error.causa === "indisponible",
  );
});

test("una consulta que se pasa del tiempo máximo se corta", async () => {
  await assert.rejects(
    () =>
      consultar(
        () => new Promise((resolver) => setTimeout(() => resolver([]), 50)),
        "select pg_sleep(1)",
        [],
        { msMaximo: 10 },
      ),
    (error: unknown) => error instanceof ErrorDeDatos && error.causa === "indisponible",
  );
});
```

- [ ] **Paso 2: ejecutar la prueba y comprobar que falla**

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/datos-consulta.test.ts
```

Esperado: falla con «Cannot find module '../app/lib/datos/consulta'».

- [ ] **Paso 3: escribir la implementación mínima**

`app/lib/datos/consulta.ts`:

```ts
import { traducirErrorDePostgres, ErrorDeDatos } from "./errores";

/**
 * Un ejecutor es cualquier cosa capaz de correr SQL con parámetros. Es el
 * mismo contrato que ya usaban `panelStats` y el repositorio del panel, y es lo
 * que permite probar sin base de datos.
 */
export type Ejecutor = (
  texto: string,
  parametros?: readonly unknown[],
) => Promise<Record<string, unknown>[]>;

/** Diez segundos. Ninguna consulta legítima de este sitio tarda más. */
const MS_MAXIMO_POR_DEFECTO = 10_000;

export async function consultar<T>(
  ejecutor: Ejecutor,
  texto: string,
  parametros: readonly unknown[] = [],
  opciones: { msMaximo?: number } = {},
): Promise<T[]> {
  const msMaximo = opciones.msMaximo ?? MS_MAXIMO_POR_DEFECTO;
  let temporizador: NodeJS.Timeout | undefined;

  const limite = new Promise<never>((_, rechazar) => {
    temporizador = setTimeout(
      () => rechazar(new ErrorDeDatos("indisponible")),
      msMaximo,
    );
  });

  try {
    const filas = await Promise.race([ejecutor(texto, parametros), limite]);
    return filas as T[];
  } catch (error) {
    throw traducirErrorDePostgres(error);
  } finally {
    clearTimeout(temporizador);
  }
}
```

`app/lib/datos/conexion.ts`:

```ts
import "server-only";

import { neon } from "@neondatabase/serverless";
import type { Ejecutor } from "./consulta";

/**
 * Las conexiones se crean de forma perezosa, nunca al importar el módulo: sin
 * `DATABASE_URL` en local el sitio tiene que arrancar igual, como ya hacían el
 * catálogo y `/api/leads`.
 *
 * Hay dos cadenas y no una. `DATABASE_URL` es la de la aplicación y puede
 * escribir. `DATABASE_URL_PUBLIC` es la del rol de lectura pública, que solo
 * ve la proyección `public_products`.
 */

const desdeCadena = (cadena: string): Ejecutor => {
  const sql = neon(cadena);
  return (texto, parametros = []) =>
    sql.query(texto, [...parametros]) as Promise<Record<string, unknown>[]>;
};

export function ejecutorDeLectura(): Ejecutor {
  const cadena = process.env.DATABASE_URL;
  if (!cadena) {
    throw new Error("Falta DATABASE_URL.");
  }
  return desdeCadena(cadena);
}

export function hayConexionPublica() {
  return Boolean(process.env.DATABASE_URL_PUBLIC);
}

export function ejecutorPublico(): Ejecutor | null {
  const cadena = process.env.DATABASE_URL_PUBLIC;
  return cadena ? desdeCadena(cadena) : null;
}
```

- [ ] **Paso 4: ejecutar la prueba y comprobar que pasa**

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/datos-consulta.test.ts
```

Esperado: 4 pruebas en verde.

- [ ] **Paso 5: confirmar**

```bash
git add app/lib/datos/conexion.ts app/lib/datos/consulta.ts tests/datos-consulta.test.ts
git commit -m "feat(datos): conexion perezosa y consulta con tiempo maximo"
```

---

## Tarea 4: Transacciones interactivas

**Archivos:**
- Crear: `app/lib/datos/transaccion.ts`
- Prueba: `tests/datos-transaccion.test.ts`

**Interfaces:**
- Consume: `Ejecutor` (tarea 3), `traducirErrorDePostgres` (tarea 1).
- Produce:
  - `type ClienteDeTransaccion = { query: (texto: string, parametros?: readonly unknown[]) => Promise<{ rows: Record<string, unknown>[] }>; release: () => void }`
  - `type PoolMinimo = { connect: () => Promise<ClienteDeTransaccion> }`
  - `enTransaccion<T>(pool: PoolMinimo, trabajo: (ejecutar: Ejecutor) => Promise<T>, opciones?: { msMaximo?: number }): Promise<T>`

**Nota para quien lo ejecute:** este módulo **no** crea el pool. Lo recibe. El pool real
vive en `index.ts` (tarea 5) y se conserva entre transacciones: **no se abre ni se cierra
en cada una**, porque su razón de existir es reutilizar conexiones inactivas.

- [ ] **Paso 1: escribir la prueba que falla**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { enTransaccion } from "../app/lib/datos/transaccion";
import { ErrorDeDatos } from "../app/lib/datos/errores";

/** Pool de mentira que apunta todo lo que se le pide. */
function poolDePrueba(alConsultar?: (texto: string) => void) {
  const estado = { prestados: 0, liberados: 0, sentencias: [] as string[] };
  const pool = {
    async connect() {
      estado.prestados += 1;
      return {
        async query(texto: string) {
          estado.sentencias.push(texto);
          alConsultar?.(texto);
          return { rows: [] };
        },
        release() {
          estado.liberados += 1;
        },
      };
    },
  };
  return { pool, estado };
}

test("una transacción correcta abre, trabaja y confirma", async () => {
  const { pool, estado } = poolDePrueba();
  const resultado = await enTransaccion(pool, async (ejecutar) => {
    await ejecutar("insert into t values (1)");
    return "listo";
  });
  assert.equal(resultado, "listo");
  assert.deepEqual(estado.sentencias.filter((s) => s === "begin" || s === "commit"), [
    "begin",
    "commit",
  ]);
});

test("si el trabajo falla se deshace y no se confirma", async () => {
  const { pool, estado } = poolDePrueba();
  await assert.rejects(
    () => enTransaccion(pool, async () => { throw new Error("algo se rompió"); }),
    (error: unknown) => error instanceof ErrorDeDatos,
  );
  assert.ok(estado.sentencias.includes("rollback"));
  assert.ok(!estado.sentencias.includes("commit"));
});

test("el cliente se libera siempre, también cuando falla", async () => {
  const { pool, estado } = poolDePrueba();
  await assert.rejects(() => enTransaccion(pool, async () => { throw new Error("x"); }));
  assert.equal(estado.prestados, 1);
  assert.equal(estado.liberados, 1);
});

test("tras una transacción fallida se puede hacer otra correcta", async () => {
  const { pool, estado } = poolDePrueba();
  await assert.rejects(() => enTransaccion(pool, async () => { throw new Error("x"); }));
  const resultado = await enTransaccion(pool, async () => 42);
  assert.equal(resultado, 42);
  assert.equal(estado.prestados, estado.liberados);
});

test("fija un tiempo máximo dentro de la transacción", async () => {
  const { pool, estado } = poolDePrueba();
  await enTransaccion(pool, async () => null, { msMaximo: 3000 });
  assert.ok(estado.sentencias.some((s) => s.includes("set local statement_timeout")));
});
```

- [ ] **Paso 2: ejecutar la prueba y comprobar que falla**

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/datos-transaccion.test.ts
```

Esperado: falla con «Cannot find module '../app/lib/datos/transaccion'».

- [ ] **Paso 3: escribir la implementación mínima**

```ts
import type { Ejecutor } from "./consulta";
import { traducirErrorDePostgres } from "./errores";

/**
 * Transacciones interactivas: leer, decidir y escribir según lo leído, todo
 * dentro de la misma transacción.
 *
 * El controlador HTTP de Neon no puede hacer esto, así que hace falta la
 * conexión agrupada por WebSocket y `runtime = "nodejs"` en la ruta o acción
 * que la use.
 *
 * El cliente se devuelve al pool en el `finally` pase lo que pase: una conexión
 * que no se devuelve es la forma habitual de agotar el pool en producción sin
 * entender por qué. El pool en cambio NO se cierra aquí: se conserva para poder
 * reutilizar conexiones inactivas, que es justo para lo que existe.
 */

export type ClienteDeTransaccion = {
  query: (
    texto: string,
    parametros?: readonly unknown[],
  ) => Promise<{ rows: Record<string, unknown>[] }>;
  release: () => void;
};

export type PoolMinimo = { connect: () => Promise<ClienteDeTransaccion> };

const MS_MAXIMO_POR_DEFECTO = 10_000;

export async function enTransaccion<T>(
  pool: PoolMinimo,
  trabajo: (ejecutar: Ejecutor) => Promise<T>,
  opciones: { msMaximo?: number } = {},
): Promise<T> {
  const msMaximo = opciones.msMaximo ?? MS_MAXIMO_POR_DEFECTO;
  const cliente = await pool.connect();

  try {
    await cliente.query("begin");
    // `set local` solo dura hasta el commit: no contamina la conexión que se
    // devuelve al pool para el siguiente uso.
    await cliente.query(`set local statement_timeout = ${Math.trunc(msMaximo)}`);

    const ejecutar: Ejecutor = async (texto, parametros = []) =>
      (await cliente.query(texto, [...parametros])).rows;

    const resultado = await trabajo(ejecutar);
    await cliente.query("commit");
    return resultado;
  } catch (error) {
    // Si el rollback también falla, el error que importa es el primero.
    await cliente.query("rollback").catch(() => undefined);
    throw traducirErrorDePostgres(error);
  } finally {
    cliente.release();
  }
}
```

- [ ] **Paso 4: ejecutar la prueba y comprobar que pasa**

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/datos-transaccion.test.ts
```

Esperado: 5 pruebas en verde.

- [ ] **Paso 5: confirmar**

```bash
git add app/lib/datos/transaccion.ts tests/datos-transaccion.test.ts
git commit -m "feat(datos): transacciones interactivas con liberacion garantizada"
```

---

## Tarea 5: La superficie pública de la capa y la regla de importación

**Archivos:**
- Crear: `app/lib/datos/index.ts`, `tests/datos-frontera-controlador.test.ts`
- Modificar: `package.json` (añadir el script `test:datos`)

**Interfaces:**
- Consume: todo lo anterior.
- Produce: `leer<T>(texto, parametros?, opciones?)`, `leerPublico<T>(...)`,
  `escribir<T>(trabajo, opciones?)`, y la reexportación de `ErrorDeDatos` y `Ejecutor`.

- [ ] **Paso 1: escribir la prueba de frontera que falla**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const RAIZ = join(import.meta.dirname, "..");
const PERMITIDO = join("app", "lib", "datos");

function archivosDe(carpeta: string): string[] {
  return readdirSync(carpeta, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = join(carpeta, entrada.name);
    if (entrada.isDirectory()) return archivosDe(ruta);
    return /\.tsx?$/.test(entrada.name) ? [ruta] : [];
  });
}

test("solo app/lib/datos importa el controlador de Neon", () => {
  const culpables = archivosDe(join(RAIZ, "app"))
    .filter((ruta) => readFileSync(ruta, "utf8").includes("@neondatabase/serverless"))
    .map((ruta) => relative(RAIZ, ruta))
    .filter((ruta) => !ruta.startsWith(PERMITIDO));

  assert.deepEqual(
    culpables,
    [],
    `Estos archivos de app/ importan el controlador por su cuenta:\n${culpables.join("\n")}`,
  );
});

test("la regla no alcanza a scripts/, y eso es a propósito", () => {
  // scripts/migrate.mjs crea el esquema del que depende la capa: se conecta
  // solo, y esta prueba documenta que la exclusión es deliberada.
  const migrador = readFileSync(join(RAIZ, "scripts", "migrate.mjs"), "utf8");
  assert.ok(migrador.includes("@neondatabase/serverless"));
});
```

- [ ] **Paso 2: ejecutar la prueba y comprobar que falla**

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/datos-frontera-controlador.test.ts
```

Esperado: la primera prueba **falla** listando los once archivos actuales. Ese fallo es el
punto de partida de la tarea 10, que los va vaciando uno a uno.

- [ ] **Paso 3: escribir la superficie de la capa**

`app/lib/datos/index.ts`:

```ts
import "server-only";

import { Pool, neonConfig } from "@neondatabase/serverless";
import { ejecutorDeLectura, ejecutorPublico, hayConexionPublica } from "./conexion";
import { consultar, type Ejecutor } from "./consulta";
import { ErrorDeDatos } from "./errores";
import { nuevoIdPeticion, registrar } from "./registro";
import { enTransaccion, type PoolMinimo } from "./transaccion";

export { ErrorDeDatos, type CausaDeError } from "./errores";
export { nuevoIdPeticion, registrar } from "./registro";
export type { Ejecutor } from "./consulta";
export { hayConexionPublica } from "./conexion";

// El controlador habla por WebSocket. Node 22 en adelante trae uno nativo, así
// que no hace falta ninguna dependencia extra, igual que en scripts/migrate.mjs.
neonConfig.webSocketConstructor = globalThis.WebSocket;

let pool: PoolMinimo | null = null;

/** El pool se crea una vez y se conserva: reutilizar conexiones es su función. */
function obtenerPool(): PoolMinimo {
  if (!pool) {
    const cadena = process.env.DATABASE_URL;
    if (!cadena) {
      throw new Error("Falta DATABASE_URL.");
    }
    pool = new Pool({ connectionString: cadena }) as unknown as PoolMinimo;
  }
  return pool;
}

/** Lectura con la conexión de la aplicación. */
export function leer<T>(
  texto: string,
  parametros: readonly unknown[] = [],
  opciones?: { msMaximo?: number },
) {
  return consultar<T>(ejecutorDeLectura(), texto, parametros, opciones);
}

/**
 * Lectura con el rol público. Devuelve `null` cuando no hay cadena pública
 * configurada: quien llama decide qué hacer, y en producción la decisión es
 * usar el respaldo estático, nunca la conexión privilegiada.
 */
export function leerPublico<T>(
  texto: string,
  parametros: readonly unknown[] = [],
  opciones?: { msMaximo?: number },
): Promise<T[]> | null {
  const ejecutor: Ejecutor | null = ejecutorPublico();
  return ejecutor ? consultar<T>(ejecutor, texto, parametros, opciones) : null;
}

/**
 * Escritura dentro de transacción. Exige `runtime = "nodejs"` en quien la use.
 *
 * Es el único punto de la capa que registra: una lectura fallida ya la maneja
 * quien la pidió, pero una escritura que se deshace es un suceso que hay que
 * poder encontrar después en el log por su `idPeticion`.
 */
export async function escribir<T>(
  trabajo: (ejecutar: Ejecutor) => Promise<T>,
  opciones?: { msMaximo?: number },
): Promise<T> {
  const idPeticion = nuevoIdPeticion();
  const comienzo = Date.now();

  try {
    const resultado = await enTransaccion(obtenerPool(), trabajo, opciones);
    registrar("info", "transaccion", { idPeticion, ms: Date.now() - comienzo });
    return resultado;
  } catch (error) {
    registrar("error", "transaccion", {
      idPeticion,
      ms: Date.now() - comienzo,
      // La causa, no el mensaje de Postgres: eso lleva nombres de tablas.
      causa: error instanceof ErrorDeDatos ? error.causa : "indisponible",
    });
    throw error;
  }
}
```

- [ ] **Paso 4: añadir el script de pruebas de la capa**

En `package.json`, dentro de `scripts`:

```json
"test:datos": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/datos-errores.test.ts tests/datos-registro.test.ts tests/datos-consulta.test.ts tests/datos-transaccion.test.ts tests/datos-frontera-controlador.test.ts"
```

- [ ] **Paso 5: comprobar el estado esperado**

```bash
npm run test:datos
```

Esperado: todo en verde **menos** «solo app/lib/datos importa el controlador de Neon», que
sigue listando los once archivos. Es correcto: la tarea 10 lo pone en verde.

- [ ] **Paso 6: confirmar**

```bash
git add app/lib/datos/index.ts tests/datos-frontera-controlador.test.ts package.json
git commit -m "feat(datos): superficie de la capa y prueba de frontera del controlador"
```

---

## Tarea 6: Verificar el comportamiento transaccional del migrador

**Archivos:**
- Crear: `tests/datos-migrador.test.ts`
- Modificar: `scripts/migrate.mjs` **solo si la comprobación revela un hueco real**

**Contexto imprescindible:** `scripts/migrate.mjs` **ya es transaccional**. Aplica cada
archivo entre `begin` y `commit`, hace `rollback` deshaciendo el archivo entero si una
instrucción falla, e inserta la fila de `schema_migrations` dentro de la misma
transacción. Esta tarea **no lo construye: lo verifica y lo cubre con pruebas**, que hoy
no tiene ninguna.

- [ ] **Paso 1: escribir la prueba que falla**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migrador = readFileSync(
  join(import.meta.dirname, "..", "scripts", "migrate.mjs"),
  "utf8",
);

test("cada migración se aplica dentro de una transacción", () => {
  assert.ok(migrador.includes('client.query("begin")'));
  assert.ok(migrador.includes('client.query("commit")'));
  assert.ok(migrador.includes('client.query("rollback")'));
});

test("el registro en schema_migrations va dentro de la misma transacción", () => {
  const cuerpo = migrador.slice(
    migrador.indexOf('client.query("begin")'),
    migrador.indexOf('client.query("commit")'),
  );
  assert.ok(cuerpo.includes("insert into schema_migrations"));
});

test("nunca imprime la cadena de conexión", () => {
  assert.ok(!/console\.log\([^)]*connectionString[^)]*\)/.test(migrador));
});

test("la conexión se cierra pase lo que pase", () => {
  assert.ok(migrador.includes("} finally {"));
  assert.ok(migrador.includes("client.end()"));
});
```

- [ ] **Paso 2: ejecutar la prueba**

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/datos-migrador.test.ts
```

Esperado: **las cuatro pasan a la primera**, porque el comportamiento ya existe. Si alguna
falla, el migrador no era lo que la especificación creía y hay que arreglarlo antes de
seguir.

- [ ] **Paso 3: evaluar si hace falta reforzarlo**

Comprobar si dos ejecuciones simultáneas del migrador pueden competir. Si se confirma que
sí, añadir al principio de la transacción de cada archivo:

```js
await client.query("select pg_advisory_xact_lock(20260830)");
```

**Solo si la comprobación lo confirma.** No añadir el bloqueo «por si acaso»: no se
presenta como funcionalidad nueva porque no lo es.

- [ ] **Paso 4: añadir la prueba al script y ejecutarla**

Añadir `tests/datos-migrador.test.ts` a `test:datos` en `package.json` y ejecutar:

```bash
npm run test:datos
```

- [ ] **Paso 5: confirmar**

```bash
git add tests/datos-migrador.test.ts package.json
git commit -m "test(datos): cubrir el comportamiento transaccional del migrador"
```

---

## Tarea 7: La proyección pública

**Archivos:**
- Crear: `db/005_proyeccion_publica.sql`, `app/data/proyeccionPublica.ts`,
  `app/data/proyeccionPublica.server.ts`, `scripts/reproyectar-catalogo.mjs`,
  `tests/proyeccion-publica.test.ts`
- Modificar: `package.json` (script `catalogo:reproyectar`)

**Interfaces:**
- Consume: `toPublicProduct` de `app/data/publicProduct.ts` (sin modificar),
  `fromProductRow` y `CATALOG_COLUMNS` de `app/data/productRow.ts`, `escribir` y `leer`
  de `app/lib/datos`.
- Produce:
  - `type FilaProyeccion = { id: string; econoluz_reference: string; position: number; public_name: string; public_description: string; image: string; images: string[] | null; product_type: string; application: string; finish: string; label_product_type: string; label_application: string; label_finish: string; technical_specs: Record<string, string | string[]> | null; price_cents: number | null }`
  - `aFilaProyeccion(producto: InternalProduct, precioGtq: number | null, position: number): FilaProyeccion`
  - `desdeFilaProyeccion(fila: FilaProyeccion): PublicProduct`

**La razón de que esto exista** está en la sección 7.2.1 del diseño global: la limpieza de
privacidad usa `supplierBrand`, `labels.brand`, `labels.series`, `series`, `supplierCode`
y `name` **como contexto**, así que una vista sin esas columnas no puede reproducirla. La
solución es adelantar la limpieza de la lectura a la escritura, **usando el mismo código
de hoy**.

- [ ] **Paso 1: escribir la migración**

`db/005_proyeccion_publica.sql`:

```sql
-- Proyección pública del catálogo: tabla derivada y sincronizada, NO fuente de
-- verdad. Su contenido se reconstruye entero desde `products` en cualquier
-- momento con `npm run catalogo:reproyectar`; si se borrara, no se perdería nada.
--
-- No es una MATERIALIZED VIEW: la mantiene la aplicación, no el planificador.
--
-- Existe porque el rol de lectura pública necesita una superficie segura que
-- leer. La limpieza de privacidad necesita los datos del proveedor como
-- contexto, así que se ejecuta al escribir, no al leer, y aquí solo entra el
-- resultado ya saneado.

create table if not exists public_products (
  -- Identificador público: la referencia en minúsculas.
  id                 text        primary key,
  econoluz_reference text        not null unique,
  position           integer     not null,

  public_name        text        not null,
  public_description text        not null default '',
  image              text        not null,
  images             jsonb,

  product_type       text        not null,
  application        text        not null,
  finish             text        not null default '',
  label_product_type text        not null,
  label_application  text        not null,
  label_finish       text        not null default '',

  technical_specs    jsonb,

  -- Centavos enteros, nunca decimales. `null` es «todavía sin precio»: el
  -- producto se enseña pero no se compra, y la tarjeta ofrece consultar.
  -- Cero no es un precio: significaría regalar el producto, así que la
  -- restricción de abajo lo rechaza igual que a los negativos.
  price_cents        integer,

  updated_at         timestamptz not null default now(),

  constraint public_products_price_cents_comprable
    check (price_cents is null or price_cents > 0)
);

create index if not exists public_products_position_idx on public_products (position);
create index if not exists public_products_application_idx on public_products (application);
```

- [ ] **Paso 2: escribir la prueba de paridad y privacidad que falla**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { products } from "../app/data/products";
import { toPublicProduct } from "../app/data/publicProduct";
import { aFilaProyeccion, desdeFilaProyeccion } from "../app/data/proyeccionPublica";

test("los 313 productos proyectados son idénticos a la salida pública de hoy", () => {
  for (const [indice, producto] of products.entries()) {
    const esperado = toPublicProduct(producto);
    const obtenido = desdeFilaProyeccion(aFilaProyeccion(producto, null, indice * 10));
    assert.deepEqual(obtenido, esperado, `difiere en ${producto.econoluzReference}`);
  }
});

test("un precio positivo se conserva exacto en centavos y vuelve igual", () => {
  for (const [quetzales, centavos] of [
    [0.01, 1],
    [125.5, 12550],
    [1250.5, 125050],
    [150, 15000],
  ] as const) {
    const fila = aFilaProyeccion(products[0], quetzales, 10);
    assert.equal(fila.price_cents, centavos);
    assert.equal(desdeFilaProyeccion(fila).priceGtq, quetzales);
  }
});

test("ningún importe no comprable llega a la proyección", () => {
  // Misma regla que `toPublicProduct` y que el motor del carrito desde el
  // commit 2b32049: solo un número finito y mayor que cero es un precio. Cero
  // regalaría el producto; `NaN` e `Infinity` envenenarían el total del carrito.
  for (const invalido of [0, -1, -0.01, Number.NaN, Number.POSITIVE_INFINITY, null]) {
    const fila = aFilaProyeccion(products[0], invalido, 10);
    assert.equal(fila.price_cents, null, `${invalido} no debería proyectarse`);
    assert.equal("priceGtq" in desdeFilaProyeccion(fila), false);
  }
});

test("una fila con centavos inválidos tampoco reconstruye precio", () => {
  // Defensa por si algo escribiera en la tabla saltándose el escritor: la
  // restricción de la base ya lo impide, pero la lectura no se fía.
  for (const invalido of [0, -50, Number.NaN]) {
    const fila = { ...aFilaProyeccion(products[0], 150, 10), price_cents: invalido };
    assert.equal("priceGtq" in desdeFilaProyeccion(fila), false);
  }
});

/**
 * Misma normalización que usa `npm run catalogo:auditar`: tildes fuera,
 * minúsculas y solo letras y dígitos, para que «Magnetrack-Pro» y
 * «magnetrack pro» se comparen igual. El rango \u0300-\u036f son los signos
 * diacríticos combinados que deja `normalize("NFD")`; hay que escribirlo con
 * escapes, no con los caracteres literales, o el patrón se corrompe al copiarlo.
 */
const normalizar = (valor: string) =>
  valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

test("ninguna fila proyectada lleva marca, serie ni código del proveedor", () => {
  const identificadores = new Set<string>();
  for (const producto of products) {
    for (const valor of [
      producto.supplierBrand,
      producto.labels.brand,
      producto.labels.series,
      producto.series,
      producto.supplierCode,
    ]) {
      const normalizado = normalizar(valor);
      if (normalizado.length >= 4) identificadores.add(normalizado);
    }
  }

  for (const [indice, producto] of products.entries()) {
    const texto = normalizar(JSON.stringify(aFilaProyeccion(producto, null, indice * 10)));
    for (const identificador of identificadores) {
      assert.ok(
        !texto.includes(identificador),
        `${producto.econoluzReference} filtra «${identificador}»`,
      );
    }
  }
});
```

- [ ] **Paso 3: ejecutar la prueba y comprobar que falla**

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/proyeccion-publica.test.ts
```

Esperado: falla con «Cannot find module '../app/data/proyeccionPublica'».

- [ ] **Paso 4: escribir la traducción pura**

`app/data/proyeccionPublica.ts`:

```ts
import type { InternalProduct } from "./products";
import { toPublicProduct, type PublicProduct } from "./publicProduct";

/**
 * Traducción entre el producto interno y su fila en `public_products`.
 *
 * La limpieza de privacidad NO se reescribe aquí: se delega en
 * `toPublicProduct`, que es exactamente el mismo código que hoy protege el
 * catálogo. Lo único que cambia es el momento en que se ejecuta, que pasa de la
 * lectura a la escritura. Por eso la fila que sale ya está saneada y el rol
 * público no puede ver un texto sin limpiar: en su lado no existe ninguno.
 */

export type FilaProyeccion = {
  id: string;
  econoluz_reference: string;
  position: number;
  public_name: string;
  public_description: string;
  image: string;
  images: string[] | null;
  product_type: string;
  application: string;
  finish: string;
  label_product_type: string;
  label_application: string;
  label_finish: string;
  technical_specs: Record<string, string | string[]> | null;
  price_cents: number | null;
};

export const aCentavos = (quetzales: number) => Math.round(quetzales * 100);

export function aFilaProyeccion(
  producto: InternalProduct,
  precioGtq: number | null,
  position: number,
): FilaProyeccion {
  // El precio se le entrega a la frontera vigente en lugar de convertirlo
  // aquí: es `toPublicProduct` quien decide si un importe es publicable
  // —número finito y mayor que cero— y la proyección no puede tener una regla
  // distinta, o volvería a abrirse la puerta que se cerró en `2b32049`.
  const publico = toPublicProduct(producto, { priceGtq });

  return {
    id: publico.id,
    econoluz_reference: publico.econoluzReference,
    position,
    public_name: publico.publicName,
    public_description: publico.publicDescription,
    image: publico.image,
    images: publico.images ?? null,
    product_type: publico.productType,
    application: publico.application,
    finish: publico.finish,
    label_product_type: publico.labels.productType,
    label_application: publico.labels.application,
    label_finish: publico.labels.finish,
    technical_specs: publico.technicalSpecs
      ? (publico.technicalSpecs as Record<string, string | string[]>)
      : null,
    // Solo hay centavos si el producto público conservó su precio. Un cero,
    // un negativo, un `NaN` o un `Infinity` no llegan hasta aquí.
    price_cents:
      typeof publico.priceGtq === "number" ? aCentavos(publico.priceGtq) : null,
  };
}

export function desdeFilaProyeccion(fila: FilaProyeccion): PublicProduct {
  const producto: PublicProduct = {
    id: fila.id,
    econoluzReference: fila.econoluz_reference,
    publicName: fila.public_name,
    publicDescription: fila.public_description,
    image: fila.image,
    productType: fila.product_type,
    application: fila.application,
    finish: fila.finish,
    labels: {
      productType: fila.label_product_type,
      application: fila.label_application,
      finish: fila.label_finish,
    },
    technicalSpecs: fila.technical_specs ?? undefined,
  };

  if (fila.images?.length) {
    producto.images = fila.images;
  }

  // Mismo criterio que la frontera pública: solo un importe finito y mayor
  // que cero es un precio. `null`, cero y cualquier resto raro significan
  // «todavía sin precio», y la tarjeta dirá «Consultar precio».
  if (
    typeof fila.price_cents === "number" &&
    Number.isFinite(fila.price_cents) &&
    fila.price_cents > 0
  ) {
    producto.priceGtq = fila.price_cents / 100;
  }

  return producto;
}
```

- [ ] **Paso 5: ejecutar la prueba y comprobar que pasa**

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/proyeccion-publica.test.ts
```

Esperado: 4 pruebas en verde. **Si la primera falla, hay una diferencia real entre la
proyección y la salida actual: no seguir hasta entenderla.**

- [ ] **Paso 6: escribir el escritor contra Neon**

`app/data/proyeccionPublica.server.ts`:

```ts
import "server-only";

import { escribir } from "../lib/datos";
import { fromProductRow, CATALOG_COLUMNS, type CatalogRow } from "./productRow";
import { aFilaProyeccion, type FilaProyeccion } from "./proyeccionPublica";

const COLUMNAS = [
  "id", "econoluz_reference", "position", "public_name", "public_description",
  "image", "images", "product_type", "application", "finish",
  "label_product_type", "label_application", "label_finish",
  "technical_specs", "price_cents",
] as const;

const marcadores = COLUMNAS.map((_, indice) => `$${indice + 1}`).join(", ");
const actualizaciones = COLUMNAS.slice(1)
  .map((columna) => `${columna} = excluded.${columna}`)
  .join(", ");

const valoresDe = (fila: FilaProyeccion) =>
  COLUMNAS.map((columna) => {
    const valor = fila[columna];
    // jsonb necesita texto; el resto va tal cual.
    return columna === "images" || columna === "technical_specs"
      ? valor === null ? null : JSON.stringify(valor)
      : valor;
  });

/** Reescribe la proyección de un producto. Idempotente. */
export async function proyectarProducto(referencia: string) {
  await escribir(async (ejecutar) => {
    const filas = (await ejecutar(
      `select ${CATALOG_COLUMNS.join(", ")}, price_gtq, published
       from products where econoluz_reference = $1`,
      [referencia],
    )) as (CatalogRow & { price_gtq: string | null; published: boolean })[];

    const fila = filas[0];

    // Un producto despublicado no existe para el visitante: se retira de la
    // proyección en vez de quedarse con una versión vieja.
    if (!fila || !fila.published) {
      await ejecutar("delete from public_products where econoluz_reference = $1", [referencia]);
      return;
    }

    const proyectada = aFilaProyeccion(
      fromProductRow(fila),
      fila.price_gtq === null ? null : Number(fila.price_gtq),
      fila.position,
    );

    await ejecutar(
      `insert into public_products (${COLUMNAS.join(", ")}) values (${marcadores})
       on conflict (id) do update set ${actualizaciones}, updated_at = now()`,
      valoresDe(proyectada),
    );
  });
}
```

- [ ] **Paso 7: escribir el comando de reconstrucción total**

`scripts/reproyectar-catalogo.mjs`:

```js
// Reconstruye la proyección pública entera desde `products`. Idempotente:
// ejecutarlo dos veces deja el mismo resultado.
//
// Nunca imprime la cadena de conexión, igual que scripts/migrate.mjs.

import { Client, neonConfig } from "@neondatabase/serverless";
import { fromProductRow, CATALOG_COLUMNS } from "../app/data/productRow.ts";
import { aFilaProyeccion } from "../app/data/proyeccionPublica.ts";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Falta DATABASE_URL. Ponla en frontend/.env.local y repite.");
  process.exit(1);
}

neonConfig.webSocketConstructor = globalThis.WebSocket;
console.log(`Base de datos:  ${new URL(connectionString).host}`);

const client = new Client(connectionString);
await client.connect();

try {
  await client.query("begin");

  const { rows } = await client.query(
    `select ${CATALOG_COLUMNS.join(", ")}, price_gtq, position
     from products where published order by position`,
  );

  for (const fila of rows) {
    const proyectada = aFilaProyeccion(
      fromProductRow(fila),
      fila.price_gtq === null ? null : Number(fila.price_gtq),
      fila.position,
    );

    await client.query(
      `insert into public_products (
         id, econoluz_reference, position, public_name, public_description,
         image, images, product_type, application, finish,
         label_product_type, label_application, label_finish,
         technical_specs, price_cents
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       on conflict (id) do update set
         econoluz_reference = excluded.econoluz_reference,
         position = excluded.position,
         public_name = excluded.public_name,
         public_description = excluded.public_description,
         image = excluded.image,
         images = excluded.images,
         product_type = excluded.product_type,
         application = excluded.application,
         finish = excluded.finish,
         label_product_type = excluded.label_product_type,
         label_application = excluded.label_application,
         label_finish = excluded.label_finish,
         technical_specs = excluded.technical_specs,
         price_cents = excluded.price_cents,
         updated_at = now()`,
      [
        proyectada.id, proyectada.econoluz_reference, proyectada.position,
        proyectada.public_name, proyectada.public_description, proyectada.image,
        proyectada.images === null ? null : JSON.stringify(proyectada.images),
        proyectada.product_type, proyectada.application, proyectada.finish,
        proyectada.label_product_type, proyectada.label_application,
        proyectada.label_finish,
        proyectada.technical_specs === null ? null : JSON.stringify(proyectada.technical_specs),
        proyectada.price_cents,
      ],
    );
  }

  // Lo que ya no está publicado deja de existir para el visitante.
  const retiradas = await client.query(
    `delete from public_products
     where econoluz_reference not in (
       select econoluz_reference from products where published
     )`,
  );

  await client.query("commit");
  console.log(`Proyectados:  ${rows.length}`);
  console.log(`Retirados:    ${retiradas.rowCount}`);
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
```

Añadir a `package.json`:

```json
"catalogo:reproyectar": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --env-file-if-exists=.env.local --import ./scripts/register-ts.mjs ./scripts/reproyectar-catalogo.mjs"
```

- [ ] **Paso 8: aplicar la migración y reproyectar contra la rama de Neon de desarrollo**

```bash
npm run db:migrar
```

```bash
npm run catalogo:reproyectar
```

Esperado: 313 filas proyectadas, 0 retiradas.

- [ ] **Paso 9: confirmar**

```bash
git add db/005_proyeccion_publica.sql app/data/proyeccionPublica.ts app/data/proyeccionPublica.server.ts scripts/reproyectar-catalogo.mjs tests/proyeccion-publica.test.ts package.json
git commit -m "feat(datos): proyeccion publica derivada del catalogo"
```

---

## Tarea 8: El rol público y la prueba de permisos

**Archivos:**
- Crear: `db/006_rol_publico.sql`, `scripts/verificar-permisos.mjs`,
  `docs/OPERACION-ROL-PUBLICO.md`
- Modificar: `package.json` (script `test:permisos`), `.env.example`

- [x] **Paso 1: escribir la migración, sin una sola contraseña**

`db/006_rol_publico.sql`:

```sql
-- Rol de lectura pública. Solo puede leer la proyección `public_products`.
--
-- ESTA MIGRACIÓN NO CONTIENE NINGUNA CONTRASEÑA, y no debe contenerla nunca:
-- la credencial se genera fuera del repositorio y se guarda como secreto en
-- Neon y en Vercel. El procedimiento está en docs/OPERACION-ROL-PUBLICO.md.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'econoluz_publico') then
    create role econoluz_publico nologin;
  end if;
end
$$;

revoke all on all tables in schema public from econoluz_publico;
revoke all on all sequences in schema public from econoluz_publico;
revoke all on schema public from econoluz_publico;

grant usage on schema public to econoluz_publico;
grant select on public_products to econoluz_publico;

-- Que una tabla futura no herede permisos por descuido.
alter default privileges in schema public revoke all on tables from econoluz_publico;
```

- [x] **Paso 2: escribir la prueba de permisos**

`scripts/verificar-permisos.mjs`:

```js
// Comprueba que el rol de lectura pública solo puede leer la proyección.
//
// Se conecta con DATABASE_URL_PUBLIC y falla con código distinto de cero si
// algo no cuadra. Nunca imprime la cadena de conexión.

import { neon } from "@neondatabase/serverless";

const connectionString = process.env.DATABASE_URL_PUBLIC;
if (!connectionString) {
  console.error("Falta DATABASE_URL_PUBLIC. Ver docs/OPERACION-ROL-PUBLICO.md.");
  process.exit(1);
}

const ROL_ESPERADO = "econoluz_publico";
const PERMITIDAS = ["public_products"];
const PROHIBIDAS = [
  "products", "leads", "projects", "project_images",
  "admin_users", "admin_sessions", "admin_login_attempts",
  "schema_migrations", "app_settings", "audit_log",
];

const sql = neon(connectionString);
let fallos = 0;
const mal = (mensaje) => { console.error(`  FALLA  ${mensaje}`); fallos += 1; };
const bien = (mensaje) => console.log(`  ok     ${mensaje}`);

// 1. Sin esto, una cadena mal copiada conectaría como propietario y todo lo
//    demás parecería comprobar algo que en realidad no comprueba.
const [{ usuario }] = await sql.query("select current_user as usuario");
if (usuario !== ROL_ESPERADO) {
  console.error(`La cadena conecta como «${usuario}», no como «${ROL_ESPERADO}».`);
  process.exit(1);
}
bien(`current_user es ${ROL_ESPERADO}`);

// 2. Cada tabla prohibida, una por una.
for (const tabla of PROHIBIDAS) {
  try {
    await sql.query(`select 1 from ${tabla} limit 1`);
    mal(`${tabla}: se pudo leer y no debería`);
  } catch (error) {
    const codigo = error?.code ?? "";
    // 42501 es permiso denegado; 42P01 es que la tabla aún no existe, y
    // entonces tampoco hay fuga.
    if (codigo === "42501" || codigo === "42P01") {
      bien(`${tabla}: denegada`);
    } else {
      mal(`${tabla}: error inesperado (${codigo || error?.message})`);
    }
  }
}

// 3. Y lo que sí tiene que poder leer.
for (const tabla of PERMITIDAS) {
  try {
    await sql.query(`select 1 from ${tabla} limit 1`);
    bien(`${tabla}: legible`);
  } catch (error) {
    mal(`${tabla}: debería ser legible (${error?.code ?? error?.message})`);
  }
}

// 4. Una tabla nueva no puede entrar sin que alguien decida su acceso.
const conocidas = new Set([...PERMITIDAS, ...PROHIBIDAS]);
const tablas = await sql.query(
  `select table_name from information_schema.tables
   where table_schema = 'public' and table_type = 'BASE TABLE'`,
);
for (const { table_name: nombre } of tablas) {
  if (!conocidas.has(nombre)) {
    mal(`${nombre}: tabla sin clasificar; añádela a PERMITIDAS o a PROHIBIDAS`);
  }
}

console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
```

**Nota:** `public_products` es una vista de la lista de tablas base solo si se creó como
tabla, que es el caso. Si en el futuro alguna entidad pasa a ser vista, hay que ampliar la
consulta del punto 4 para incluir `VIEW`.

```json
"test:permisos": "node --env-file-if-exists=.env.local ./scripts/verificar-permisos.mjs"
```

- [x] **Paso 3: escribir el documento de operación**

`docs/OPERACION-ROL-PUBLICO.md`, con los cinco apartados que exige la sección 4 de la
especificación: creación o activación del rol con capacidad de acceso; generación de la
contraseña y **procedimiento de rotación**; obtención de `DATABASE_URL_PUBLIC`;
configuración en desarrollo, pruebas, staging y producción; y verificación de que la
cadena usa realmente el rol público. **Ninguna credencial real en el documento.**

- [x] **Paso 4: añadir la variable a `.env.example`**

```bash
# --- Rol de lectura pública — OBLIGATORIA en producción ------------------
# Cadena del rol `econoluz_publico`, que SOLO puede leer `public_products`.
# Su contraseña se genera fuera del repositorio; ver docs/OPERACION-ROL-PUBLICO.md.
# Si falta en producción, el catálogo se sirve del respaldo estático y se
# registra un error de configuración. NUNCA se usa DATABASE_URL en su lugar.
DATABASE_URL_PUBLIC=
```

- [x] **Paso 5: aplicar y verificar contra la rama de Neon de desarrollo**

```bash
npm run db:migrar
```

```bash
npm run test:permisos
```

Esperado: `current_user` es `econoluz_publico`, error de permisos en **todas** las tablas
prohibidas, lectura correcta de `public_products`, y ninguna tabla sin clasificar.

- [x] **Paso 6: confirmar**

```bash
git add db/006_rol_publico.sql scripts/verificar-permisos.mjs docs/OPERACION-ROL-PUBLICO.md .env.example package.json
git commit -m "feat(datos): rol publico de solo lectura y su prueba de permisos"
```

---

## Tarea 9: `app_settings` y `audit_log`

**Archivos:**
- Crear: `db/007_app_settings.sql`, `db/008_audit_log.sql`, `app/lib/ajustes.ts`,
  `app/lib/ajustes.server.ts`, `tests/ajustes.test.ts`

**Interfaces:**
- Produce, en `app/lib/ajustes.ts` (puro): `type ModeloDeCatalogo = "legacy" | "shadow" | "relational_v2"`,
  `interpretarModelo(valor: unknown): ModeloDeCatalogo`,
  `leerModeloDeCatalogo(ejecutor: Ejecutor): Promise<ModeloDeCatalogo>`.
- Produce, en `app/lib/ajustes.server.ts`: `obtenerModeloDeCatalogo(): Promise<ModeloDeCatalogo>`,
  que es `leerModeloDeCatalogo` con la conexión real y caché breve.

- [ ] **Paso 1: escribir las migraciones**

`db/007_app_settings.sql`:

```sql
-- Configuración persistente y protegida.
--
-- Vive en la base y no en una variable de entorno porque cambiar una variable
-- en Vercel exige normalmente un nuevo despliegue, y entonces no sirve como
-- vuelta atrás inmediata.

create table if not exists app_settings (
  clave          text        primary key,
  valor          text        not null,
  actualizado_en timestamptz not null default now(),
  actualizado_por text       not null default 'sistema'
);

-- El selector del modelo de catálogo nace en `legacy` y ahí se queda al
-- terminar este subproyecto. `relational_v2` es del subproyecto 3 y necesita
-- autorización expresa del dueño.
insert into app_settings (clave, valor)
values ('modelo_catalogo', 'legacy')
on conflict (clave) do nothing;
```

`db/008_audit_log.sql`:

```sql
-- Quién cambió qué, con el antes y el después.

create table if not exists audit_log (
  id          bigserial   primary key,
  ocurrido_en timestamptz not null default now(),
  actor_tipo  text        not null,
  actor_id    text,
  accion      text        not null,
  entidad     text        not null,
  entidad_id  text,
  antes       jsonb,
  despues     jsonb,

  constraint audit_log_actor_tipo_valido
    check (actor_tipo in ('admin', 'sistema', 'cliente'))
);

create index if not exists audit_log_ocurrido_en_idx on audit_log (ocurrido_en desc);
create index if not exists audit_log_entidad_idx on audit_log (entidad, entidad_id);
```

- [ ] **Paso 2: escribir la prueba que falla**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { interpretarModelo, leerModeloDeCatalogo } from "../app/lib/ajustes";

test("acepta los tres valores previstos", () => {
  assert.equal(interpretarModelo("legacy"), "legacy");
  assert.equal(interpretarModelo("shadow"), "shadow");
  assert.equal(interpretarModelo("relational_v2"), "relational_v2");
});

test("cualquier otra cosa cae en legacy, que es lo seguro", () => {
  assert.equal(interpretarModelo("v3"), "legacy");
  assert.equal(interpretarModelo(null), "legacy");
  assert.equal(interpretarModelo(undefined), "legacy");
});

test("si la base no responde, se sirve legacy y no se rompe nada", async () => {
  const modelo = await leerModeloDeCatalogo(async () => {
    throw new Error("Neon no disponible");
  });
  assert.equal(modelo, "legacy");
});

test("lee el valor guardado", async () => {
  const modelo = await leerModeloDeCatalogo(async () => [{ valor: "shadow" }]);
  assert.equal(modelo, "shadow");
});
```

- [ ] **Paso 3: ejecutar la prueba y comprobar que falla**

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/ajustes.test.ts
```

Esperado: falla con «Cannot find module '../app/lib/ajustes'».

- [ ] **Paso 4: escribir la implementación mínima**

```ts
import type { Ejecutor } from "./datos/consulta";

/**
 * El selector del modelo de catálogo.
 *
 * Ante cualquier duda —valor desconocido, base que no responde— se sirve
 * `legacy`, que es el camino probado. Un fallo de configuración no puede
 * cambiar por su cuenta lo que ve el visitante.
 */

export type ModeloDeCatalogo = "legacy" | "shadow" | "relational_v2";

const MODELOS: readonly ModeloDeCatalogo[] = ["legacy", "shadow", "relational_v2"];

export function interpretarModelo(valor: unknown): ModeloDeCatalogo {
  return typeof valor === "string" && (MODELOS as readonly string[]).includes(valor)
    ? (valor as ModeloDeCatalogo)
    : "legacy";
}

export async function leerModeloDeCatalogo(ejecutor: Ejecutor): Promise<ModeloDeCatalogo> {
  try {
    const filas = await ejecutor("select valor from app_settings where clave = $1", [
      "modelo_catalogo",
    ]);
    return interpretarModelo(filas[0]?.valor);
  } catch {
    return "legacy";
  }
}
```

Y `app/lib/ajustes.server.ts`:

```ts
import "server-only";

import { unstable_cache } from "next/cache";
import { ejecutorDeLectura } from "./datos/conexion";
import { leerModeloDeCatalogo, type ModeloDeCatalogo } from "./ajustes";

/**
 * Sesenta segundos de caché: lo bastante para no consultar en cada carga, y lo
 * bastante poco para que una vuelta atrás urgente se note casi enseguida. Es la
 * razón de que la bandera viva aquí y no en una variable de entorno, que
 * exigiría un despliegue.
 */
const SEGUNDOS_DE_CACHE = 60;

const leerConCache = unstable_cache(
  async (): Promise<ModeloDeCatalogo> => leerModeloDeCatalogo(ejecutorDeLectura()),
  ["modelo-catalogo"],
  { revalidate: SEGUNDOS_DE_CACHE },
);

export async function obtenerModeloDeCatalogo(): Promise<ModeloDeCatalogo> {
  if (!process.env.DATABASE_URL) {
    return "legacy";
  }

  try {
    return await leerConCache();
  } catch {
    return "legacy";
  }
}
```

- [ ] **Paso 5: ejecutar la prueba y comprobar que pasa**

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/ajustes.test.ts
```

Esperado: 4 pruebas en verde.

- [ ] **Paso 6: aplicar las migraciones y confirmar**

```bash
npm run db:migrar
```

```bash
git add db/007_app_settings.sql db/008_audit_log.sql app/lib/ajustes.ts app/lib/ajustes.server.ts tests/ajustes.test.ts package.json
git commit -m "feat(datos): configuracion persistente y registro de auditoria"
```

---

## Tarea 10: Trasladar los once accesos

**Archivos a modificar, uno por commit y sin cambiar comportamiento:**

1. `app/data/catalog.server.ts`
2. `app/data/projects.server.ts`
3. `app/api/leads/route.ts`
4. `app/admin/auth/repository.server.ts`
5. `app/admin/panelStats.server.ts`
6. `app/admin/productos/list.server.ts`
7. `app/admin/productos/ficha.server.ts`
8. `app/admin/productos/nuevo.server.ts`
9. `app/admin/proyectos/repository.server.ts`
10. `app/admin/proyectos/imagenes.server.ts`
11. `app/tienda/disponibilidad.server.ts`

**El patrón del traslado**, idéntico en los once: sustituir `neon(process.env.DATABASE_URL)`
por `leer` o `escribir` de `app/lib/datos`, conservando **exactamente** la misma política
de fallo que tenía cada archivo. Ejemplo, en `app/data/projects.server.ts`:

```ts
// Antes
const sql = neon(connectionString);
const filas = await sql.query(consulta);

// Después
import { leer } from "../lib/datos";
const filas = await leer<FilaProyecto>(consulta);
```

**Dos avisos que no se pueden pasar por alto:**

- **`app/tienda/disponibilidad.server.ts` se traslada, pero no se toca su lógica.** Sigue
  consultando `products.stock` igual que hoy. Su retirada es el subproyecto 11 y necesita
  autorización expresa del dueño.
- **`app/data/catalog.server.ts` conserva su respaldo** al catálogo del código cuando Neon
  no responde, y **no cambia de fuente**: sigue leyendo `products` con la conexión de la
  aplicación. La bandera se queda en `legacy`.

- [ ] **Paso 1: trasladar el primer archivo**

Empezar por `app/admin/panelStats.server.ts`, que es el más pequeño y ya usa el patrón del
ejecutor.

- [ ] **Paso 2: ejecutar la batería completa**

```bash
npm run test:admin
```

```bash
npm run typecheck
```

Esperado: 182 pruebas en verde y sin errores de tipos, **antes y después** del traslado.

- [ ] **Paso 3: confirmar ese archivo**

```bash
git add app/admin/panelStats.server.ts
git commit -m "refactor(datos): la portada del panel usa la capa de acceso"
```

- [ ] **Paso 4: repetir los pasos 1 a 3 con los diez restantes**

Un archivo por commit, con la batería entre cada uno. **No agrupar**: si algo cambia de
comportamiento, un commit por archivo dice exactamente cuál fue.

- [ ] **Paso 5: comprobar que la prueba de frontera pasa a verde**

```bash
npm run test:datos
```

Esperado: **ahora sí**, «solo app/lib/datos importa el controlador de Neon» en verde. Ese
es el momento en que la regla estructural empieza a proteger de verdad.

- [ ] **Paso 6: batería completa**

Cerrar cualquier `npm run dev` abierto antes de Playwright.

```bash
npm run lint
```

```bash
npm run build
```

```bash
npx playwright test
```

Esperado: 182 de unidad, 67 de navegador, `lint` y `build` limpios. **Los mismos números
que antes de empezar el subproyecto: eso es la paridad.**

---

## Tarea 11: Comportamiento ante la falta de `DATABASE_URL_PUBLIC`

**Archivos:**
- Crear: `app/data/origenPublico.ts`
- Modificar: `app/data/catalog.server.ts`
- Prueba: `tests/datos-respaldo-configuracion.test.ts`

**Por qué un módulo aparte y no dentro de `catalog.server.ts`:** ese archivo empieza con
`import "server-only"`, que impide importarlo desde una prueba de `node:test`. La decisión
es lógica pura y se prueba sin base de datos, así que vive en un módulo puro y
`catalog.server.ts` lo consume. Es el mismo reparto que ya usan `panelStats.ts` y
`panelStats.server.ts`.

**La regla, y es la más importante de este subproyecto:** la conexión privilegiada **nunca**
se usa como respaldo del camino público. Hacerlo convertiría un descuido de configuración
en la desaparición silenciosa de la protección que este subproyecto construye.

- [ ] **Paso 1: escribir la prueba que falla**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { decidirOrigenPublico } from "../app/data/origenPublico";

test("en producción sin cadena pública se sirve el respaldo estático", () => {
  const decision = decidirOrigenPublico({ produccion: true, hayCadenaPublica: false });
  assert.equal(decision.origen, "respaldo-estatico");
  assert.equal(decision.registrarErrorDeConfiguracion, true);
});

test("en producción sin cadena pública NUNCA se usa la privilegiada", () => {
  const decision = decidirOrigenPublico({ produccion: true, hayCadenaPublica: false });
  assert.notEqual(decision.origen, "conexion-privilegiada");
});

test("en local sin cadena pública se permite la privilegiada, con aviso", () => {
  const decision = decidirOrigenPublico({ produccion: false, hayCadenaPublica: false });
  assert.equal(decision.origen, "conexion-privilegiada");
  assert.equal(decision.avisar, true);
});

test("con cadena pública se usa el rol público en cualquier entorno", () => {
  for (const produccion of [true, false]) {
    assert.equal(
      decidirOrigenPublico({ produccion, hayCadenaPublica: true }).origen,
      "rol-publico",
    );
  }
});
```

- [ ] **Paso 2: ejecutar la prueba y comprobar que falla**

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/datos-respaldo-configuracion.test.ts
```

Esperado: falla con «Cannot find module '../app/data/origenPublico'».

- [ ] **Paso 3: escribir la implementación mínima**

`app/data/origenPublico.ts`, y después `catalog.server.ts` lo importa y actúa según lo que
devuelva:

```ts
export type OrigenPublico = "rol-publico" | "conexion-privilegiada" | "respaldo-estatico";

/**
 * Decide de dónde sale el catálogo público.
 *
 * En producción, la falta de `DATABASE_URL_PUBLIC` NO autoriza a usar la
 * conexión privilegiada: eso quitaría en silencio la barrera que separa al
 * visitante de los datos del proveedor. Se sirve el catálogo estático, que es
 * el respaldo seguro, y se registra un error de configuración para que el
 * descuido se note.
 */
export function decidirOrigenPublico(entorno: {
  produccion: boolean;
  hayCadenaPublica: boolean;
}): { origen: OrigenPublico; avisar: boolean; registrarErrorDeConfiguracion: boolean } {
  if (entorno.hayCadenaPublica) {
    return { origen: "rol-publico", avisar: false, registrarErrorDeConfiguracion: false };
  }

  if (entorno.produccion) {
    return {
      origen: "respaldo-estatico",
      avisar: false,
      registrarErrorDeConfiguracion: true,
    };
  }

  return { origen: "conexion-privilegiada", avisar: true, registrarErrorDeConfiguracion: false };
}
```

- [ ] **Paso 4: ejecutar la prueba y comprobar que pasa**

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/datos-respaldo-configuracion.test.ts
```

Esperado: 4 pruebas en verde.

- [ ] **Paso 5: confirmar**

```bash
git add app/data/origenPublico.ts app/data/catalog.server.ts tests/datos-respaldo-configuracion.test.ts package.json
git commit -m "feat(datos): el respaldo publico nunca usa la conexion privilegiada"
```

---

## Tarea 12: Cierre y documentación

- [ ] **Paso 1: ejecutar todo**

```bash
npm run test:datos
```

```bash
npm run test:admin
```

```bash
npm run test:permisos
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
npx playwright test
```

- [ ] **Paso 2: comprobar los doce criterios de aceptación**

Recorrer uno por uno la sección 6 de la especificación y anotar la evidencia de cada uno.
**El criterio 12 exige comprobar que la bandera sigue en `legacy`** y que
`publicProduct.ts` y `publicProductPrivacy.ts` están sin modificar:

```bash
git diff main --stat -- app/data/publicProduct.ts app/data/publicProductPrivacy.ts
```

Esperado: salida vacía.

- [ ] **Paso 3: actualizar la documentación**

`CLAUDE.md` (§4, comandos nuevos y la carpeta `app/lib/datos/`) y
`docs/CONTINUAR-PANEL.md` (§0.1, qué hacer a continuación). **Sin retirar nada de lo que
la sección 0 protege.**

- [ ] **Paso 4: confirmar**

```bash
git add CLAUDE.md docs/CONTINUAR-PANEL.md
git commit -m "docs: dejar por escrito la capa de acceso a datos"
```

- [ ] **Paso 5: punto de revisión con el dueño**

Presentarle: los doce criterios con su evidencia, la batería completa, y **lo que hay que
hacer en Neon y en Vercel antes de desplegar** —crear el rol, generar su contraseña y
añadir `DATABASE_URL_PUBLIC`—. **No fusionar, no desplegar y no empezar el subproyecto 2
sin su autorización expresa.**

---

## Lo que el dueño tiene que hacer, y cuándo

| Cuándo | Qué |
|---|---|
| Antes de la tarea 8 | Crear el rol `econoluz_publico` en Neon con capacidad de acceso y generar su contraseña, siguiendo `docs/OPERACION-ROL-PUBLICO.md` |
| Antes de la tarea 8 | Añadir `DATABASE_URL_PUBLIC` a `.env.local` |
| Antes de desplegar | Añadir `DATABASE_URL_PUBLIC` a Vercel como secreto del entorno de producción |
| Al terminar | Autorizar la fusión y, por separado, el despliegue |
