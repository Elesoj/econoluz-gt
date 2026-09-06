import {
  applications,
  finishes,
  getFinishId,
  getFinishLabel,
  productTypes,
} from "../../data/catalogTaxonomy";
import type { AdminAuthQuery } from "../auth/types";

/**
 * Los campos de ficha técnica que se ofrecen en el formulario, con el nombre
 * en español. La clave es la que ya usan los 313 productos: cambiarla dejaría
 * los datos existentes huérfanos.
 *
 * `specialFeatures` no está aquí porque es una lista y se edita aparte.
 */
export const CAMPOS_FICHA_TECNICA = [
  { clave: "applicationType", etiqueta: "Tipo de aplicación", ayuda: "Para qué sirve, en una línea" },
  { clave: "power", etiqueta: "Potencia", ayuda: "7 W / 15 W / 35 W" },
  { clave: "voltage", etiqueta: "Voltaje", ayuda: "120-277 V" },
  { clave: "luminousFlux", etiqueta: "Flujo luminoso", ayuda: "300 lm" },
  { clave: "efficiency", etiqueta: "Eficiencia", ayuda: "40 lm/W" },
  { clave: "colorTemperature", etiqueta: "Temperatura de color", ayuda: "3 000 K" },
  { clave: "cri", etiqueta: "IRC", ayuda: "90" },
  { clave: "beamAngle", etiqueta: "Ángulo de apertura", ayuda: "110°" },
  { clave: "protection", etiqueta: "Grado de protección", ayuda: "IP65" },
  { clave: "dimensions", etiqueta: "Dimensiones", ayuda: "0.30 m / 0.60 m" },
  { clave: "material", etiqueta: "Material", ayuda: "Aluminio inyectado" },
  { clave: "dimming", etiqueta: "Regulación", ayuda: "ON/OFF, 0-10 V…" },
  { clave: "lifetime", etiqueta: "Vida útil", ayuda: "50 000 h" },
  { clave: "warranty", etiqueta: "Garantía", ayuda: "3 años" },
] as const;

export type FichaTecnica = Record<string, string | string[]>;

export type EntradaFicha = {
  nombre: string;
  descripcion: string;
  imagen: string;
  tipo: string;
  aplicacion: string;
  acabado: string;
  acabadoEtiqueta: string;
  familia: string;
};

export type DatosFicha = EntradaFicha & {
  tipoEtiqueta: string;
  aplicacionEtiqueta: string;
};

export type ResultadoValidacion =
  | { ok: true; datos: DatosFicha }
  | { ok: false; errores: string[] };

type TipoConocido = keyof typeof productTypes;

function esTipoConocido(valor: string): valor is TipoConocido {
  return Object.hasOwn(productTypes, valor);
}

/** Las aplicaciones que admite un tipo, en el orden de la taxonomía. */
export function aplicacionesDe(tipo: string) {
  if (!esTipoConocido(tipo)) {
    return [];
  }

  return productTypes[tipo].applications.map((id) => ({
    id,
    label: applications[id as keyof typeof applications]?.label ?? id,
  }));
}

export type ResultadoAcabado =
  | { ok: true; acabado: string; acabadoEtiqueta: string }
  | { ok: false; error: string };

/**
 * Resuelve y valida la opción de acabado elegida:
 * - Acabados conocidos del catálogo
 * - 'otro' con texto libre personalizado
 * - 'sin_especificar' o vacío
 */
export function resolverAcabado(seleccion: string, textoOtro?: string): ResultadoAcabado {
  const seleccionLimpia = (seleccion ?? "").trim();
  if (!seleccionLimpia || seleccionLimpia === "sin_especificar") {
    return { ok: true, acabado: "", acabadoEtiqueta: "" };
  }

  if (seleccionLimpia === "otro") {
    const personalizado = (textoOtro ?? "").trim();
    if (personalizado.length === 0) {
      return { ok: false, error: "Si eliges 'Otro acabado...', debes escribir el nombre del acabado." };
    }
    return {
      ok: true,
      acabado: getFinishId(personalizado),
      acabadoEtiqueta: personalizado,
    };
  }

  if (Object.hasOwn(finishes, seleccionLimpia)) {
    const conocido = finishes[seleccionLimpia as keyof typeof finishes];
    return {
      ok: true,
      acabado: conocido.id,
      acabadoEtiqueta: conocido.label,
    };
  }

  const idNormalizado = getFinishId(seleccionLimpia);
  const etiqueta = getFinishLabel(idNormalizado);
  return {
    ok: true,
    acabado: idNormalizado,
    acabadoEtiqueta: etiqueta !== idNormalizado ? etiqueta : seleccionLimpia,
  };
}

/**
 * Valida lo que llega del formulario.
 *
 * Lo importante aquí no es rellenar huecos, es que **la aplicación pertenezca
 * al tipo**: el catálogo guiado filtra por esa pareja, así que un producto con
 * una aplicación que su tipo no admite queda invisible para quien lo busque.
 */
