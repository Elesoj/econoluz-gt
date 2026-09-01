import "server-only";

import { leer } from "../lib/datos";
import {
  SQL_ACEPTAR,
  SQL_REVOCAR,
  SQL_VIGENTES,
  type TipoDeConsentimiento,
} from "./consentimientos";

export async function aceptarConsentimiento(
  userId: string,
  tipo: TipoDeConsentimiento,
  version: string,
) {
  await leer(SQL_ACEPTAR, [userId, tipo, version]);
}

export async function revocarConsentimiento(userId: string, tipo: TipoDeConsentimiento) {
  await leer(SQL_REVOCAR, [userId, tipo]);
}

export async function leerConsentimientos(userId: string) {
  return leer<Record<string, unknown>>(SQL_VIGENTES, [userId]);
}
