import assert from "node:assert/strict";
import { test } from "node:test";
import { loginAdmin } from "../app/admin/auth/login";
import {
  TEST_NOW,
  TEST_SECRET,
  createInMemoryAuthFixture,
} from "./helpers/admin-auth";

test("un acceso correcto crea sesión, limpia fallos y actualiza el último acceso", async () => {
  const fixture = await createInMemoryAuthFixture({ userPassword: "frase segura de prueba" });
  const result = await loginAdmin(
    { email: " ADMIN@EJEMPLO.COM ", password: "frase segura de prueba", origin: "203.0.113.7" },
    fixture.repository,
    TEST_NOW,
    TEST_SECRET,
  );
  assert.equal(result.status, "success");
  assert.equal(fixture.state.sessions.length, 1);
  assert.equal(fixture.state.attempts.size, 0);
  assert.equal(fixture.state.users[0].lastLoginAt?.toISOString(), TEST_NOW.toISOString());
});

test("la sesión creada guarda la huella del token, nunca el token", async () => {
  const fixture = await createInMemoryAuthFixture({ userPassword: "frase segura de prueba" });
  const result = await loginAdmin(
    { email: "admin@ejemplo.com", password: "frase segura de prueba", origin: "203.0.113.7" },
    fixture.repository,
    TEST_NOW,
    TEST_SECRET,
  );
  assert.equal(result.status, "success");
  if (result.status !== "success") return;
  assert.equal(result.expiresAt.toISOString(), "2026-08-26T00:00:00.000Z");
  assert.notEqual(fixture.state.sessions[0].tokenHash, result.token);
  assert.equal(fixture.state.sessions[0].tokenHash.includes(result.token), false);
});

test("cuatro fallos no bloquean una contraseña correcta y el acierto los limpia", async () => {
  const fixture = await createInMemoryAuthFixture({
    userPassword: "frase segura de prueba",
    previousFailures: 4,
  });
  const result = await loginAdmin(
    { email: "admin@ejemplo.com", password: "frase segura de prueba", origin: "203.0.113.7" },
    fixture.repository,
    TEST_NOW,
    TEST_SECRET,
  );
  assert.equal(result.status, "success");
  assert.equal(fixture.state.attempts.size, 0);
});

test("correo inexistente y contraseña errónea producen el mismo estado público", async () => {
  const unknown = await createInMemoryAuthFixture({ withoutUser: true });
  const wrong = await createInMemoryAuthFixture({ userPassword: "frase segura de prueba" });
  const input = { email: "admin@ejemplo.com", password: "incorrecta", origin: "203.0.113.7" };
  assert.deepEqual(await loginAdmin(input, unknown.repository, TEST_NOW, TEST_SECRET), {
    status: "invalid",
  });
  assert.deepEqual(await loginAdmin(input, wrong.repository, TEST_NOW, TEST_SECRET), {
    status: "invalid",
  });
});

test("un correo desconocido también cuenta como intento fallido", async () => {
  const fixture = await createInMemoryAuthFixture({ withoutUser: true });
  await loginAdmin(
    { email: "admin@ejemplo.com", password: "incorrecta", origin: "203.0.113.7" },
    fixture.repository,
    TEST_NOW,
    TEST_SECRET,
  );
  assert.equal(fixture.state.attempts.size, 1);
});

test("el quinto fallo bloquea y una contraseña correcta no omite un bloqueo vigente", async () => {
  const fixture = await createInMemoryAuthFixture({
    userPassword: "frase segura de prueba",
    previousFailures: 4,
  });
  const wrong = { email: "admin@ejemplo.com", password: "incorrecta", origin: "203.0.113.7" };
  const correct = { ...wrong, password: "frase segura de prueba" };
  assert.equal((await loginAdmin(wrong, fixture.repository, TEST_NOW, TEST_SECRET)).status, "blocked");
  assert.equal((await loginAdmin(correct, fixture.repository, TEST_NOW, TEST_SECRET)).status, "blocked");
  assert.equal(fixture.state.sessions.length, 0);
});

test("un bloqueo vigente no consume intentos adicionales", async () => {
  const fixture = await createInMemoryAuthFixture({
    userPassword: "frase segura de prueba",
    previousFailures: 5,
  });
  const before = structuredClone(fixture.state);
  const result = await loginAdmin(
    { email: "admin@ejemplo.com", password: "incorrecta", origin: "203.0.113.7" },
    fixture.repository,
    TEST_NOW,
    TEST_SECRET,
  );
  assert.equal(result.status, "blocked");
  assert.deepEqual(fixture.state, before);
});

test("una entrada malformada no toca el repositorio", async () => {
  const fixture = await createInMemoryAuthFixture({ userPassword: "frase segura de prueba" });
  const before = structuredClone(fixture.state);
  const result = await loginAdmin(
    { email: "sin-arroba", password: "", origin: "203.0.113.7" },
    fixture.repository,
    TEST_NOW,
    TEST_SECRET,
  );
  assert.equal(result.status, "invalid");
  assert.deepEqual(fixture.state, before);
});

test("un fallo de Neon se convierte en indisponibilidad sin filtrar detalles", async () => {
  const fixture = await createInMemoryAuthFixture({ failQueries: true });
  const result = await loginAdmin(
    { email: "admin@ejemplo.com", password: "frase segura de prueba", origin: "203.0.113.7" },
    fixture.repository,
    TEST_NOW,
    TEST_SECRET,
  );
  assert.deepEqual(result, { status: "unavailable" });
});
