# Carrito de la tienda — plan de implementación

> **Para quien ejecute esto:** los pasos llevan casilla (`- [ ]`) para ir
> marcándolos. Cada tarea termina con algo probado y commiteado.

**Objetivo:** que el catálogo de ECONOLUZ permita meter productos con precio en
un carrito, ver el total en quetzales y recuperarlo al volver otro día.

**Arquitectura:** un motor propio en `app/tienda/`, separado del de cotización,
que guarda solo referencias y cantidades. Los precios se resuelven siempre
contra el catálogo del servidor. El estado vive en un store de módulo con
`useSyncExternalStore`, el mismo patrón que ya usa `floatingQuoteStore.ts`, para
que el contador de la barra de navegación y la página del carrito compartan
estado sin pasar props por todo el árbol.

**Stack:** Next.js 16 App Router, React 19, TypeScript estricto, Tailwind v4,
`node:test` para unidad, Playwright para navegador.

**Spec:** `docs/superpowers/specs/2026-08-26-tienda-carrito-design.md`

## Restricciones globales

- **Español de España** en comentarios, mensajes de commit y textos de interfaz.
- **El catálogo público no revela al proveedor.** Nada de marca, serie ni código
  del proveedor puede bajar al navegador (`app/data/publicProduct.ts` es la
  frontera).
- **La huella del catálogo está congelada.** Los campos nuevos de
  `PublicProduct` son opcionales, nunca `null`, o `tests/fixtures` deja de
  cuadrar.
- **Ningún importe que venga del navegador se acepta como bueno.** El navegador
  guarda referencia y cantidad; el precio se lee del catálogo del servidor.
- **Tener precio es estar a la venta.** No hay casilla aparte.
- **Dinero en centavos enteros** para las sumas; `formatPrice` solo al pintar.
- **No hacer push ni desplegar** sin confirmación explícita del dueño.
- Las pruebas de unidad nuevas se añaden al script `test:admin` de
  `package.json`; las de navegador, a `testMatch` en `playwright.config.ts`.
- Playwright levanta su propio servidor en el puerto 3100: **cerrar cualquier
  `npm run dev` abierto** antes de lanzarlo.

---

### Cambio respecto al spec

El spec describía un **cajón lateral** para el carrito. Se sustituye por una
**página `/carrito`**, con el contador en la barra de navegación enlazando a
ella. Razones: el cajón obligaría a cargar el catálogo entero en todas las
páginas del sitio para poder pintar nombres y precios; la página lo carga solo
donde hace falta, se prueba más fácil y es el peldaño natural hacia `/checkout`,
que será otra página. El cajón se puede añadir encima más adelante sin tocar el
motor.

---

## Tarea 1: El reductor del carrito

Lógica pura: qué líneas tiene el carrito y cómo cambian. Sin React, sin
navegador, sin precios.

**Archivos:**
- Crear: `app/tienda/carrito.ts`
- Crear: `tests/tienda-carrito.test.ts`
- Modificar: `package.json` (script `test:admin`)

**Interfaces que produce:**

```ts
export type LineaCarrito = { econoluzReference: string; cantidad: number };
export type AccionCarrito =
  | { tipo: "agregar"; econoluzReference: string; cantidad?: number }
  | { tipo: "quitar"; econoluzReference: string }
  | { tipo: "fijar"; econoluzReference: string; cantidad: number }
  | { tipo: "vaciar" };
export const CANTIDAD_MAXIMA_POR_LINEA = 999;
export const reducirCarrito: (lineas: readonly LineaCarrito[], accion: AccionCarrito) => LineaCarrito[];
export const contarArticulos: (lineas: readonly LineaCarrito[]) => number;
```

- [ ] **Paso 1: escribir la prueba que falla**

Crear `tests/tienda-carrito.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CANTIDAD_MAXIMA_POR_LINEA,
  contarArticulos,
  reducirCarrito,
  type LineaCarrito,
} from "../app/tienda/carrito";

const REF = "ECO-IND-0048";
const OTRA = "ECO-CAT-0132";

test("agregar mete una unidad de un producto que no estaba", () => {
  assert.deepEqual(reducirCarrito([], { tipo: "agregar", econoluzReference: REF }), [
    { econoluzReference: REF, cantidad: 1 },
  ]);
});

test("agregar dos veces el mismo producto suma, no duplica la línea", () => {
  const uno = reducirCarrito([], { tipo: "agregar", econoluzReference: REF });
  const dos = reducirCarrito(uno, { tipo: "agregar", econoluzReference: REF });
  assert.deepEqual(dos, [{ econoluzReference: REF, cantidad: 2 }]);
});

test("agregar respeta el orden en que se fueron metiendo", () => {
  let lineas: LineaCarrito[] = [];
  lineas = reducirCarrito(lineas, { tipo: "agregar", econoluzReference: REF });
  lineas = reducirCarrito(lineas, { tipo: "agregar", econoluzReference: OTRA });
  assert.deepEqual(lineas.map((linea) => linea.econoluzReference), [REF, OTRA]);
});

test("agregar acepta una cantidad concreta", () => {
  const lineas = reducirCarrito([], {
    tipo: "agregar",
    econoluzReference: REF,
    cantidad: 4,
  });
  assert.deepEqual(lineas, [{ econoluzReference: REF, cantidad: 4 }]);
});

test("fijar a cero borra la línea", () => {
  const lineas = reducirCarrito([{ econoluzReference: REF, cantidad: 3 }], {
    tipo: "fijar",
    econoluzReference: REF,
    cantidad: 0,
  });
  assert.deepEqual(lineas, []);
});

test("quitar borra la línea entera aunque tuviera muchas unidades", () => {
  const lineas = reducirCarrito([{ econoluzReference: REF, cantidad: 9 }], {
    tipo: "quitar",
    econoluzReference: REF,
  });
  assert.deepEqual(lineas, []);
});

test("vaciar deja el carrito sin nada", () => {
  const lineas = reducirCarrito(
    [
      { econoluzReference: REF, cantidad: 2 },
      { econoluzReference: OTRA, cantidad: 1 },
    ],
    { tipo: "vaciar" },
  );
  assert.deepEqual(lineas, []);
});

test("una cantidad inválida no cambia nada", () => {
  // Nadie escribe esto a mano, pero el valor llega de un <input> y de
  // localStorage, y los dos pueden traer basura.
  const previo: LineaCarrito[] = [{ econoluzReference: REF, cantidad: 2 }];
  for (const cantidad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(
      reducirCarrito(previo, { tipo: "fijar", econoluzReference: REF, cantidad }),
      previo,
    );
  }
});

test("la cantidad por línea tiene tope", () => {
  const lineas = reducirCarrito([], {
    tipo: "fijar",
    econoluzReference: REF,
    cantidad: CANTIDAD_MAXIMA_POR_LINEA + 1,
  });
  assert.deepEqual(lineas, []);
});

test("agregar sobre el tope se queda en el tope", () => {
  const lleno: LineaCarrito[] = [
    { econoluzReference: REF, cantidad: CANTIDAD_MAXIMA_POR_LINEA },
  ];
  assert.equal(reducirCarrito(lleno, { tipo: "agregar", econoluzReference: REF }), lleno);
});

test("actuar sobre un producto que no está en el carrito no hace nada", () => {
  const previo: LineaCarrito[] = [{ econoluzReference: REF, cantidad: 1 }];
  assert.equal(reducirCarrito(previo, { tipo: "quitar", econoluzReference: OTRA }), previo);
});

test("contar artículos suma todas las unidades", () => {
  assert.equal(
    contarArticulos([
      { econoluzReference: REF, cantidad: 2 },
      { econoluzReference: OTRA, cantidad: 3 },
    ]),
    5,
  );
  assert.equal(contarArticulos([]), 0);
});
```

Nota sobre los `assert.equal(resultado, previo)` de las pruebas de «no cambia
nada»: comparan por identidad a propósito. El reductor debe devolver **el mismo
array** cuando no hay cambio, para que React no vuelva a pintar de balde.

