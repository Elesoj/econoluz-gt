import assert from "node:assert/strict";
import { test } from "node:test";

import { CANTIDAD_MAXIMA_POR_LINEA } from "../app/tienda/carrito";
import {
  decidirFusion,
  fusionarLineas,
  type ProductoDelCatalogo,
} from "../app/tienda/carritoServidor";

const producto = (
  referencia: string,
  extra: Partial<ProductoDelCatalogo> = {},
): ProductoDelCatalogo => ({
  productId: `id-${referencia.toLowerCase()}`,
  econoluzReference: referencia,
  publicado: true,
  precioCentavos: 12500,
  ...extra,
});

const catalogoCon = (...productos: ProductoDelCatalogo[]) =>
  new Map(productos.map((p) => [p.econoluzReference, p]));

// --- La suma ---------------------------------------------------------------------------

test("sin nada guardado, el carrito local pasa entero", () => {
  const { lineas, descartes } = fusionarLineas(
    [],
    [{ econoluzReference: "ECO-ELE-0001", cantidad: 3 }],
    catalogoCon(producto("ECO-ELE-0001")),
  );

  assert.deepEqual(lineas, [
    { productId: "id-eco-ele-0001", econoluzReference: "ECO-ELE-0001", cantidad: 3 },
  ]);
  assert.deepEqual(descartes, []);
});

test("las cantidades del mismo producto se suman, no se sustituyen", () => {
  const { lineas } = fusionarLineas(
    [{ productId: "id-eco-ele-0001", econoluzReference: "ECO-ELE-0001", cantidad: 2 }],
    [{ econoluzReference: "ECO-ELE-0001", cantidad: 3 }],
    catalogoCon(producto("ECO-ELE-0001")),
  );

  assert.equal(lineas.length, 1);
  assert.equal(lineas[0].cantidad, 5);
});

test("lo guardado que no viene en el local se conserva", () => {
  const { lineas } = fusionarLineas(
    [{ productId: "id-eco-ele-0002", econoluzReference: "ECO-ELE-0002", cantidad: 4 }],
    [{ econoluzReference: "ECO-ELE-0001", cantidad: 1 }],
    catalogoCon(producto("ECO-ELE-0001"), producto("ECO-ELE-0002")),
  );

  assert.deepEqual(
    lineas.map((l) => [l.econoluzReference, l.cantidad]),
    [["ECO-ELE-0002", 4], ["ECO-ELE-0001", 1]],
    "primero lo guardado, en su orden, y después lo nuevo",
  );
});

test("un carrito local vacio deja el guardado tal cual", () => {
  const { lineas, descartes } = fusionarLineas(
    [{ productId: "id-eco-ele-0001", econoluzReference: "ECO-ELE-0001", cantidad: 7 }],
    [],
    catalogoCon(producto("ECO-ELE-0001")),
  );

  assert.deepEqual(lineas.map((l) => l.cantidad), [7]);
  assert.deepEqual(descartes, []);
});

test("una referencia repetida en el carrito local se suma una sola vez", () => {
  const { lineas } = fusionarLineas(
    [],
    [
      { econoluzReference: "ECO-ELE-0001", cantidad: 2 },
      { econoluzReference: "ECO-ELE-0001", cantidad: 3 },
    ],
    catalogoCon(producto("ECO-ELE-0001")),
  );

  assert.equal(lineas.length, 1);
  assert.equal(lineas[0].cantidad, 5);
});

// --- El tope ---------------------------------------------------------------------------

test("la suma se recorta al tope, no se rechaza la linea entera", () => {
  const { lineas } = fusionarLineas(
    [{ productId: "id-eco-ele-0001", econoluzReference: "ECO-ELE-0001", cantidad: 900 }],
    [{ econoluzReference: "ECO-ELE-0001", cantidad: 900 }],
    catalogoCon(producto("ECO-ELE-0001")),
  );

  assert.equal(lineas[0].cantidad, CANTIDAD_MAXIMA_POR_LINEA);
});

test("el tope es el mismo que el del carrito local", () => {
  assert.equal(CANTIDAD_MAXIMA_POR_LINEA, 999);
});

// --- Los descartes ---------------------------------------------------------------------

test("un producto que ya no existe se descarta y se dice", () => {
  const { lineas, descartes } = fusionarLineas(
    [],
    [{ econoluzReference: "ECO-XXX-9999", cantidad: 2 }],
    catalogoCon(producto("ECO-ELE-0001")),
  );

  assert.deepEqual(lineas, []);
  assert.deepEqual(descartes, [{ econoluzReference: "ECO-XXX-9999", motivo: "inexistente" }]);
});

