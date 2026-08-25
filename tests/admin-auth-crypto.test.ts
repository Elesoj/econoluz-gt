import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createSessionToken,
  hashLoginAttemptKey,
  hashPassword,
  hashSessionToken,
  verifyPassword,
} from "../app/admin/auth/crypto";

test("una contraseña correcta verifica y otra contraseña no", async () => {
  const stored = await hashPassword("frase segura de prueba");
  assert.equal(await verifyPassword("frase segura de prueba", stored.salt, stored.hash), true);
  assert.equal(await verifyPassword("otra contraseña", stored.salt, stored.hash), false);
});

test("un hash malformado se rechaza sin lanzar una excepción", async () => {
  assert.equal(await verifyPassword("frase segura de prueba", "00", "ff"), false);
});

test("cada sesión recibe un token distinto de 32 bytes", () => {
  const first = createSessionToken();
  const second = createSessionToken();
  assert.notEqual(first, second);
  assert.equal(Buffer.from(first, "base64url").byteLength, 32);
});

test("la huella cambia con el secreto y nunca contiene el token", () => {
  const token = "token-controlado";
  const first = hashSessionToken(token, "a".repeat(64));
  const second = hashSessionToken(token, "b".repeat(64));
  assert.notEqual(first, second);
  assert.equal(first.includes(token), false);
});

test("correo y origen se anonimizan de forma estable", () => {
  const secret = "c".repeat(64);
  assert.equal(
    hashLoginAttemptKey(" ADMIN@EJEMPLO.COM ", "203.0.113.7", secret),
    hashLoginAttemptKey("admin@ejemplo.com", "203.0.113.7", secret),
  );
});
