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

  // Los códigos son **obligatorios** en toda dirección nueva, y no se degradan a
  // `null` cuando faltan o vienen mal.
  //
  // Aceptarlos como opcionales abría un rodeo: omitirlos saltaba la comprobación
  // contra el catálogo y, con ella, la obligatoriedad de la zona capitalina.
  // Bastaba con guardar «Guatemala/Guatemala» como texto libre para quedarse con
  // una dirección de la capital sin zona, que después no se puede repartir ni
  // calcular.
  //
  // Esto no invalida nada de lo ya guardado: las direcciones históricas sin
  // códigos se siguen leyendo igual. La obligatoriedad es para lo que entra.
  const depCodRaw = texto(datos.departamentoCodigo);
  const munCodRaw = texto(datos.municipioCodigo);
  const depTieneForma = /^\d{2}$/.test(depCodRaw);
  const munTieneForma = /^\d{4}$/.test(munCodRaw);

  if (!depTieneForma) {
    faltan.push("departamento");
  }
  if (!munTieneForma) {
    faltan.push("municipio");
  }

  // Con la forma correcta, tienen que ser además un destino que existe de verdad
  // y corresponderse entre sí: Quetzaltenango no está dentro de Guatemala.
  const oficial =
    depTieneForma && munTieneForma
      ? resolverDestinoOficial(depCodRaw, munCodRaw, MUNICIPIOS_OFICIALES)
      : null;

  if (depTieneForma && munTieneForma && !oficial) {
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