export function validarFichaProducto(entrada: EntradaFicha): ResultadoValidacion {
  const errores: string[] = [];

  const nombre = entrada.nombre.trim();
  if (nombre.length === 0) {
    errores.push("El nombre no puede quedar vacío.");
  }

  const imagen = entrada.imagen.trim();
  if (imagen.length === 0) {
    errores.push("El producto necesita una imagen.");
  }

  if (!esTipoConocido(entrada.tipo)) {
    errores.push("Ese tipo de producto no existe.");
    return { ok: false, errores };
  }

  const admitidas = aplicacionesDe(entrada.tipo);
  const aplicacion = admitidas.find((candidata) => candidata.id === entrada.aplicacion);
  if (!aplicacion) {
    errores.push(
      `La aplicación elegida no pertenece a ${productTypes[entrada.tipo].label}. ` +
        "Si no coincide, el producto no aparece en los filtros del catálogo.",
    );
  }

  const resAcabado = resolverAcabado(entrada.acabado, entrada.acabadoEtiqueta);
  if (!resAcabado.ok) {
    errores.push(resAcabado.error);
  }

  if (errores.length > 0) {
    return { ok: false, errores };
  }

  const acabadoFinal = resAcabado.ok ? resAcabado.acabado : entrada.acabado.trim();
  const acabadoEtiquetaFinal = resAcabado.ok
    ? resAcabado.acabadoEtiqueta
    : entrada.acabadoEtiqueta.trim();

  return {
    ok: true,
    datos: {
      ...entrada,
      nombre,
      imagen,
      descripcion: entrada.descripcion.trim(),
      acabado: acabadoFinal,
      acabadoEtiqueta: acabadoEtiquetaFinal,
      familia: entrada.familia.trim(),
      tipoEtiqueta: productTypes[entrada.tipo].label,
      aplicacionEtiqueta: aplicacion?.label ?? "",
    },
  };
}

/**
 * Normaliza las especificaciones al leerlas: convierte la clave histórica
 * `lifespan` a la canónica `lifetime` y elimina `lifespan`. Si existen ambas,
 * `lifetime` tiene prioridad.
 */
export function normalizarFichaTecnicaLectura(
  specs: FichaTecnica | null | undefined,
): FichaTecnica {
  if (!specs) return {};
  const copia: FichaTecnica = { ...specs };
  if ("lifespan" in copia) {
    if (!copia.lifetime && copia.lifespan) {
      copia.lifetime = copia.lifespan;
    }
    delete copia.lifespan;
  }
  return copia;
}

/**
 * Actualiza la ficha técnica preservando todas las especificaciones que el
 * formulario no administra (como amperage, frequency, etc.).
 *
 * - Clona las especificaciones preexistentes normalizadas.
 * - Actualiza únicamente las claves administradas que tengan valor.
 * - Si una clave administrada se vacía deliberadamente, se elimina del objeto.
 * - Elimina la clave histórica `lifespan` garantizando que solo quede `lifetime`.
 * - Gestiona `specialFeatures` actualizándolo o eliminándolo si está vacío.
 */
export function actualizarFichaTecnica(
  actual: FichaTecnica | null | undefined,
  campos: Record<string, string>,
  caracteristicas: string,
): FichaTecnica {
  const base = normalizarFichaTecnicaLectura(actual);
  const resultado: FichaTecnica = { ...base };

  const clavesAdministradas = new Set<string>(CAMPOS_FICHA_TECNICA.map((c) => c.clave));

  for (const [clave, valor] of Object.entries(campos)) {
    const claveCanon = clave === "lifespan" ? "lifetime" : clave;
    const limpio = valor.trim();

    if (limpio.length > 0) {
      resultado[claveCanon] = limpio;
      if (claveCanon === "lifetime") {
        delete resultado.lifespan;
      }
    } else if (clavesAdministradas.has(claveCanon)) {
      delete resultado[claveCanon];
      if (claveCanon === "lifetime") {
        delete resultado.lifespan;
      }
    }
  }

  const lista = caracteristicas
    .split("\n")
    .map((linea) => linea.trim())
    .filter((linea) => linea.length > 0);

  if (lista.length > 0) {
    resultado.specialFeatures = lista;
  } else {
    delete resultado.specialFeatures;
  }

  return resultado;
}

/**
 * Arma la ficha técnica desde el formulario para altas nuevas partiendo de cero.
 */
export function fichaTecnicaDesdeFormulario(
  campos: Record<string, string>,
  caracteristicas: string,
): FichaTecnica {
  return actualizarFichaTecnica({}, campos, caracteristicas);
}

/** Devuelve una lista guardada al formulario, un elemento por renglón. */
export function lineasDesdeLista(valor: string | string[] | undefined) {
  if (Array.isArray(valor)) {
    return valor.join("\n");
  }
  return valor ?? "";
}

/**
 * Un producto tal y como se edita en el panel.
 *
 * Los datos del proveedor están aquí a propósito: el panel es interno y son
 * justo los que hay que poder consultar. Lo que no puede pasar es que crucen
 * al catálogo público, y de eso se encarga `publicProduct.ts`.
 */
