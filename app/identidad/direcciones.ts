/** Las direcciones de entrega del cliente. */

import { esZonaCapitalinaValida } from "../envios/zonasCapitalinas";
import {
  resolverDestinoOficial,
  type MunicipioCatalogo,
} from "../envios/geografia";
import geografia from "../../db/datos/geografia-gt.json" with { type: "json" };

/**
 * El catálogo oficial del INE, el mismo que alimenta los desplegables. Se importa
 * aquí porque esta función es la frontera del servidor: los códigos llegan en un
 * `FormData` que escribe el navegador, y comprobar solo su forma —dos dígitos y
 * cuatro dígitos— deja pasar códigos inventados y parejas que no se corresponden.
 *
 * Importa más desde que la zona capitalina decide el precio: enviar 01/0101 a
 * mano convertiría cualquier dirección en capitalina y elegible para el mensajero
 * propio a Q35.
 */
const MUNICIPIOS_OFICIALES: readonly MunicipioCatalogo[] = geografia.municipios;

export type DireccionValidada = {
  destinatario: string;
  telefono: string;
  departamento: string;
  municipio: string;
  direccion: string;
  referencias: string;
  predeterminada: boolean;
  departamentoCodigo?: string | null;
  municipioCodigo?: string | null;
  zonaCapitalina?: number | null;
};

export type ResultadoDeValidacion =
  | { ok: true; direccion: DireccionValidada }
  | { ok: false; faltan: string[] };

const OBLIGATORIOS = [
  "destinatario",
  "telefono",
  "departamento",
  "municipio",
  "direccion",
] as const;
const LARGO_MAXIMO = 300;

const texto = (valor: unknown) => (typeof valor === "string" ? valor.trim() : "");

/**
 * Lo que ve el cliente en la pantalla, no el nombre del campo en el formulario. Decirle
 * «destinatario» cuando la etiqueta dice «Quién recibe» le obliga a adivinar.
 */
const ETIQUETAS: Record<string, string> = {
  destinatario: "quién recibe",
  telefono: "teléfono",
  departamento: "departamento",
  municipio: "municipio",
  direccion: "dirección",
  referencias: "referencias",
  zonaCapitalina: "zona capitalina",
};

/**
 * El mensaje que sustituye al silencio: antes la acción hacía `return` y el cliente se
 * quedaba mirando el formulario sin saber qué había pasado.
 *
 * No dice que los campos no puedan quedar vacíos, porque `referencias` sí puede y solo
 * falla por larga. Dice qué revisar y cuál es el límite, que es lo único cierto de los dos
 * casos a la vez.
 */
export function mensajeDeFaltan(faltan: readonly string[]): string {
  if (faltan.length === 0) return "";

  const etiquetas = faltan.map((campo) => ETIQUETAS[campo] ?? "algún dato");
  const unicos = [...new Set(etiquetas)];

  const cabecera =
    unicos.length === 1
      ? `Revisa el campo «${unicos[0]}».`
      : `Revisa estos campos: ${unicos.map((e) => `«${e}»`).join(", ")}.`;

  return `${cabecera} Los obligatorios no pueden quedar vacíos, y ninguno puede pasar de ${LARGO_MAXIMO} caracteres.`;
}

export function validarDireccion(entrada: unknown): ResultadoDeValidacion {
  if (typeof entrada !== "object" || entrada === null) {
    return { ok: false, faltan: [...OBLIGATORIOS] };
  }

  const datos = entrada as Record<string, unknown>;
  const faltan: string[] = OBLIGATORIOS.filter((campo) => {
    const valor = texto(datos[campo]);
    return valor.length === 0 || valor.length > LARGO_MAXIMO;
  });

  const referencias = texto(datos.referencias);
  if (referencias.length > LARGO_MAXIMO) {
    faltan.push("referencias");
  }

  const depCodRaw = texto(datos.departamentoCodigo);
  const munCodRaw = texto(datos.municipioCodigo);
  const tieneFormaDeCodigos = /^\d{2}$/.test(depCodRaw) && /^\d{4}$/.test(munCodRaw);

  // Si vienen códigos, tienen que ser de un destino que existe de verdad. Un
  // código inventado o una pareja incompatible —Quetzaltenango dentro de
  // Guatemala— se rechaza, no se ignora en silencio: ignorarlo guardaría la
  // dirección sin códigos y el envío no se podría calcular.
  const oficial = tieneFormaDeCodigos
    ? resolverDestinoOficial(depCodRaw, munCodRaw, MUNICIPIOS_OFICIALES)
    : null;

  if (tieneFormaDeCodigos && !oficial) {
    faltan.push("municipio");
  }

  const departamentoCodigo = oficial ? oficial.departamento.codigo : null;
  const municipioCodigo = oficial ? oficial.municipio.codigo : null;

  // La zona solo existe en el municipio de Guatemala, y allí es obligatoria: es
  // lo único que distingue un destino con mensajero propio de uno que va por
  // Guatex. Fuera de la capital se descarta cualquier valor que llegue.
  const esMunicipioGuatemala = departamentoCodigo === "01" && municipioCodigo === "0101";
  let zonaCapitalina: number | null = null;

  if (esMunicipioGuatemala) {
    const bruta = datos.zonaCapitalina;
    // El formulario la envía como texto; el resto de llamadas, como número.
    const numero =
      typeof bruta === "number"
        ? bruta
        : typeof bruta === "string" && bruta.trim() !== ""
          ? Number(bruta)
          : Number.NaN;
    if (!esZonaCapitalinaValida(numero)) {
      faltan.push("zonaCapitalina");
    } else {
      zonaCapitalina = numero;
    }
  }

  if (faltan.length > 0) {
    return { ok: false, faltan };
  }

  return {
    ok: true,
    direccion: {
      destinatario: texto(datos.destinatario),
      telefono: texto(datos.telefono),
      // Con códigos oficiales manda el catálogo, no lo que escribiera el
      // formulario: el nombre es texto libre que viaja en el `FormData`.
      departamento: oficial ? oficial.departamento.nombre : texto(datos.departamento),
      municipio: oficial ? oficial.municipio.nombre : texto(datos.municipio),
      direccion: texto(datos.direccion),
      referencias,
      predeterminada: datos.predeterminada === true,
      departamentoCodigo,
      municipioCodigo,
      zonaCapitalina,
    },
  };
}

export const SQL_LISTAR_DIRECCIONES = `
  select id, destinatario, telefono, departamento, municipio, direccion, referencias, predeterminada, departamento_codigo, municipio_codigo, zona_capitalina
  from user_addresses
  where user_id = $1
  order by predeterminada desc, id
`;

export const SQL_QUITAR_PREDETERMINADA = `
  update user_addresses set predeterminada = false, actualizado_en = now()
  where user_id = $1 and predeterminada
`;

export const SQL_INSERTAR_DIRECCION = `
  insert into user_addresses
    (user_id, destinatario, telefono, departamento, municipio, direccion, referencias, predeterminada, departamento_codigo, municipio_codigo, zona_capitalina)
  values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
  returning id
`;
