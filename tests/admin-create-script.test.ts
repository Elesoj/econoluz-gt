import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyPassword } from "../app/admin/auth/crypto";
import {
  requireDatabaseUrl,
  saveAdmin,
  validatePasswordConfirmation,
} from "../scripts/create-admin.mjs";
import { createInMemoryAuthFixture, createStoredSession } from "./helpers/admin-auth";

test("crear de nuevo el mismo correo cambia la contraseña e invalida sus sesiones", async () => {
  const fixture = await createInMemoryAuthFixture({ withoutUser: true });
  await saveAdmin(
    { name: "Administración", email: " ADMIN@EJEMPLO.COM ", password: "primera frase segura" },
    fixture.repository,
  );
  fixture.state.sessions.push(createStoredSession({ userId: "1", tokenHash: "sesion-anterior" }));
  await saveAdmin(
    { name: "Administración", email: "admin@ejemplo.com", password: "segunda frase segura" },
    fixture.repository,
  );
  assert.equal(fixture.state.users.length, 1);
  assert.equal(fixture.state.sessions.length, 0);
  assert.equal(
    await verifyPassword(
      "segunda frase segura",
      fixture.state.users[0].salt,
      fixture.state.users[0].passwordHash,
    ),
    true,
  );
});

test("la contraseña se guarda con sal propia y nunca en claro", async () => {
  const fixture = await createInMemoryAuthFixture({ withoutUser: true });
  await saveAdmin(
    { name: "Administración", email: "admin@ejemplo.com", password: "frase segura de prueba" },
    fixture.repository,
  );
  const guardado = fixture.state.users[0];
  assert.equal(guardado.passwordHash.includes("frase segura de prueba"), false);
  assert.match(guardado.salt, /^[0-9a-f]{32}$/);
  assert.equal(guardado.email, "admin@ejemplo.com");
});

test("rechaza una contraseña de menos de doce caracteres", async () => {
  const fixture = await createInMemoryAuthFixture({ withoutUser: true });
  await assert.rejects(
    () =>
      saveAdmin(
        { name: "Administración", email: "admin@ejemplo.com", password: "demasiado" },
        fixture.repository,
      ),
    /doce caracteres/,
  );
  assert.equal(fixture.state.users.length, 0);
});

test("rechaza un correo sin forma válida sin tocar la base de datos", async () => {
  const fixture = await createInMemoryAuthFixture({ withoutUser: true });
  await assert.rejects(
    () =>
      saveAdmin(
        { name: "Administración", email: "sin-arroba", password: "frase segura de prueba" },
        fixture.repository,
      ),
    /correo/i,
  );
  assert.equal(fixture.state.users.length, 0);
});

test("rechaza una confirmación distinta antes de abrir la base de datos", () => {
  assert.equal(validatePasswordConfirmation("frase segura larga", "otra frase segura"), false);
  assert.equal(validatePasswordConfirmation("frase segura larga", "frase segura larga"), true);
});

test("la ausencia de DATABASE_URL no expone ningún valor de entorno", () => {
  assert.throws(() => requireDatabaseUrl({}), /^Error: Falta DATABASE_URL\.$/);
  assert.equal(requireDatabaseUrl({ DATABASE_URL: "postgres://x" }), "postgres://x");
});
