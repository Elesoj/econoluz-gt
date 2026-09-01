import "server-only";

import { leer } from "../../lib/datos";
import { createAdminAuthRepository } from "./repository";

/**
 * El repositorio del panel sobre la capa de datos.
 *
 * Va por `leer` y no por `escribir` aunque algunos de sus métodos escriban:
 * cada uno resuelve una sola sentencia, igual que antes del traslado, así que
 * ni el camino ni la atomicidad cambian.
 *
 * La comprobación de `DATABASE_URL` se queda aquí, aunque `leer` haría la
 * misma: sin ella el error se retrasaría hasta la primera consulta, y este
 * archivo fallaba al construir el repositorio. La política de fallo tiene que
 * salir del traslado exactamente como entró.
 */
export function getAdminAuthRepository() {
  if (!process.env.DATABASE_URL) {
    throw new Error("Falta DATABASE_URL.");
  }

  return createAdminAuthRepository((text, params) =>
    leer<Record<string, unknown>>(text, params),
  );
}
