/**
 * Los errores de la capa de datos.
 *
 * Distinguir «no encontrado» de «la base no responde» importa: lo primero es una
 * respuesta legítima y lo segundo es un fallo del servicio. El panel ya hacía esa
 * distinción a mano; aquí se generaliza.
 *
 * El mensaje nunca arrastra el texto original de Postgres, que lleva nombres de
 * tablas y columnas. El detalle completo viaja en `cause`, que solo se registra
 * en el servidor y nunca sale en una respuesta.
 */

export type CausaDeError =
  | "no-encontrado"
  | "conflicto"
  | "permiso-denegado"
  | "indisponible";

const MENSAJES: Record<CausaDeError, string> = {
  "no-encontrado": "No se encontró el dato solicitado.",
  conflicto: "El dato ya existe o entra en conflicto con otro.",
  "permiso-denegado": "La conexión no tiene permiso para esa operación.",
  indisponible: "La base de datos no está disponible.",
};

export class ErrorDeDatos extends Error {
  readonly causa: CausaDeError;

  constructor(causa: CausaDeError, cause?: unknown) {
    super(MENSAJES[causa], { cause });
    this.name = "ErrorDeDatos";
    this.causa = causa;
  }
}

// Códigos SQLSTATE. 23505 es unicidad, 23503 clave ajena, 42501 permiso denegado.
const CAUSA_POR_CODIGO: Record<string, CausaDeError> = {
  "23505": "conflicto",
  "23503": "conflicto",
  "42501": "permiso-denegado",
};

export function traducirErrorDePostgres(error: unknown): ErrorDeDatos {
  if (error instanceof ErrorDeDatos) {
    return error;
  }

  const codigo =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "";

  return new ErrorDeDatos(CAUSA_POR_CODIGO[codigo] ?? "indisponible", error);
}
