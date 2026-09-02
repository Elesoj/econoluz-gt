/**
 * La traducción del catálogo actual al núcleo relacional.
 *
 * Módulo puro: sin red, sin base de datos y sin `server-only`, para poder probarlo entero.
 * Aun así **maneja datos del proveedor** —marca, serie, código y textos sin sanear—, igual
 * que `app/data/productRow.ts`, así que solo debe importarse desde código de servidor y
 * desde los scripts. Nada de lo que devuelve `planificarProducto` en `categorias`,
 * `imagenes` o `atributos` contiene información del proveedor; esa vive aislada en
 * `privados`, que es lo único que va a `product_private_data`.
 *
 * ## Por qué casi nada se normaliza
 *
 * El diseño §3.8 quiere que la potencia se guarde como el número `20` con la unidad `W`
 * aparte, para poder pedir «entre 15 y 25 W». El catálogo real no lo permite todavía: sus
 * fichas describen **familias** de producto, así que `power` vale
 * `"75 W / 100 W / 150 W / 200 W"` y `colorTemperature` vale `"4 000 K / 5 000 K"`.
 * Convertirlos exige antes decidir si un producto se parte en variantes, que es materia del
 * ERP y no de este subproyecto.
 *
 * Por eso solo se normalizan las siete claves de `CLAVES_NUMERICAS`, aprobadas por el dueño
 * el 02/09/2026 tras ver todos sus valores, y **el dato original se conserva intacto** en
 * `products.technical_specs`, que esta importación no toca. `specialFeatures` queda fuera a
 * propósito: sus 947 valores distintos, el 77 % usados por un solo producto, son texto
 * libre y no un vocabulario controlado.
 */

import { aCentavos } from "../../lib/dinero";

export type FilaDeCatalogo = {
  id: string;
  econoluz_reference: string;
  position: number;
  public_name: string;
  public_description: string;
  image: string;
  images: string[] | null;
  technical_specs: Record<string, string | string[]> | null;
  product_type: string;
  product_type_label: string;
  application: string;
  application_label: string;
  finish: string;
  finish_label: string;
  family_label: string;
  supplier_brand: string;
  supplier_brand_label: string;
  supplier_series: string;
  supplier_series_label: string;
  supplier_code: string;
  supplier_name: string;
  supplier_description: string;
  price_gtq: number | null;
  published: boolean;
};

export type NumeroConUnidad = { numero: number; unidad: string | null };

/**
 * Un número al principio, con separador de millares opcional. La primera alternativa exige
 * al menos un grupo separado para no partir `1234` en `123` y sobra `4`.
 */