- [ ] **Paso 2: comprobar que falla**

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/tienda-carrito.test.ts
```

Esperado: falla al no encontrar `../app/tienda/carrito`.

- [ ] **Paso 3: escribir el reductor**

Crear `app/tienda/carrito.ts`:

```ts
/**
 * El carrito de la tienda.
 *
 * Guarda referencias y cantidades, nunca precios: el precio se resuelve contra
 * el catálogo del servidor cada vez que se pinta o se cobra. Si el importe
 * viajara en el navegador, cualquiera podría editar su propio carrito y
 * comprar un panel por un quetzal.
 *
 * Es gemelo del motor de cotización (`app/catalogo/quoteSelection.ts`) y a
 * propósito no lo reutiliza: la cotización no sabe de dinero ni de existencias
 * y no debe cargar con ello.
 */

export type LineaCarrito = {
  econoluzReference: string;
  cantidad: number;
};

export type AccionCarrito =
  | { tipo: "agregar"; econoluzReference: string; cantidad?: number }
  | { tipo: "quitar"; econoluzReference: string }
  | { tipo: "fijar"; econoluzReference: string; cantidad: number }
  | { tipo: "vaciar" };

/**
 * Tope por línea. No es una regla de negocio: es un freno para que un `<input>`
 * manipulado no genere un pedido de un millón de unidades. Quien necesite más
 * de novecientas noventa y nueve piezas está haciendo un proyecto, y para eso
 * está la asesoría.
 */
export const CANTIDAD_MAXIMA_POR_LINEA = 999;

const esCantidadValida = (cantidad: number) =>
  Number.isSafeInteger(cantidad) &&
  cantidad >= 1 &&
  cantidad <= CANTIDAD_MAXIMA_POR_LINEA;

const esReferenciaValida = (referencia: unknown): referencia is string =>
  typeof referencia === "string" && referencia.length > 0;

export const contarArticulos = (lineas: readonly LineaCarrito[]) =>
  lineas.reduce((total, linea) => total + linea.cantidad, 0);

export const reducirCarrito = (
  lineas: readonly LineaCarrito[],
  accion: AccionCarrito,
): LineaCarrito[] => {
  if (accion.tipo === "vaciar") {
    return lineas.length === 0 ? (lineas as LineaCarrito[]) : [];
  }

  if (!esReferenciaValida(accion.econoluzReference)) {
    return lineas as LineaCarrito[];
  }

  const indice = lineas.findIndex(
    (linea) => linea.econoluzReference === accion.econoluzReference,
  );

  if (accion.tipo === "quitar") {
    return indice < 0
      ? (lineas as LineaCarrito[])
      : lineas.filter((_, posicion) => posicion !== indice);
  }

  const cantidadPedida =
    accion.tipo === "agregar"
      ? (accion.cantidad ?? 1) + (indice < 0 ? 0 : lineas[indice].cantidad)
      : accion.cantidad;

  // Fijar a cero es la forma de borrar desde el selector de cantidad.
  if (accion.tipo === "fijar" && cantidadPedida === 0) {
    return indice < 0
      ? (lineas as LineaCarrito[])
      : lineas.filter((_, posicion) => posicion !== indice);
  }

  if (!esCantidadValida(cantidadPedida)) {
    return lineas as LineaCarrito[];
  }

  if (indice < 0) {
    return [
      ...lineas,
      { econoluzReference: accion.econoluzReference, cantidad: cantidadPedida },
    ];
  }

  if (lineas[indice].cantidad === cantidadPedida) {
    return lineas as LineaCarrito[];
  }

  return lineas.map((linea, posicion) =>
    posicion === indice ? { ...linea, cantidad: cantidadPedida } : linea,
  );
};
```

- [ ] **Paso 4: comprobar que pasa**

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/tienda-carrito.test.ts
```

Esperado: todas en verde.

- [ ] **Paso 5: registrar la prueba en `package.json`**

Añadir `tests/tienda-carrito.test.ts` al final de la lista del script
`test:admin`, después de `tests/admin-project-upload.test.ts`.

- [ ] **Paso 6: commit**

```bash
git add app/tienda/carrito.ts tests/tienda-carrito.test.ts package.json
git commit -m "feat(tienda): reductor del carrito"
```

---

## Tarea 2: Las existencias bajan al navegador

`PublicProduct` necesita saber cuántas unidades hay apuntadas para poder avisar
del plazo. Es un cambio en la frontera pública del catálogo, así que va con sus
propias pruebas antes de que nadie lo consuma.

**Archivos:**
- Modificar: `app/data/publicProduct.ts` (tipo `PublicProduct`, tipo
  `PublicProductExtras`, función `toPublicProduct`)
- Modificar: `app/data/catalog.server.ts` (la consulta y el mapeo)
- Modificar: `tests/catalogo-precio-publico.test.ts`
- Modificar: `package.json` no hace falta: esa prueba ya está registrada.

**Interfaces que produce:** `PublicProduct.stock?: number` y
`PublicProductExtras.stock?: number | null`.

- [ ] **Paso 1: escribir las pruebas que fallan**

Añadir al final de `tests/catalogo-precio-publico.test.ts`:

```ts
test("un producto sin existencias apuntadas sale exactamente igual que antes", () => {
  // Mismo motivo que con el precio: un `stock: null` en los 313 productos
  // rompería la huella congelada del catálogo sin que nada haya cambiado.
  assert.equal("stock" in toPublicProduct(UNO), false);
  assert.equal("stock" in toPublicProduct(UNO, { stock: null }), false);
});

test("las existencias apuntadas llegan al catálogo público", () => {
  assert.equal(toPublicProduct(UNO, { stock: 12 }).stock, 12);
});

test("cero existencias es un dato y se publica", () => {
  // Cero significa «se agotó», que no es lo mismo que «no lo he contado».
  assert.equal(toPublicProduct(UNO, { stock: 0 }).stock, 0);
});

test("unas existencias que no son un entero no se publican", () => {
  assert.equal("stock" in toPublicProduct(UNO, { stock: Number.NaN }), false);
  assert.equal("stock" in toPublicProduct(UNO, { stock: 2.5 }), false);
});
```

- [ ] **Paso 2: comprobar que falla**

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/catalogo-precio-publico.test.ts
```

Esperado: fallan las cuatro nuevas; las de precio siguen en verde.

- [ ] **Paso 3: añadir el campo**

En `app/data/publicProduct.ts`, dentro del tipo `PublicProduct`, justo después
de `priceGtq`:

```ts
  /**
   * Unidades apuntadas en el panel.
   *
   * Opcional por el mismo motivo que `priceGtq`, y con una distinción que
   * importa: que no exista significa «no se ha contado el inventario», que es
   * distinto de `0`, que significa «se agotó». La tienda solo avisa del plazo
   * cuando hay un número apuntado; sin él no promete nada.
   */
  stock?: number;
```

En el tipo `PublicProductExtras`:

```ts
export type PublicProductExtras = {
  priceGtq?: number | null;
  stock?: number | null;
};
```

Y en `toPublicProduct`, justo después del bloque que publica `priceGtq`:

```ts
  // Las existencias tienen que ser un entero: media luminaria no existe.
  if (typeof extras?.stock === "number" && Number.isSafeInteger(extras.stock)) {
    publicProduct.stock = extras.stock;
  }
```

- [ ] **Paso 4: leerlo de la base de datos**

En `app/data/catalog.server.ts`, cambiar la consulta:

```ts
const catalogQuery = `
  select ${CATALOG_COLUMNS.join(", ")}, price_gtq, stock
  from products
  where published
  order by position
`;
```

El tipo de las filas:

```ts
  const rows = (await sql.query(catalogQuery)) as (CatalogRow & {
    price_gtq: string | number | null;
    stock: number | null;
  })[];
```

Y el mapeo:

```ts
  return rows.map((row) =>
    toPublicProduct(fromProductRow(row), {
      // `Number(null)` es cero, y cero significaría "regalado": el producto sin
      // precio tiene que llegar como `null`, no como 0.
      priceGtq: row.price_gtq === null ? null : Number(row.price_gtq),
      // `integer` sí llega como número, al contrario que `numeric`.
      stock: row.stock,
    }),
  );
