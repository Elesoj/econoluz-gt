/** Las direcciones de entrega del cliente. */

export type DireccionValidada = {
  destinatario: string;
  telefono: string;
  departamento: string;
  municipio: string;
  direccion: string;
  referencias: string;
  predeterminada: boolean;
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
  const faltan = OBLIGATORIOS.filter((campo) => {
    const valor = texto(datos[campo]);
    return valor.length === 0 || valor.length > LARGO_MAXIMO;
  });

  if (faltan.length > 0) {
    return { ok: false, faltan };
  }

  const referencias = texto(datos.referencias);
  if (referencias.length > LARGO_MAXIMO) {
    return { ok: false, faltan: ["referencias"] };
  }

  return {
    ok: true,
    direccion: {
      destinatario: texto(datos.destinatario),
      telefono: texto(datos.telefono),
      departamento: texto(datos.departamento),
      municipio: texto(datos.municipio),
      direccion: texto(datos.direccion),
      referencias,
      predeterminada: datos.predeterminada === true,
    },
  };
}

export const SQL_LISTAR_DIRECCIONES = `
  select id, destinatario, telefono, departamento, municipio, direccion, referencias, predeterminada
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
    (user_id, destinatario, telefono, departamento, municipio, direccion, referencias, predeterminada)
  values ($1, $2, $3, $4, $5, $6, $7, $8)
  returning id
`;
