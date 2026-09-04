import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { validarRol, ROLES } from "../app/admin/auth/types";

const sql = readFileSync("db/014_roles_admin.sql", "utf8");

test("la columna nace sin valor por defecto", () => {
  assert.doesNotMatch(sql, /add column\s+rol[^;]*default/i);
});

// Refuerzo pedido en revisión: la prueba anterior solo mira la sentencia que
// añade la columna en ESTE archivo. Un `default` colado por una
// `alter column ... set default` aparte —en este archivo, o en cualquier
// migración futura, `015_*.sql` o posterior— no la haría fallar: la
// reintroducción por la puerta de atrás seguiría siendo posible, solo que un
// archivo más allá. Por eso esta prueba recorre **todos** los `db/*.sql`, no
// solo el de esta tarea.
test("ningún `default` acompaña al rol, ni siquiera en una sentencia aparte de otra migración", () => {
  const archivosSql = readdirSync("db").filter((nombre) => nombre.endsWith(".sql"));
  assert.ok(archivosSql.length > 0, "no se encontró ninguna migración en db/");

  for (const archivo of archivosSql) {
    const contenido = readFileSync(join("db", archivo), "utf8");
    assert.doesNotMatch(
      contenido,
      /default[^;]*'administrador'/i,
      `${archivo}: un default seguido de 'administrador' reintroduciría la elevación silenciosa`,
    );
    assert.doesNotMatch(
      contenido,
      /'administrador'[^;]*default/i,
      `${archivo}: 'administrador' seguido de default reintroduciría la elevación silenciosa`,
    );
    // Ninguna migración pone jamás un `default` sobre `admin_users.rol`: ni
    // siquiera un `set default` con otro valor sería correcto, porque el
    // punto entero es que la columna se quede sin ninguno.
    if (/admin_users/i.test(contenido) && /\brol\b/i.test(contenido)) {
      assert.doesNotMatch(
        contenido,
        /alter\s+column\s+rol\s+set\s+default/i,
        `${archivo}: ninguna migración puede poner un default sobre admin_users.rol`,
      );
    }
  }
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
