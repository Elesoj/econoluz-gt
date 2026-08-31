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
    [producto("ECO-IND-0048", { priceGtq: 20 })],
    {
      "ECO-IND-0048": {
        econoluzReference: "ECO-IND-0048",
        alcanza: false,
        disponiblesAhora: 3,
      },
    },
  );

  assert.equal(resuelto.lineas[0].superaExistencias, true);
  assert.equal(resuelto.lineas[0].cantidad, 10);
  assert.equal(resuelto.lineas[0].disponiblesAhora, 3);
});

test("sin respuesta del servidor no se avisa de nada", () => {
  // Si el inventario no se ha podido consultar, el carrito no inventa plazos.
  const resuelto = resolverCarrito(
    [{ econoluzReference: "ECO-IND-0048", cantidad: 99 }],
    [producto("ECO-IND-0048", { priceGtq: 20 })],
  );

  assert.equal(resuelto.lineas[0].superaExistencias, false);
});

test("pedir justo lo que hay no avisa", () => {
  const resuelto = resolverCarrito(
    [{ econoluzReference: "ECO-IND-0048", cantidad: 3 }],
    [producto("ECO-IND-0048", { priceGtq: 20 })],
    {
      "ECO-IND-0048": { econoluzReference: "ECO-IND-0048", alcanza: true },
    },
  );

  assert.equal(resuelto.lineas[0].superaExistencias, false);
});

test("un precio que no es un importe comprable se descarta", () => {
  // `toPublicProduct` ya filtra esto antes de que el catálogo salga al
  // navegador, pero el motor del carrito no puede confiar en que siempre lo
  // llamen a él: cualquier `PublicProduct` construido por otro camino llegaría
  // aquí con lo que fuera. Cero significaría regalar el producto, y NaN o
  // Infinity envenenarían el total de todo el carrito.
  for (const invalido of [0, -1, -0.01, Number.NaN, Number.POSITIVE_INFINITY]) {
    const resuelto = resolverCarrito(
      [{ econoluzReference: "ECO-IND-0048", cantidad: 2 }],
      [producto("ECO-IND-0048", { priceGtq: invalido })],
    );

    assert.deepEqual(resuelto.lineas, [], `${invalido} no debería resolverse`);
    assert.deepEqual(resuelto.descartadas, ["ECO-IND-0048"]);
    assert.equal(resuelto.totalCentavos, 0);
  }
});

test("los precios positivos normales se resuelven igual que siempre", () => {
  for (const [precio, centavos] of [
    [0.01, 2],
    [125.5, 25100],
    [1250, 250000],
  ] as const) {
    const resuelto = resolverCarrito(
      [{ econoluzReference: "ECO-IND-0048", cantidad: 2 }],
      [producto("ECO-IND-0048", { priceGtq: precio })],
    );

    assert.equal(resuelto.lineas.length, 1);
    assert.equal(resuelto.totalCentavos, centavos);
    assert.deepEqual(resuelto.descartadas, []);
  }
});

test("la espera aceptada llega a la línea resuelta", () => {
  const resuelto = resolverCarrito(
    [{ econoluzReference: "ECO-IND-0048", cantidad: 10, esperaAceptada: true }],
    [producto("ECO-IND-0048", { priceGtq: 20 })],
    {
      "ECO-IND-0048": {
        econoluzReference: "ECO-IND-0048",
        alcanza: false,
        disponiblesAhora: 3,
      },
    },
  );

  assert.equal(resuelto.lineas[0].superaExistencias, true);
  assert.equal(resuelto.lineas[0].esperaAceptada, true);
});

test("una espera aceptada que ya no hace falta no se enseña", () => {
  // Si el inventario se repuso, o si bajó la cantidad, la línea deja de tener
  // nada que esperar aunque la marca siga guardada en el navegador.
  const resuelto = resolverCarrito(
    [{ econoluzReference: "ECO-IND-0048", cantidad: 2, esperaAceptada: true }],
    [producto("ECO-IND-0048", { priceGtq: 20 })],
    {
      "ECO-IND-0048": { econoluzReference: "ECO-IND-0048", alcanza: true },
    },
  );

  assert.equal(resuelto.lineas[0].superaExistencias, false);
  assert.equal(resuelto.lineas[0].esperaAceptada, false);
});

test("sin decidir nada, la línea que supera existencias queda pendiente", () => {
  const resuelto = resolverCarrito(
    [{ econoluzReference: "ECO-IND-0048", cantidad: 10 }],
    [producto("ECO-IND-0048", { priceGtq: 20 })],
    {
      "ECO-IND-0048": {
        econoluzReference: "ECO-IND-0048",
        alcanza: false,
        disponiblesAhora: 3,
      },
    },
  );

  assert.equal(resuelto.lineas[0].superaExistencias, true);
  assert.equal(resuelto.lineas[0].esperaAceptada, false);
  assert.equal(resuelto.lineas[0].disponiblesAhora, 3);
});

test("los centavos redondean al céntimo más cercano", () => {
  assert.equal(aCentavos(0.1 + 0.2), 30);
  assert.equal(aCentavos(1250.555), 125056);
});

test("un carrito antiguo con un producto sin precio lo descarta", () => {
  // El visitante guardó la referencia cuando la tarjeta ofrecía comprarla. Si
  // después se le quita el precio desde el panel, el catálogo del servidor deja
  // de traer `priceGtq` y la línea no puede resolverse: se descarta, se avisa
  // en pantalla y no suma al total. No hay forma de comprar por el precio
  // viejo, porque el precio viejo nunca estuvo en el navegador.
  const resuelto = resolverCarrito(
    [{ econoluzReference: "ECO-ELE-0001", cantidad: 4 }],
    [producto("ECO-ELE-0001")],
  );

  assert.deepEqual(resuelto.lineas, []);
  assert.deepEqual(resuelto.descartadas, ["ECO-ELE-0001"]);
  assert.equal(resuelto.totalCentavos, 0);
});

test("en un carrito mixto solo sobrevive lo que conserva su precio", () => {
  const resuelto = resolverCarrito(
    [
      { econoluzReference: "CON-PRECIO", cantidad: 2 },
      { econoluzReference: "SIN-PRECIO", cantidad: 7 },
    ],
    [producto("CON-PRECIO", { priceGtq: 50 }), producto("SIN-PRECIO")],
  );

  assert.equal(resuelto.lineas.length, 1);
  assert.equal(resuelto.lineas[0].producto.econoluzReference, "CON-PRECIO");
  assert.deepEqual(resuelto.descartadas, ["SIN-PRECIO"]);
  assert.equal(resuelto.totalCentavos, 10000);
});
