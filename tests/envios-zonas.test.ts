// tests/envios-zonas.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { resolverZona } from "../app/envios/zonas";

const capital = { zoneId: 1, departamentoCodigo: null, municipioCodigo: "0101", activa: true };
const resto = { zoneId: 2, departamentoCodigo: "01", municipioCodigo: null, activa: true };
const enCapital = { departamentoCodigo: "01", municipioCodigo: "0101" };
const enMixco = { departamentoCodigo: "01", municipioCodigo: "0108" };

test("el municipio gana al departamento", () => {
  assert.deepEqual(resolverZona([capital, resto], enCapital), { tipo: "zona", zoneId: 1 });
});

test("sin cobertura municipal se cae al departamento", () => {
  assert.deepEqual(resolverZona([capital, resto], enMixco), { tipo: "zona", zoneId: 2 });
});

test("una cobertura municipal inactiva NO cae al departamento", () => {
  const apagada = { ...capital, activa: false };
  assert.deepEqual(resolverZona([apagada, resto], enCapital), { tipo: "cobertura_desactivada" });
});

test("una cobertura departamental inactiva tampoco resuelve", () => {
  const apagado = { ...resto, activa: false };
  assert.deepEqual(resolverZona([apagado], enMixco), { tipo: "cobertura_desactivada" });
});

test("sin ningún registro no hay cobertura", () => {
  assert.deepEqual(resolverZona([], enCapital), { tipo: "sin_cobertura" });
});

test("el orden de la lista no cambia el resultado", () => {
  assert.deepEqual(resolverZona([resto, capital], enCapital), { tipo: "zona", zoneId: 1 });
});