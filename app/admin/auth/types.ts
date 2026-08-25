export type AdminUser = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  salt: string;
};

export type AdminSession = {
  userId: string;
  userName: string;
  expiresAt: Date;
};

export type AdminLoginAttempt = {
  failureCount: number;
  blockedUntil: Date | null;
};

export type UpsertAdminUserInput = {
  email: string;
  name: string;
  passwordHash: string;
  salt: string;
  now: Date;
};

export type AdminAuthRepository = {
  findActiveUserByEmail(email: string): Promise<AdminUser | null>;
  createSessionForUser(userId: string, tokenHash: string, now: Date, expiresAt: Date): Promise<void>;
  findValidSession(tokenHash: string, now: Date): Promise<AdminSession | null>;
  renewSession(tokenHash: string, expiresAt: Date, now: Date): Promise<boolean>;
  deleteSession(tokenHash: string): Promise<void>;
  deleteSessionsForUser(userId: string): Promise<void>;
  findCurrentLoginAttempt(keyHash: string, now: Date): Promise<AdminLoginAttempt | null>;
  recordLoginFailure(keyHash: string, now: Date): Promise<AdminLoginAttempt>;
  clearLoginAttempt(keyHash: string): Promise<void>;
  deleteExpiredData(now: Date): Promise<{ deletedSessions: number; deletedAttempts: number }>;
  upsertAdminUser(input: UpsertAdminUserInput): Promise<void>;
};

export type AdminAuthQuery = (
  text: string,
  params: readonly (string | number | boolean | null)[],
) => Promise<Record<string, unknown>[]>;
