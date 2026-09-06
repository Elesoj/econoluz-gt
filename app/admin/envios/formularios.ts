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
import type { RecogidaEnTienda } from "../../lib/ajustes";

/** El mismo límite que aplica `leerRecogidaEnTienda` al interpretar lo guardado. */
export const LARGO_TEXTO_RECOGIDA = 200;

export type ResultadoAccionMetodo =
  | { ok: true; zona: ZonaCapitalina; metodo: MetodoEnvioZona }
  | { ok: false; error: string };

export type ResultadoAccionReglas =
  | { ok: true; reglas: ReglasPropias }
  | { ok: false; error: string };

/**
 * Un millón de quetzales: muy por encima de cualquier tarifa o umbral real, y muy
 * por debajo del entero seguro. Una cota evita que un dedazo o un `POST` a mano
 * metan un número que después se arrastre a los cálculos.
 */
export const MAXIMO_QUETZALES = 1_000_000;

/** Lo que ocupa el mismo importe por dentro, que es donde se suma el dinero. */
const MAXIMO_CENTS = MAXIMO_QUETZALES * 100;

/** Lo que puede escribir una persona: 35, 35.5, 35.50, 2,500.00. */
const IMPORTE_EN_QUETZALES = /^\d{1,7}(?:,\d{3})*(?:\.\d{0,2})?$/;

/** Lo mismo, pero con más de dos decimales: se distingue para decirlo con precisión. */
const IMPORTE_CON_DEMASIADOS_DECIMALES = /^\d[\d,]*\.\d{3,}$/;

export type ImporteEnQuetzales =
  | { ok: true; centavos: number }
  | { ok: false; error: string };

/**
 * Convierte lo que escribe una persona en quetzales al entero de centavos que se
 * guarda.
 *
 * **No usa `Number()` sobre el texto crudo a propósito.** `Number("3.5e3")` da
 * 3500 y `Number("")` da 0: una conversión ingenua aceptaría en silencio un
 * importe que nadie escribió. Aquí solo entra lo que tiene forma de cantidad de
 * dinero, y los centavos se calculan sobre los dígitos, sin coma flotante de por
 * medio, para que Q35.35 no acabe siendo 3534.
 */
export function importeAQuetzalesEnCentavos(
  bruto: FormDataEntryValue | null,
  campo: string,
): ImporteEnQuetzales {
  const texto = typeof bruto === "string" ? bruto.trim() : "";

  if (texto === "") {
    return { ok: false, error: `Escribe ${campo} en quetzales, por ejemplo 35.00.` };
  }

  if (IMPORTE_CON_DEMASIADOS_DECIMALES.test(texto)) {
    return {
      ok: false,
      error: `${campo} no puede tener más de dos decimales, por ejemplo Q35.50.`,
    };
  }

  if (!IMPORTE_EN_QUETZALES.test(texto)) {
    return {
      ok: false,
      error: `${campo} tiene que ser una cantidad en quetzales, por ejemplo 35.00 o 2,500.00.`,
    };
  }

  const [enteroCrudo, decimalCrudo = ""] = texto.replace(/,/g, "").split(".");
  const entero = Number(enteroCrudo);
  const centavosDecimales = Number(decimalCrudo.padEnd(2, "0"));
  const centavos = entero * 100 + centavosDecimales;

  if (!Number.isSafeInteger(centavos) || centavos > MAXIMO_CENTS) {
    return {
      ok: false,
      error: `${campo} no puede pasar de Q${MAXIMO_QUETZALES.toLocaleString("en-US")}.00.`,
    };
  }

  return { ok: true, centavos };
}

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
  const tarifa = importeAQuetzalesEnCentavos(formData.get("tarifaQuetzales"), "La tarifa fija");
  if (!tarifa.ok) {
    return { ok: false, error: tarifa.error };
  }

  const umbral = importeAQuetzalesEnCentavos(
    formData.get("umbralGratisQuetzales"),
    "El importe a partir del cual el envío es gratis",
  );
  if (!umbral.ok) {
    return { ok: false, error: umbral.error };
  }

  // Lo que sale de aquí ya es lo que guarda `app_settings`: enteros en centavos.
  return {
    ok: true,
    reglas: { tarifaCents: tarifa.centavos, umbralGratisCents: umbral.centavos },
  };
}

export type ResultadoAccionRecogida =
  | { ok: true; recogida: RecogidaEnTienda }
  | { ok: false; error: string };

/**
 * La recogida en tienda del panel.
 *
 * Si se ofrece al cliente, hay que decirle dónde y cuándo recoger: activarla sin
 * texto dejaría en la pantalla una opción que no explica nada.
 *
 * Al desactivarla **el texto se conserva**, no se borra: quien la apaga un día
 * suele volver a encenderla, y perder lo escrito obliga a redactarlo otra vez.
 */
export function validarFormularioRecogida(formData: FormData): ResultadoAccionRecogida {
  const activa = formData.get("activa") === "on";
  const texto = String(formData.get("texto") ?? "").trim();

  if (texto.length > LARGO_TEXTO_RECOGIDA) {
    return {
      ok: false,
      error: `La información para el cliente no puede pasar de ${LARGO_TEXTO_RECOGIDA} caracteres.`,
    };
  }

  if (activa && texto.length === 0) {
    return {
      ok: false,
      error:
        "Escribe la información para el cliente: si se ofrece la recogida, hay que decirle dónde y cuándo recoger.",
    };
  }

  return { ok: true, recogida: { activa, texto } };
}
