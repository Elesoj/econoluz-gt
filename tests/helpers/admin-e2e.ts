import { createHmac, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { BrowserContext } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

function obtenerVariablesEntorno(): { dbUrl: string; secret: string } {
  let dbUrl = process.env.DATABASE_URL;
  let secret = process.env.ADMIN_SESSION_SECRET;

  if (!dbUrl || !secret) {
    const envPath = path.resolve(process.cwd(), ".env.local");
    if (fs.existsSync(envPath)) {
      const contenido = fs.readFileSync(envPath, "utf8");
      for (const linea of contenido.split("\n")) {
        const trimmed = linea.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const igualIdx = trimmed.indexOf("=");
        if (igualIdx === -1) continue;
        const clave = trimmed.slice(0, igualIdx).trim();
        let valor = trimmed.slice(igualIdx + 1).trim();
        if (valor.startsWith('"') && valor.endsWith('"')) {
          valor = valor.slice(1, -1);
        } else if (valor.startsWith("'") && valor.endsWith("'")) {
          valor = valor.slice(1, -1);
        }
        if (clave === "DATABASE_URL" && !dbUrl) dbUrl = valor;
        if (clave === "ADMIN_SESSION_SECRET" && !secret) secret = valor;
      }
    }
  }

  if (!dbUrl) {
    throw new Error("Falta DATABASE_URL para las pruebas e2e administrativas.");
  }
  if (!secret) {
    throw new Error("Falta ADMIN_SESSION_SECRET para las pruebas e2e administrativas.");
  }

  return { dbUrl, secret };
}

export function getE2ESql() {
  const { dbUrl } = obtenerVariablesEntorno();
  return neon(dbUrl);
}

function hashSessionToken(token: string, secret: string): string {
  return createHmac("sha256", secret).update(`session:${token}`).digest("hex");
}

export const ADMIN_E2E_EMAIL = "admin-e2e@econoluz.net";
export const ADMIN_E2E_NAME = "Administrador E2E";

/**
 * Asegura que el usuario administrador de prueba exista en la base de datos
 * con el rol 'administrador' activo.
 */
export async function asegurarAdminE2E(): Promise<string> {
  const sql = getE2ESql();
  const dummySalt = "a".repeat(32);
  const dummyHash = "b".repeat(128);

  const rows = (await sql.query(
    `
      insert into admin_users (email, name, password_hash, salt, rol, created_at, active)
      values ($1, $2, $3, $4, 'administrador', now(), true)
      on conflict (email) do update
      set name = excluded.name,
          rol = 'administrador',
          active = true
      returning id::text
    `,
    [ADMIN_E2E_EMAIL, ADMIN_E2E_NAME, dummyHash, dummySalt],
  )) as { id: string }[];

  return rows[0].id;
}

/**
 * Inserta una sesión activa válida para el usuario administrador y devuelve el token en claro.
 */
export async function crearSesionAdminE2E(userId: string): Promise<string> {
  const { secret } = obtenerVariablesEntorno();
  const sql = getE2ESql();
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(token, secret);

  await sql.query(
    `
      insert into admin_sessions (user_id, token_hash, created_at, expires_at)
      values ($1, $2, now(), now() + interval '12 hours')
    `,
    [userId, tokenHash],
  );

  return token;
}

/**
 * Autentica un contexto de navegador de Playwright inyectando la cookie de sesión administrativa.
 */
export async function autenticarComoAdmin(
  context: BrowserContext,
  baseURL = "http://127.0.0.1:3100",
): Promise<{ token: string; userId: string }> {
  const userId = await asegurarAdminE2E();
  const token = await crearSesionAdminE2E(userId);

  await context.addCookies([
    {
      name: "econoluz_admin",
      value: token,
      url: baseURL,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  return { token, userId };
}

/**
 * Limpia una zona de prueba (tarifas, coberturas y zona) garantizando idempotencia.
 * Desactiva temporalmente los disparadores de inmutabilidad para poder purgar la prueba.
 */
export async function limpiarZonaE2E(codigo: string): Promise<void> {
  const sql = getE2ESql();
  try {
    await sql.query("alter table shipping_rates disable trigger user");
    await sql.query(
      `
        delete from shipping_rates
         where zone_id in (select id from shipping_zones where codigo = $1)
      `,
      [codigo],
    );
  } finally {
    await sql.query("alter table shipping_rates enable trigger user");
  }

  await sql.query(
    `
      delete from shipping_zone_areas
       where zone_id in (select id from shipping_zones where codigo = $1)
    `,
    [codigo],
  );

  await sql.query(
    `
      delete from shipping_zones
       where codigo = $1
    `,
    [codigo],
  );
}
