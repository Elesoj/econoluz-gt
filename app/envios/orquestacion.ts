// app/envios/orquestacion.ts
//
// La decisión de cuánto cuesta un envío, sin acceso a nada externo: recibe la
// configuración, el carrito y la dirección como dependencias inyectadas.
//
// Sin "server-only" a propósito. Que sea puro es lo que permite probar entero el
// algoritmo con `node:test`, sin Neon, sin sesión y sin red. El adaptador que le
// da las dependencias reales es `envios.server.ts`.

import { ErrorDeDatos } from "../lib/datos/errores";
import type {
  DestinoDeEnvio,
  LineaDeEntrada,
  ResultadoDeEnvio,
} from "./contratos";
import { calcularEnvioOperativo, type ReglasPropias } from "./tarifas";
import {
  esZonaCapitalinaValida,
  type MetodoEnvioZona,
  type ZonaCapitalina,
} from "./zonasCapitalinas";
import { validarLineasEstimacion } from "./validacion";

export type ResumenProductos = {
  piezas: number;
  subtotalCents: number;
  descartadas: readonly string[];
};

export type ConfiguracionEnvios = {
  recogidaActiva: boolean;
  metodosZonas: Record<ZonaCapitalina, MetodoEnvioZona>;
  reglasPropias: ReglasPropias;
};

export type DependenciasEnvios = {
  leerConfiguracion: () => Promise<ConfiguracionEnvios>;
  leerCarrito?: () => Promise<{ lineas: readonly LineaDeEntrada[] }>;
  resolverProductos: (lineas: readonly LineaDeEntrada[]) => Promise<ResumenProductos>;
  leerDireccion?: (direccionId: string) => Promise<{
    departamentoCodigo: string | null;
    municipioCodigo: string | null;
    zonaCapitalina?: number | null;
  } | null>;
  ahora?: () => Date;
};

export type OpcionesEnvios = {
  estimacion?: boolean;
  lineas?: readonly LineaDeEntrada[];
};

/** El municipio de Guatemala es el único con mensajero propio. */
const DEPARTAMENTO_GUATEMALA = "01";
const MUNICIPIO_GUATEMALA = "0101";

/**
 * Orquestación del envío, en el orden que fija el diseño operativo:
 *
 * 1. Carrito y resolución de productos con precios del servidor.
 * 2. Recogida en tienda, que se decide antes de mirar geografía.
 * 3. Resolución del destino a códigos y zona.
 * 4. Configuración vigente de métodos por zona y reglas comerciales.
 * 5. Deducción del método y cálculo.
 *
 * Fuera del municipio de Guatemala siempre sale Guatex, y Guatex nunca trae un
 * importe: su coste depende del peso y no se conoce desde la web.
 */
export async function orquestar(
  destino: DestinoDeEnvio,
  deps: DependenciasEnvios,
  opciones?: OpcionesEnvios,
): Promise<ResultadoDeEnvio> {
  const estimacion = Boolean(opciones?.estimacion);

  try {
    // 1. Reconstruir el carrito desde el servidor. Cualquier descarte detiene el cálculo.
    let lineas: readonly LineaDeEntrada[] = [];
    if (estimacion) {
      lineas = opciones?.lineas ?? [];
      const validacion = validarLineasEstimacion(lineas);
      if (!validacion.ok) {
        return { estimacion: true, tipo: "carrito_no_comprable", referencias: [] };
      }
    } else {
      const carrito = await deps.leerCarrito?.();
      lineas = carrito?.lineas ?? [];
    }

    const { subtotalCents, descartadas } = await deps.resolverProductos(lineas);
    if (descartadas.length > 0) {
      return { estimacion, tipo: "carrito_no_comprable", referencias: descartadas };
    }

    // 2. Recogida en tienda. Apagada por defecto y fuera de este flujo.
    if (destino.tipo === "recogida_en_tienda") {
      const config = await deps.leerConfiguracion();
      if (config.recogidaActiva) {
        return { estimacion, tipo: "sin_coste", metodo: "recogida_en_tienda", envioCents: 0 };
      }
      return { estimacion, tipo: "metodo_no_disponible", metodo: "recogida_en_tienda" };
    }

    // 3. Destino a códigos y zona.
    let departamentoCodigo: string | null;
    let municipioCodigo: string | null;
    let zonaCapitalina: number | null;

    if (destino.tipo === "direccion_guardada") {
      if (!deps.leerDireccion) {
        return { estimacion, tipo: "requiere_cotizacion", motivo: "direccion_sin_codigos" };
      }
      const dir = await deps.leerDireccion(destino.direccionId);
      if (!dir) {
        return { estimacion, tipo: "requiere_cotizacion", motivo: "direccion_sin_codigos" };
      }
      departamentoCodigo = dir.departamentoCodigo;
      municipioCodigo = dir.municipioCodigo;
      zonaCapitalina = dir.zonaCapitalina ?? null;
    } else {
      departamentoCodigo = destino.departamentoCodigo;
      municipioCodigo = destino.municipioCodigo;
      zonaCapitalina = destino.zonaCapitalina ?? null;
    }

    if (
      !departamentoCodigo ||
      !municipioCodigo ||
      municipioCodigo.slice(0, 2) !== departamentoCodigo
    ) {
      return { estimacion, tipo: "requiere_cotizacion", motivo: "direccion_sin_codigos" };
    }

    // 4. Configuración vigente.
    const config = await deps.leerConfiguracion();

    // 5. Deducción del método.
    if (
      departamentoCodigo === DEPARTAMENTO_GUATEMALA &&
      municipioCodigo === MUNICIPIO_GUATEMALA
    ) {
      if (!esZonaCapitalinaValida(zonaCapitalina)) {
        return { estimacion, tipo: "requiere_cotizacion", motivo: "direccion_sin_codigos" };
      }
      const metodoZona = deducirMetodoZona(config.metodosZonas, zonaCapitalina);
      const base = calcularEnvioOperativo({
        metodo: metodoZona,
        subtotalCents,
        reglas: config.reglasPropias,
      });
      return { estimacion, ...base };
    }

    // Cualquier otro municipio del país va por Guatex.
    const base = calcularEnvioOperativo({ metodo: "guatex", subtotalCents });
    return { estimacion, ...base };
  } catch (error) {
    if (error instanceof ErrorDeDatos) {
      return { estimacion, tipo: "no_disponible", causa: "datos" };
    }
    throw error;
  }
}

/**
 * Un valor que no sea exactamente uno de los dos métodos no puede convertirse en
 * mensajero propio: eso inventaría un importe. Se degrada a Guatex, que solo pide
 * contacto.
 */
function deducirMetodoZona(
  metodosZonas: Record<ZonaCapitalina, MetodoEnvioZona>,
  zona: ZonaCapitalina,
): MetodoEnvioZona {
  const metodo = metodosZonas[zona];
  return metodo === "mensajero_propio" ? "mensajero_propio" : "guatex";
}
