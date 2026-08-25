import type { AdminAuthQuery } from "../auth/types";
import type { FichaTecnica } from "./ficha";

/**
 * El prefijo que se propone según el tipo.
 *
 * **No es una regla histórica, es una propuesta.** Los prefijos actuales no
 * siguen un criterio único: `ECO-ELE` son las placas, `ECO-IND` el industrial,
 * y en los sistemas lineales mandó la marca de origen —doce llevan `ECO-TUB` y
 * cuatro se quedaron en `ECO-CAT`—. Como no hay norma que recuperar, la
 * pantalla sugiere y el dueño cambia lo que quiera antes de guardar.
 */
const PREFIJOS_SUGERIDOS: Record<string, string> = {
  placas_accesorios: "ELE",
  iluminacion_industrial: "IND",
  sistemas_lineales_tubos: "TUB",
};

/** El cajón general: lo llevan 234 de los 313 productos actuales. */
const PREFIJO_POR_DEFECTO = "CAT";

/** Deja huecos entre posiciones para poder intercalar sin renumerar. */
const PASO_DE_POSICION = 10;

export function prefijoSugerido(tipo: string) {
  return PREFIJOS_SUGERIDOS[tipo] ?? PREFIJO_POR_DEFECTO;
}

export function construirReferencia(prefijo: string, numero: number) {
  return `ECO-${prefijo.toUpperCase()}-${String(numero).padStart(4, "0")}`;
}

export type ValidacionPrefijo = { ok: true; valor: string } | { ok: false; error: string };

export function validarPrefijo(entrada: string): ValidacionPrefijo {
  const valor = entrada.trim().toUpperCase();
  if (!/^[A-Z]{2,6}$/.test(valor)) {
    return { ok: false, error: "El prefijo son de dos a seis letras, sin números ni guiones." };
  }
  return { ok: true, valor };
}

export type ProductoNuevo = {
  prefijo: string;
  nombre: string;
  descripcion: string;
  imagen: string;
  tipo: string;
  tipoEtiqueta: string;
  aplicacion: string;
  aplicacionEtiqueta: string;
  familia: string;
  fichaTecnica: FichaTecnica;
  publicado: boolean;
};

/**
 * Da de alta el producto y devuelve su referencia.
 *
 * El número sale de `econoluz_reference_seq`, la secuencia que creó
 * `db/002_products.sql` arrancando en 314 porque el último producto importado
 * es el 313. Pedirle un número a la secuencia es atómico: dos altas a la vez
 * no pueden recibir el mismo.
 *
 * El identificador interno se construye con la referencia en minúsculas. Los
 * 313 antiguos lo tienen con el nombre del proveedor dentro
 * (`construlita-cuasar`); lo nuevo no repite eso.
 */
export async function crearProducto(query: AdminAuthQuery, datos: ProductoNuevo) {
  const [fila] = await query("select nextval('econoluz_reference_seq') as numero", []);
  const referencia = construirReferencia(datos.prefijo, Number(fila?.numero ?? 0));

  const [posiciones] = await query("select max(position) as ultima from products", []);
  const posicion = Number(posiciones?.ultima ?? 0) + PASO_DE_POSICION;

  await query(
    `
      insert into products (
        id, econoluz_reference, position,
        public_name, public_description, image, technical_specs,
        product_type, product_type_label, application, application_label,
        family_label, published
      ) values (
        $1, $2, $3,
        $4, $5, $6, $7::jsonb,
        $8, $9, $10, $11,
        $12, $13
      )
    `,
    [
      referencia.toLowerCase(),
      referencia,
      posicion,
      datos.nombre,
      datos.descripcion,
      datos.imagen,
      JSON.stringify(datos.fichaTecnica),
      datos.tipo,
      datos.tipoEtiqueta,
      datos.aplicacion,
      datos.aplicacionEtiqueta,
      datos.familia,
      datos.publicado,
    ],
  );

  return referencia;
}
