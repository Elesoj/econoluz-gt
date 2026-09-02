# Núcleo relacional de productos — plan de la Fase B (subproyecto 3)

> **Para quien ejecute esto con agentes:** SUB-SKILL OBLIGATORIA:
> `superpowers:executing-plans`, y `superpowers:test-driven-development` en cada tarea con
> código. Los pasos usan casillas (`- [ ]`) para poder seguirlos.

**Objetivo:** aplicar la migración `010` en una rama **aislada de desarrollo** de Neon,
implementar el contrato de escritura y lectura del modelo relacional, e importar allí el
catálogo actual de forma idempotente y comprobada.

**Arquitectura:** el contrato nuevo no abre conexiones propias: recibe un `Ejecutor`
—el mismo tipo que ya usa `app/lib/datos`— y se envuelve con `escribir()` para que toda la
sincronización de un producto ocurra dentro de una sola transacción. La lógica que se puede
probar sin base de datos vive en módulos puros; lo que necesita SQL se prueba con un
ejecutor de mentira y se verifica después contra PostgreSQL de verdad.

**Stack:** Node 24, TypeScript estricto, `@neondatabase/serverless`, `node:test`,
PostgreSQL 18 en Neon (y PostgreSQL 16 efímero en WSL para la comprobación estructural).

**Diseño:** `docs/superpowers/specs/2026-09-02-nucleo-productos-tienda-design.md`
**Fase anterior:** `docs/superpowers/plans/2026-09-02-catalogo-relacional.md`

## Restricciones globales

- **Rama `feat/catalogo-relacional`, worktree `.worktrees/catalogo-relacional`, desde `3cf911d`.**
- **Prohibido escribir en la rama de Producción de Neon.** Toda escritura va a la rama
  aislada `catalogo-relacional-fase-b`, creada desde Producción.
- **`modelo_catalogo` sigue en `legacy`.** La web pública continúa leyendo el catálogo
  antiguo. No se activa `shadow` ni `relational_v2`: son las fases C y D.
- **Sin push, sin fusión, sin despliegue, sin borrar ramas de Neon.**
- **Ninguna credencial en archivos rastreados, logs, commits ni `.env.local`.** Las
  cadenas de conexión viajan como variables de sesión de PowerShell.
- **Ocho tablas nuevas, ni una más.** `category_attributes` no existe.
- **No se normaliza lo ambiguo.** Solo se convierten a atributos tipados las claves de
  `technical_specs` que se pueden convertir sin adivinar; el resto se queda en el JSON.
  `specialFeatures` **no** se normaliza: sus 947 valores distintos no son un vocabulario
  controlado. Decisión del dueño el 02/09/2026.
- **El valor original se conserva.** `products.technical_specs` no se modifica: un dato
  normalizado sigue estando también en su forma original durante la transición.
- Español de España en comentarios, mensajes de commit y resúmenes.

---

## Lo que ya está comprobado antes de empezar

`bash scripts/verificar-migracion-postgres.sh` se ejecutó en WSL (PostgreSQL 16.11) el
02/09/2026 con **30 comprobaciones y 0 fallos**: las diez migraciones se aplican con un rol
**no superusuario**, `create extension if not exists btree_gist` funciona con ese rol, la
`010` se aplica dos veces sin error y las trece restricciones del diseño rechazan lo que
deben rechazar. Eso cierra el requisito previo que la Fase A había dejado abierto y que el
diseño §5 exige antes de la Fase B.

Queda por confirmar lo mismo **en Neon**, donde el rol y la versión son otros.

## Las siete claves numéricas aprobadas

Son las únicas claves de `technical_specs` cuyo valor es, en **todas** sus apariciones, un
número seguido opcionalmente de una unidad corta sin dígitos. Se listan con todos sus
valores distintos porque el dueño pidió verlos antes de escribir:

| Clave | Productos | Unidad | Valores distintos |
|---|---|---|---|
| `amperage` | 29 | `A` | `0.78A`, `15A`, `20A` |
| `savings` | 10 | `%` | `75%`, `90%` |
| `panelLifetime` | 2 | `anos` | `25 anos` |
| `disconnectSpeed` | 1 | `seg.` | `0.025 seg.` |
| `shortCircuitCurrent` | 1 | `kA` | `10 kA` |
| `weight` | 1 | `g` | `87 g` |
| `cutout` | 1 | `mm` | `75 mm` |

