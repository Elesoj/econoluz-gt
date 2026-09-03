import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { estadoDelError } from "../app/tienda/carritoContratos";

/**
 * Vigila las rutas del carrito por su **texto**.
 *
 * Instanciarlas de verdad exige Next, Firebase y Neon a la vez, y una prueba que monta
 * todo eso comprueba sobre todo que el montaje funciona. Lo que no puede perderse sin que
 * salte algo es más concreto: que la sesión sale de la cookie y no del cuerpo, que las
 * mutaciones exigen mismo origen, que el cuerpo está acotado y que nada se sirve desde el
 * runtime equivocado. El comportamiento vivo lo cubren Playwright y las pruebas del
 * repositorio.
 */
const RAIZ = join(import.meta.dirname, "..");
const ruta = (...partes: string[]) =>
  readFileSync(join(RAIZ, "app", "api", "v1", "carrito", ...partes), "utf8");

const RUTAS = [
  ["carrito", ruta("route.ts")],
  ["carrito/linea", ruta("linea", "route.ts")],
  ["carrito/fusionar", ruta("fusionar", "route.ts")],
] as const;

test("todas las rutas del carrito corren en Node, no en edge", () => {
  for (const [nombre, fuente] of RUTAS) {
    assert.match(fuente, /export const runtime = "nodejs"/, `${nombre} sin runtime nodejs`);
  }
});

/**
 * La regla que no se puede relajar: el usuario se obtiene de la cookie de sesión
 * verificada. Aceptarlo del cuerpo convertiría el carrito ajeno en un campo más del JSON.
 *
 * Se comprueba en dos niveles porque la identidad vive en un solo sitio: las rutas piden
 * `usuarioDeLaSesion`, y esa función —y solo esa— consulta `leerClienteActual`.
 */
test("el usuario sale siempre de la sesion verificada", () => {
  const comun = readFileSync(join(RAIZ, "app", "api", "v1", "carrito", "comun.ts"), "utf8");
  assert.match(comun, /leerClienteActual/);

  for (const [nombre, fuente] of RUTAS) {
    assert.match(fuente, /usuarioDeLaSesion/, `${nombre} no pide la identidad de la sesion`);
    assert.equal(
      /userId\s*[:=]\s*(cuerpo|body|datos|valor)\./i.test(fuente),
      false,
      `${nombre} parece sacar el usuario del cuerpo`,
    );
  }
});

const COMUN = readFileSync(join(RAIZ, "app", "api", "v1", "carrito", "comun.ts"), "utf8");

test("sin sesion se responde 401, y esa decision vive en un solo sitio", () => {
  assert.match(COMUN, /"sin-sesion"/);
  for (const [nombre, fuente] of RUTAS) {
    assert.match(
      fuente,
      /if \(!sesion\.ok\) return fallar\(sesion\.error\)/,
      `${nombre} no corta cuando no hay sesion`,
    );
  }
});

/** Leer el carrito propio no necesita origen; cambiarlo, sí. */
test("todas las mutaciones exigen mismo origen", () => {
  assert.match(COMUN, /esMismoOrigen/);

  const mutaciones: [string, string][] = [
    ["carrito DELETE", RUTAS[0][1].slice(RUTAS[0][1].indexOf("export async function DELETE"))],
    ["linea PUT", RUTAS[1][1].slice(RUTAS[1][1].indexOf("export async function PUT"))],
    ["linea DELETE", RUTAS[1][1].slice(RUTAS[1][1].indexOf("export async function DELETE"))],
    ["fusionar POST", RUTAS[2][1].slice(RUTAS[2][1].indexOf("export async function POST"))],
  ];

  for (const [nombre, cuerpo] of mutaciones) {
    assert.match(cuerpo, /origenValido\(request\)/, `${nombre} no comprueba el origen`);
  }
});

test("el cuerpo esta acotado en las rutas que lo leen", () => {
  assert.match(COMUN, /BYTES_MAXIMOS_DEL_CUERPO/);
  for (const nombre of ["carrito/linea", "carrito/fusionar"]) {
    const fuente = RUTAS.find(([n]) => n === nombre)![1];
    assert.match(fuente, /leerCuerpoAcotado/, `${nombre} no acota el cuerpo`);
  }
});

/**
 * Se busca la **llamada**, no el nombre: importar el validador y no usarlo dejaba pasar
 * esta prueba, y se vio pasar una versión que había sustituido la validación por un
 * `{ ok: true }` con el cuerpo tal cual.
 */
test("las rutas validan con los contratos compartidos, no a mano", () => {
  const linea = RUTAS.find(([n]) => n === "carrito/linea")![1];
  const fusionar = RUTAS.find(([n]) => n === "carrito/fusionar")![1];
  assert.match(linea, /validarCuerpoDeLinea\(cuerpo\.valor\)/);
  assert.match(linea, /validarCuerpoDeReferencia\(cuerpo\.valor\)/);
  assert.match(fusionar, /validarCuerpoDeFusion\(cuerpo\.valor\)/);
});

/**
 * Una respuesta de error no puede llevar el texto de PostgreSQL, ni el nombre de una
 * tabla, ni la cadena de conexión. Solo el código tipado.
 */
test("ninguna ruta devuelve el texto de un error", () => {
  for (const [nombre, fuente] of RUTAS) {
    assert.equal(
      /error\.message|String\(error\)|error\.stack/.test(fuente),
      false,
      `${nombre} arriesga devolver el texto del error`,
    );
  }
});

test("ninguna ruta menciona columnas del proveedor ni existencias", () => {
  for (const [nombre, fuente] of RUTAS) {
    assert.equal(
      /supplier_|supplierBrand|supplierCode|\bstock\b/i.test(fuente),
      false,
      `${nombre} menciona datos que no le tocan`,
    );
  }
});

test("cada error tiene su codigo HTTP, y el de sesion es 401", () => {
  assert.equal(estadoDelError("sin-sesion"), 401);
  assert.equal(estadoDelError("origen-no-valido"), 403);
  assert.equal(estadoDelError("cuerpo-demasiado-grande"), 413);
  assert.equal(estadoDelError("carrito-no-disponible"), 503);
  assert.equal(estadoDelError("cantidad-invalida"), 400);
});

test("el servicio del carrito escribe siempre dentro de una transaccion", () => {
  const fuente = readFileSync(join(RAIZ, "app", "tienda", "carrito.server.ts"), "utf8");
  for (const operacion of ["fijarCantidad", "eliminarLinea", "vaciarCarrito", "fusionarCarrito"]) {
    const bloque = fuente.slice(fuente.indexOf(`export function ${operacion}`));
    assert.match(
      bloque.slice(0, 400),
      /escribir\(/,
      `${operacion} tiene que ir dentro de escribir()`,
    );
  }
});
