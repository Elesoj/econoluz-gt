import assert from "node:assert/strict";
import { test } from "node:test";
import { clasificarFalloDeSesion, interpretarSesion } from "../app/identidad/sesion";

test("sin cookie no hay sesión, y eso no es un error", () => {
  assert.deepEqual(interpretarSesion({ hayCookie: false, verificada: false, fallo: null }), {
    estado: "sin-sesion",
  });
});

test("una cookie que no verifica saca al visitante", () => {
  assert.deepEqual(
    interpretarSesion({ hayCookie: true, verificada: false, fallo: "invalida" }),
    { estado: "invalida" },
  );
});

test("un fallo del servicio no cierra la sesión de todo el mundo", () => {
  assert.deepEqual(
    interpretarSesion({ hayCookie: true, verificada: false, fallo: "indisponible" }),
    { estado: "indisponible" },
  );
});

test("una cookie verificada da sesión", () => {
  assert.deepEqual(interpretarSesion({ hayCookie: true, verificada: true, fallo: null }), {
    estado: "valida",
  });
});

test("los fallos propios de una cookie o cuenta inválida expulsan al visitante", () => {
  for (const code of [
    "auth/argument-error",
    "auth/session-cookie-expired",
    "auth/session-cookie-revoked",
    "auth/user-disabled",
    "auth/user-not-found",
  ]) {
    assert.equal(clasificarFalloDeSesion({ code }), "invalida", code);
  }
});

test("los fallos operativos se conservan como servicio no disponible", () => {
  for (const fallo of [
    { code: "auth/internal-error" },
    { code: "auth/insufficient-permission" },
    new Error("Neon no contesta"),
    null,
  ]) {
    assert.equal(clasificarFalloDeSesion(fallo), "indisponible");
  }
});
