import { randomBytes } from "node:crypto";

/**
 * Registro estructurado de la capa de datos.
 *
 * Una línea JSON por suceso, para poder buscarla después por `idPeticion`. Solo
 * se aceptan valores escalares: así ningún objeto con datos personales acaba en
 * el log por descuido al pasarlo entero.
 */

export type NivelDeRegistro = "info" | "error";

export function nuevoIdPeticion() {
  return randomBytes(8).toString("hex");
}

export function formatearRegistro(
  nivel: NivelDeRegistro,
  suceso: string,
  datos: Record<string, string | number | boolean> = {},
  momento = new Date(),
) {
  const escalares = Object.fromEntries(
    Object.entries(datos).filter(([, valor]) =>
      ["string", "number", "boolean"].includes(typeof valor),
    ),
  );

  return JSON.stringify({ nivel, suceso, momento: momento.toISOString(), ...escalares });
}

export function registrar(
  nivel: NivelDeRegistro,
  suceso: string,
  datos?: Record<string, string | number | boolean>,
) {
  const linea = formatearRegistro(nivel, suceso, datos);
  if (nivel === "error") {
    console.error(linea);
  } else {
    console.log(linea);
  }
}
