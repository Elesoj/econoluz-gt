import "server-only";

import { leer, registrar, type Ejecutor } from "../../lib/datos";
import { ejecutarComparacion } from "./comparacion";

const ejecutarPrivado: Ejecutor = (texto, parametros = []) =>
  leer<Record<string, unknown>>(texto, parametros);

/**
 * La comparación de `shadow` contra la base real.
 *
 * Usa la conexión de la aplicación, la misma que ya lee el catálogo hoy: el rol público
 * tiene denegadas las ocho tablas nuevas, y esta comparación es trabajo interno que no
 * sirve a ningún visitante.
 */
export async function compararCatalogoEnSombra(): Promise<void> {
  await ejecutarComparacion(ejecutarPrivado, registrar);
}
