"server-only";

// Adaptador del orquestador de envíos: le da las dependencias reales —Neon, la
// sesión del cliente y la configuración de `app_settings`— al módulo puro
// `orquestacion.ts`, que es donde vive la decisión.

import { aCentavos } from "../lib/dinero";
import type {
  DestinoDeEnvio,
  LineaDeEntrada,
  ResultadoDeEnvio,
} from "./contratos";
import { REGLAS_PROPIAS_DEFECTO } from "./tarifas";
import { mapaMetodosPorDefecto } from "./zonasCapitalinas";
import {
  orquestar,
  type ConfiguracionEnvios,
  type DependenciasEnvios,
  type ResumenProductos,
} from "./orquestacion";

export type {
  ConfiguracionEnvios,
  DependenciasEnvios,
  OpcionesEnvios,
  ResumenProductos,
} from "./orquestacion";
export { orquestar } from "./orquestacion";

async function leerConfiguracionReal(): Promise<ConfiguracionEnvios> {
  const { obtenerRecogidaEnTienda } = await import("../lib/ajustes.server");
  const { obtenerMetodosZonas, obtenerReglasPropias } = await import("./configuracion.server");

  const [recogida, metodosZonas, reglasPropias] = await Promise.all([
    obtenerRecogidaEnTienda(),
    obtenerMetodosZonas(),
    obtenerReglasPropias(),
  ]);

  return { recogidaActiva: recogida.activa, metodosZonas, reglasPropias };
}

async function resolverProductosReal(
  lineas: readonly LineaDeEntrada[],
): Promise<ResumenProductos> {
  if (lineas.length === 0) {
    return { piezas: 0, subtotalCents: 0, descartadas: [] };
  }

  const { leer } = await import("../lib/datos");

  const referencias = [...new Set(lineas.map((l) => l.econoluzReference))];
  const filas = await leer<{
    id: string;
    econoluz_reference: string;
    published: boolean;
    price_gtq: number | string | null;
  }>(
    `select id, econoluz_reference, published, price_gtq
       from products
      where econoluz_reference = any($1)`,
    [referencias],
  );

  const porReferencia = new Map(filas.map((f) => [f.econoluz_reference, f]));
  let piezas = 0;
  let subtotalCents = 0;
  const descartadas: string[] = [];

  for (const linea of lineas) {
    const prod = porReferencia.get(linea.econoluzReference);
    if (
      !prod ||
      !prod.published ||
      prod.price_gtq === null ||
      prod.price_gtq === undefined ||
      Number(prod.price_gtq) <= 0 ||
      !Number.isFinite(Number(prod.price_gtq))
    ) {
      descartadas.push(linea.econoluzReference);
    } else {
      const precioCentavos = aCentavos(Number(prod.price_gtq));
      piezas += linea.cantidad;
      subtotalCents += precioCentavos * linea.cantidad;
    }
  }

  return { piezas, subtotalCents, descartadas };
}

/** Configuración de respaldo si no hay nada que leer: la comercial aprobada. */
export const CONFIGURACION_POR_DEFECTO: ConfiguracionEnvios = {
  recogidaActiva: false,
  metodosZonas: mapaMetodosPorDefecto(),
  reglasPropias: REGLAS_PROPIAS_DEFECTO,
};

/**
 * Cálculo autenticado. Recibe SOLO el destino y lee el carrito y el cliente desde
 * el servidor: nada que venga del navegador se acepta como precio ni como método.
 */
export async function cotizarEnvioDelCliente(
  destino: DestinoDeEnvio,
): Promise<ResultadoDeEnvio> {
  const { leerClienteActual } = await import("../identidad/sesion.server");
  const cliente = await leerClienteActual();
  if (!cliente) {
    return { estimacion: false, tipo: "no_disponible", causa: "configuracion" };
  }

  const { leer } = await import("../lib/datos");
  const { leerCarritoCon } = await import("../tienda/carritoRepositorio");

  const depsReales: DependenciasEnvios = {
    leerConfiguracion: leerConfiguracionReal,
    leerCarrito: async () => {
      const carrito = await leerCarritoCon(
        (texto, parametros = []) => leer(texto, parametros),
        cliente.id,
      );
      return carrito;
    },
    resolverProductos: resolverProductosReal,
    leerDireccion: async (direccionId: string) => {
      const filas = await leer<{
        departamento_codigo: string | null;
        municipio_codigo: string | null;
        zona_capitalina: number | null;
      }>(
        `select departamento_codigo, municipio_codigo, zona_capitalina
           from user_addresses
          where id = $1 and user_id = $2`,
        [direccionId, cliente.id],
      );
      const fila = filas[0];
      if (!fila) return null;
      return {
        departamentoCodigo: fila.departamento_codigo
          ? String(fila.departamento_codigo).trim()
          : null,
        municipioCodigo: fila.municipio_codigo ? String(fila.municipio_codigo).trim() : null,
        zonaCapitalina: fila.zona_capitalina === null ? null : Number(fila.zona_capitalina),
      };
    },
    ahora: () => new Date(),
  };

  return orquestar(destino, depsReales, { estimacion: false });
}

/** Estimación anónima. Recibe referencias públicas y cantidades, nunca precios. */
export async function estimarEnvio(
  destino: DestinoDeEnvio,
  lineas: readonly LineaDeEntrada[],
): Promise<ResultadoDeEnvio> {
  const depsReales: DependenciasEnvios = {
    leerConfiguracion: leerConfiguracionReal,
    resolverProductos: resolverProductosReal,
    leerDireccion: async () => null,
    ahora: () => new Date(),
  };

  return orquestar(destino, depsReales, { estimacion: true, lineas });
}