Todo lo demás se queda en `technical_specs`. En particular `power`, `luminousFlux` y
`colorTemperature`, cuyos valores son familias de producto (`"75 W / 100 W / 150 W / 200 W"`)
y no un número: normalizarlas exige antes decidir si un producto se parte en variantes, que
es materia del ERP y no de este subproyecto.

**Por qué importa no equivocarse aquí:** el tipo de un atributo con valores es inmutable por
clave foránea compuesta. Convertir `power` a texto hoy obligaría a borrar todos sus valores
para poder hacerlo numérico mañana.

## Cómo se clasifican los productos en categorías

La taxonomía actual es un árbol de dos niveles: **7 tipos de producto** y **29 parejas
tipo/aplicación**. Se importa así:

- Una categoría raíz por tipo de producto (`parent_id` nulo), con `slug` como
  `iluminacion-exterior`.
- Una categoría hija por pareja tipo/aplicación, con `slug` compuesto
  `iluminacion-exterior-decorativos`.
- Cada producto pertenece **solo a su categoría hoja**, marcada `principal`. La ascendencia
  se deduce con `rutaDeCategoria`; duplicar la raíz en `product_categories` no añade nada.

El `slug` compuesto no es un adorno: **`decorativos` cuelga de dos tipos distintos**
—arquitectónica (3 productos) y exterior (13)—, y `categories.slug` es único en toda la
tabla. Con el slug simple, la importación fallaría en el producto catorce.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `app/data/catalogo/importacion.ts` | **Crear.** Puro: el test numérico estricto, la lista aprobada de claves, los slugs de categoría y el plan relacional de un producto. |
| `app/data/catalogo/escritura.server.ts` | **Crear.** El contrato de escritura atómico del diseño §4, sobre un `Ejecutor`. |
| `app/data/catalogo/lectura.server.ts` | **Crear.** Reconstruir un producto relacional, proyectarlo saneado y buscar por `supplier_code`. |
| `scripts/guarda-neon.mjs` | **Crear.** Rechaza continuar si la conexión no es la rama de desarrollo esperada. |
| `scripts/importar-catalogo-relacional.mjs` | **Crear.** Importador idempotente, con modo simulación. |
| `scripts/verificar-catalogo-relacional.mjs` | **Crear.** Comprobaciones estructurales y de datos contra la base real. |
| `tests/catalogo-importacion.test.ts` | **Crear.** Pruebas de la lógica pura de importación. |
| `tests/catalogo-escritura.test.ts` | **Crear.** Pruebas del contrato de escritura con ejecutor de mentira. |
| `tests/catalogo-lectura.test.ts` | **Crear.** Pruebas del contrato de lectura y de la proyección saneada. |
| `tests/catalogo-guarda-neon.test.ts` | **Crear.** Pruebas de la guarda contra Producción. |
| `package.json` | **Modificar.** Tres comandos nuevos. |
| `CLAUDE.md`, `docs/CONTINUAR-PANEL.md` | **Modificar.** Estado al día. |

---

## Tarea 1: La rama de Neon y la guarda contra Producción

**Archivos:**
- Crear: `scripts/guarda-neon.mjs`
- Test: `tests/catalogo-guarda-neon.test.ts`
- Modificar: `package.json`

**Interfaces:**
- Produce: `decidirSiPuedeEscribir({ host, hostEsperado, rama, ramaEsperada }) → { ok: true } | { ok: false, motivo: string }` y `exigirRamaDeDesarrollo(cliente) → Promise<void>`.
- Consume: `app_settings`, creada por `db/007_app_settings.sql`.

**Por qué una guarda y no cuidado:** el encargo prohíbe escribir en Producción, y la única
diferencia entre una y otra es una cadena de conexión en una variable de entorno. Una
equivocación de copiar y pegar bastaría. La guarda convierte ese error en un fallo ruidoso.

La guarda exige **dos confirmaciones positivas**, nunca una lista negra: el host tiene que
coincidir con el endpoint esperado, y la base tiene que llevar dentro un marcador que diga a
qué rama pertenece. Una lista negra falla en cuanto aparece un endpoint que nadie apuntó.

- [ ] **Paso 1: Crear la rama en Neon y anotar su identidad**

```bash
npx neonctl branches create --name catalogo-relacional-fase-b --parent production
```

Anotar en el informe el **ID de la rama**, el **ID de la rama padre** y el **host del
endpoint**. No pegar nunca la cadena de conexión en un archivo ni en un commit.

