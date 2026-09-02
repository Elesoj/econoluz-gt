/**
 * Qué camino sirve el catálogo según la bandera `modelo_catalogo`.
 *
 * Módulo puro: recibe las fuentes y no conoce ninguna conexión, así que se prueba entero
 * sin base de datos. El enganche real vive en `app/data/catalog.server.ts`.
 *
 * ## La llave de la Fase D
 *
 * `relational_v2` está implementado y probado, pero **no se sirve** mientras
 * `FASE_D_AUTORIZADA` valga `false`: si alguien pusiera esa bandera en la base durante la
 * Fase C, el visitante seguiría recibiendo `legacy`. Activar la Fase D exige cambiar
 * código y desplegar, que es justo el trámite que el dueño quiere para ese paso.
 *
 * La vuelta atrás **no depende de esta llave**: poner `modelo_catalogo` en `legacy`
 * devuelve el catálogo antiguo en menos de un minuto y sin desplegar nada.
 */

import type { ModeloDeCatalogo } from "../../lib/ajustes";

/** Cerrada durante la Fase C. Solo la Fase D, con autorización expresa, la abre. */
export const FASE_D_AUTORIZADA = false;

export function modeloEfectivo(
  modelo: ModeloDeCatalogo,
  faseDAutorizada: boolean = FASE_D_AUTORIZADA,
): ModeloDeCatalogo {
  if (modelo === "relational_v2" && !faseDAutorizada) return "shadow";
  return modelo;
}

export type FuentesDeCatalogo<T> = {
  /** El camino probado. Es lo que recibe el visitante en `legacy` y en `shadow`. */
  legacy: () => Promise<T>;
  /** El camino nuevo. Solo se invoca con la Fase D autorizada. */
  relacional: () => Promise<T>;
  /** Lee el modelo relacional y compara. **No debe lanzar**; aun así se protege aquí. */
  comparar: () => Promise<void>;
};

export async function servirSegunModelo<T>(
  modelo: ModeloDeCatalogo,
  fuentes: FuentesDeCatalogo<T>,
  faseDAutorizada: boolean = FASE_D_AUTORIZADA,
): Promise<T> {
  const efectivo = modeloEfectivo(modelo, faseDAutorizada);

  if (efectivo === "relational_v2") return fuentes.relacional();

  const resultado = await fuentes.legacy();
  if (efectivo === "legacy") return resultado;

  // `shadow`: la respuesta del visitante ya está decidida y no puede cambiar por nada de
  // lo que ocurra a partir de aquí. Un fallo del modelo nuevo no rompe el antiguo.
  try {
    await fuentes.comparar();
  } catch {
    // `comparar` registra sus propios fallos saneados; aquí solo se impide que suban.
  }

  return resultado;
}
