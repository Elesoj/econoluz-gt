import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validarRol, ROLES } from "../app/admin/auth/types";

const sql = readFileSync("db/014_roles_admin.sql", "utf8");

test("la columna nace sin valor por defecto", () => {
  assert.doesNotMatch(sql, /add column\s+rol[^;]*default/i);
});

// Refuerzo: la prueba anterior solo mira la sentencia que añade la columna.
// Un `default` colado por una `alter column ... set default` aparte, en
// cualquier punto del archivo, no la haría fallar. Esta sí: ningún `default`
// puede acompañar a `rol` bajo ninguna forma, y "administrador" no puede
// aparecer junto a la palabra `default` en ningún punto del archivo.
test("ningún `default` acompaña al rol, ni siquiera en una sentencia aparte", () => {
  assert.doesNotMatch(sql, /default[^;]*'administrador'/i);
  assert.doesNotMatch(sql, /'administrador'[^;]*default/i);
  assert.doesNotMatch(sql, /set\s+default/i);
});

test("la migración va en tres pasos", () => {
  const orden = ["add column rol text", "update admin_users", "set not null", "check (rol in"];
  let desde = 0;
  for (const trozo of orden) {
    const i = sql.toLowerCase().indexOf(trozo.toLowerCase(), desde);
    assert.ok(i > -1, `falta el paso: ${trozo}`);
    desde = i;
  }
});

test("las cuentas existentes quedan como administrador", () => {
  assert.match(sql, /set rol = 'administrador'\s*\n?\s*where rol is null/i);
});

test("solo hay dos roles válidos", () => {
  assert.deepEqual([...ROLES], ["administrador", "empleado"]);
});

test("validarRol rechaza cualquier otra cosa", () => {
  assert.equal(validarRol("administrador").ok, true);
  assert.equal(validarRol("empleado").ok, true);
  assert.equal(validarRol("root").ok, false);
  assert.equal(validarRol("").ok, false);
  assert.equal(validarRol(undefined).ok, false);
});