```

- [ ] **Paso 5: comprobar que pasa**

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/catalogo-precio-publico.test.ts
```

```bash
npm run typecheck
```

- [ ] **Paso 6: comprobar que la frontera del proveedor sigue intacta**

```bash
npm run catalogo:auditar
```

Esperado: sin fugas. `stock` no dice nada del proveedor, pero la consulta se ha
tocado y esta comprobación es barata.

- [ ] **Paso 7: commit**

```bash
git add app/data/publicProduct.ts app/data/catalog.server.ts tests/catalogo-precio-publico.test.ts
git commit -m "feat(catálogo): las existencias bajan al navegador"
```

---

## Tarea 3: Emparejar con el catálogo y sumar

Convierte líneas sueltas en líneas con producto y dinero. Aquí entra el precio
del servidor y aquí se decide qué línea caducó.

**Archivos:**
- Crear: `app/tienda/lineas.ts`
- Crear: `tests/tienda-lineas.test.ts`
- Modificar: `package.json` (script `test:admin`)

**Interfaces que consume:** `LineaCarrito` de `app/tienda/carrito.ts` (Tarea 1);
`PublicProduct` con `stock` de `app/data/publicProduct.ts` (Tarea 2).

**Interfaces que produce:**

```ts
export type LineaResuelta = {
  producto: PublicProduct;
  cantidad: number;
  precioCentavos: number;
  subtotalCentavos: number;
  superaExistencias: boolean;
};
export type CarritoResuelto = {
  lineas: LineaResuelta[];
  descartadas: string[];
  totalCentavos: number;
};
export const aCentavos: (quetzales: number) => number;
export const aQuetzales: (centavos: number) => number;
export const resolverCarrito: (
  lineas: readonly LineaCarrito[],
  catalogo: readonly PublicProduct[],
) => CarritoResuelto;
```

- [ ] **Paso 1: escribir la prueba que falla**

Crear `tests/tienda-lineas.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import type { PublicProduct } from "../app/data/publicProduct";
import { aCentavos, aQuetzales, resolverCarrito } from "../app/tienda/lineas";

const producto = (
  econoluzReference: string,
  extras: Partial<PublicProduct> = {},
): PublicProduct => ({
  id: econoluzReference.toLowerCase(),
  econoluzReference,
  publicName: `Luminaria ${econoluzReference}`,
  publicDescription: "",
  image: "/imagen.jpg",
  productType: "industrial",
  application: "bodegas",
  finish: "negro",
  labels: { productType: "Industrial", application: "Bodegas", finish: "Negro" },
  ...extras,
});

test("una línea con precio se resuelve con su subtotal", () => {
  const resuelto = resolverCarrito(
    [{ econoluzReference: "ECO-IND-0048", cantidad: 3 }],
    [producto("ECO-IND-0048", { priceGtq: 125.5 })],
  );

  assert.equal(resuelto.lineas.length, 1);
  assert.equal(resuelto.lineas[0].precioCentavos, 12550);
  assert.equal(resuelto.lineas[0].subtotalCentavos, 37650);
  assert.equal(resuelto.totalCentavos, 37650);
  assert.deepEqual(resuelto.descartadas, []);
});

test("el total suma varias líneas sin errores de céntimos", () => {
  // 12.30 + 4.15 en coma flotante da 16.450000000000003; en centavos, 1645.
  const resuelto = resolverCarrito(
    [
      { econoluzReference: "A", cantidad: 1 },
      { econoluzReference: "B", cantidad: 1 },
    ],
    [producto("A", { priceGtq: 12.3 }), producto("B", { priceGtq: 4.15 })],
  );

  assert.equal(resuelto.totalCentavos, 1645);
  assert.equal(aQuetzales(resuelto.totalCentavos), 16.45);
});

test("un producto que ya no está en el catálogo se descarta", () => {
  const resuelto = resolverCarrito(
    [{ econoluzReference: "ECO-FANTASMA", cantidad: 2 }],
    [producto("ECO-IND-0048", { priceGtq: 100 })],
  );

  assert.deepEqual(resuelto.lineas, []);
  assert.deepEqual(resuelto.descartadas, ["ECO-FANTASMA"]);
  assert.equal(resuelto.totalCentavos, 0);
});

test("un producto que se quedó sin precio se descarta", () => {
  // Tener precio es estar a la venta: sin precio no se puede comprar.
  const resuelto = resolverCarrito(
    [{ econoluzReference: "ECO-IND-0048", cantidad: 1 }],
    [producto("ECO-IND-0048")],
  );

  assert.deepEqual(resuelto.descartadas, ["ECO-IND-0048"]);
});

test("una línea descartada no rompe las demás", () => {
  const resuelto = resolverCarrito(
    [
      { econoluzReference: "ECO-FANTASMA", cantidad: 1 },
      { econoluzReference: "ECO-IND-0048", cantidad: 2 },
    ],
    [producto("ECO-IND-0048", { priceGtq: 50 })],
  );

  assert.equal(resuelto.lineas.length, 1);
  assert.equal(resuelto.totalCentavos, 10000);
});

test("pedir más de lo que hay apuntado se marca, pero no se bloquea", () => {
  const resuelto = resolverCarrito(
    [{ econoluzReference: "ECO-IND-0048", cantidad: 10 }],
    [producto("ECO-IND-0048", { priceGtq: 20, stock: 3 })],
  );

  assert.equal(resuelto.lineas[0].superaExistencias, true);
  assert.equal(resuelto.lineas[0].cantidad, 10);
});

test("sin existencias apuntadas no se avisa de nada", () => {
  // Casilla vacía significa «no sé cuántos hay», no «no hay ninguno».
  const resuelto = resolverCarrito(
    [{ econoluzReference: "ECO-IND-0048", cantidad: 99 }],
    [producto("ECO-IND-0048", { priceGtq: 20 })],
  );

  assert.equal(resuelto.lineas[0].superaExistencias, false);
});

test("pedir justo lo que hay no avisa", () => {
  const resuelto = resolverCarrito(
    [{ econoluzReference: "ECO-IND-0048", cantidad: 3 }],
    [producto("ECO-IND-0048", { priceGtq: 20, stock: 3 })],
  );

  assert.equal(resuelto.lineas[0].superaExistencias, false);
});

test("el precio cero es un precio y se puede comprar", () => {
  const resuelto = resolverCarrito(
    [{ econoluzReference: "ECO-IND-0048", cantidad: 2 }],
    [producto("ECO-IND-0048", { priceGtq: 0 })],
  );

  assert.equal(resuelto.lineas.length, 1);
  assert.equal(resuelto.totalCentavos, 0);
});

test("los centavos redondean al céntimo más cercano", () => {
  assert.equal(aCentavos(0.1 + 0.2), 30);
  assert.equal(aCentavos(1250.555), 125056);
});
```

- [ ] **Paso 2: comprobar que falla**

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/tienda-lineas.test.ts
```

- [ ] **Paso 3: escribir el módulo**

Crear `app/tienda/lineas.ts`:

```ts
import type { PublicProduct } from "../data/publicProduct";
import type { LineaCarrito } from "./carrito";

/**
 * Empareja las líneas del carrito con el catálogo del servidor y suma.
 *
 * El dinero se maneja en centavos enteros de principio a fin. Sumar quetzales
 * en coma flotante acumula errores que acaban saliendo en pantalla como un
 * céntimo que no cuadra, y en una factura eso no se puede explicar.
 */

export type LineaResuelta = {
  producto: PublicProduct;
  cantidad: number;
  precioCentavos: number;
  subtotalCentavos: number;
  /** Se pidió más de lo apuntado en existencias. Avisa; no bloquea. */
  superaExistencias: boolean;
};

export type CarritoResuelto = {
  lineas: LineaResuelta[];
  /** Referencias que estaban guardadas y ya no se pueden comprar. */
  descartadas: string[];
  totalCentavos: number;
};

