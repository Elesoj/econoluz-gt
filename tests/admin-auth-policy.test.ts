import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getSessionCookieOptions,
  getSessionExpiry,
  normalizeEmail,
  shouldRenewSession,
  validateLoginInput,
} from "../app/admin/auth/policy";

test("normaliza el correo sin alterar su contenido útil", () => {
  assert.equal(normalizeEmail(" ADMIN@Ejemplo.COM "), "admin@ejemplo.com");
});

test("rechaza correo inválido y contraseña vacía", () => {
  assert.deepEqual(validateLoginInput({ email: "sin-arroba", password: "" }), {
    ok: false,
  });
});

test("la sesión vence doce horas después", () => {
  const now = new Date("2026-08-25T12:00:00.000Z");
  assert.equal(getSessionExpiry(now).toISOString(), "2026-08-26T00:00:00.000Z");
});

test("solo renueva al entrar en la ventana de quince minutos", () => {
  const expiresAt = new Date("2026-08-26T00:00:00.000Z");
  assert.equal(shouldRenewSession(expiresAt, new Date("2026-08-25T12:14:59.000Z")), false);
  assert.equal(shouldRenewSession(expiresAt, new Date("2026-08-25T12:15:00.000Z")), true);
});

test("no renueva una sesión ya vencida", () => {
  assert.equal(
    shouldRenewSession(
      new Date("2026-08-25T11:59:59.000Z"),
      new Date("2026-08-25T12:00:00.000Z"),
    ),
    false,
  );
});

test("secure depende del entorno y conserva las demás defensas", () => {
  const expiresAt = new Date("2026-08-26T00:00:00.000Z");
  assert.deepEqual(getSessionCookieOptions(expiresAt, false), {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/admin",
    expires: expiresAt,
  });
  assert.equal(getSessionCookieOptions(expiresAt, true).secure, true);
});
