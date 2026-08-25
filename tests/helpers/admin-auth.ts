import assert from "node:assert/strict";
import {
  hashLoginAttemptKey,
  hashPassword,
  hashSessionToken,
} from "../../app/admin/auth/crypto";
import type {
  AdminAuthRepository,
  AdminLoginAttempt,
  AdminSession,
  AdminUser,
} from "../../app/admin/auth/types";

export const TEST_NOW = new Date("2026-08-25T12:00:00.000Z");
export const TEST_SECRET = "a".repeat(64);
export const TEST_TOKEN = "token-de-sesion-controlado";

type QueryRow = Record<string, unknown>;

type ControlledQueryOptions = {
  expectedParams: readonly unknown[];
  rows: QueryRow[];
};

export function createControlledQuery({ expectedParams, rows }: ControlledQueryOptions) {
  return async (_text: string, params: readonly unknown[]): Promise<QueryRow[]> => {
    assert.deepEqual(params, expectedParams);
    return rows;
  };
}

export type StoredSession = AdminSession & {
  tokenHash: string;
  createdAt: Date;
};

export function createStoredSession(overrides: Partial<StoredSession> = {}): StoredSession {
  return {
    tokenHash: "huella-de-sesión",
    userId: "7",
    userName: "Administración",
    createdAt: TEST_NOW,
    expiresAt: new Date("2026-08-26T00:00:00.000Z"),
    ...overrides,
  };
}

type FixtureSeed = {
  withoutUser?: boolean;
  userPassword?: string;
  previousFailures?: number;
  activeSessionToken?: string;
  sessionExpiresAt?: Date;
  failQueries?: boolean;
};

type StoredUser = AdminUser & {
  active: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
};

type FixtureState = {
  users: StoredUser[];
  sessions: StoredSession[];
  attempts: Map<string, StoredLoginAttempt>;
};

type StoredLoginAttempt = AdminLoginAttempt & {
  windowStartedAt: Date;
};

const LOGIN_FAILURE_LIMIT = 5;
const LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000;

function unavailableIfNeeded(failQueries: boolean) {
  if (failQueries) {
    throw new Error("Neon no disponible en la fixture");
  }
}

