/** Qué aceptó el cliente y en qué versión. */

export type TipoDeConsentimiento = "terminos" | "privacidad" | "comunicaciones";

/** Los textos legales se versionan por fecha de publicación: `2026-09-01`. */
export function esVersionValida(valor: unknown): boolean {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    return false;
  }

  const fecha = new Date(`${valor}T00:00:00.000Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
}

export const SQL_ACEPTAR = `
  insert into user_consents (user_id, tipo, version) values ($1, $2, $3) returning id
`;

export const SQL_REVOCAR = `
  update user_consents set revocado_en = now()
  where user_id = $1 and tipo = $2 and revocado_en is null
`;

export const SQL_VIGENTES = `
  select tipo, version, revocado_en from user_consents where user_id = $1
`;

export function estaVigente(
  filas: readonly Record<string, unknown>[],
  tipo: TipoDeConsentimiento,
  version: string,
): boolean {
  return filas.some(
    (fila) => fila.tipo === tipo && fila.version === version && fila.revocado_en == null,
  );
}
