import assert from "node:assert/strict";
import { test } from "node:test";
import { decidirDisponibilidad } from "../app/tienda/disponibilidad";

const REF = "ECO-IND-0048";

test("si hay de sobra, alcanza y no se dice cuántas hay", () => {
  const respuesta = decidirDisponibilidad(
    { econoluzReference: REF, cantidad: 3 },
    50,
  );

  assert.deepEqual(respuesta, { econoluzReference: REF, alcanza: true });
});

test("pedir justo lo que hay alcanza", () => {
  const respuesta = decidirDisponibilidad(
    { econoluzReference: REF, cantidad: 3 },
    3,
  );

  assert.equal(respuesta.alcanza, true);
  assert.equal("disponiblesAhora" in respuesta, false);
});

test("cuando no alcanza sí se dice cuántas hay", () => {
  // Es el único momento en que el número sale del servidor: el cliente lo
  // necesita para decidir entre llevarse esas o esperar por el resto.
  const respuesta = decidirDisponibilidad(
    { econoluzReference: REF, cantidad: 10 },
    3,
  );

  assert.deepEqual(respuesta, {
    econoluzReference: REF,
    alcanza: false,
    disponiblesAhora: 3,
  });
});

test("sin inventario apuntado se contesta que alcanza", () => {
  // `null` es «no se ha contado», que no es «no hay»: no se frena una venta
  // por un dato que nadie ha registrado.
  const respuesta = decidirDisponibilidad(
    { econoluzReference: REF, cantidad: 500 },
    null,
  );

  assert.deepEqual(respuesta, { econoluzReference: REF, alcanza: true });
});

test("agotado se contesta con cero disponibles", () => {
  const respuesta = decidirDisponibilidad(
    { econoluzReference: REF, cantidad: 1 },
    0,
  );

  assert.deepEqual(respuesta, {
    econoluzReference: REF,
    alcanza: false,
    disponiblesAhora: 0,
  });
});

test("un inventario con forma imposible no frena la compra", () => {
  for (const existencias of [Number.NaN, 2.5, Number.POSITIVE_INFINITY]) {
    assert.equal(
      decidirDisponibilidad({ econoluzReference: REF, cantidad: 9 }, existencias)
        .alcanza,
      true,
    );
  }
});