- [ ] **Paso 2: Escribir la prueba que falla**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { decidirSiPuedeEscribir } from "../scripts/guarda-neon.mjs";

test("rechaza un host que no es el esperado", () => {
  const decision = decidirSiPuedeEscribir({
    host: "ep-misty-sun-avmcbgly-pooler.c-11.us-east-1.aws.neon.tech",
    hostEsperado: "ep-desarrollo-xxxx.c-11.us-east-1.aws.neon.tech",
    rama: "catalogo-relacional-fase-b",
    ramaEsperada: "catalogo-relacional-fase-b",
  });
  assert.equal(decision.ok, false);
  assert.match(decision.motivo, /endpoint/i);
});

test("rechaza cuando falta el marcador de rama", () => {
  const decision = decidirSiPuedeEscribir({
    host: "ep-desarrollo-xxxx.c-11.us-east-1.aws.neon.tech",
    hostEsperado: "ep-desarrollo-xxxx.c-11.us-east-1.aws.neon.tech",
    rama: null,
    ramaEsperada: "catalogo-relacional-fase-b",
  });
  assert.equal(decision.ok, false);
});

test("acepta cuando coinciden endpoint y marcador", () => {
  const decision = decidirSiPuedeEscribir({
    host: "ep-desarrollo-xxxx.c-11.us-east-1.aws.neon.tech",
    hostEsperado: "ep-desarrollo-xxxx.c-11.us-east-1.aws.neon.tech",
    rama: "catalogo-relacional-fase-b",
    ramaEsperada: "catalogo-relacional-fase-b",
  });
  assert.equal(decision.ok, true);
});
```

- [ ] **Paso 3: Ejecutarla y verla fallar**

`node --test tests/catalogo-guarda-neon.test.ts` → falla con «Cannot find module».

- [ ] **Paso 4: Implementar `decidirSiPuedeEscribir`**

```js
export function decidirSiPuedeEscribir({ host, hostEsperado, rama, ramaEsperada }) {
  if (!hostEsperado || !ramaEsperada) {
    return { ok: false, motivo: "Faltan NEON_ENDPOINT_ESPERADO o NEON_RAMA_ESPERADA." };
  }
  if (host !== hostEsperado) {
    return { ok: false, motivo: `El endpoint conectado no es el esperado: ${host}.` };
  }
  if (rama !== ramaEsperada) {
    return { ok: false, motivo: `La base dice ser la rama «${rama ?? "sin marcar"}».` };
  }
  return { ok: true };
}
```

`exigirRamaDeDesarrollo` lee el marcador con
`select valor from app_settings where clave = 'rama_neon'` y aborta el proceso si la
decisión no es `ok`.

- [ ] **Paso 5: Verla pasar y sellar la rama**

```bash
node scripts/guarda-neon.mjs --sellar catalogo-relacional-fase-b
```

Escribe el marcador en `app_settings`. El sellado exige que el host coincida con
`NEON_ENDPOINT_ESPERADO` y se niega a sobrescribir un marcador distinto.

- [ ] **Paso 6: Commit**

```bash
git add scripts/guarda-neon.mjs tests/catalogo-guarda-neon.test.ts package.json
git commit -m "feat(catalogo): guarda que impide escribir fuera de la rama de desarrollo"
```

---

## Tarea 2: Aplicar las migraciones con el migrador real

**Archivos:**
- Crear: `scripts/verificar-catalogo-relacional.mjs`
- Modificar: `package.json`

**Interfaces:**
- Consume: `scripts/guarda-neon.mjs`.
- Produce: `npm run catalogo:relacional:verificar`.

El migrador es `npm run db:migrar`, el mismo de siempre. No se aplica SQL a mano: el diseño
exige que la migración quede registrada una sola vez en `schema_migrations`.

- [ ] **Paso 1: Fotografiar el estado inicial**

```bash
node scripts/verificar-catalogo-relacional.mjs --estado
```

Antes de migrar: qué migraciones hay aplicadas, cuántos productos, cuántos con precio.

- [ ] **Paso 2: Aplicar**

```bash
npm run db:migrar
```

Esperado: `APLICADA 010_catalogo_relacional.sql` y ninguna otra; las `001`–`009` ya estaban.

- [ ] **Paso 3: Comprobar en PostgreSQL de verdad**

`scripts/verificar-catalogo-relacional.mjs` comprueba, en la rama de desarrollo:

1. las **ocho** tablas nuevas existen;
2. `category_attributes` **no** existe;
3. `product_private_data` no tiene `sku` ni `product_code`;
4. `supplier_code` está indexado y su índice **no** es único;
5. las trece restricciones, el `constraint trigger` diferido y los índices parciales existen;
6. `btree_gist` está instalada;
7. el rol público sigue sin permisos sobre las ocho tablas nuevas;
8. `010` aparece **una sola vez** en `schema_migrations`.

- [ ] **Paso 4: Commit**

```bash
git add scripts/verificar-catalogo-relacional.mjs package.json
git commit -m "feat(catalogo): comprobaciones del esquema relacional contra la base real"
```

---

## Tarea 3: La lógica pura de importación

**Archivos:**
- Crear: `app/data/catalogo/importacion.ts`
- Test: `tests/catalogo-importacion.test.ts`

**Interfaces:**
- Produce:
  - `numeroEstricto(texto: string) → { numero: number; unidad: string | null } | null`
  - `CLAVES_NUMERICAS: readonly string[]` — las siete aprobadas
  - `slugDeCategoria(tipo: string, aplicacion?: string) → string`
  - `categoriasDelCatalogo(filas) → CategoriaPlan[]`
  - `planificarProducto(fila, categorias) → PlanDeProducto`
- Consume: `CatalogRow` de `app/data/productRow.ts`, `validarPertenencias` de `categorias.ts`.

- [ ] **Paso 1: Escribir las pruebas que fallan**

```ts
test("numeroEstricto acepta un número con unidad corta", () => {
  assert.deepEqual(numeroEstricto("15A"), { numero: 15, unidad: "A" });
  assert.deepEqual(numeroEstricto("0.025 seg."), { numero: 0.025, unidad: "seg." });
});

