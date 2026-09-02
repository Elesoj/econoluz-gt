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

/**
 * Qué se puede hacer con una definición que ya está en uso.
 *
 * Borrar un atributo o una opción que ya describe productos perdería esos datos sin avisar,
 * así que desde el primer uso solo cabe desactivar. Desactivar impide asignaciones nuevas y
 * conserva las históricas, y la clave sigue reservada para que nadie la reutilice con otro
 * significado. Vale igual para un atributo y para una opción.
 */
export function decidirRetirada(usos: number): "borrar" | "desactivar" {
  return usos === 0 ? "borrar" : "desactivar";
}

/**
 * El tipo de un atributo usado es inmutable: cambiarlo reinterpretaría los valores ya
 * guardados —los `20` de `value_number` pasarían a leerse como otra cosa— sin tocarlos.
 * La base lo impide además con una clave foránea compuesta hacia `attributes (id, tipo)`.
 */
export function puedeCambiarseElTipo(usos: number): boolean {
  return usos === 0;
}

export type Atributo = { id: string; tipo: TipoDeAtributo };
export type Opcion = { id: string; atributoId: string; activa: boolean };

export type Asignacion =
  | { clase: "escalar"; valor: unknown }
  | { clase: "opcion"; opcion: Opcion };

export type ResultadoDeAsignaciones = { ok: true } | { ok: false; motivo: string };
export type ModoDeValidacionDeAsignaciones = "asignacion_nueva" | "valor_existente";

const ADMITE_VARIAS = (tipo: TipoDeAtributo) => tipo === "opcion_multiple";
const ESPERA_OPCION = (tipo: TipoDeAtributo) => tipo === "opcion" || tipo === "opcion_multiple";

/**
 * Las cuatro reglas de las asignaciones de un producto, en un solo sitio.
 *
 * Tres de ellas las impide además el esquema —un solo valor escalar, la opción del atributo
 * correcto y nunca la misma opción dos veces—, y aquí existen para poder dar un mensaje
 * entendible en vez de un error de Postgres. La cuarta, que la opción esté **activa**, solo
 * puede vivir aquí: el esquema no distingue una fila nueva de una histórica, y desactivar
 * tiene que impedir lo primero sin borrar lo segundo.
 */
export function validarAsignaciones(
  atributo: Atributo,
  asignaciones: readonly Asignacion[],
  modo: ModoDeValidacionDeAsignaciones = "asignacion_nueva",
): ResultadoDeAsignaciones {
  if (asignaciones.length === 0) {
    return { ok: true };
  }

  if (!ADMITE_VARIAS(atributo.tipo) && asignaciones.length > 1) {
    return {
      ok: false,
      motivo: `El atributo admite un solo valor por producto, y llegaron ${asignaciones.length}.`,
    };
  }

  const vistas = new Set<string>();

  for (const asignacion of asignaciones) {
    if (ESPERA_OPCION(atributo.tipo) !== (asignacion.clase === "opcion")) {
      return {
        ok: false,
        motivo: `Un atributo de tipo ${atributo.tipo} no admite un valor de clase ${asignacion.clase}.`,
      };
    }

    if (asignacion.clase === "escalar") {
      const valor = validarValor(atributo.tipo, asignacion.valor);
      if (!valor.ok) return { ok: false, motivo: valor.motivo };
      continue;
    }

    const { opcion } = asignacion;

    if (opcion.atributoId !== atributo.id) {
      return { ok: false, motivo: `La opción ${opcion.id} no pertenece a este atributo.` };
    }

    if (!opcion.activa && modo === "asignacion_nueva") {
      return {
        ok: false,
        motivo: `La opción ${opcion.id} está desactivada y no admite asignaciones nuevas.`,
      };
    }

    if (vistas.has(opcion.id)) {
      return { ok: false, motivo: `La opción ${opcion.id} está repetida: no puede elegirse dos veces.` };
    }
    vistas.add(opcion.id);
  }

  return { ok: true };
}

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
