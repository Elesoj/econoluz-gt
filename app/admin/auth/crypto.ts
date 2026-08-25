import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { normalizeEmail } from "./policy";

const SALT_BYTES = 16;
const PASSWORD_HASH_BYTES = 64;
const scryptAsync = promisify(scrypt);

function isHexOfLength(value: string, length: number) {
  return value.length === length && /^[0-9a-f]+$/i.test(value);
}

async function derivePasswordHash(password: string, salt: string) {
  return (await scryptAsync(password, Buffer.from(salt, "hex"), PASSWORD_HASH_BYTES)) as Buffer;
}

export async function hashPassword(password: string, salt = randomBytes(SALT_BYTES).toString("hex")) {
  const hash = (await derivePasswordHash(password, salt)).toString("hex");
  return { salt, hash };
}

export async function verifyPassword(password: string, salt: string, hash: string) {
  if (
    !isHexOfLength(salt, SALT_BYTES * 2) ||
    !isHexOfLength(hash, PASSWORD_HASH_BYTES * 2)
  ) {
    return false;
  }

  try {
    const expected = Buffer.from(hash, "hex");
    const actual = await derivePasswordHash(password, salt);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

function hashWithContext(context: string, value: string, secret: string) {
  return createHmac("sha256", secret).update(`${context}:${value}`).digest("hex");
}

export function hashSessionToken(token: string, secret: string) {
  return hashWithContext("session", token, secret);
}

export function hashLoginAttemptKey(email: string, origin: string, secret: string) {
  const normalizedEmail = normalizeEmail(email);
  return hashWithContext("login-attempt", `${normalizedEmail}:${origin}`, secret);
}