test("numeroEstricto rechaza un rango, que no es un número", () => {
  // "5-8 anos" leído a la ligera da 5 con unidad "-8 anos": eso es corromper el dato.
  assert.equal(numeroEstricto("5-8 anos"), null);
  assert.equal(numeroEstricto("75 W / 100 W / 150 W"), null);
  assert.equal(numeroEstricto(">80"), null);
});

test("el slug de una hoja lleva su tipo, porque decorativos cuelga de dos", () => {
  assert.equal(
    slugDeCategoria("iluminacion_exterior", "decorativos"),
    "iluminacion-exterior-decorativos",
  );
  assert.notEqual(
    slugDeCategoria("iluminacion_exterior", "decorativos"),
    slugDeCategoria("iluminacion_arquitectonica", "decorativos"),
  );
});

test("el plan de un producto marca exactamente una categoría principal", () => {
  const plan = planificarProducto(FILA, CATEGORIAS);
  assert.equal(plan.categorias.filter((c) => c.principal).length, 1);
});

test("la primera imagen es la principal y la galería va después", () => {
  const plan = planificarProducto({ ...FILA, image: "/a.png", images: ["/b.png"] }, CATEGORIAS);
  assert.deepEqual(
    plan.imagenes.map((i) => [i.url, i.posicion, i.principal]),
    [["/a.png", 0, true], ["/b.png", 10, false]],
  );
});

test("solo se normalizan las siete claves aprobadas", () => {
  const plan = planificarProducto(
    { ...FILA, technical_specs: { amperage: "15A", power: "75 W / 100 W" } },
    CATEGORIAS,
  );
  assert.deepEqual(plan.atributos.map((a) => a.clave), ["amperage"]);
  assert.equal(plan.atributos[0].numero, 15);
});
```

- [ ] **Paso 2: Ejecutarlas y verlas fallar**

`npm run test:datos` tras añadir el archivo → falla por módulo inexistente.

- [ ] **Paso 3: Implementar el módulo**

El test numérico exige: número con separadores de millar opcionales, y unidad **sin
dígitos**, de seis caracteres o menos. Un guion, una barra o dos puntos descalifican el
valor entero.

- [ ] **Paso 4: Verlas pasar**

- [ ] **Paso 5: Romper una a propósito y verla fallar**

Cambiar la unidad permitida para que acepte dígitos y comprobar que la prueba de `"5-8 anos"`
falla. Deshacer.

- [ ] **Paso 6: Commit**

```bash
git commit -m "feat(catalogo): logica pura de importacion al modelo relacional"
```

---

## Tarea 4: El contrato de escritura

**Archivos:**
- Crear: `app/data/catalogo/escritura.server.ts`
- Test: `tests/catalogo-escritura.test.ts`

**Interfaces:**
- Produce: `aplicarProducto(ejecutar: Ejecutor, entrada: EntradaDeProducto) → Promise<void>` y `guardarProducto(entrada) → Promise<void>`.
- Consume: `Ejecutor` y `escribir` de `app/lib/datos`, `ErrorDeDatos`, la lógica pura de las tareas anteriores.

El orden del diseño §4 no es negociable: validar, núcleo, sincronizar, comprobar, proyectar,
auditar, confirmar. La caché se invalida **después** del commit.

- [ ] **Paso 1: Escribir las pruebas que fallan**

```ts
const ejecutorFalso = () => {
  const sentencias = [];
  const ejecutar = async (texto, parametros = []) => {
    sentencias.push({ texto, parametros });
    return [];
  };
  return { ejecutar, sentencias };
};

