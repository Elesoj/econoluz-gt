const SESSION_DURATION_MS = 12 * 60 * 60 * 1000;
const SESSION_RENEWAL_INTERVAL_MS = 15 * 60 * 1000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SessionCookieOptions = {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/admin";
  expires: Date;
};

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function validateLoginInput(input: { email?: unknown; password?: unknown }) {
  if (typeof input.email !== "string" || typeof input.password !== "string") {
    return { ok: false } as const;
  }

  const email = normalizeEmail(input.email);
  if (!EMAIL_PATTERN.test(email) || input.password.length === 0) {
    return { ok: false } as const;
  }

  return { ok: true, email, password: input.password } as const;
}

export function getSessionExpiry(now: Date) {
  return new Date(now.getTime() + SESSION_DURATION_MS);
}

export function shouldRenewSession(expiresAt: Date, now: Date) {
  return (
    expiresAt.getTime() > now.getTime() &&
    expiresAt.getTime() <= getSessionExpiry(now).getTime() - SESSION_RENEWAL_INTERVAL_MS
  );
}

export function getSessionCookieOptions(
  expiresAt: Date,
  isProduction: boolean,
): SessionCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/admin",
    expires: expiresAt,
  };
}
