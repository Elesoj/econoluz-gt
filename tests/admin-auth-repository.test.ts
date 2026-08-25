import assert from "node:assert/strict";
import { test } from "node:test";
import { createAdminAuthRepository } from "../app/admin/auth/repository";
import { TEST_NOW, createControlledQuery } from "./helpers/admin-auth";

test("solo reconstruye usuarios activos con todos sus campos de autenticación", async () => {
  const repository = createAdminAuthRepository(
    createControlledQuery({
      expectedParams: ["admin@econoluz.test"],
      rows: [
        {
          id: "7",
          email: "admin@econoluz.test",
          name: "Administración",
          password_hash: "ab".repeat(64),
          salt: "cd".repeat(16),
          active: true,
        },
      ],
    }),
  );

  assert.deepEqual(await repository.findActiveUserByEmail("admin@econoluz.test"), {
    id: "7",
    email: "admin@econoluz.test",
    name: "Administración",
    passwordHash: "ab".repeat(64),
    salt: "cd".repeat(16),
  });
});

test("una consulta sin sesión vigente devuelve null", async () => {
  const repository = createAdminAuthRepository(
    createControlledQuery({
      expectedParams: ["huella", "2026-08-25T12:00:00.000Z"],
      rows: [],
    }),
  );

  assert.equal(await repository.findValidSession("huella", TEST_NOW), null);
});

test("una renovación no revive una sesión vencida", async () => {
  const repository = createAdminAuthRepository(
    createControlledQuery({
      expectedParams: [
        "huella",
        "2026-08-26T00:15:00.000Z",
        "2026-08-25T12:15:00.000Z",
      ],
      rows: [],
    }),
  );

  assert.equal(
    await repository.renewSession(
      "huella",
      new Date("2026-08-26T00:15:00.000Z"),
      new Date("2026-08-25T12:15:00.000Z"),
    ),
    false,
  );
});

test("el adaptador devuelve el bloqueo calculado atómicamente por Postgres", async () => {
  const blockedUntil = new Date("2026-08-25T12:15:00.000Z");
  const repository = createAdminAuthRepository(
    createControlledQuery({
      expectedParams: ["clave-anónima", "2026-08-25T12:00:00.000Z", 5, 900],
      rows: [{ failure_count: 5, blocked_until: blockedUntil.toISOString() }],
    }),
  );

  assert.deepEqual(await repository.recordLoginFailure("clave-anónima", TEST_NOW), {
    failureCount: 5,
    blockedUntil,
  });
});

test("la limpieza devuelve el recuento de sesiones e intentos caducados", async () => {
  const repository = createAdminAuthRepository(
    createControlledQuery({
      expectedParams: ["2026-08-25T12:00:00.000Z"],
      rows: [{ deleted_sessions: 2, deleted_attempts: 3 }],
    }),
  );

  assert.deepEqual(await repository.deleteExpiredData(TEST_NOW), {
    deletedSessions: 2,
    deletedAttempts: 3,
  });
});

test("crear una sesión registra el acceso y almacena únicamente su huella", async () => {
  const createdAt = new Date("2026-08-25T12:00:00.000Z");
  const expiresAt = new Date("2026-08-26T00:00:00.000Z");
  const repository = createAdminAuthRepository(
    createControlledQuery({
      expectedParams: ["7", "huella", createdAt.toISOString(), expiresAt.toISOString()],
      rows: [],
    }),
  );

  await repository.createSessionForUser("7", "huella", createdAt, expiresAt);
});

test("revocar una o todas las sesiones acepta solo los identificadores recibidos", async () => {
  const sessionRepository = createAdminAuthRepository(
    createControlledQuery({ expectedParams: ["huella"], rows: [] }),
  );
  const userRepository = createAdminAuthRepository(
    createControlledQuery({ expectedParams: ["7"], rows: [] }),
  );

  await sessionRepository.deleteSession("huella");
  await userRepository.deleteSessionsForUser("7");
});

test("limpiar el contador de acceso acepta únicamente la clave anónima", async () => {
  const repository = createAdminAuthRepository(
    createControlledQuery({ expectedParams: ["clave-anónima"], rows: [] }),
  );

  await repository.clearLoginAttempt("clave-anónima");
});

test("guardar un administrador parametriza todos sus datos de autenticación", async () => {
  const now = new Date("2026-08-25T12:00:00.000Z");
  const repository = createAdminAuthRepository(
    createControlledQuery({
      expectedParams: [
        "admin@econoluz.test",
        "Administración",
        "ab".repeat(64),
        "cd".repeat(16),
        now.toISOString(),
      ],
      rows: [],
    }),
  );

  await repository.upsertAdminUser({
    email: "admin@econoluz.test",
    name: "Administración",
    passwordHash: "ab".repeat(64),
    salt: "cd".repeat(16),
    now,
  });
});
