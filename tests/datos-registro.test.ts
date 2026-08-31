import assert from "node:assert/strict";
import { test } from "node:test";
import { formatearRegistro, nuevoIdPeticion } from "../app/lib/datos/registro";

test("cada identificador de petición es distinto y legible", () => {
  const a = nuevoIdPeticion();
  const b = nuevoIdPeticion();
  assert.notEqual(a, b);
  assert.match(a, /^[0-9a-f]{16}$/);
});

test("el registro es una línea JSON con nivel, suceso y momento", () => {
  const linea = JSON.parse(formatearRegistro("info", "consulta", { ms: 12 }, new Date(0)));
  assert.equal(linea.nivel, "info");
  assert.equal(linea.suceso, "consulta");
  assert.equal(linea.ms, 12);
  assert.equal(linea.momento, "1970-01-01T00:00:00.000Z");
});

test("los datos que no son escalares no se registran", () => {
  const linea = JSON.parse(
    formatearRegistro("error", "consulta", { ok: true, correo: { a: 1 } as never }, new Date(0)),
  );
  assert.equal(linea.ok, true);
  assert.equal("correo" in linea, false);
});
