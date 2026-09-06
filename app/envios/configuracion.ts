// app/envios/configuracion.ts
//
// Qué significa el texto que guarda `app_settings` para los envíos. Módulo puro:
// sin "server-only", sin acceso a la base y sin caché.
//
// La política ante un valor que no cuadra es **volver entero a la configuración
// comercial aprobada**, no quedarse con las claves que sí valían. Un mapa a
// medias es peor que uno por defecto: parece configurado y no lo está.

import {
  mapaMetodosPorDefecto,
  ZONAS_CAPITALINAS_VALIDAS,
  type MetodoEnvioZona,
  type ZonaCapitalina,
} from "./zonasCapitalinas";
import {
  REGLAS_PROPIAS_DEFECTO,
  type ReglasPropias,
} from "./tarifas";

export const CLAVE_AJUSTE_ZONAS_METODOS = "envios_zonas_metodos";
export const CLAVE_AJUSTE_REGLAS_PROPIAS = "envios_reglas_propias";

/** Deshace el texto guardado sin dejar que un JSON roto se propague como error. */
function comoObjeto(valor: unknown): Record<string, unknown> | null {
  let candidato = valor;
  if (typeof valor === "string") {
    try {
      candidato = JSON.parse(valor);
    } catch {
      return null;
    }
  }
  if (!candidato || typeof candidato !== "object" || Array.isArray(candidato)) {
    return null;
  }
  return candidato as Record<string, unknown>;
}

export function interpretarZonasMetodos(
  valor: unknown,
): Record<ZonaCapitalina, MetodoEnvioZona> {
  const defecto = mapaMetodosPorDefecto();
  const objeto = comoObjeto(valor);
  if (!objeto) {
    return defecto;
  }

  // Tiene que estar completo: ni una clave de más —una zona que no existe— ni
  // una de menos.
  if (Object.keys(objeto).length !== ZONAS_CAPITALINAS_VALIDAS.length) {
    return defecto;
  }

  const resultado = {} as Record<ZonaCapitalina, MetodoEnvioZona>;
  for (const z of ZONAS_CAPITALINAS_VALIDAS) {
    const val = objeto[String(z)];
    if (val !== "mensajero_propio" && val !== "guatex") {
      return defecto;
    }
    resultado[z] = val;
  }
  return resultado;
}

export function interpretarReglasPropias(valor: unknown): ReglasPropias {
  const objeto = comoObjeto(valor);
  if (!objeto) {
    return { ...REGLAS_PROPIAS_DEFECTO };
  }

  const tarifa = objeto.tarifaCents;
  const umbral = objeto.umbralGratisCents;

  const tarifaValida = typeof tarifa === "number" && Number.isInteger(tarifa) && tarifa >= 0;
  const umbralValido = typeof umbral === "number" && Number.isInteger(umbral) && umbral >= 0;

  if (!tarifaValida || !umbralValido) {
    return { ...REGLAS_PROPIAS_DEFECTO };
  }

  return { tarifaCents: tarifa, umbralGratisCents: umbral };
}

export type FusionDeMetodoZona = {
  mapa: Record<ZonaCapitalina, MetodoEnvioZona>;
  valorSerializado: string;
  metodoAnterior: MetodoEnvioZona;
};

/**
 * Cambia el método de una sola zona sobre el mapa vigente y devuelve, además del
 * mapa nuevo, el texto exacto que hay que escribir y el método que había antes,
 * que es lo que se registra en `audit_log`.
 *
 * No muta el mapa recibido: quien llama necesita el estado anterior para la
 * auditoría.
 */
export function fusionarMetodoZona(
  mapaVigente: Record<ZonaCapitalina, MetodoEnvioZona>,
  zona: ZonaCapitalina,
  metodo: MetodoEnvioZona,
): FusionDeMetodoZona {
  const saneado = interpretarZonasMetodos(mapaVigente);
  const mapa: Record<ZonaCapitalina, MetodoEnvioZona> = { ...saneado, [zona]: metodo };
  return {
    mapa,
    valorSerializado: JSON.stringify(mapa),
    metodoAnterior: saneado[zona],
  };
}
