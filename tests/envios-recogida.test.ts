// tests/envios-recogida.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { leerRecogidaEnTienda } from "../app/lib/ajustes";

test("sin ajuste guardado la recogida está apagada", () => {
  assert.deepEqual(leerRecogidaEnTienda(undefined), { activa: false, texto: "" });
  assert.deepEqual(leerRecogidaEnTienda(null), { activa: false, texto: "" });
});

test("un valor corrupto no enciende la recogida", () => {
  assert.equal(leerRecogidaEnTienda("sí").activa, false);
  assert.equal(leerRecogidaEnTienda({ activa: "true" }).activa, false);
  assert.equal(leerRecogidaEnTienda(42).activa, false);
});

test("solo el booleano verdadero la enciende", () => {
  assert.deepEqual(
    leerRecogidaEnTienda({ activa: true, texto: "21 Avenida 0-18, zona 15" }),
    { activa: true, texto: "21 Avenida 0-18, zona 15" },
  );
});

test("el texto se recorta y se acota", () => {
  assert.equal(leerRecogidaEnTienda({ activa: true, texto: "  x  " }).texto, "x");
  assert.equal(leerRecogidaEnTienda({ activa: true, texto: "x".repeat(300) }).texto.length, 200);
});