export const aCentavos = (quetzales: number) => Math.round(quetzales * 100);

export const aQuetzales = (centavos: number) => centavos / 100;

export const resolverCarrito = (
  lineas: readonly LineaCarrito[],
  catalogo: readonly PublicProduct[],
): CarritoResuelto => {
  const porReferencia = new Map(
    catalogo.map((producto) => [producto.econoluzReference, producto]),
  );

  const resueltas: LineaResuelta[] = [];
  const descartadas: string[] = [];
  let totalCentavos = 0;

  for (const linea of lineas) {
    const producto = porReferencia.get(linea.econoluzReference);

    // Sin producto o sin precio no hay compra posible. Se descarta esa línea
    // y se sigue: una referencia caducada no puede tumbar el carrito entero.
    if (!producto || typeof producto.priceGtq !== "number") {
      descartadas.push(linea.econoluzReference);
      continue;
    }

    const precioCentavos = aCentavos(producto.priceGtq);
    const subtotalCentavos = precioCentavos * linea.cantidad;

    resueltas.push({
      producto,
      cantidad: linea.cantidad,
      precioCentavos,
      subtotalCentavos,
      // Existencias sin apuntar significa «no sé cuántos hay», no «no hay
      // ninguno»: en ese caso no se avisa de un plazo que nadie ha calculado.
      superaExistencias:
        typeof producto.stock === "number" && linea.cantidad > producto.stock,
    });

    totalCentavos += subtotalCentavos;
  }

  return { lineas: resueltas, descartadas, totalCentavos };
};
```

- [ ] **Paso 4: comprobar que pasa**

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/tienda-lineas.test.ts
```

- [ ] **Paso 5: registrar en `package.json`** — añadir `tests/tienda-lineas.test.ts` al script `test:admin`.

- [ ] **Paso 6: commit**

```bash
git add app/tienda/lineas.ts tests/tienda-lineas.test.ts package.json
git commit -m "feat(tienda): emparejar el carrito con el catálogo y sumar en centavos"
```

---

## Tarea 4: Que el carrito sobreviva a cerrar el navegador

**Archivos:**
- Crear: `app/tienda/carritoPersistencia.ts`
- Crear: `tests/tienda-persistencia.test.ts`
- Modificar: `package.json` (script `test:admin`)

**Interfaces que consume:** `LineaCarrito` de `app/tienda/carrito.ts`.

**Interfaces que produce:**

```ts
export const CARRITO_STORAGE_KEY = "econoluz_carrito";
export type AlmacenCarrito = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type LecturaCarrito =
  | { estado: "ok"; lineas: LineaCarrito[] }
  | { estado: "fallo" };
export type EscrituraCarrito = "escrito" | "borrado" | "sin-cambios" | "fallo";
export const parsearCarritoGuardado: (serializado: string | null) => LineaCarrito[];
export const leerCarrito: (almacen: AlmacenCarrito) => LecturaCarrito;
export const guardarCarrito: (
  almacen: AlmacenCarrito,
  lineas: readonly LineaCarrito[],
) => EscrituraCarrito;
```

- [ ] **Paso 1: escribir la prueba que falla**

Crear `tests/tienda-persistencia.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import type { LineaCarrito } from "../app/tienda/carrito";
import {
  CARRITO_STORAGE_KEY,
  guardarCarrito,
  leerCarrito,
  parsearCarritoGuardado,
  type AlmacenCarrito,
} from "../app/tienda/carritoPersistencia";

/** Un localStorage de mentira, para no necesitar navegador. */
const almacenDePrueba = (inicial: Record<string, string> = {}) => {
  const datos = new Map(Object.entries(inicial));
  return {
    getItem: (clave: string) => datos.get(clave) ?? null,
    setItem: (clave: string, valor: string) => {
      datos.set(clave, valor);
    },
    removeItem: (clave: string) => {
      datos.delete(clave);
    },
    datos,
  };
};

/** Un almacén que revienta, como el de un navegador en modo privado. */
const almacenRoto: AlmacenCarrito = {
  getItem: () => {
    throw new Error("bloqueado");
  },
  setItem: () => {
    throw new Error("bloqueado");
  },
  removeItem: () => {
    throw new Error("bloqueado");
  },
};

const LINEAS: LineaCarrito[] = [
  { econoluzReference: "ECO-IND-0048", cantidad: 2 },
  { econoluzReference: "ECO-CAT-0132", cantidad: 1 },
];

test("lo guardado se recupera igual", () => {
  const almacen = almacenDePrueba();
  assert.equal(guardarCarrito(almacen, LINEAS), "escrito");
  assert.deepEqual(leerCarrito(almacen), { estado: "ok", lineas: LINEAS });
});

test("un carrito vacío borra la clave en vez de guardar un array vacío", () => {
  const almacen = almacenDePrueba();
  guardarCarrito(almacen, LINEAS);
  assert.equal(guardarCarrito(almacen, []), "borrado");
  assert.equal(almacen.datos.has(CARRITO_STORAGE_KEY), false);
});

test("guardar lo mismo dos veces no vuelve a escribir", () => {
  const almacen = almacenDePrueba();
  guardarCarrito(almacen, LINEAS);
  assert.equal(guardarCarrito(almacen, LINEAS), "sin-cambios");
});

test("un almacén bloqueado no revienta: el carrito funciona sin persistir", () => {
  assert.deepEqual(leerCarrito(almacenRoto), { estado: "fallo" });
  assert.equal(guardarCarrito(almacenRoto, LINEAS), "fallo");
});

test("sin nada guardado, el carrito está vacío", () => {
  assert.deepEqual(leerCarrito(almacenDePrueba()), { estado: "ok", lineas: [] });
});

test("basura guardada no rompe nada", () => {
  assert.deepEqual(parsearCarritoGuardado("esto no es json"), []);
  assert.deepEqual(parsearCarritoGuardado("null"), []);
  assert.deepEqual(parsearCarritoGuardado('{"otra":"forma"}'), []);
  assert.deepEqual(parsearCarritoGuardado('{"lineas":"no es lista"}'), []);
});

test("las líneas inválidas de dentro se tiran, las buenas se quedan", () => {
  const guardado = JSON.stringify({
    lineas: [
      { econoluzReference: "ECO-IND-0048", cantidad: 2 },
      { econoluzReference: "", cantidad: 3 },
      { econoluzReference: "ECO-MAL", cantidad: -1 },
      { econoluzReference: "ECO-MAL-2", cantidad: 1.5 },
      { cantidad: 4 },
      "ni siquiera es un objeto",
    ],
  });

  assert.deepEqual(parsearCarritoGuardado(guardado), [
    { econoluzReference: "ECO-IND-0048", cantidad: 2 },
  ]);
});

test("una referencia repetida se suma en una sola línea", () => {
  const guardado = JSON.stringify({
    lineas: [
      { econoluzReference: "ECO-IND-0048", cantidad: 2 },
      { econoluzReference: "ECO-IND-0048", cantidad: 3 },
    ],
  });

  assert.deepEqual(parsearCarritoGuardado(guardado), [
    { econoluzReference: "ECO-IND-0048", cantidad: 5 },
  ]);
});

test("una cantidad guardada por encima del tope se recorta al tope", () => {
  const guardado = JSON.stringify({
    lineas: [{ econoluzReference: "ECO-IND-0048", cantidad: 5000 }],
  });

  assert.deepEqual(parsearCarritoGuardado(guardado), [
    { econoluzReference: "ECO-IND-0048", cantidad: 999 },
  ]);
});
```

- [ ] **Paso 2: comprobar que falla**

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/tienda-persistencia.test.ts
```

- [ ] **Paso 3: escribir la persistencia**

Crear `app/tienda/carritoPersistencia.ts`:

```ts
import { CANTIDAD_MAXIMA_POR_LINEA, type LineaCarrito } from "./carrito";

