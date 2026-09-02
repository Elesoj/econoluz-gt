/**
 * El tipado de las características del catálogo, y la regla que lo sostiene todo.
 *
 * Hoy `power` vale la cadena `"20 W"`, y por eso no se puede pedir «entre 15 y 25 W»: para
 * la base de datos eso es texto. El modelo nuevo guarda cada valor en la columna que
 * corresponde a su tipo, y **exactamente en una**, que es lo que permite comparar de verdad.
 *
 * Módulo puro: sin red, sin base de datos y sin `server-only`, para poder probarlo entero.
 * La restricción equivalente vive también en `db/010_catalogo_relacional.sql`, porque una
 * regla que solo vigila la aplicación acaba incumpliéndose desde un script.
 */

export const TIPOS_DE_ATRIBUTO = [
  "numero",
  "texto",
  "booleano",
  "opcion",
  "opcion_multiple",
] as const;

export type TipoDeAtributo = (typeof TIPOS_DE_ATRIBUTO)[number];

export type ColumnaDeValor = "value_number" | "value_text" | "value_bool" | "option_id";

/**
 * `opcion` y `opcion_multiple` comparten columna a propósito: la diferencia entre elegir
 * una o varias está en cuántas filas hay, no en dónde se guarda cada una.
 */
export const COLUMNA_DE_TIPO: Record<TipoDeAtributo, ColumnaDeValor> = {
  numero: "value_number",
  texto: "value_text",
  booleano: "value_bool",
  opcion: "option_id",
  opcion_multiple: "option_id",
};

export type ValorDeAtributo = {
  value_number: number | null;
  value_text: string | null;
  value_bool: boolean | null;
  option_id: string | null;
};

const VACIO: ValorDeAtributo = {
  value_number: null,
  value_text: null,
  value_bool: null,
  option_id: null,
};

export type ResultadoDeValor =
  | { ok: true; columnas: ValorDeAtributo }
  | { ok: false; motivo: string };

/** Qué columnas de una fila están llenas. La respuesta correcta es siempre una. */
export function columnasLlenas(columnas: ValorDeAtributo): ColumnaDeValor[] {
  return (Object.keys(VACIO) as ColumnaDeValor[]).filter((clave) => columnas[clave] !== null);
}

const esTexto = (valor: unknown): valor is string =>
  typeof valor === "string" && valor.trim().length > 0;

export function validarValor(tipo: TipoDeAtributo, valor: unknown): ResultadoDeValor {
  switch (tipo) {
    case "numero":
      // `NaN` e `Infinity` son números para JavaScript y veneno para un filtro por rango:
      // una comparación contra ellos no es verdadera ni falsa. Caen aquí, no en la base.
      return typeof valor === "number" && Number.isFinite(valor)
        ? { ok: true, columnas: { ...VACIO, value_number: valor } }
        : { ok: false, motivo: `Un atributo de tipo numero necesita un número finito.` };

    case "texto":
      return esTexto(valor)
        ? { ok: true, columnas: { ...VACIO, value_text: valor.trim() } }
        : { ok: false, motivo: "Un atributo de tipo texto no puede quedar vacío." };

    case "booleano":
      // La cadena "true" que manda un formulario no es un booleano, y aceptarla haría que
      // "false" también fuera verdadero.
      return typeof valor === "boolean"
        ? { ok: true, columnas: { ...VACIO, value_bool: valor } }
        : { ok: false, motivo: "Un atributo de tipo booleano necesita true o false." };

    case "opcion":
    case "opcion_multiple":
      return esTexto(valor)
        ? { ok: true, columnas: { ...VACIO, option_id: valor.trim() } }
        : { ok: false, motivo: "Una opción necesita el identificador de la opción elegida." };

    default:
      return { ok: false, motivo: `Tipo de atributo desconocido: ${String(tipo)}.` };
  }
}
