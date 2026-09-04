import test from "node:test";
import assert from "node:assert/strict";
import { puedeEscribirEnvios } from "../app/admin/auth/permisos";

test("solo el administrador escribe la configuración de envíos", () => {
  assert.equal(puedeEscribirEnvios("administrador"), true);
  assert.equal(puedeEscribirEnvios("empleado"), false);
});
