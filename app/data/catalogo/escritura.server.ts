import "server-only";

import { updateTag } from "next/cache";
import { escribir } from "../../lib/datos";
import { CATALOG_CACHE_TAG } from "../catalog.server";
import {
  guardarProductoCon,
  type EntradaDeProducto,
  type EscrituraTransaccional,
} from "./escritura";

/** Guarda el producto entero en una transacción e invalida la caché después del commit. */
export function guardarProducto(entrada: EntradaDeProducto): Promise<void> {
  return guardarProductoCon(
    escribir as EscrituraTransaccional,
    () => updateTag(CATALOG_CACHE_TAG),
    entrada,
  );
}

export type { EntradaDeProducto } from "./escritura";
