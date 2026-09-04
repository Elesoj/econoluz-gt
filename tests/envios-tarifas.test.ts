// tests/envios-tarifas.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { calcularEnvio, estaVigente } from "../app/envios/tarifas";

// Cantidades ficticias de prueba: NO son las tarifas reales de ECONOLUZ.
const zona = { codigo: "z-prueba", nombre: "Zona de prueba", metodo: "paqueteria" } as const;
const tarifa = {
  importeCents: 5000,
  umbralGratisCents: 200_000,
  maxPiezas: 6,
  maxImporteCents: 500_000,
  plazoMinDias: 2,
  plazoMaxDias: 3,
  publicada: true,
  vigenteDesde: new Date("2026-01-01T00:00:00Z"),
  vigenteHasta: null,
};
const ahora = new Date("2026-06-01T00:00:00Z");

test("por debajo del umbral se cobra la tarifa", () => {
  const r = calcularEnvio(tarifa, zona, { piezas: 2, subtotalCents: 100_000 }, ahora);
  assert.equal(r.tipo, "con_tarifa");
  assert(r.tipo === "con_tarifa");
  assert.equal(r.envioCents, 5000);
  assert.equal(r.gratuito, false);
  assert.equal(r.faltanParaGratisCents, 100_000);
});

test("el umbral es inclusive", () => {
  const justo = calcularEnvio(tarifa, zona, { piezas: 2, subtotalCents: 200_000 }, ahora);
  assert(justo.tipo === "con_tarifa");
  assert.equal(justo.envioCents, 0);
  assert.equal(justo.gratuito, true);
  const uncentavoMenos = calcularEnvio(tarifa, zona, { piezas: 2, subtotalCents: 199_999 }, ahora);
  assert(uncentavoMenos.tipo === "con_tarifa");
  assert.equal(uncentavoMenos.gratuito, false);
  assert.equal(uncentavoMenos.faltanParaGratisCents, 1);
});

test("faltanParaGratisCents es 0 al alcanzar el umbral y null si no hay umbral", () => {
  const alcanzado = calcularEnvio(tarifa, zona, { piezas: 1, subtotalCents: 250_000 }, ahora);
  assert(alcanzado.tipo === "con_tarifa");
  assert.equal(alcanzado.faltanParaGratisCents, 0);
  const sinUmbral = calcularEnvio(
    { ...tarifa, umbralGratisCents: null },
    zona,
    { piezas: 1, subtotalCents: 250_000 },
    ahora
  );
  assert(sinUmbral.tipo === "con_tarifa");
  assert.equal(sinUmbral.faltanParaGratisCents, null);
  assert.equal(sinUmbral.gratuito, false);
});

test("los límites se evalúan ANTES que la gratuidad", () => {
  // Supera las piezas y también el umbral: manda el bulto, no el dinero.
  const r = calcularEnvio(tarifa, zona, { piezas: 7, subtotalCents: 900_000 }, ahora);
  assert.equal(r.tipo, "requiere_cotizacion");
  assert(r.tipo === "requiere_cotizacion");
  assert.equal(r.motivo, "pedido_grande");
});

test("exactamente el máximo todavía se admite", () => {
  const enElLimite = calcularEnvio(tarifa, zona, { piezas: 6, subtotalCents: 500_000 }, ahora);
  assert.equal(enElLimite.tipo, "con_tarifa");
  const unaMas = calcularEnvio(tarifa, zona, { piezas: 7, subtotalCents: 1000 }, ahora);
  assert.equal(unaMas.tipo, "requiere_cotizacion");
  const unCentavoMas = calcularEnvio(tarifa, zona, { piezas: 1, subtotalCents: 500_001 }, ahora);
  assert.equal(unCentavoMas.tipo, "requiere_cotizacion");
});

test("los límites nulos no limitan", () => {
  const sinLimites = { ...tarifa, maxPiezas: null, maxImporteCents: null };
  const r = calcularEnvio(sinLimites, zona, { piezas: 999, subtotalCents: 9_000_000 }, ahora);
  assert.equal(r.tipo, "con_tarifa");
});

test("la vigencia se mide en el instante inicial, antes del final y en el final", () => {
  const cerrada = { ...tarifa, vigenteHasta: new Date("2026-07-01T00:00:00Z") };
  assert.equal(estaVigente(cerrada, new Date("2026-01-01T00:00:00Z")), true);
  assert.equal(estaVigente(cerrada, new Date("2026-06-30T23:59:59Z")), true);
  assert.equal(estaVigente(cerrada, new Date("2026-07-01T00:00:00Z")), false);
  assert.equal(estaVigente(cerrada, new Date("2025-12-31T23:59:59Z")), false);
});

test("una tarifa sin publicar no está vigente", () => {
  assert.equal(estaVigente({ ...tarifa, publicada: false }, ahora), false);
});

test("todo el cálculo es en enteros", () => {
  const r = calcularEnvio(tarifa, zona, { piezas: 3, subtotalCents: 133_333 }, ahora);
  assert(r.tipo === "con_tarifa");
  assert.equal(Number.isInteger(r.envioCents), true);
  assert.equal(Number.isInteger(r.faltanParaGratisCents), true);
});