/**
 * El carrito guardado en el navegador.
 *
 * Va en `localStorage` y no en `sessionStorage` —donde vive la selección de
 * cotización— porque comprar rara vez se hace de una sentada: se mira hoy y se
 * decide mañana. Se guardan solo referencias y cantidades; los precios se
 * resuelven después contra el catálogo del servidor.
 *
 * Todo lo que se lee de aquí es dato ajeno: lo puede haber escrito una versión
 * vieja de la web, otra pestaña, o una persona trasteando con las herramientas
 * del navegador. Se valida línea a línea y lo que no cuadra se tira sin ruido.
 */

export const CARRITO_STORAGE_KEY = "econoluz_carrito";

export type AlmacenCarrito = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type LecturaCarrito =
  | { estado: "ok"; lineas: LineaCarrito[] }
  | { estado: "fallo" };

export type EscrituraCarrito = "escrito" | "borrado" | "sin-cambios" | "fallo";

const esObjeto = (valor: unknown): valor is Record<string, unknown> =>
  typeof valor === "object" && valor !== null && !Array.isArray(valor);

export const parsearCarritoGuardado = (
  serializado: string | null,
): LineaCarrito[] => {
  if (serializado === null) {
    return [];
  }

  let contenido: unknown;

  try {
    contenido = JSON.parse(serializado) as unknown;
  } catch {
    return [];
  }

  if (!esObjeto(contenido) || !Array.isArray(contenido.lineas)) {
    return [];
  }

  const porReferencia = new Map<string, number>();

  for (const guardada of contenido.lineas) {
    if (!esObjeto(guardada)) {
      continue;
    }

    const { econoluzReference, cantidad } = guardada;

    if (
      typeof econoluzReference !== "string" ||
      econoluzReference.length === 0 ||
      typeof cantidad !== "number" ||
      !Number.isSafeInteger(cantidad) ||
      cantidad < 1
    ) {
      continue;
    }

    const acumulada = (porReferencia.get(econoluzReference) ?? 0) + cantidad;
    porReferencia.set(
      econoluzReference,
      Math.min(acumulada, CANTIDAD_MAXIMA_POR_LINEA),
    );
  }

  return [...porReferencia].map(([econoluzReference, cantidad]) => ({
    econoluzReference,
    cantidad,
  }));
};

export const leerCarrito = (almacen: AlmacenCarrito): LecturaCarrito => {
  try {
    return {
      estado: "ok",
      lineas: parsearCarritoGuardado(almacen.getItem(CARRITO_STORAGE_KEY)),
    };
  } catch {
    // Modo privado, almacenamiento bloqueado por el usuario o cuota agotada.
    // No es un error del que haya que informar a nadie: el carrito funcionará
    // durante la visita y simplemente no se recordará.
    return { estado: "fallo" };
  }
};

export const guardarCarrito = (
  almacen: AlmacenCarrito,
  lineas: readonly LineaCarrito[],
): EscrituraCarrito => {
  const deseado =
    lineas.length === 0
      ? null
      : JSON.stringify({
          lineas: lineas.map((linea) => ({
            econoluzReference: linea.econoluzReference,
            cantidad: linea.cantidad,
          })),
        });

  try {
    if (almacen.getItem(CARRITO_STORAGE_KEY) === deseado) {
      return "sin-cambios";
    }

    if (deseado === null) {
      almacen.removeItem(CARRITO_STORAGE_KEY);
      return "borrado";
    }

    almacen.setItem(CARRITO_STORAGE_KEY, deseado);
    return "escrito";
  } catch {
    return "fallo";
  }
};
```

- [ ] **Paso 4: comprobar que pasa**

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/tienda-persistencia.test.ts
```

- [ ] **Paso 5: registrar en `package.json`** — añadir `tests/tienda-persistencia.test.ts` al script `test:admin`.

- [ ] **Paso 6: commit**

```bash
git add app/tienda/carritoPersistencia.ts tests/tienda-persistencia.test.ts package.json
git commit -m "feat(tienda): el carrito sobrevive a cerrar el navegador"
```

---

## Tarea 5: El estado compartido

El contador de la barra de navegación y la página del carrito tienen que ver lo
mismo sin ser parientes en el árbol de React. Se resuelve con un store de
módulo y `useSyncExternalStore`, que es el patrón que el proyecto ya usa en
`app/catalogo/floatingQuoteStore.ts`.

**Archivos:**
- Crear: `app/tienda/carritoStore.ts`
- Crear: `app/tienda/useCarrito.ts`

**Interfaces que consume:** `reducirCarrito`, `contarArticulos`,
`LineaCarrito`, `AccionCarrito` (Tarea 1); `leerCarrito`, `guardarCarrito`
(Tarea 4).

**Interfaces que produce:**

```ts
// carritoStore.ts
export const obtenerLineas: () => readonly LineaCarrito[];
export const obtenerLineasDelServidor: () => readonly LineaCarrito[];
export const suscribirse: (oyente: () => void) => () => void;
export const despachar: (accion: AccionCarrito) => void;
export const hidratar: () => void;

// useCarrito.ts
export default function useCarrito(): {
  lineas: readonly LineaCarrito[];
  articulos: number;
  agregar: (econoluzReference: string, cantidad?: number) => void;
  quitar: (econoluzReference: string) => void;
  fijar: (econoluzReference: string, cantidad: number) => void;
  vaciar: () => void;
  cantidadDe: (econoluzReference: string) => number;
};
```

- [ ] **Paso 1: escribir el store**

Crear `app/tienda/carritoStore.ts`:

```ts
import { reducirCarrito, type AccionCarrito, type LineaCarrito } from "./carrito";
import { guardarCarrito, leerCarrito } from "./carritoPersistencia";

/**
 * El carrito, vivo, compartido por toda la aplicación.
 *
 * Es un store de módulo con suscripción, el mismo patrón que
 * `app/catalogo/floatingQuoteStore.ts`, y no un contexto de React: el contador
 * vive en la barra de navegación y las líneas en la página del carrito, que no
 * son parientes en el árbol. Un contexto obligaría a envolver el layout entero
 * y a convertir en cliente páginas que hoy se sirven desde el servidor.
 */

/** Un carrito vacío, siempre el mismo objeto: `useSyncExternalStore` compara
 *  las instantáneas por identidad y un array nuevo en cada llamada haría que
 *  React volviera a pintar sin descanso. */
const VACIO: readonly LineaCarrito[] = Object.freeze([]);

let lineas: readonly LineaCarrito[] = VACIO;
let hidratado = false;
const oyentes = new Set<() => void>();

const avisar = () => {
  oyentes.forEach((oyente) => oyente());
};

export const obtenerLineas = () => lineas;

/** En el servidor el carrito siempre está vacío: vive en el navegador de cada
 *  visitante. Devolver otra cosa provocaría un desajuste al hidratar. */
export const obtenerLineasDelServidor = () => VACIO;

export const suscribirse = (oyente: () => void) => {
  oyentes.add(oyente);

  return () => {
    oyentes.delete(oyente);
  };
};

const persistir = () => {
  try {
    guardarCarrito(window.localStorage, lineas);
  } catch {
    // `window.localStorage` puede lanzar solo con acceder. Sin persistencia,
    // el carrito sigue funcionando durante la visita.
  }
};

/**
 * Lee el carrito guardado. Se llama desde un efecto, nunca durante el render:
 * el servidor no tiene `localStorage` y cambiar el estado mientras se pinta
 * rompería la hidratación de React.
 */
export const hidratar = () => {
  if (hidratado) {
    return;
  }

  hidratado = true;

  let guardadas: readonly LineaCarrito[] = VACIO;

  try {
    const lectura = leerCarrito(window.localStorage);
    guardadas = lectura.estado === "ok" ? lectura.lineas : VACIO;
  } catch {
    return;
  }

  if (guardadas.length === 0) {
    return;
  }

  // Lo que el visitante haya metido antes de que termine la hidratación manda:
  // se conserva encima de lo guardado, no al revés.
  lineas = lineas.length === 0 ? guardadas : lineas;
  avisar();
};

export const despachar = (accion: AccionCarrito) => {
  const siguientes = reducirCarrito(lineas, accion);

  if (siguientes === lineas) {
    return;
  }

  lineas = siguientes;
  persistir();
  avisar();
};
```

