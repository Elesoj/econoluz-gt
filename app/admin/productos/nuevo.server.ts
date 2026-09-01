import "server-only";

import { leer } from "../../lib/datos";
import { crearProducto, type ProductoNuevo } from "./nuevo";

/**
 * Solo la conexión, ahora por la capa de datos, con la comprobación de
 * `DATABASE_URL` en el mismo sitio que antes del traslado.
 *
 * `crearProducto` encadena tres sentencias —pedir el siguiente número de la
 * secuencia, mirar la última posición e insertar— y hoy no van en transacción.
 * Se deja igual a propósito: este paso traslada el acceso sin cambiar
 * comportamiento, y encerrarlas en `escribir` cambiaría la atomicidad. Queda
 * anotado en `docs/CONTINUAR-PANEL.md` como decisión pendiente del dueño.
 */
function conectar() {
  if (!process.env.DATABASE_URL) {
    throw new Error("Falta DATABASE_URL.");
  }

  return (text: string, params: readonly (string | number | boolean | null)[]) =>
    leer<Record<string, unknown>>(text, params);
}

export async function crearProductoEnCatalogo(datos: ProductoNuevo): Promise<string> {
  return crearProducto(conectar(), datos);
}