test("un precio normal nuevo cierra la vigencia del anterior antes de insertar", async () => {
  const { ejecutar, sentencias } = ejecutorFalso();
  await aplicarProducto(ejecutar, { ...ENTRADA, precioNormalCentavos: 129900 });
  const cierre = sentencias.findIndex((s) => /update product_prices/.test(s.texto));
  const alta = sentencias.findIndex((s) => /insert into product_prices/.test(s.texto));
  assert.ok(cierre >= 0 && alta > cierre, "el cierre tiene que ir antes del alta");
});

test("la proyección pública se reconstruye después de sincronizar", async () => {
  const { ejecutar, sentencias } = ejecutorFalso();
  await aplicarProducto(ejecutar, ENTRADA);
  const imagenes = sentencias.findIndex((s) => /product_images/.test(s.texto));
  const proyeccion = sentencias.findIndex((s) => /public_products/.test(s.texto));
  assert.ok(proyeccion > imagenes);
});

test("la proyección no lleva ningún dato del proveedor", async () => {
  const { ejecutar, sentencias } = ejecutorFalso();
  await aplicarProducto(ejecutar, { ...ENTRADA, privados: { supplier_code: "APL-001" } });
  const proyeccion = sentencias.find((s) => /public_products/.test(s.texto));
  assert.ok(!JSON.stringify(proyeccion.parametros).includes("APL-001"));
});

test("un producto publicado sin imagen principal visible se rechaza", async () => {
  const { ejecutar } = ejecutorFalso();
  await assert.rejects(
    aplicarProducto(ejecutar, { ...ENTRADA, published: true, imagenes: [] }),
    (error) => error instanceof ErrorDeDatos && error.causa === "conflicto",
  );
});

test("dos categorías principales se rechazan antes de tocar la base", async () => {
  const { ejecutar, sentencias } = ejecutorFalso();
  await assert.rejects(
    aplicarProducto(ejecutar, {
      ...ENTRADA,
      categorias: [{ categoriaId: "1", principal: true }, { categoriaId: "2", principal: true }],
    }),
  );
  assert.equal(sentencias.length, 0, "no debe escribir nada si la validación falla");
});

test("cada guardado deja una fila de auditoría", async () => {
  const { ejecutar, sentencias } = ejecutorFalso();
  await aplicarProducto(ejecutar, ENTRADA);
  assert.ok(sentencias.some((s) => /insert into audit_log/.test(s.texto)));
});
```

- [ ] **Paso 2: Ejecutarlas y verlas fallar**
- [ ] **Paso 3: Implementar el contrato**
- [ ] **Paso 4: Verlas pasar**
- [ ] **Paso 5: Romper el orden del precio y ver fallar la prueba correspondiente. Deshacer.**
- [ ] **Paso 6: Commit**

```bash
git commit -m "feat(catalogo): contrato de escritura atomico del modelo relacional"
```

---

## Tarea 5: El contrato de lectura y la búsqueda por código de proveedor

**Archivos:**
- Crear: `app/data/catalogo/lectura.server.ts`
- Test: `tests/catalogo-lectura.test.ts`

**Interfaces:**
- Produce:
  - `leerProductoRelacional(ejecutar, id) → Promise<ProductoRelacional | null>`
  - `leerCatalogoRelacional(ejecutar) → Promise<ProductoRelacional[]>`
  - `proyeccionDesdeRelacional(producto, ahora) → FilaProyeccion`
  - `buscarPorCodigoDeProveedor(ejecutar, texto) → Promise<{ id: string; supplier_code: string }[]>`

- [ ] **Paso 1: Escribir las pruebas que fallan**

```ts
test("la proyección usa el precio vigente y no el histórico", () => {
  const fila = proyeccionDesdeRelacional(
    { ...PRODUCTO, precios: [
      { id: "1", centavos: 100000, tipo: "normal", desde: new Date("2026-01-01"), hasta: new Date("2026-06-01") },
      { id: "2", centavos: 129900, tipo: "normal", desde: new Date("2026-06-01"), hasta: null },
    ] },
    new Date("2026-09-02"),
  );
  assert.equal(fila.price_cents, 129900);
});

