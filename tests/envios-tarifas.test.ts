// tests/envios-tarifas.test.ts
//
// Cubre el cálculo operativo de `app/envios/tarifas.ts` en los bordes que la
// prueba del caso feliz no toca: enteros, umbrales extremos y no mutación de las
// reglas que llegan desde `app_settings`.
import test from "node:test";
import assert from "node:assert/strict";
import {
  REGLAS_PROPIAS_DEFECTO,
  calcularEnvioOperativo,
  calcularTarifaMensajeroPropio,
} from "../app/envios/tarifas";

test("todo el cálculo del mensajero propio es en enteros", () => {
  const r = calcularTarifaMensajeroPropio(133_333);
  assert.equal(Number.isInteger(r.envioCents), true);
  assert.equal(Number.isInteger(r.faltanParaGratisCents), true);
});

test("un carrito vacío todavía paga la tarifa completa", () => {
  const r = calcularTarifaMensajeroPropio(0);
  assert.equal(r.envioCents, 3500);
  assert.equal(r.gratuito, false);
  assert.equal(r.faltanParaGratisCents, 250_000);
});

test("con umbral de gratuidad cero todo pedido sale gratis", () => {
  const r = calcularTarifaMensajeroPropio(0, { tarifaCents: 3500, umbralGratisCents: 0 });
  assert.equal(r.envioCents, 0);
  assert.equal(r.gratuito, true);
  assert.equal(r.faltanParaGratisCents, 0);
});

test("las reglas por defecto son las comerciales aprobadas y no se mutan al calcular", () => {
  assert.deepEqual(REGLAS_PROPIAS_DEFECTO, { tarifaCents: 3500, umbralGratisCents: 250_000 });
  const reglas = { tarifaCents: 4000, umbralGratisCents: 300_000 };
  calcularTarifaMensajeroPropio(1000, reglas);
  assert.deepEqual(reglas, { tarifaCents: 4000, umbralGratisCents: 300_000 });
  assert.deepEqual(REGLAS_PROPIAS_DEFECTO, { tarifaCents: 3500, umbralGratisCents: 250_000 });
});

test("Guatex ignora el subtotal y las reglas del mensajero propio", () => {
  const barato = calcularEnvioOperativo({ metodo: "guatex", subtotalCents: 1 });
  const caro = calcularEnvioOperativo({
    metodo: "guatex",
    subtotalCents: 9_000_000,
    reglas: { tarifaCents: 4000, umbralGratisCents: 1 },
  });
  assert.deepEqual(barato, caro);
  assert.equal(caro.envioCents, null);
  assert.equal(caro.gratuito, false);
});

test("el mensajero propio con reglas explícitas produce el tipo 'calculado'", () => {
  const r = calcularEnvioOperativo({
    metodo: "mensajero_propio",
    subtotalCents: 249_999,
    reglas: REGLAS_PROPIAS_DEFECTO,
  });
  assert.equal(r.tipo, "calculado");
  assert.equal(r.metodo, "mensajero_propio");
  assert.equal(r.envioCents, 3500);
});
