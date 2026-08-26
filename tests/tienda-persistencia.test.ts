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
