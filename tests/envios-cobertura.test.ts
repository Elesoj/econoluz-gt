// tests/envios-cobertura.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { resumirCobertura } from "../app/admin/envios/cobertura";

const municipios = [
  { codigo: "0101", departamento: "01", nombre: "Guatemala" },
  { codigo: "0108", departamento: "01", nombre: "Mixco" },
];
const zonas = [{ id: 1, activa: true }, { id: 2, activa: true }];
const conTarifa = [{ zoneId: 1, publicada: true }, { zoneId: 2, publicada: true }];

test("un departamento con todos sus municipios resueltos es completa", () => {
  const cobertura = [{ zoneId: 1, departamentoCodigo: "01", municipioCodigo: null, activa: true }];
  const r = resumirCobertura(municipios, cobertura, zonas, conTarifa);
  assert.equal(r[0].estado, "completa");
  assert.deepEqual(r[0].municipiosExcluidos, []);
});

test("una excepción municipal inactiva lo deja parcial y nombra el municipio", () => {
  const cobertura = [
    { zoneId: 1, departamentoCodigo: "01", municipioCodigo: null, activa: true },
    { zoneId: 2, departamentoCodigo: null, municipioCodigo: "0101", activa: false },
  ];
  const r = resumirCobertura(municipios, cobertura, zonas, conTarifa);
  assert.equal(r[0].estado, "parcial");
  assert.deepEqual(r[0].municipiosExcluidos, ["Guatemala"]);
});

test("una zona sin tarifa publicada deja el departamento sin cobertura", () => {
  const cobertura = [{ zoneId: 1, departamentoCodigo: "01", municipioCodigo: null, activa: true }];
  const r = resumirCobertura(municipios, cobertura, zonas, []);
  assert.equal(r[0].estado, "sin_cobertura");
});

test("sin ningún registro el departamento no tiene cobertura", () => {
  const r = resumirCobertura(municipios, [], zonas, conTarifa);
  assert.equal(r[0].estado, "sin_cobertura");
});
