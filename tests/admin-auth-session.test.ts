import assert from "node:assert/strict";
import { test } from "node:test";
import { renewSessionToken, validateSessionToken } from "../app/admin/auth/session";
import {
  TEST_NOW,
  TEST_SECRET,
  TEST_TOKEN,
  createInMemoryAuthFixture,
  createStoredSession,
} from "./helpers/admin-auth";

test("una sesión vigente devuelve únicamente la identidad segura", async () => {
  const fixture = await createInMemoryAuthFixture({ activeSessionToken: TEST_TOKEN });
  const result = await validateSessionToken(TEST_TOKEN, fixture.repository, TEST_NOW, TEST_SECRET);
  assert.deepEqual(result, {
    status: "valid",
    user: { id: "7", name: "Administración" },
    expiresAt: new Date("2026-08-26T00:00:00.000Z"),
  });
});

test("un token desconocido o ausente no da acceso", async () => {
  const fixture = await createInMemoryAuthFixture({ activeSessionToken: TEST_TOKEN });
  assert.deepEqual(
    await validateSessionToken("otro-token", fixture.repository, TEST_NOW, TEST_SECRET),
    { status: "invalid" },
  );
  assert.deepEqual(await validateSessionToken("", fixture.repository, TEST_NOW, TEST_SECRET), {
    status: "invalid",
  });
});

test("una sesión caducada se elimina y nunca se renueva", async () => {
  const fixture = await createInMemoryAuthFixture({
    activeSessionToken: TEST_TOKEN,
    sessionExpiresAt: new Date("2026-08-25T11:59:59.000Z"),
  });
  const result = await renewSessionToken(TEST_TOKEN, fixture.repository, TEST_NOW, TEST_SECRET);
  assert.deepEqual(result, { status: "invalid" });
  assert.equal(fixture.state.sessions.length, 0);
});

/** Estrecha el resultado para poder mirar `renewed` sin perder la comprobación. */
function renovacionValida(resultado: Awaited<ReturnType<typeof renewSessionToken>>) {
  assert.equal(resultado.status, "valid");
  assert.ok(resultado.status === "valid");
  return resultado;
}

test("la actividad amplía la sesión doce horas sin escribir antes de quince minutos", async () => {
  const fixture = await createInMemoryAuthFixture({ activeSessionToken: TEST_TOKEN });
  const minute14 = new Date("2026-08-25T12:14:59.000Z");
  const minute15 = new Date("2026-08-25T12:15:00.000Z");
  assert.equal(
    renovacionValida(await renewSessionToken(TEST_TOKEN, fixture.repository, minute14, TEST_SECRET)).renewed,
    false,
  );
  assert.equal(
    renovacionValida(await renewSessionToken(TEST_TOKEN, fixture.repository, minute15, TEST_SECRET)).renewed,
    true,
  );
  assert.equal(fixture.state.sessions[0].expiresAt.toISOString(), "2026-08-26T00:15:00.000Z");
});

test("una renovación efectiva aprovecha para borrar lo ya caducado", async () => {
  const fixture = await createInMemoryAuthFixture({ activeSessionToken: TEST_TOKEN });
  fixture.state.sessions.push(
    createStoredSession({
      tokenHash: "sesión-vieja",
      expiresAt: new Date("2026-08-25T10:00:00.000Z"),
    }),
  );
  await renewSessionToken(
    TEST_TOKEN,
    fixture.repository,
    new Date("2026-08-25T12:15:00.000Z"),
    TEST_SECRET,
  );
  assert.equal(fixture.state.sessions.length, 1);
});

test("la huella nunca contiene el token que viaja en la cookie", async () => {
  const fixture = await createInMemoryAuthFixture({ activeSessionToken: TEST_TOKEN });
  assert.equal(fixture.state.sessions[0].tokenHash.includes(TEST_TOKEN), false);
});

test("un fallo de Neon se distingue de una sesión inválida", async () => {
  const fixture = await createInMemoryAuthFixture({ failQueries: true });
  assert.deepEqual(
    await validateSessionToken(TEST_TOKEN, fixture.repository, TEST_NOW, TEST_SECRET),
    { status: "unavailable" },
  );
  assert.deepEqual(
    await renewSessionToken(TEST_TOKEN, fixture.repository, TEST_NOW, TEST_SECRET),
    { status: "unavailable" },
  );
});
