import "server-only";

import { leer, type Ejecutor } from "../../lib/datos";
import {
  buscarPorCodigoDeProveedor as buscarConEjecutor,
  leerCatalogoRelacional as leerCatalogoConEjecutor,
  leerProductoRelacional as leerProductoConEjecutor,
} from "./lectura";

const ejecutarPrivado: Ejecutor = (texto, parametros = []) =>
  leer<Record<string, unknown>>(texto, parametros);

/** Lectura interna de un producto; nunca usa el rol público. */
export function leerProductoRelacional(id: string) {
  return leerProductoConEjecutor(ejecutarPrivado, id);
}

/** Lectura interna completa para verificación y futuras acciones del panel. */
export function leerCatalogoRelacional() {
  return leerCatalogoConEjecutor(ejecutarPrivado);
}

/** El código del proveedor solo se busca mediante la conexión privilegiada. */
export function buscarPorCodigoDeProveedor(texto: string) {
  return buscarConEjecutor(ejecutarPrivado, texto);
}

export { proyeccionDesdeRelacional } from "./lectura";
export type { ProductoRelacional } from "./lectura";
