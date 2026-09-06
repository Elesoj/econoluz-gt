// app/admin/envios/formularios.ts
//
// MÓDULO PURO: sin la directiva "use server", para poder importarlo desde las
// pruebas unitarias sin las restricciones de las Server Actions.
//
// Nada de lo que llega en el `FormData` se acepta sin comprobar: el desplegable
// del panel es cerrado, pero el navegador puede enviar cualquier cosa.

import {
  esZonaCapitalinaValida,
  type MetodoEnvioZona,
  type ZonaCapitalina,
} from "../../envios/zonasCapitalinas";
import type { ReglasPropias } from "../../envios/tarifas";

export type ResultadoAccionMetodo =
  | { ok: true; zona: ZonaCapitalina; metodo: MetodoEnvioZona }
  | { ok: false; error: string };

export type ResultadoAccionReglas =
  | { ok: true; reglas: ReglasPropias }
  | { ok: false; error: string };

/**
 * Cien millones de céntimos son un millón de quetzales: muy por encima de
 * cualquier tarifa o umbral real, y muy por debajo del entero seguro. Una cota
 * evita que un dedazo o un `POST` a mano metan un número que después se arrastre
 * a los cálculos.
 */
const MAXIMO_CENTS = 100_000_000;

/** Un entero de verdad: ni vacío, ni decimal, ni texto que `Number` convierta a 0. */
function aEnteroEstricto(bruto: FormDataEntryValue | null): number {
  if (typeof bruto !== "string") return Number.NaN;
  const texto = bruto.trim();
  if (texto === "" || !/^-?\d+$/.test(texto)) return Number.NaN;
  return Number(texto);
}

export function validarFormularioMetodoZona(formData: FormData): ResultadoAccionMetodo {
  const rawZona = formData.get("zona");
  const rawMetodo = formData.get("metodo");

  const zona = aEnteroEstricto(rawZona);
  if (!esZonaCapitalinaValida(zona)) {
    return { ok: false, error: `La zona ${String(rawZona ?? "")} no es válida.` };
  }

  if (rawMetodo !== "mensajero_propio" && rawMetodo !== "guatex") {
    return { ok: false, error: `El método ${String(rawMetodo ?? "")} no está permitido.` };
  }

  return { ok: true, zona, metodo: rawMetodo };
}

export function validarFormularioReglasEnvio(formData: FormData): ResultadoAccionReglas {
  const tarifa = aEnteroEstricto(formData.get("tarifaCents"));
  const umbral = aEnteroEstricto(formData.get("umbralGratisCents"));

  if (!Number.isSafeInteger(tarifa) || tarifa < 0 || tarifa > MAXIMO_CENTS) {
    return {
      ok: false,
      error: `La tarifa debe ser un número entero de céntimos entre 0 y ${MAXIMO_CENTS}.`,
    };
  }
  if (!Number.isSafeInteger(umbral) || umbral < 0 || umbral > MAXIMO_CENTS) {
    return {
      ok: false,
      error: `El umbral de gratuidad debe ser un número entero de céntimos entre 0 y ${MAXIMO_CENTS}.`,
    };
  }

  return { ok: true, reglas: { tarifaCents: tarifa, umbralGratisCents: umbral } };
}
