// app/envios/zonasCapitalinas.ts
//
// Catálogo puro de las zonas del municipio de Guatemala y su método de reparto
// inicial. Sin "server-only": lo usan el formulario del cliente, el panel y los
// módulos del servidor.
//
// Las zonas 20, 22 y 23 no existen en la ciudad y por eso no aparecen aquí: la
// lista es cerrada a propósito, para que nadie pueda escribir una zona a mano.

export const ZONAS_CAPITALINAS_VALIDAS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 24, 25,
] as const;

export type ZonaCapitalina = (typeof ZONAS_CAPITALINAS_VALIDAS)[number];

/** Zonas sin mensajero propio desde el primer día. El panel puede cambiarlas después. */
export const ZONAS_DEFECTO_GUATEX: readonly ZonaCapitalina[] = [6, 17, 18] as const;

export type MetodoEnvioZona = "mensajero_propio" | "guatex";

export function esZonaCapitalinaValida(zona: unknown): zona is ZonaCapitalina {
  return (
    typeof zona === "number" &&
    Number.isInteger(zona) &&
    (ZONAS_CAPITALINAS_VALIDAS as readonly number[]).includes(zona)
  );
}

export function metodoPorDefectoZona(zona: ZonaCapitalina): MetodoEnvioZona {
  return (ZONAS_DEFECTO_GUATEX as readonly number[]).includes(zona)
    ? "guatex"
    : "mensajero_propio";
}

export function mapaMetodosPorDefecto(): Record<ZonaCapitalina, MetodoEnvioZona> {
  const mapa = {} as Record<ZonaCapitalina, MetodoEnvioZona>;
  for (const z of ZONAS_CAPITALINAS_VALIDAS) {
    mapa[z] = metodoPorDefectoZona(z);
  }
  return mapa;
}
