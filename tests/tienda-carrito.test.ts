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
  assert.deepEqual(
    lineas.map((linea) => linea.econoluzReference),
    [REF, OTRA],
  );
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
