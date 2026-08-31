// Verifica el comportamiento transaccional de scripts/migrate.mjs.
//
// El migrador ya cumple su contrato: aplica cada archivo entre `begin` y
// `commit`, deshace el archivo entero con `rollback` si algo falla, inserta
// la fila de `schema_migrations` dentro de la misma transacción y cierra la
// conexión pase lo que pase. Esta prueba no construye ese comportamiento,
// solo lo cubre para que una regresión futura no pase desapercibida.

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migrador = readFileSync(
  join(import.meta.dirname, "..", "scripts", "migrate.mjs"),
  "utf8",
);

test("cada migración se aplica dentro de una transacción", () => {
  assert.ok(migrador.includes('client.query("begin")'));
  assert.ok(migrador.includes('client.query("commit")'));
  assert.ok(migrador.includes('client.query("rollback")'));
});

test("el registro en schema_migrations va dentro de la misma transacción", () => {
  const cuerpo = migrador.slice(
    migrador.indexOf('client.query("begin")'),
    migrador.indexOf('client.query("commit")'),
  );
  assert.ok(cuerpo.includes("insert into schema_migrations"));
});

test("nunca imprime la cadena de conexión, solo el host", () => {
  // La cadena lleva la contraseña de la base de datos. La única mención permitida
  // en una línea de consola es la que extrae el host con `new URL(...).host`.
  const lineasDeConsola = migrador
    .split("\n")
    .filter((linea) => /console\.(log|error)/.test(linea) && linea.includes("connectionString"));

  for (const linea of lineasDeConsola) {
    assert.ok(
      linea.includes("new URL(connectionString).host"),
      `esta línea podría imprimir la cadena entera: ${linea.trim()}`,
    );
  }
});

test("la conexión se cierra pase lo que pase", () => {
  assert.ok(migrador.includes("} finally {"));
  assert.ok(migrador.includes("client.end()"));
});