- [ ] **Paso 2: escribir el hook**

Crear `app/tienda/useCarrito.ts`:

```ts
"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { contarArticulos } from "./carrito";
import {
  despachar,
  hidratar,
  obtenerLineas,
  obtenerLineasDelServidor,
  suscribirse,
} from "./carritoStore";

export default function useCarrito() {
  const lineas = useSyncExternalStore(
    suscribirse,
    obtenerLineas,
    obtenerLineasDelServidor,
  );

  useEffect(() => {
    hidratar();
  }, []);

  const agregar = useCallback(
    (econoluzReference: string, cantidad?: number) =>
      despachar({ tipo: "agregar", econoluzReference, cantidad }),
    [],
  );

  const quitar = useCallback(
    (econoluzReference: string) => despachar({ tipo: "quitar", econoluzReference }),
    [],
  );

  const fijar = useCallback(
    (econoluzReference: string, cantidad: number) =>
      despachar({ tipo: "fijar", econoluzReference, cantidad }),
    [],
  );

  const vaciar = useCallback(() => despachar({ tipo: "vaciar" }), []);

  const cantidades = useMemo(
    () => new Map(lineas.map((linea) => [linea.econoluzReference, linea.cantidad])),
    [lineas],
  );

  const cantidadDe = useCallback(
    (econoluzReference: string) => cantidades.get(econoluzReference) ?? 0,
    [cantidades],
  );

  return {
    lineas,
    articulos: contarArticulos(lineas),
    agregar,
    quitar,
    fijar,
    vaciar,
    cantidadDe,
  };
}
```

- [ ] **Paso 3: comprobar que compila y no rompe nada**

```bash
npm run typecheck
```

```bash
npm run lint
```

- [ ] **Paso 4: commit**

```bash
git add app/tienda/carritoStore.ts app/tienda/useCarrito.ts
git commit -m "feat(tienda): estado compartido del carrito"
```

Nota: este store no lleva prueba de unidad propia. Su lógica —el reductor y la
persistencia— ya está cubierta en las tareas 1 y 4, y lo que queda es el pegamento
con React, que se comprueba de verdad en la prueba de navegador de la Tarea 9.

---

## Tarea 6: El contador en la barra de navegación

**Archivos:**
- Crear: `app/tienda/CarritoContador.tsx`
- Modificar: `app/components/SiteNavbar.tsx` (insertar el contador antes del
  bloque del CTA, alrededor de la línea 235)

**Interfaces que consume:** `useCarrito` (Tarea 5).

- [ ] **Paso 1: escribir el componente**

Crear `app/tienda/CarritoContador.tsx`:

```tsx
"use client";

import Link from "next/link";
import useCarrito from "./useCarrito";

/**
 * El acceso al carrito desde la barra de navegación.
 *
 * Solo aparece cuando hay algo dentro: un icono de carrito vacío colgado en
 * todas las páginas es ruido, y en un sitio donde la mayoría del catálogo
 * todavía no tiene precio, sería ruido casi siempre.
 */
export default function CarritoContador() {
  const { articulos } = useCarrito();

  if (articulos === 0) {
    return null;
  }

  return (
    <Link
      href="/carrito"
      className="inline-flex h-11 items-center gap-2 rounded-full border border-neutral-300 px-4 text-sm font-semibold text-proyectos transition hover:border-proyectos hover:bg-neutral-50"
      aria-label={`Ver el carrito, ${articulos} ${articulos === 1 ? "artículo" : "artículos"}`}
    >
      <span aria-hidden="true">Carrito</span>
      <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-tienda px-1.5 text-xs text-white tabular-nums">
        {articulos}
      </span>
    </Link>
  );
}
```

- [ ] **Paso 2: colocarlo en la barra**

En `app/components/SiteNavbar.tsx`, importar el componente junto a los demás
imports:

```tsx
import CarritoContador from "../tienda/CarritoContador";
```

Y meterlo justo **antes** del bloque del CTA de escritorio, es decir, antes de
la línea que abre `<div className="hidden min-w-[7.25rem] items-center justify-end gap-3 md:flex">`:

```tsx
        <div className="flex items-center justify-end">
          <CarritoContador />
        </div>
```

Va fuera del bloque `hidden md:flex` a propósito: en el móvil el CTA se esconde
dentro del menú desplegable, pero el carrito tiene que verse siempre que tenga
algo, sin abrir ningún menú.

- [ ] **Paso 3: comprobar**

```bash
npm run typecheck
```

Esperado: sin errores. Todavía no se puede ver en pantalla porque nada añade
productos al carrito: eso llega en la Tarea 8.

- [ ] **Paso 4: commit**

```bash
git add app/tienda/CarritoContador.tsx app/components/SiteNavbar.tsx
git commit -m "feat(tienda): contador del carrito en la barra de navegación"
```

---

## Tarea 7: La página del carrito

**Archivos:**
- Crear: `app/carrito/page.tsx`
- Crear: `app/carrito/CarritoCliente.tsx`

**Interfaces que consume:** `getPublicCatalog` de `app/data/catalog.server.ts`;
`resolverCarrito` y `aQuetzales` (Tarea 3); `useCarrito` (Tarea 5);
`formatPrice` de `app/lib/formatters.ts`.

- [ ] **Paso 1: la página de servidor**

Crear `app/carrito/page.tsx`:

```tsx
import type { Metadata } from "next";
import SiteFooter from "../components/SiteFooter";
import SiteNavbar from "../components/SiteNavbar";
import { getPublicCatalog } from "../data/catalog.server";
import { mainNavItems } from "../data/siteData";
import CarritoCliente from "./CarritoCliente";

export const metadata: Metadata = {
  title: "Carrito",
  description: "Los productos que has seleccionado para comprar en ECONOLUZ.",
};

/**
 * El carrito vive en el navegador de cada visitante, pero los precios no: se
 * cargan aquí, en el servidor, y se emparejan con las referencias guardadas.
 * Así el importe que se ve es siempre el vigente, y no el que se guardó el día
 * que el visitante metió el producto.
 */
export default async function Carrito() {
  return (
    <main className="min-h-screen bg-white text-black">
      <SiteNavbar
        items={mainNavItems}
        ctaHref="/#contacto"
        ctaLabel="Contacto"
        mobileCtaLabel="Solicitar asesoría"
      />

      <CarritoCliente productos={await getPublicCatalog()} />

      <SiteFooter />
    </main>
  );
}
```

- [ ] **Paso 2: la parte de cliente**

Crear `app/carrito/CarritoCliente.tsx`:

```tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";
import type { PublicProduct } from "../data/publicProduct";
import { formatPrice } from "../lib/formatters";
import { CANTIDAD_MAXIMA_POR_LINEA } from "../tienda/carrito";
import { aQuetzales, resolverCarrito } from "../tienda/lineas";
import useCarrito from "../tienda/useCarrito";

type CarritoClienteProps = {
  productos: PublicProduct[];
};

export default function CarritoCliente({ productos }: CarritoClienteProps) {
  const { lineas, fijar, quitar, cantidadDe } = useCarrito();

  const resuelto = useMemo(
    () => resolverCarrito(lineas, productos),
    [lineas, productos],
  );

  return (
    <section className="mx-auto w-full max-w-4xl px-4 pb-24 pt-28 sm:px-6">
      <h1 className="text-2xl font-semibold sm:text-3xl">Tu carrito</h1>

      {resuelto.descartadas.length > 0 && (
        <p className="mt-4 border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600">
          {resuelto.descartadas.length === 1
            ? "Un producto que tenías guardado ya no está disponible y se ha quitado del carrito."
            : `${resuelto.descartadas.length} productos que tenías guardados ya no están disponibles y se han quitado del carrito.`}
        </p>
      )}

      {resuelto.lineas.length === 0 ? (
        <div className="mt-10 border border-neutral-200 p-8 text-center">
          <p className="text-sm text-neutral-600">
            Todavía no has agregado nada.
          </p>
          <Link
            href="/catalogo"
            className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-tienda px-6 text-sm font-semibold text-white transition hover:bg-tienda-fuerte"
          >
            Ver el catálogo
          </Link>
        </div>
      ) : (
        <>
          <ul className="mt-8 divide-y divide-neutral-200 border-y border-neutral-200">
            {resuelto.lineas.map((linea) => (
              <li
                key={linea.producto.econoluzReference}
                className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center"
              >
                <div className="relative aspect-square w-20 shrink-0 overflow-hidden bg-white">
                  <Image
                    src={linea.producto.image}
                    alt={linea.producto.publicName}
                    fill
                    sizes="80px"
                    className="object-contain"
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-tight">
                    {linea.producto.publicName}
                  </p>
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
                    Ref. {linea.producto.econoluzReference}
                  </p>
                  <p className="mt-1 text-sm tabular-nums text-neutral-600">
                    {formatPrice(aQuetzales(linea.precioCentavos))} por unidad
                  </p>
                  {linea.superaExistencias && (
                    <p className="mt-2 text-xs font-semibold text-tienda">
                      Pediste más de las que tenemos en bodega: puede tardar unos
                      días.
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <label className="sr-only" htmlFor={`cantidad-${linea.producto.id}`}>
                    Cantidad de {linea.producto.publicName}
                  </label>
                  <input
                    id={`cantidad-${linea.producto.id}`}
                    type="number"
                    min={1}
                    max={CANTIDAD_MAXIMA_POR_LINEA}
                    value={cantidadDe(linea.producto.econoluzReference)}
                    onChange={(evento) =>
                      fijar(
                        linea.producto.econoluzReference,
                        Number(evento.target.value),
                      )
                    }
                    className="h-10 w-20 rounded-full border border-neutral-300 px-3 text-center text-sm tabular-nums"
                  />
                  <p className="w-28 text-right text-sm font-semibold tabular-nums">
                    {formatPrice(aQuetzales(linea.subtotalCentavos))}
                  </p>
                  <button
                    type="button"
                    onClick={() => quitar(linea.producto.econoluzReference)}
                    className="text-xs font-semibold text-neutral-500 underline transition hover:text-black"
                  >
                    Quitar
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-col items-end gap-4">
            <p className="text-lg font-semibold tabular-nums">
              Total: {formatPrice(aQuetzales(resuelto.totalCentavos))}
            </p>

            {/* El pago en línea llega con la pasarela. Hasta entonces el botón
                se ve pero no promete nada que la web no pueda cumplir. */}
            <button
              type="button"
              disabled
              className="inline-flex h-12 items-center justify-center rounded-full bg-tienda px-8 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Ir a pagar
            </button>
            <p className="text-xs text-neutral-500">
              El pago en línea está en preparación. Mientras tanto, escríbenos y
              cerramos el pedido por WhatsApp.
            </p>
          </div>
        </>
      )}
    </section>
  );
}
```

- [ ] **Paso 3: comprobar**

```bash
npm run typecheck
```

```bash
npm run lint
```

- [ ] **Paso 4: commit**

```bash
git add app/carrito/page.tsx app/carrito/CarritoCliente.tsx
git commit -m "feat(tienda): página del carrito con totales del servidor"
```

---

## Tarea 8: Un camino por producto en la tarjeta

Es el cambio que el visitante ve. La tarjeta decide sola: con precio, se compra;
sin precio, se cotiza.

**Archivos:**
- Modificar: `app/components/ProductCard.tsx`
- Modificar: `app/catalogo/CatalogClient.tsx` (alrededor de la línea 515)

**Interfaces que consume:** `useCarrito` (Tarea 5).

- [ ] **Paso 1: ampliar las props de la tarjeta**

En `app/components/ProductCard.tsx`, cambiar el tipo de props:

```tsx
type ProductCardProps = {
  product: PublicProduct;
  /** Unidades en la selección de cotización. */
  quantity?: number;
  /** Unidades en el carrito de compra. */
  cartQuantity?: number;
  onAdd: () => void;
  onDecrease: () => void;
  onAddToCart: () => void;
  onDecreaseFromCart: () => void;
  onViewDetails: () => void;
};

export default function ProductCard({
  product,
  quantity = 0,
  cartQuantity = 0,
  onAdd,
  onDecrease,
  onAddToCart,
  onDecreaseFromCart,
  onViewDetails,
}: ProductCardProps) {
```

- [ ] **Paso 2: bifurcar los botones**

Sustituir el bloque `{quantity > 0 ? (...) : (...)}` que hay dentro de
`<div className="mt-auto grid gap-2 pt-4">` por este, dejando el botón «Ficha
técnica» tal cual está encima:

```tsx
          {/* Tener precio es estar a la venta: ese producto se compra. El que
              no lo tiene sigue el camino de siempre, el de la cotización. Los
              dos botones a la vez obligarían al visitante a elegir sin saber
              en qué se diferencian. */}
          {typeof product.priceGtq === "number" ? (
            cartQuantity > 0 ? (
              <div className="inline-flex h-9 w-full items-center justify-between rounded-full bg-tienda text-xs font-semibold text-white">
                <button
                  type="button"
                  onClick={onDecreaseFromCart}
                  className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-white/12"
                  aria-label={`Quitar una unidad de ${product.publicName} del carrito`}
                >
                  -
                </button>
                <span className="min-w-0 text-center">
                  En el carrito ({cartQuantity})
                </span>
                <button
                  type="button"
                  onClick={onAddToCart}
                  className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-white/12"
                  aria-label={`Agregar una unidad de ${product.publicName} al carrito`}
                >
                  +
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onAddToCart}
                className="inline-flex h-9 w-full items-center justify-center rounded-full bg-tienda px-3 text-xs font-semibold text-white transition hover:bg-tienda-fuerte"
              >
                Agregar al carrito
              </button>
            )
          ) : quantity > 0 ? (
            <div className="inline-flex h-9 w-full items-center justify-between rounded-full bg-proyectos text-xs font-semibold text-white">
              <button
                type="button"
                onClick={onDecrease}
                className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-white/12"
                aria-label={`Quitar una unidad de ${product.publicName}`}
              >
                -
              </button>
              <span className="min-w-0 text-center">Agregado ({quantity})</span>
              <button
                type="button"
                onClick={onAdd}
                className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-white/12"
                aria-label={`Agregar una unidad de ${product.publicName}`}
              >
                +
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onAdd}
              className="inline-flex h-9 w-full items-center justify-center rounded-full bg-proyectos px-3 text-xs font-semibold text-white transition hover:opacity-90"
            >
              Agregar a cotización
            </button>
          )}
```

Dos detalles del texto: el botón de cotización pasa de decir «Agregar» a decir
«Agregar a cotización», porque ahora convive con otro que también agrega; y
cambia de color al azul de proyectos, para que se distinga del rojo de tienda
que lleva el de compra.

- [ ] **Paso 3: conectarla en el catálogo**

En `app/catalogo/CatalogClient.tsx`, importar el hook junto a los demás imports:

```tsx
import useCarrito from "../tienda/useCarrito";
```

Dentro del componente, junto a la llamada a `useQuoteSelection` (línea 72
aproximadamente):

```tsx
  const {
    agregar: agregarAlCarrito,
    fijar: fijarEnCarrito,
    cantidadDe: cantidadEnCarrito,
  } = useCarrito();
```

Y en el `<ProductCard>` (línea 515 aproximadamente), añadir las tres props
nuevas sin tocar las que ya están:

```tsx
                    <ProductCard
                      key={product.id}
                      product={product}
                      quantity={selectedItem?.quantity}
                      cartQuantity={cantidadEnCarrito(product.econoluzReference)}
                      onAdd={() => addToQuote(product, false)}
                      onDecrease={() =>
                        decreaseQuoteProduct(product.econoluzReference)
                      }
                      onAddToCart={() =>
                        agregarAlCarrito(product.econoluzReference)
                      }
                      onDecreaseFromCart={() =>
                        fijarEnCarrito(
                          product.econoluzReference,
                          cantidadEnCarrito(product.econoluzReference) - 1,
                        )
                      }
                      onViewDetails={() => setTechnicalProduct(product)}
                    />
```

