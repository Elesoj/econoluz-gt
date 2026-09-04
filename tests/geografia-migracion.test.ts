// tests/geografia-migracion.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

interface Catalogo {
  departamentos: unknown[];
  municipios: unknown[];
}

const sql = readFileSync("db/012_geografia_gt.sql", "utf8");

test("cita la fuente oficial con su huella", () => {
  assert.match(sql, /Instituto Nacional de Estad[íi]stica/i);
  assert.match(sql, /1eb2a2e3a718c7132c944a26a83a1d2a317c42e7fc4f3ab4862026950da7ca0e/);
});

test("la clave compuesta que necesita user_addresses existe", () => {
  assert.match(sql, /unique\s*\(\s*codigo\s*,\s*departamento_codigo\s*\)/i);
});

test("el municipio comprueba que pertenece a su departamento", () => {
  assert.match(sql, /left\s*\(\s*codigo\s*,\s*2\s*\)\s*=\s*departamento_codigo/i);
});

test("inserta las filas del catálogo", () => {
  const catalogo = JSON.parse(readFileSync("db/datos/geografia-gt.json", "utf8")) as Catalogo;
  const valores = sql.match(/^\s*\('/gm) ?? [];
  assert.equal(valores.length, catalogo.departamentos.length + catalogo.municipios.length);
});

test("no consulta Internet", () => {
  assert.doesNotMatch(sql, /https?:\/\/(?!www\.ine\.gob\.gt)/);
  assert.doesNotMatch(sql, /\bcopy\b.*\bfrom\b.*\bprogram\b/i);
});