test("la proyección de un producto sin precio vigente no lleva importe", () => {
  const fila = proyeccionDesdeRelacional({ ...PRODUCTO, precios: [] }, new Date());
  assert.equal(fila.price_cents, null);
});

test("la búsqueda por código de proveedor encuentra un código dentro de una lista", async () => {
  const { ejecutar, sentencias } = ejecutorFalso();
  await buscarPorCodigoDeProveedor(ejecutar, "MT-12");
  assert.match(sentencias[0].texto, /product_private_data/);
  assert.match(sentencias[0].texto, /ilike/i);
});

test("la búsqueda por código de proveedor nunca sale por la conexión pública", () => {
  const fuente = readFileSync("app/data/catalogo/lectura.server.ts", "utf8");
  assert.ok(!/leerPublico/.test(fuente));
});
```

- [ ] **Paso 2: Verlas fallar**
- [ ] **Paso 3: Implementar**
- [ ] **Paso 4: Verlas pasar**
- [ ] **Paso 5: Commit**

```bash
git commit -m "feat(catalogo): lectura relacional, proyeccion saneada y busqueda por codigo"
```

---

## Tarea 5.bis: Las definiciones de atributos y opciones

**Archivos:**
- Modificar: `app/data/catalogo/escritura.server.ts`
- Modificar: `tests/catalogo-escritura.test.ts`

**Interfaces:**
- Produce:
  - `crearAtributo(ejecutar, { clave, nombre, tipo, unidad }) → Promise<string>`
  - `editarAtributo(ejecutar, id, { nombre, unidad, filterable, comparable }) → Promise<void>`
  - `retirarAtributo(ejecutar, id) → Promise<"borrado" | "desactivado">`
  - `crearOpcion(ejecutar, atributoId, { clave, etiqueta, posicion }) → Promise<string>`
  - `retirarOpcion(ejecutar, id) → Promise<"borrado" | "desactivado">`
- Consume: `decidirRetirada` y `puedeCambiarseElTipo` de `app/data/catalogo/atributos.ts`.

El diseño §3.6 y §3.7 lo pide explícitamente: lo que nunca se usó se borra, lo que ya
describe productos solo se desactiva, y el tipo de un atributo usado no se cambia. La
lógica pura de la Fase A ya decide; lo que falta es la operación que cuenta los usos y
actúa en consecuencia, dentro de la misma transacción que cuenta.

**Por qué cuenta dentro de la transacción:** si se cuenta fuera y se borra después, entre
las dos sentencias puede aparecer el primer uso y el borrado se llevaría por delante un dato
recién escrito. La cuenta va con `for update` sobre la definición.

- [ ] **Paso 1: Escribir las pruebas que fallan**

```ts
test("un atributo sin usar se borra", async () => {
  const { ejecutar, sentencias } = ejecutorFalso([[{ usos: 0 }]]);
  assert.equal(await retirarAtributo(ejecutar, "1"), "borrado");
  assert.ok(sentencias.some((s) => /delete from attributes/.test(s.texto)));
});

test("un atributo usado solo se desactiva, y conserva su clave", async () => {
  const { ejecutar, sentencias } = ejecutorFalso([[{ usos: 7 }]]);
  assert.equal(await retirarAtributo(ejecutar, "1"), "desactivado");
  assert.ok(!sentencias.some((s) => /delete from attributes/.test(s.texto)));
  assert.ok(sentencias.some((s) => /set active = false/.test(s.texto)));
});