Bajar la cantidad se hace con `fijar` y no con una acción «decrementar»: al
llegar a cero, `fijar` borra la línea, que es justo lo que tiene que pasar.

- [ ] **Paso 4: comprobar**

```bash
npm run typecheck
```

```bash
npm run lint
```

- [ ] **Paso 5: mirarlo en el navegador**

```bash
npm run dev
```

Con `DATABASE_URL` configurado en `.env.local`, abrir `/catalogo` y buscar
`ECO-IND-0048` —o cualquiera de los que ya tienen precio— para comprobar que
aparece «Agregar al carrito», que el contador de la barra sube y que `/carrito`
enseña la línea con su total. Cerrar el servidor al terminar: Playwright levanta
el suyo en el paso siguiente y los dos no pueden convivir.

- [ ] **Paso 6: commit**

```bash
git add app/components/ProductCard.tsx app/catalogo/CatalogClient.tsx
git commit -m "feat(catálogo): un camino por producto, comprar o cotizar"
```

---

## Tarea 9: Retirar la casilla que ya no manda, y probarlo entero

**Archivos:**
- Modificar: `app/admin/(panel)/productos/[referencia]/page.tsx` (quitar el
  control de `seVendeEnLinea`, alrededor de la línea 364)
- Crear: `tests/tienda-carrito.spec.ts`
- Modificar: `playwright.config.ts` (`testMatch`)

- [ ] **Paso 1: quitar la casilla del panel**

En `app/admin/(panel)/productos/[referencia]/page.tsx`, eliminar el bloque del
`<input name="seVendeEnLinea" ... />` junto con su etiqueta y el texto que lo
acompañe.

Motivo, para dejarlo claro a quien lo lea después: con la regla «tener precio es
estar a la venta», esa casilla ya no cambia nada, y un interruptor que no hace
nada es peor que no tenerlo — haría creer al dueño que un producto no está a la
venta cuando sí lo está.

**No se toca** `app/admin/productos/ficha.ts`: sigue leyendo y guardando la
columna, que se queda en la base de datos por si vuelve a hacer falta. Tampoco
se toca la base de datos.

- [ ] **Paso 2: comprobar que la ficha del panel sigue guardando**

```bash
npm run test:admin
```

Esperado: todo en verde, incluidas las pruebas de `admin-ficha-producto`.

- [ ] **Paso 3: escribir la prueba de navegador**

Crear `tests/tienda-carrito.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

/** `Q1,250.00`, el formato de precio del proyecto. */
const PRECIO = /^Q[\d.,]+$/;

/**
 * El recorrido completo del carrito. Es la única prueba que ejerce el pegamento
 * con React —el store compartido y la hidratación desde localStorage—, que la
 * lógica pura de las pruebas de unidad no puede tocar.
 */
test("comprar un producto con precio y encontrarlo al volver", async ({ page }) => {
  await page.goto("/catalogo");
  await page.getByRole("button", { name: "Mostrar todos los productos" }).click();

  const agregar = page.getByRole("button", { name: "Agregar al carrito" }).first();

  // Si ningún producto tiene precio, no hay tienda que probar. Se dice en voz
  // alta en vez de dar la prueba por buena: el catálogo se administra a mano y
  // un día puede amanecer sin precios.
  await expect(
    agregar,
    "ningún producto del catálogo tiene precio: marca alguno desde el panel",
  ).toBeVisible();

  await agregar.click();

  const contador = page.getByRole("link", { name: /Ver el carrito/ });
  await expect(contador).toBeVisible();

  await contador.click();
  await expect(page).toHaveURL(/\/carrito$/);

  await expect(page.getByRole("heading", { name: "Tu carrito" })).toBeVisible();
  await expect(page.getByText(/^Total: Q/)).toBeVisible();

  // Lo que de verdad se comprueba aquí: que el carrito sobrevive a recargar.
  await page.reload();
  await expect(page.getByText(/^Total: Q/)).toBeVisible();
});

test("cambiar la cantidad recalcula el total", async ({ page }) => {
  await page.goto("/catalogo");
  await page.getByRole("button", { name: "Mostrar todos los productos" }).click();
  await page.getByRole("button", { name: "Agregar al carrito" }).first().click();
  await page.getByRole("link", { name: /Ver el carrito/ }).click();

  const total = page.getByText(/^Total: Q/);
  const inicial = await total.textContent();

  await page.getByRole("spinbutton").first().fill("3");

  await expect(total).not.toHaveText(inicial ?? "");
  await expect(total).toHaveText(/^Total: Q/);
});

test("un producto sin precio sigue siendo de cotización, no de carrito", async ({
  page,
}) => {
  await page.goto("/catalogo");
  await page.getByRole("button", { name: "Mostrar todos los productos" }).click();

  // La regla «precio = a la venta» vista desde fuera: donde no hay precio, no
  // hay botón de compra.
  const sinPrecio = page
    .locator("article")
    .filter({ hasText: "Precio a consultar" })
    .first();

  await expect(sinPrecio).toBeVisible();
  await expect(
    sinPrecio.getByRole("button", { name: "Agregar al carrito" }),
  ).toHaveCount(0);
  await expect(
    sinPrecio.getByRole("button", { name: "Agregar a cotización" }),
  ).toBeVisible();
});

test("el carrito vacío no enseña contador en la barra", async ({ page }) => {
  await page.goto("/catalogo");
  await expect(page.getByRole("link", { name: /Ver el carrito/ })).toHaveCount(0);
});

test("la ficha técnica sigue enseñando el precio", async ({ page }) => {
  // Regresión: la Tarea 8 toca la tarjeta, y la ficha comparte producto.
  await page.goto("/catalogo");
  const search = page.getByLabel("Buscar en catálogo");
  await search.fill("ECO-IND-0048");
  await search.press("Enter");
  await page.getByRole("button", { name: /Ver ficha técnica/ }).click();

  await expect(
    page.getByText("Precio a consultar").or(page.getByText(PRECIO)).first(),
  ).toBeVisible();
});
```

- [ ] **Paso 4: registrar la prueba**

En `playwright.config.ts`, añadir `"tienda-carrito.spec.ts"` al array
`testMatch`, después de `"ui-botones.spec.ts"`.

- [ ] **Paso 5: pasar las pruebas de navegador**

Cerrar cualquier `npm run dev` abierto antes de lanzarlas.

```bash
npx playwright test tienda-carrito.spec.ts
```

Esperado: las cinco en verde. Si la primera falla diciendo que ningún producto
tiene precio, no es un fallo del código: hay que ponerle precio a algún producto
desde el panel.

- [ ] **Paso 6: pasar la suite entera**

```bash
npm run test:admin
```

```bash
npx playwright test
```

Esperado: todo en verde salvo `catalog-quote.spec.ts:891`, que **ya fallaba
antes de este trabajo** y no tiene relación con el carrito.

- [ ] **Paso 7: commit**

```bash
git add "app/admin/(panel)/productos/[referencia]/page.tsx" tests/tienda-carrito.spec.ts playwright.config.ts
git commit -m "feat(tienda): recorrido completo del carrito probado en navegador"
```

---

## Al terminar

- [ ] Actualizar `docs/CONTINUAR-PANEL.md`: el carrito está hecho, y lo
      siguiente del paso 2 es el checkout con datos fiscales.
- [ ] Anotar en `CLAUDE.md` la regla nueva del proyecto: **tener precio es estar
      a la venta**, y ningún importe que venga del navegador se acepta como bueno.
- [ ] Avisar al dueño de que, al desplegar, los productos con precio quedan a la
      venta automáticamente: conviene repasar esos precios antes.
- [ ] **No desplegar sin su confirmación explícita.**

