import { applications, productTypes } from "../../data/catalogTaxonomy";

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
  { clave: "lifespan", etiqueta: "Vida útil", ayuda: "50 000 h" },
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

  if (errores.length > 0) {
    return { ok: false, errores };
  }

  return {
    ok: true,
    datos: {
      ...entrada,
      nombre,
      imagen,
      descripcion: entrada.descripcion.trim(),
      acabado: entrada.acabado.trim(),
      acabadoEtiqueta: entrada.acabadoEtiqueta.trim(),
      familia: entrada.familia.trim(),
      tipoEtiqueta: productTypes[entrada.tipo].label,
      aplicacionEtiqueta: aplicacion?.label ?? "",
    },
  };
}

/**
 * Arma la ficha técnica desde el formulario. Un campo vacío **no se guarda**:
 * dejarlo como cadena vacía llenaría la ficha del catálogo de renglones sin
 * contenido.
 */
export function fichaTecnicaDesdeFormulario(
  campos: Record<string, string>,
  caracteristicas: string,
): FichaTecnica {
  const ficha: FichaTecnica = {};

  for (const [clave, valor] of Object.entries(campos)) {
    const limpio = valor.trim();
    if (limpio.length > 0) {
      ficha[clave] = limpio;
    }
  }

  const lista = caracteristicas
    .split("\n")
    .map((linea) => linea.trim())
    .filter((linea) => linea.length > 0);

  if (lista.length > 0) {
    ficha.specialFeatures = lista;
  }

  return ficha;
}

/** Devuelve una lista guardada al formulario, un elemento por renglón. */
export function lineasDesdeLista(valor: string | string[] | undefined) {
  if (Array.isArray(valor)) {
    return valor.join("\n");
  }
  return valor ?? "";
}