export async function createInMemoryAuthFixture(seed: FixtureSeed = {}) {
  const state: FixtureState = {
    users: [],
    sessions: [],
    attempts: new Map(),
  };

  if (!seed.withoutUser) {
    const stored = await hashPassword(seed.userPassword ?? "frase segura de prueba");
    state.users.push({
      id: "7",
      email: "admin@ejemplo.com",
      name: "Administración",
      passwordHash: stored.hash,
      salt: stored.salt,
      active: true,
      createdAt: TEST_NOW,
      lastLoginAt: null,
    });
  }

  if (seed.previousFailures) {
    state.attempts.set(hashLoginAttemptKey("admin@ejemplo.com", "203.0.113.7", TEST_SECRET), {
      failureCount: seed.previousFailures,
      windowStartedAt: TEST_NOW,
      // Igual que `recordLoginFailure`: alcanzar el límite deja la marca de bloqueo.
      blockedUntil:
        seed.previousFailures >= LOGIN_FAILURE_LIMIT
          ? new Date(TEST_NOW.getTime() + LOGIN_FAILURE_WINDOW_MS)
          : null,
    });
  }

  if (seed.activeSessionToken) {
    state.sessions.push(
      createStoredSession({
        tokenHash: hashSessionToken(seed.activeSessionToken, TEST_SECRET),
        expiresAt: seed.sessionExpiresAt ?? new Date("2026-08-26T00:00:00.000Z"),
      }),
    );
  }

  const repository: AdminAuthRepository = {
    async findActiveUserByEmail(email) {
      unavailableIfNeeded(Boolean(seed.failQueries));
      return state.users.find((user) => user.active && user.email === email) ?? null;
    },
    async createSessionForUser(userId, tokenHash, now, expiresAt) {
      unavailableIfNeeded(Boolean(seed.failQueries));
      const user = state.users.find((candidate) => candidate.id === userId && candidate.active);
      if (!user) return;
      user.lastLoginAt = now;
      state.sessions.push(
        createStoredSession({ tokenHash, userId, userName: user.name, createdAt: now, expiresAt }),
      );
    },
    async findValidSession(tokenHash, now) {
      unavailableIfNeeded(Boolean(seed.failQueries));
      const session = state.sessions.find(
        (candidate) => candidate.tokenHash === tokenHash && candidate.expiresAt > now,
      );
      if (!session) return null;
      const user = state.users.find((candidate) => candidate.id === session.userId && candidate.active);
      return user ? { userId: user.id, userName: user.name, expiresAt: session.expiresAt } : null;
    },
    async renewSession(tokenHash, expiresAt, now) {
      unavailableIfNeeded(Boolean(seed.failQueries));
      const session = state.sessions.find(
        (candidate) => candidate.tokenHash === tokenHash && candidate.expiresAt > now,
      );
      if (!session) return false;
      session.expiresAt = expiresAt;
      return true;
    },
    async deleteSession(tokenHash) {
      unavailableIfNeeded(Boolean(seed.failQueries));
      state.sessions = state.sessions.filter((session) => session.tokenHash !== tokenHash);
    },
    async deleteSessionsForUser(userId) {
      unavailableIfNeeded(Boolean(seed.failQueries));
      state.sessions = state.sessions.filter((session) => session.userId !== userId);
    },
    async findCurrentLoginAttempt(keyHash, now) {
      unavailableIfNeeded(Boolean(seed.failQueries));
      const attempt = state.attempts.get(keyHash);
      if (!attempt || attempt.windowStartedAt.getTime() + LOGIN_FAILURE_WINDOW_MS <= now.getTime()) {
        return null;
      }
      return { failureCount: attempt.failureCount, blockedUntil: attempt.blockedUntil };
    },
    async recordLoginFailure(keyHash, now) {
      unavailableIfNeeded(Boolean(seed.failQueries));
      const current = state.attempts.get(keyHash);
      const resetWindow =
        !current || now.getTime() - current.windowStartedAt.getTime() >= LOGIN_FAILURE_WINDOW_MS;
      const windowStartedAt = resetWindow ? now : current.windowStartedAt;
      const failureCount = resetWindow ? 1 : current.failureCount + 1;
      const blockedUntil =
        failureCount >= LOGIN_FAILURE_LIMIT
          ? new Date(windowStartedAt.getTime() + LOGIN_FAILURE_WINDOW_MS)
          : null;
      const attempt = { failureCount, windowStartedAt, blockedUntil };
      state.attempts.set(keyHash, attempt);
      return attempt;
    },
    async clearLoginAttempt(keyHash) {
      unavailableIfNeeded(Boolean(seed.failQueries));
      state.attempts.delete(keyHash);
    },
    async deleteExpiredData(now) {
      unavailableIfNeeded(Boolean(seed.failQueries));
      const sessionsBefore = state.sessions.length;
      state.sessions = state.sessions.filter((session) => session.expiresAt > now);
      let deletedAttempts = 0;
      for (const [keyHash, attempt] of state.attempts) {
        if (attempt.windowStartedAt.getTime() + LOGIN_FAILURE_WINDOW_MS <= now.getTime()) {
          state.attempts.delete(keyHash);
          deletedAttempts += 1;
        }
      }
      return { deletedSessions: sessionsBefore - state.sessions.length, deletedAttempts };
    },
    async upsertAdminUser(input) {
      unavailableIfNeeded(Boolean(seed.failQueries));
      const existing = state.users.find((user) => user.email === input.email);
      if (existing) {
        existing.name = input.name;
        existing.passwordHash = input.passwordHash;
        existing.salt = input.salt;
        existing.active = true;
        await repository.deleteSessionsForUser(existing.id);
        return;
      }
      state.users.push({
        id: String(state.users.length + 1),
        email: input.email,
        name: input.name,
        passwordHash: input.passwordHash,
        salt: input.salt,
        active: true,
        createdAt: input.now,
        lastLoginAt: null,
      });
    },
  };

  return { repository, state };
}
