import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BYTES_MAXIMOS_DEL_CUERPO,
  LINEAS_MAXIMAS_POR_PETICION,
  validarCuerpoDeFusion,
  validarCuerpoDeLinea,
  validarReferencia,
} from "../app/tienda/carritoContratos";

// --- Referencias -----------------------------------------------------------------------

test("una referencia con la forma del catalogo se acepta", () => {
  assert.deepEqual(validarReferencia("ECO-ELE-0001"), { ok: true, valor: "ECO-ELE-0001" });
});

test("lo que no tiene forma de referencia se rechaza, no se intenta arreglar", () => {
  for (const basura of [
    "",
    "eco-ele-0001",
    "ECO-ELE-1",
    "ECO-ELE-00011",
    "ECO-ELECTRICO-0001",
    "ECO-ELE-0001; drop table carts",
    "  ECO-ELE-0001  ",
    123,
    null,
    undefined,
    { toString: () => "ECO-ELE-0001" },
  ]) {
    const resultado = validarReferencia(basura);
    assert.equal(resultado.ok, false, `«${String(basura)}» no deberia aceptarse`);
  }
});

// --- El cuerpo de fijar cantidad --------------------------------------------------------

test("fijar cantidad admite referencia y cantidad", () => {
  const resultado = validarCuerpoDeLinea({ econoluzReference: "ECO-ELE-0001", cantidad: 3 });
  assert.deepEqual(resultado, {
    ok: true,
    valor: { econoluzReference: "ECO-ELE-0001", cantidad: 3 },
  });
});

test("la cantidad tiene que ser un entero entre 1 y 999", () => {
  for (const cantidad of [0, -1, 1000, 2.5, Number.NaN, Number.POSITIVE_INFINITY, "3", null]) {
    const resultado = validarCuerpoDeLinea({ econoluzReference: "ECO-ELE-0001", cantidad });
    assert.equal(resultado.ok, false, `cantidad ${String(cantidad)} no deberia valer`);
    if (!resultado.ok) assert.equal(resultado.error, "cantidad-invalida");
  }
});

test("un cuerpo que no es un objeto se rechaza con su codigo", () => {
  for (const cuerpo of [null, undefined, "texto", 42, []]) {
    const resultado = validarCuerpoDeLinea(cuerpo);
    assert.equal(resultado.ok, false);
    if (!resultado.ok) assert.equal(resultado.error, "cuerpo-invalido");
  }
});

/**
 * La regla del proyecto: ningún importe que venga del navegador se acepta como bueno. No
 * basta con no leerlo; hay que demostrar que un cuerpo con precios se queda sin ellos.
 */
test("un precio enviado por el navegador se ignora, no se copia", () => {
  const resultado = validarCuerpoDeLinea({
    econoluzReference: "ECO-ELE-0001",
    cantidad: 2,
    precioCentavos: 1,
    priceGtq: 0.01,
    total: 0.02,
  });

  assert.equal(resultado.ok, true);
  if (resultado.ok) {
    assert.deepEqual(Object.keys(resultado.valor).sort(), ["cantidad", "econoluzReference"]);
  }
});

// --- El cuerpo de la fusión -------------------------------------------------------------

test("fusionar admite un token y una lista de lineas", () => {
  const resultado = validarCuerpoDeFusion({
    token: "0f3d9c2a-1111-4222-8333-444455556666",
    lineas: [{ econoluzReference: "ECO-ELE-0001", cantidad: 2 }],
  });

  assert.equal(resultado.ok, true);
  if (resultado.ok) {
    assert.equal(resultado.valor.token, "0f3d9c2a-1111-4222-8333-444455556666");
    assert.deepEqual(resultado.valor.lineas, [{ econoluzReference: "ECO-ELE-0001", cantidad: 2 }]);
  }
});

test("fusionar sin token no se acepta: sin token no hay idempotencia", () => {
  const resultado = validarCuerpoDeFusion({ lineas: [] });
  assert.equal(resultado.ok, false);
  if (!resultado.ok) assert.equal(resultado.error, "token-invalido");
});

test("un token que no es un identificador razonable se rechaza", () => {
  for (const token of ["", "x", "a".repeat(129), 42, null, "con espacios"]) {
    const resultado = validarCuerpoDeFusion({ token, lineas: [] });
    assert.equal(resultado.ok, false, `token ${String(token)} no deberia valer`);
  }
});

test("fusionar con la lista vacia es legitimo: el visitante no traia nada", () => {
  const resultado = validarCuerpoDeFusion({ token: "tok-de-prueba-1234", lineas: [] });
  assert.equal(resultado.ok, true);
});

/**
 * Una línea mala no tira la fusión entera: se descarta y el resto entra. El cliente
 * prefiere perder una línea rara a perder el carrito, y el servidor valida cada una.
 */
test("una linea con basura se descarta y las buenas pasan", () => {
  const resultado = validarCuerpoDeFusion({
    token: "tok-de-prueba-1234",
    lineas: [
      { econoluzReference: "ECO-ELE-0001", cantidad: 2 },
      { econoluzReference: "no-vale", cantidad: 1 },
      { econoluzReference: "ECO-ELE-0002", cantidad: 5000 },
      "ni siquiera es un objeto",
    ],
  });

  assert.equal(resultado.ok, true);
  if (resultado.ok) {
    assert.deepEqual(resultado.valor.lineas, [{ econoluzReference: "ECO-ELE-0001", cantidad: 2 }]);
  }
});

test("una peticion con demasiadas lineas se rechaza entera", () => {
  const lineas = Array.from({ length: LINEAS_MAXIMAS_POR_PETICION + 1 }, (_, i) => ({
    econoluzReference: `ECO-ELE-${String(i).padStart(4, "0")}`,
    cantidad: 1,
  }));

  const resultado = validarCuerpoDeFusion({ token: "tok-de-prueba-1234", lineas });
  assert.equal(resultado.ok, false);
  if (!resultado.ok) assert.equal(resultado.error, "demasiadas-lineas");
});

test("hay un tope de bytes para el cuerpo, y es modesto", () => {
  assert.ok(BYTES_MAXIMOS_DEL_CUERPO > 0);
  assert.ok(BYTES_MAXIMOS_DEL_CUERPO <= 64 * 1024);
});

// --- Los errores ------------------------------------------------------------------------

/**
 * Los errores salen como códigos, nunca como texto de PostgreSQL ni datos privados: un
 * mensaje de error es la vía más común por la que se escapa el nombre de una tabla, una
 * cadena de conexión o el código del proveedor.
 */
test("los codigos de error son cerrados y no llevan texto libre", () => {
  const resultado = validarCuerpoDeLinea({ econoluzReference: "no", cantidad: 1 });
  assert.equal(resultado.ok, false);
  if (!resultado.ok) {
    assert.equal(typeof resultado.error, "string");
    assert.equal(Object.keys(resultado).length, 2, "solo `ok` y `error`");
    assert.match(resultado.error, /^[a-z-]+$/);
  }
});
