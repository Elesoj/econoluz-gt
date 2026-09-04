// app/envios/validacion.ts

export const LIMITES = {
  zonaCodigo: { patron: /^[a-z0-9]+(-[a-z0-9]+)*$/, min: 2, max: 40 },
  zonaNombre: { min: 2, max: 80 },
  zonaNotas: { min: 0, max: 500 },
  importeCents: { min: 0, max: 100_000 },
  umbralGratisCents: { min: 1, max: 10_000_000 },
  maxPiezas: { min: 1, max: 999 },
  maxImporteCents: { min: 1, max: 10_000_000 },
  plazoDias: { min: 0, max: 60 },
  lineasEstimacion: { max: 100 },
  cantidadPorLinea: { min: 1, max: 999 },
} as const;

export type ResultadoValidacion =
  | { ok: true }
  | { ok: false; error: string };

export function validarZona(input: unknown): ResultadoValidacion {
  if (typeof input !== "object" || input === null) {
    return { ok: false, error: "La zona debe ser un objeto" };
  }
  const { codigo, nombre, notas } = input as Record<string, unknown>;

  if (typeof codigo !== "string") {
    return { ok: false, error: "El código de zona debe ser una cadena" };
  }
  if (
    codigo.length < LIMITES.zonaCodigo.min ||
    codigo.length > LIMITES.zonaCodigo.max ||
    !LIMITES.zonaCodigo.patron.test(codigo)
  ) {
    return { ok: false, error: "El código de zona no cumple el formato o longitud permitidos" };
  }

  if (typeof nombre !== "string") {
    return { ok: false, error: "El nombre de zona debe ser una cadena" };
  }
  if (
    nombre.length < LIMITES.zonaNombre.min ||
    nombre.length > LIMITES.zonaNombre.max ||
    /[\r\n\x00-\x1f\x7f]/.test(nombre)
  ) {
    return {
      ok: false,
      error: "El nombre de zona no cumple la longitud o contiene caracteres de control",
    };
  }

  if (notas !== undefined && notas !== null) {
    if (typeof notas !== "string") {
      return { ok: false, error: "Las notas de zona deben ser una cadena" };
    }
    if (notas.length < LIMITES.zonaNotas.min || notas.length > LIMITES.zonaNotas.max) {
      return { ok: false, error: "Las notas de zona exceden la longitud permitida" };
    }
  }

  return { ok: true };
}

export function validarTarifa(input: unknown): ResultadoValidacion {
  if (typeof input !== "object" || input === null) {
    return { ok: false, error: "La tarifa debe ser un objeto" };
  }
  const {
    importeCents,
    umbralGratisCents,
    maxPiezas,
    maxImporteCents,
    plazoMinDias,
    plazoMaxDias,
  } = input as Record<string, unknown>;

  if (
    typeof importeCents !== "number" ||
    !Number.isInteger(importeCents) ||
    importeCents < LIMITES.importeCents.min ||
    importeCents > LIMITES.importeCents.max
  ) {
    return { ok: false, error: "El importe en centavos no es válido" };
  }

  if (umbralGratisCents !== null && umbralGratisCents !== undefined) {
    if (
      typeof umbralGratisCents !== "number" ||
      !Number.isInteger(umbralGratisCents) ||
      umbralGratisCents < LIMITES.umbralGratisCents.min ||
      umbralGratisCents > LIMITES.umbralGratisCents.max
    ) {
      return { ok: false, error: "El umbral de envío gratis no es válido" };
    }
  }

  if (maxPiezas !== null && maxPiezas !== undefined) {
    if (
      typeof maxPiezas !== "number" ||
      !Number.isInteger(maxPiezas) ||
      maxPiezas < LIMITES.maxPiezas.min ||
      maxPiezas > LIMITES.maxPiezas.max
    ) {
      return { ok: false, error: "El máximo de piezas no es válido" };
    }
  }

  if (maxImporteCents !== null && maxImporteCents !== undefined) {
    if (
      typeof maxImporteCents !== "number" ||
      !Number.isInteger(maxImporteCents) ||
      maxImporteCents < LIMITES.maxImporteCents.min ||
      maxImporteCents > LIMITES.maxImporteCents.max
    ) {
      return { ok: false, error: "El máximo de importe no es válido" };
    }
  }

  if (
    typeof plazoMinDias !== "number" ||
    !Number.isInteger(plazoMinDias) ||
    plazoMinDias < LIMITES.plazoDias.min ||
    plazoMinDias > LIMITES.plazoDias.max
  ) {
    return { ok: false, error: "El plazo mínimo en días no es válido" };
  }

  if (
    typeof plazoMaxDias !== "number" ||
    !Number.isInteger(plazoMaxDias) ||
    plazoMaxDias < LIMITES.plazoDias.min ||
    plazoMaxDias > LIMITES.plazoDias.max ||
    plazoMaxDias < plazoMinDias
  ) {
    return {
      ok: false,
      error: "El plazo máximo en días no es válido o es menor que el mínimo",
    };
  }

  return { ok: true };
}

export function validarLineasEstimacion(input: unknown): ResultadoValidacion {
  if (!Array.isArray(input)) {
    return { ok: false, error: "Las líneas deben ser una lista" };
  }
  if (input.length === 0 || input.length > LIMITES.lineasEstimacion.max) {
    return { ok: false, error: "La cantidad de líneas no está dentro del rango permitido" };
  }

  for (const item of input) {
    if (typeof item !== "object" || item === null) {
      return { ok: false, error: "Cada línea debe ser un objeto" };
    }
    const { econoluzReference, cantidad } = item as Record<string, unknown>;

    if (typeof econoluzReference !== "string" || econoluzReference.trim().length === 0) {
      return { ok: false, error: "La referencia de producto no es válida" };
    }

    if (
      typeof cantidad !== "number" ||
      !Number.isInteger(cantidad) ||
      cantidad < LIMITES.cantidadPorLinea.min ||
      cantidad > LIMITES.cantidadPorLinea.max
    ) {
      return { ok: false, error: "La cantidad por línea no está dentro del rango permitido" };
    }
  }

  return { ok: true };
}