export type ProductoFicha = {
  referencia: string;
  nombre: string;
  descripcion: string;
  imagen: string;
  galeria: string[];
  fichaTecnica: FichaTecnica;
  tipo: string;
  aplicacion: string;
  acabado: string;
  acabadoEtiqueta: string;
  familia: string;
  proveedorMarca: string;
  proveedorSerie: string;
  proveedorCodigo: string;
  proveedorNombre: string;
  proveedorDescripcion: string;
  precio: number | null;
  existencias: number | null;
  publicado: boolean;
};

function comoTexto(valor: unknown) {
  return valor === null || valor === undefined ? "" : String(valor);
}

function comoNumeroONulo(valor: unknown) {
  if (valor === null || valor === undefined || valor === "") return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

export async function leerProductoPorReferencia(
  query: AdminAuthQuery,
  referencia: string,
): Promise<ProductoFicha | null> {
  const filas = await query(
    `
      select
        econoluz_reference, public_name, public_description, image, images,
        technical_specs, product_type, application, finish, finish_label,
        family_label, supplier_brand_label, supplier_series_label, supplier_code,
        supplier_name, supplier_description, price_gtq, stock,
        published
      from products
      where econoluz_reference = $1
      limit 1
    `,
    [referencia],
  );

  const fila = filas[0];
  if (!fila) {
    return null;
  }

  return {
    referencia: comoTexto(fila.econoluz_reference),
    nombre: comoTexto(fila.public_name),
    descripcion: comoTexto(fila.public_description),
    imagen: comoTexto(fila.image),
    galeria: Array.isArray(fila.images) ? fila.images.map(String) : [],
    fichaTecnica: normalizarFichaTecnicaLectura(fila.technical_specs as FichaTecnica),
    tipo: comoTexto(fila.product_type),
    aplicacion: comoTexto(fila.application),
    acabado: comoTexto(fila.finish),
    acabadoEtiqueta: comoTexto(fila.finish_label),
    familia: comoTexto(fila.family_label),
    proveedorMarca: comoTexto(fila.supplier_brand_label),
    proveedorSerie: comoTexto(fila.supplier_series_label),
    proveedorCodigo: comoTexto(fila.supplier_code),
    proveedorNombre: comoTexto(fila.supplier_name),
    proveedorDescripcion: comoTexto(fila.supplier_description),
    precio: comoNumeroONulo(fila.price_gtq),
    existencias: comoNumeroONulo(fila.stock),
    publicado: Boolean(fila.published),
  };
}

export type CambioFicha = {
  referencia: string;
  nombre: string;
  descripcion: string;
  imagen: string;
  galeria: string[];
  fichaTecnica: FichaTecnica;
  tipo: string;
  tipoEtiqueta: string;
  aplicacion: string;
  aplicacionEtiqueta: string;
  acabado: string;
  acabadoEtiqueta: string;
  familia: string;
  proveedorCodigo: string;
  proveedorNombre: string;
  proveedorDescripcion: string;
  precio: number | null;
  existencias: number | null;
  publicado: boolean;
};

/**
 * Guarda la ficha completa.
 *
 * `supplier_brand` y `supplier_series` **no se tocan**: son parejas de
 * identificador y etiqueta que otros módulos internos dan por buenas, y
 * cambiarlas desde un campo de texto las desemparejaría. Se editan el código,
 * el nombre y la descripción del fabricante, que son texto suelto.
 *
 * Una galería vacía se guarda como `null`, no como lista vacía: en este
 * catálogo significan lo mismo para el visitante, pero `null` es lo que ya
 * tienen los 249 productos sin fotos adicionales.
 */
export async function guardarFichaProducto(
  query: AdminAuthQuery,
  cambio: CambioFicha,
): Promise<void> {
  await query(
    `
      update products
      set public_name = $1,
          public_description = $2,
          image = $3,
          images = $4::jsonb,
          technical_specs = $5::jsonb,
          product_type = $6,
          product_type_label = $7,
          application = $8,
          application_label = $9,
          finish = $10,
          finish_label = $11,
          family_label = $12,
          supplier_code = $13,
          supplier_name = $14,
          supplier_description = $15,
          price_gtq = $16,
          stock = $17,
          published = $18
      where econoluz_reference = $19
    `,
    [
      cambio.nombre,
      cambio.descripcion,
      cambio.imagen,
      cambio.galeria.length > 0 ? JSON.stringify(cambio.galeria) : null,
      JSON.stringify(cambio.fichaTecnica),
      cambio.tipo,
      cambio.tipoEtiqueta,
      cambio.aplicacion,
      cambio.aplicacionEtiqueta,
      cambio.acabado,
      cambio.acabadoEtiqueta,
      cambio.familia,
      cambio.proveedorCodigo,
      cambio.proveedorNombre,
      cambio.proveedorDescripcion,
      cambio.precio,
      cambio.existencias,
      cambio.publicado,
      cambio.referencia,
    ],
  );
}