test("un producto despublicado se descarta", () => {
  const { lineas, descartes } = fusionarLineas(
    [],
    [{ econoluzReference: "ECO-ELE-0001", cantidad: 2 }],
    catalogoCon(producto("ECO-ELE-0001", { publicado: false })),
  );

  assert.deepEqual(lineas, []);
  assert.deepEqual(descartes, [{ econoluzReference: "ECO-ELE-0001", motivo: "despublicado" }]);
});

test("un producto sin precio vigente se descarta: sin precio no se compra", () => {
  const { lineas, descartes } = fusionarLineas(
    [],
    [{ econoluzReference: "ECO-ELE-0001", cantidad: 2 }],
    catalogoCon(producto("ECO-ELE-0001", { precioCentavos: null })),
  );

  assert.deepEqual(lineas, []);
  assert.deepEqual(descartes, [{ econoluzReference: "ECO-ELE-0001", motivo: "sin-precio" }]);
});

/**
 * El descarte también alcanza a lo ya guardado: si un producto dejó de venderse mientras
 * el carrito dormía, no puede quedarse dentro esperando a un checkout que no podría
 * cobrarlo. Se descarta y se avisa, que es distinto de borrarlo en silencio.
 */
test("lo guardado tambien se descarta si el producto dejo de venderse", () => {
  const { lineas, descartes } = fusionarLineas(
    [{ productId: "id-eco-ele-0001", econoluzReference: "ECO-ELE-0001", cantidad: 4 }],
    [],
    catalogoCon(producto("ECO-ELE-0001", { publicado: false })),
  );

  assert.deepEqual(lineas, []);
  assert.deepEqual(descartes, [{ econoluzReference: "ECO-ELE-0001", motivo: "despublicado" }]);
});

test("un descarte no arrastra al resto del carrito", () => {
  const { lineas, descartes } = fusionarLineas(
    [],
    [
      { econoluzReference: "ECO-ELE-0001", cantidad: 2 },
      { econoluzReference: "ECO-XXX-9999", cantidad: 1 },
      { econoluzReference: "ECO-ELE-0002", cantidad: 5 },
    ],
    catalogoCon(producto("ECO-ELE-0001"), producto("ECO-ELE-0002")),
  );

  assert.deepEqual(lineas.map((l) => l.econoluzReference), ["ECO-ELE-0001", "ECO-ELE-0002"]);
  assert.equal(descartes.length, 1);
});

/**
 * Que el precio haya cambiado no descarta nada: el carrito guarda qué y cuánto, y el
 * importe se recalcula al pintarlo. Lo único que importa es que **haya** precio.
 */
test("un precio distinto del de ayer no cambia la linea", () => {
  const { lineas, descartes } = fusionarLineas(
    [{ productId: "id-eco-ele-0001", econoluzReference: "ECO-ELE-0001", cantidad: 2 }],
    [],
    catalogoCon(producto("ECO-ELE-0001", { precioCentavos: 99900 })),
  );

  assert.deepEqual(lineas.map((l) => l.cantidad), [2]);
  assert.deepEqual(descartes, []);
  assert.equal(
    Object.keys(lineas[0]).includes("precioCentavos"),
    false,
    "la linea del carrito no lleva precio",
  );
});

test("una cantidad que no es un entero positivo no entra", () => {
  const { lineas } = fusionarLineas(
    [],
    [
      { econoluzReference: "ECO-ELE-0001", cantidad: 0 },
      { econoluzReference: "ECO-ELE-0002", cantidad: -3 },
    ],
    catalogoCon(producto("ECO-ELE-0001"), producto("ECO-ELE-0002")),
  );

  assert.deepEqual(lineas, []);
});

// --- La idempotencia -------------------------------------------------------------------

test("un token nuevo aplica la fusion", () => {
  assert.deepEqual(decidirFusion({ fusionToken: null }, "tok-1"), { accion: "fusionar" });
  assert.deepEqual(decidirFusion({ fusionToken: "tok-0" }, "tok-1"), { accion: "fusionar" });
});

test("repetir el mismo token devuelve lo que ya hay, sin volver a sumar", () => {
  assert.deepEqual(decidirFusion({ fusionToken: "tok-1" }, "tok-1"), { accion: "ya-aplicada" });
});

test("sin carrito guardado todavia, cualquier token fusiona", () => {
  assert.deepEqual(decidirFusion(null, "tok-1"), { accion: "fusionar" });
});
