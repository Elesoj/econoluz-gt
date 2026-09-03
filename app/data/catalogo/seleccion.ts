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

/**
 * Traduce el valor del entorno a un booleano, **sin trucos de veracidad**.
 *
 * Solo la cadena exacta `"true"` autoriza. Ni `"1"`, ni `"si"`, ni `"True"`, ni un objeto
 * vacío: en JavaScript todos ellos son verdaderos, y una activación que dependa de eso se
 * enciende sola el día que alguien escriba mal la variable. Aquí la duda siempre se
 * resuelve en «no autorizada», que es el lado seguro.
 */
export function interpretarAutorizacionFaseD(valor: unknown): boolean {
  return valor === "true";
}

/**
 * Cerrada durante la Fase C. La abre la variable de entorno `FASE_D_AUTORIZADA`, y solo
 * con el valor exacto `true`.
 *
 * Es la **segunda** llave, no la única: activar la Fase D exigirá además poner
 * `modelo_catalogo` en `relational_v2`. La vuelta atrás no depende de esta variable —la
 * bandera de la base sola basta y no necesita despliegue—, así que un entorno mal
 * configurado puede impedir una activación pero nunca impedir una reversión.
 */
export const FASE_D_AUTORIZADA = interpretarAutorizacionFaseD(
  process.env.FASE_D_AUTORIZADA,
);

export function modeloEfectivo(
  modelo: ModeloDeCatalogo,
  faseDAutorizada: boolean = FASE_D_AUTORIZADA,
): ModeloDeCatalogo {
  // `=== true` y no `!faseDAutorizada`: cualquier valor verdadero abriría la puerta, y
  // este módulo también se consume desde scripts `.mjs` donde los tipos no protegen.
  if (modelo === "relational_v2" && faseDAutorizada !== true) return "shadow";
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