test("editar un atributo no permite cambiarle el tipo", async () => {
  const fuente = readFileSync("app/data/catalogo/escritura.server.ts", "utf8");
  const editar = fuente.slice(fuente.indexOf("export async function editarAtributo"));
  assert.ok(!/\btipo\b\s*=/.test(editar.slice(0, editar.indexOf("\n}"))));
});

test("una opción usada se desactiva en vez de borrarse", async () => {
  const { ejecutar } = ejecutorFalso([[{ usos: 3 }]]);
  assert.equal(await retirarOpcion(ejecutar, "10"), "desactivado");
});
```

- [ ] **Paso 2: Verlas fallar**
- [ ] **Paso 3: Implementar**
- [ ] **Paso 4: Verlas pasar**
- [ ] **Paso 5: Commit**

```bash
git commit -m "feat(catalogo): alta, edicion y retirada de atributos y opciones"
```

---

## Tarea 6: El importador idempotente

**Archivos:**
- Crear: `scripts/importar-catalogo-relacional.mjs`
- Modificar: `package.json`

**Interfaces:**
- Consume: `guarda-neon.mjs`, `app/data/catalogo/importacion.ts`, `escritura.server.ts`.
- Produce: `npm run catalogo:relacional:simular` y `npm run catalogo:relacional:importar`.

**Idempotente quiere decir:** volver a ejecutarlo no duplica filas ni cambia datos que no
hayan cambiado. Las claves naturales son `products.id` para todo lo que cuelga del producto,
`categories.slug`, `attributes.clave`, `(product_id, posicion)` para las imágenes y
`(product_id, attribute_id)` para los valores escalares.

**No se supone el número de productos:** se cuenta con `select count(*) from products` y se
registra el número real, por tipo de tabla, antes y después.

- [ ] **Paso 1: Modo simulación, sin escribir**

```bash
npm run catalogo:relacional:simular
```

Imprime cuántas categorías, imágenes, atributos, valores, filas privadas y precios se
crearían, y la lista de productos rechazados con su motivo. Abre una transacción y hace
`rollback` siempre, para que la simulación ejercite las restricciones de verdad.

- [ ] **Paso 2: Importación real**

```bash
npm run catalogo:relacional:importar
```

- [ ] **Paso 3: Segunda pasada, para demostrar idempotencia**

Se vuelve a ejecutar y se comparan los conteos y una huella del contenido —excluidas las
marcas de tiempo— antes y después. Tienen que ser idénticos.

- [ ] **Paso 4: Commit**

```bash
git commit -m "feat(catalogo): importador idempotente al modelo relacional"
```

---

## Tarea 7: Verificación de la importación

**Archivos:**
- Modificar: `scripts/verificar-catalogo-relacional.mjs`

- [ ] **Paso 1: Comprobar campo a campo**

1. todos los productos de `products` tienen su fila privada, sus categorías y su imagen
   principal, sin ninguno perdido ni duplicado;
2. los precios coinciden con `price_gtq` convertido a centavos enteros;
3. las imágenes coinciden en número, orden y principal;
4. cada producto tiene exactamente una categoría principal;
5. los valores de atributo coinciden con las siete claves aprobadas y con su número;
6. la proyección pública no contiene **ningún** identificador de proveedor;
7. `supplier_code` se puede buscar desde administración.

- [ ] **Paso 2: Commit**

```bash
git commit -m "test(catalogo): verificacion campo a campo de la importacion"
```

---

## Tarea 8: Batería completa y documentación

- [ ] **Paso 1: Ejecutar todo**

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

Playwright se ejecuta una sola vez y **se inspecciona el informe antes de repetirlo**. En
este worktree faltan `.env.local` y `DATABASE_URL`, así que hay cinco fallos conocidos por
ausencia de precios; hay que confirmar que son esos y no otros.

- [ ] **Paso 2: Actualizar `CLAUDE.md` y `docs/CONTINUAR-PANEL.md`**

Estado real: qué se aplicó, dónde, con qué conteos, y que `modelo_catalogo` sigue en
`legacy`.

- [ ] **Paso 3: Commit**

```bash
git commit -m "docs(catalogo): estado de la fase B tras la importacion verificada"
```

---

## Lo que esta fase NO hace

- No activa `shadow` (fase C) ni `relational_v2` (fase D).
- No cambia `modelo_catalogo`, que sigue en `legacy`.
- No engancha ninguna página ni acción del panel al modelo nuevo.
- No escribe en Producción, no hace push, no fusiona y no despliega.
- No borra ninguna rama de Neon ni ningún archivo.
