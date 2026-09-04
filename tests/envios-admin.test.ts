// tests/envios-admin.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { pasosDeSustitucion } from "../app/admin/envios/tarifas";
import { validarTarifa } from "../app/envios/validacion";

test("la sustitución bloquea, cierra, inserta y audita, en ese orden", () => {
  const pasos = pasosDeSustitucion();
  assert.deepEqual(
    pasos.map((p) => p.tipo),
    ["bloquear", "cerrar", "insertar", "auditar"],
  );
  assert.match(pasos[0].sql, /for update/i);
});

test("la invalidación de caché NO forma parte de la transacción", () => {
  const pasos = pasosDeSustitucion();
  assert.equal(
    pasos.some((p) => (p as unknown as { tipo: string }).tipo === "invalidar-cache"),
    false,
  );
});

test("comprueba validación de tarifa en app/envios/validacion", () => {
  const base = {
    importeCents: 3500,
    umbralGratisCents: 20000,
    maxPiezas: 10,
    maxImporteCents: 50000,
    plazoMinDias: 2,
    plazoMaxDias: 3,
  };

  assert.equal(validarTarifa(base).ok, true);

  // Valores inválidos
  assert.equal(validarTarifa({ ...base, importeCents: -1 }).ok, false);
  assert.equal(validarTarifa({ ...base, importeCents: 100001 }).ok, false);
  assert.equal(validarTarifa({ ...base, umbralGratisCents: 0 }).ok, false);
  assert.equal(validarTarifa({ ...base, maxPiezas: 0 }).ok, false);
  assert.equal(validarTarifa({ ...base, maxPiezas: 1000 }).ok, false);
  assert.equal(validarTarifa({ ...base, maxImporteCents: 0 }).ok, false);
  assert.equal(validarTarifa({ ...base, plazoMinDias: -1 }).ok, false);

  // Coherencia de plazos: max < min
  const plazoIncoherente = validarTarifa({ ...base, plazoMinDias: 5, plazoMaxDias: 2 });
  assert.equal(plazoIncoherente.ok, false);
});
