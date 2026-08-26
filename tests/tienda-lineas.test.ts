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