const NUMERO = /^(\d{1,3}(?:[\u0020\u00a0,]\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(.*)$/;

/**
 * Qué se acepta como unidad: una sola palabra corta que **no lleva dígitos**, con una
 * barra opcional para las compuestas (`lm/W`).
 *
 * Es la mitad importante de la regla. Sin ella, `"5-8 anos"` se lee como el número 5 con la
 * unidad `"-8 anos"`, y `"5V Max. 2.1A"` como el 5 con la unidad `"V Max. 2.1A"`: dos
 * valores corruptos que después nadie distingue de los buenos.
 */
const UNIDAD = /^[A-Za-zµΩ°%][A-Za-z°%.]{0,5}(?:\/[A-Za-z]{1,3})?$/;

/** El valor tal cual lo guarda el catálogo: una cadena, o varias que se unen para mirarlas. */
export function aplanarValor(valor: string | string[]): string {
  return Array.isArray(valor) ? valor.join(" / ") : String(valor);
}

/**
 * El número que hay en un texto, o `null` si el texto no es exactamente un número con una
 * unidad simple. Rechazar es la respuesta correcta ante cualquier duda: un rango, una
 * familia de valores, una aproximación (`>80`) o una frase.
 */
export function numeroEstricto(texto: string): NumeroConUnidad | null {
  const coincidencia = NUMERO.exec(String(texto).trim());
  if (!coincidencia) return null;

  const unidad = coincidencia[2].trim();
  if (unidad !== "" && !UNIDAD.test(unidad)) return null;

  const numero = Number(coincidencia[1].replace(/[\u0020\u00a0,]/g, ""));
  if (!Number.isFinite(numero)) return null;

  return { numero, unidad: unidad === "" ? null : unidad };
}

/**
 * Las siete claves de `technical_specs` que se convierten en atributos tipados.
 *
 * Son las únicas cuyo valor es, en **todas** sus apariciones del catálogo, un número con
 * una unidad simple. El dueño las revisó una a una con todos sus valores el 02/09/2026.
 * Ampliar esta lista no es un detalle: el tipo de un atributo con valores es inmutable por
 * clave foránea compuesta, así que meter aquí una clave ambigua la congela para siempre.
 */
export const CLAVES_NUMERICAS = [
  "amperage",
  "savings",
  "panelLifetime",
  "disconnectSpeed",
  "shortCircuitCurrent",
  "weight",
  "cutout",
] as const;

/** El nombre visible de cada atributo. La clave técnica no se le enseña a nadie. */
export const NOMBRES_DE_ATRIBUTO: Record<(typeof CLAVES_NUMERICAS)[number], string> = {
  amperage: "Amperaje",
  savings: "Ahorro",
  panelLifetime: "Vida útil del panel",
  disconnectSpeed: "Velocidad de desconexión",
  shortCircuitCurrent: "Corriente de cortocircuito",
  weight: "Peso",
  cutout: "Medida de corte",
};

/** Unidades canónicas aprobadas; el texto original permanece en `technical_specs`. */
export const UNIDADES_NUMERICAS: Record<(typeof CLAVES_NUMERICAS)[number], string> = {
  amperage: "A",
  savings: "%",
  panelLifetime: "años",
  disconnectSpeed: "segundos",
  shortCircuitCurrent: "kA",
  weight: "g",
  cutout: "mm",
};

/** `attributes.clave` tiene que ir en minúsculas: lo exige `attributes_clave_minusculas`. */
export function claveDeAtributo(clave: string): string {
  return clave.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

const guionizar = (valor: string) =>
  valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * El slug de una categoría. El de una hoja **lleva dentro el de su padre**, y no es un
 * adorno: `decorativos` cuelga a la vez de iluminación arquitectónica y de exterior, y
 * `categories.slug` es único en toda la tabla.
 */
export function slugDeCategoria(tipo: string, aplicacion?: string): string {
  const raiz = guionizar(tipo);
  return aplicacion ? `${raiz}-${guionizar(aplicacion)}` : raiz;
}

export type CategoriaPlan = {
  slug: string;
  nombre: string;
  parentSlug: string | null;
  posicion: number;
};

/**
 * El árbol completo que hace falta para clasificar estas filas: una raíz por tipo de
 * producto y una hoja por pareja tipo/aplicación. Las raíces salen antes que sus hojas
 * porque `categories.parent_id` no puede apuntar a una fila que todavía no existe.
 */
export function categoriasDelCatalogo(filas: readonly FilaDeCatalogo[]): CategoriaPlan[] {
  const raices = new Map<string, CategoriaPlan>();
  const hojas = new Map<string, CategoriaPlan>();

  for (const fila of filas) {
    const slugRaiz = slugDeCategoria(fila.product_type);
    if (!raices.has(slugRaiz)) {
      raices.set(slugRaiz, {
        slug: slugRaiz,
        nombre: fila.product_type_label,
        parentSlug: null,
        posicion: raices.size * 10,
      });
    }

    const slugHoja = slugDeCategoria(fila.product_type, fila.application);
    if (!hojas.has(slugHoja)) {
      hojas.set(slugHoja, {
        slug: slugHoja,
        nombre: fila.application_label,
        parentSlug: slugRaiz,
        posicion: hojas.size * 10,
      });
    }
  }

  return [...raices.values(), ...hojas.values()];
}

export type ImagenPlan = {
  url: string;
  alt: string;
  posicion: number;
  visible: boolean;
  principal: boolean;
};

export type AtributoPlan = {
  clave: string;
  nombre: string;
  unidad: string | null;
  numero: number;
};

export type RechazoDeAtributo = { clave: string; valor: string; motivo: string };

export type DatosPrivados = {
  supplier_brand: string;
  supplier_brand_label: string;
  supplier_series: string;
  supplier_series_label: string;
  supplier_code: string;
  supplier_name: string;
  supplier_description: string;
};

export type PlanDeProducto = {
  id: string;
  categorias: { slug: string; principal: boolean }[];
  imagenes: ImagenPlan[];
  atributos: AtributoPlan[];
  rechazos: RechazoDeAtributo[];
  privados: DatosPrivados;
  precioNormalCentavos: number | null;
};

/** Hueco entre posiciones, para poder intercalar una foto sin renumerar el resto. */
const PASO_DE_POSICION = 10;

/**
 * Qué filas relacionales le corresponden a un producto del catálogo actual.
 *
 * No escribe nada ni decide identificadores: devuelve el plan en claves naturales —slugs de
 * categoría y claves de atributo— y es el importador quien las resuelve contra la base.
 */
export function planificarProducto(fila: FilaDeCatalogo): PlanDeProducto {
  const urls: string[] = [];
  for (const url of [fila.image, ...(fila.images ?? [])]) {
    // La galería del catálogo repite a veces la foto principal, y `(product_id, posicion)`
    // es único: la duplicada se descarta en vez de hacer fallar la importación entera.
    if (url && !urls.includes(url)) urls.push(url);
  }

  const atributos: AtributoPlan[] = [];
  const rechazos: RechazoDeAtributo[] = [];

  for (const clave of CLAVES_NUMERICAS) {
    const bruto = fila.technical_specs?.[clave];
    if (bruto === undefined || bruto === null) continue;

    const texto = aplanarValor(bruto);
    const medida = numeroEstricto(texto);

    if (!medida) {
      rechazos.push({ clave, valor: texto, motivo: "no es un número con unidad simple" });
      continue;
    }

    atributos.push({
      clave: claveDeAtributo(clave),
      nombre: NOMBRES_DE_ATRIBUTO[clave],
      unidad: UNIDADES_NUMERICAS[clave],
      numero: medida.numero,
    });
  }

  // Cero y los negativos no son precios: tener precio es estar a la venta desde el
  // 26/08/2026, y un cero pondría el producto a la venta por nada.
  const precio =
    typeof fila.price_gtq === "number" && Number.isFinite(fila.price_gtq) && fila.price_gtq > 0
      ? aCentavos(fila.price_gtq)
      : null;

  return {
    id: fila.id,
    categorias: [
      { slug: slugDeCategoria(fila.product_type, fila.application), principal: true },
    ],
    imagenes: urls.map((url, indice) => ({
      url,
      alt: fila.public_name,
      posicion: indice * PASO_DE_POSICION,
      visible: true,
      principal: indice === 0,
    })),
    atributos,
    rechazos,
    privados: {
      supplier_brand: fila.supplier_brand,
      supplier_brand_label: fila.supplier_brand_label,
      supplier_series: fila.supplier_series,
      supplier_series_label: fila.supplier_series_label,
      supplier_code: fila.supplier_code,
      supplier_name: fila.supplier_name,
      supplier_description: fila.supplier_description,
    },
    precioNormalCentavos: precio,
  };
}
