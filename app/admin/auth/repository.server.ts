import "server-only";

import { neon } from "@neondatabase/serverless";
import { createAdminAuthRepository } from "./repository";

export function getAdminAuthRepository() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Falta DATABASE_URL.");
  }

  const sql = neon(connectionString);
  return createAdminAuthRepository((text, params) => sql.query(text, [...params]));
}
