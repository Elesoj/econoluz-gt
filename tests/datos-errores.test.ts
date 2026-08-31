import assert from "node:assert/strict";
import { test } from "node:test";
import { traducirErrorDePostgres } from "../app/lib/datos/errores";

test("una violación de unicidad es un conflicto, no un fallo de servicio", () => {
  const error = traducirErrorDePostgres(Object.assign(new Error("duplicate key"), { code: "23505" }));
  assert.equal(error.causa, "conflicto");
});

test("un permiso denegado se distingue de todo lo demás", () => {
  const error = traducirErrorDePostgres(Object.assign(new Error("permission denied"), { code: "42501" }));
  assert.equal(error.causa, "permiso-denegado");
});

test("lo que no se reconoce es indisponibilidad, que es lo prudente", () => {
  assert.equal(traducirErrorDePostgres(new Error("socket colgado")).causa, "indisponible");
});

test("el error original se conserva para el registro del servidor", () => {
  const original = new Error("detalle interno");
  assert.equal(traducirErrorDePostgres(original).cause, original);
});

test("el mensaje no arrastra el texto de Postgres", () => {
  const error = traducirErrorDePostgres(new Error("relation \"users\" does not exist"));
  assert.ok(!error.message.includes("users"));
});
