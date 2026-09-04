"server-only";

import { ErrorDeDatos } from "../lib/datos/errores";
import { aCentavos } from "../lib/dinero";
import type { DestinoDeEnvio, ResultadoDeEnvio, ResultadoDeEnvioBase } from "./contratos";
import { resolverZona, type Cobertura } from "./zonas";
import { calcularEnvio, estaVigente, type Tarifa, type Zona } from "./tarifas";

export type LineaDeEntrada = {
  econoluzReference: string;
  cantidad: number;
};

export type ResumenProductos = {
  piezas: number;
  subtotalCents: number;
  descartadas: readonly string[];
};

export type ConfiguracionEnvios = {
  recogidaActiva?: boolean;
  cobertura?: readonly Cobertura[];
  zonas?: readonly (Partial<Zona> & { id?: number; activa?: boolean })[];
  tarifas?: readonly (Partial<Tarifa> & { zoneId?: number; publicada?: boolean })[];
};

export type DependenciasEnvios = {
  leerConfiguracion: () => Promise<ConfiguracionEnvios>;
  leerCarrito?: () => Promise<{ lineas: readonly LineaDeEntrada[] }>;
  resolverProductos: (lineas: readonly LineaDeEntrada[]) => Promise<ResumenProductos>;
  leerDireccion?: (direccionId: string) => Promise<{
    departamentoCodigo?: string | null;
    municipioCodigo?: string | null;
  } | null>;
  ahora?: () => Date;
};

export type OpcionesEnvios = {
  estimacion?: boolean;
  lineas?: readonly LineaDeEntrada[];
};

function construirTarifa(rawTarifa: Partial<Tarifa>): Tarifa {
  return {
    importeCents: rawTarifa.importeCents ?? 0,
    umbralGratisCents: rawTarifa.umbralGratisCents ?? null,
    maxPiezas: rawTarifa.maxPiezas ?? null,
    maxImporteCents: rawTarifa.maxImporteCents ?? null,
    plazoMinDias: rawTarifa.plazoMinDias ?? 2,
    plazoMaxDias: rawTarifa.plazoMaxDias ?? 3,
    publicada: Boolean(rawTarifa.publicada),
    vigenteDesde:
      rawTarifa.vigenteDesde instanceof Date
        ? rawTarifa.vigenteDesde
        : rawTarifa.vigenteDesde
          ? new Date(rawTarifa.vigenteDesde)
          : new Date(0),
    vigenteHasta:
      rawTarifa.vigenteHasta instanceof Date
        ? rawTarifa.vigenteHasta
        : rawTarifa.vigenteHasta
          ? new Date(rawTarifa.vigenteHasta)
          : null,
  };
}

/**
 * Función central de orquestación de envíos.
 *
 * Aplica en orden estricto el algoritmo de §5.5 del diseño:
 * 1. Carrito y resolución de productos.
 * 2. Recogida en tienda.
 * 3. Resolver destino a códigos.
 * 4. Configuración de geografía y tarifas.
 * 5. Determinar zona por precedencia.
 * 6. Zona activa y determinismo.
 * 7. Tarifa publicada y vigente con determinismo.
 * 8. Cálculo de tarifa (límites, gratuidad, plazos).
 */
export async function orquestar(
  destino: DestinoDeEnvio,
  deps: DependenciasEnvios,
  opciones?: OpcionesEnvios,
): Promise<ResultadoDeEnvio> {
  const estimacion = Boolean(opciones?.estimacion);

  try {
    // 1. Reconstruir el carrito desde el servidor. Si aparece cualquier descarte,
    // el cálculo se detiene inmediatamente.
    let lineas: readonly LineaDeEntrada[] = [];
    if (estimacion) {
      lineas = opciones?.lineas ?? [];
    } else {
      const carrito = await deps.leerCarrito?.();
      lineas = carrito?.lineas ?? [];
    }

    const { piezas, subtotalCents, descartadas } = await deps.resolverProductos(lineas);
    if (descartadas && descartadas.length > 0) {
      return {
        estimacion,
        tipo: "carrito_no_comprable",
        referencias: descartadas,
      };
    }

    // 2. Recogida en tienda. Se evalúa antes de geografía y códigos.
    if (destino.tipo === "recogida_en_tienda") {
      const config = await deps.leerConfiguracion();
      if (config.recogidaActiva) {
        return {
          estimacion,
          tipo: "sin_coste",
          metodo: "recogida_en_tienda",
          envioCents: 0,
        };
      }
      return {
        estimacion,
        tipo: "metodo_no_disponible",
        metodo: "recogida_en_tienda",
      };
    }

    // 3. Resolver el destino a códigos.
    let departamentoCodigo: string;
    let municipioCodigo: string;

    if (destino.tipo === "direccion_guardada") {
      if (!deps.leerDireccion) {
        return {
          estimacion,
          tipo: "requiere_cotizacion",
          motivo: "direccion_sin_codigos",
        };
      }
      const dir = await deps.leerDireccion(destino.direccionId);
      if (
        !dir ||
        !dir.departamentoCodigo ||
        !dir.municipioCodigo ||
        dir.municipioCodigo.slice(0, 2) !== dir.departamentoCodigo
      ) {
        return {
          estimacion,
          tipo: "requiere_cotizacion",
          motivo: "direccion_sin_codigos",
        };
      }
      departamentoCodigo = dir.departamentoCodigo;
      municipioCodigo = dir.municipioCodigo;
    } else if (destino.tipo === "destino_directo") {
      if (
        !destino.departamentoCodigo ||
        !destino.municipioCodigo ||
        destino.municipioCodigo.slice(0, 2) !== destino.departamentoCodigo
      ) {
        return {
          estimacion,
          tipo: "requiere_cotizacion",
          motivo: "direccion_sin_codigos",
        };
      }
      departamentoCodigo = destino.departamentoCodigo;
      municipioCodigo = destino.municipioCodigo;
    } else {
      return {
        estimacion,
        tipo: "requiere_cotizacion",
        motivo: "direccion_sin_codigos",
      };
    }

    // 4. Configuración geografía y tarifas.
    const config = await deps.leerConfiguracion();

    // 5. Determinar zona por precedencia.
    const cobertura = (config.cobertura ?? []) as Cobertura[];
    const resZona = resolverZona(cobertura, { departamentoCodigo, municipioCodigo });

    if (resZona.tipo === "sin_cobertura") {
      return {
        estimacion,
        tipo: "requiere_cotizacion",
        motivo: "sin_cobertura",
      };
    }

    if (resZona.tipo === "cobertura_desactivada") {
      return {
        estimacion,
        tipo: "requiere_cotizacion",
        motivo: "cobertura_desactivada",
      };
    }

    const zoneId = resZona.zoneId;

    // 6. Zona activa. Determinismo: si hay más de una fila, error interno.
    const zonasCoincidentes = (config.zonas ?? []).filter((z) => z.id === zoneId);
    if (zonasCoincidentes.length > 1) {
      throw new Error(`Determinismo: múltiples zonas encontradas con el id ${zoneId}`);
    }

    const zonaEncontrada = zonasCoincidentes[0];
    if (!zonaEncontrada || !zonaEncontrada.activa) {
      return {
        estimacion,
        tipo: "requiere_cotizacion",
        motivo: "zona_inactiva",
      };
    }

    const zona: Zona = {
      codigo: zonaEncontrada.codigo ?? "",
      nombre: zonaEncontrada.nombre ?? "",
      metodo: zonaEncontrada.metodo ?? "paqueteria",
    };

    // 7. Tarifa publicada y vigente. Determinismo: si hay más de una fila, error interno.
    const ahora = deps.ahora ? deps.ahora() : new Date();
    const tarifasCoincidentes = (config.tarifas ?? []).filter(
      (t) => t.zoneId === zoneId && t.publicada && estaVigente(construirTarifa(t), ahora),
    );

    if (tarifasCoincidentes.length > 1) {
      throw new Error(
        `Determinismo: múltiples tarifas publicadas encontradas para la zona ${zoneId}`,
      );
    }

    if (tarifasCoincidentes.length === 0) {
      return {
        estimacion,
        tipo: "requiere_cotizacion",
        motivo: "sin_tarifa_vigente",
      };
    }

    const tarifa: Tarifa = construirTarifa(tarifasCoincidentes[0]);

    // 8. Cálculo de tarifa.
    const resultadoBase: ResultadoDeEnvioBase = calcularEnvio(
      tarifa,
      zona,
      { piezas, subtotalCents },
      ahora,
    );

    return {
      estimacion,
      ...resultadoBase,
    };
  } catch (error) {
    if (error instanceof ErrorDeDatos) {
      return {
        estimacion,
        tipo: "no_disponible",
        causa: "datos",
      };
    }
    throw error;
  }
}

async function leerConfiguracionReal(): Promise<ConfiguracionEnvios> {
  const { leer } = await import("../lib/datos");

  const [areas, zonas, tarifas] = await Promise.all([
    leer<{
      zone_id: number | string;
      departamento_codigo: string | null;
      municipio_codigo: string | null;
      activa: boolean;
    }>(
      `select zone_id, departamento_codigo, municipio_codigo, activa
         from shipping_zone_areas`,
    ),
    leer<{
      id: number | string;
      codigo: string;
      nombre: string;
      metodo: string;
      activa: boolean;
    }>(
      `select id, codigo, nombre, metodo, activa
         from shipping_zones`,
    ),
    leer<{
      zone_id: number | string;
      importe_cents: number;
      umbral_gratis_cents: number | null;
      max_piezas: number | null;
      max_importe_cents: number | null;
      plazo_min_dias: number;
      plazo_max_dias: number;
      publicada: boolean;
      vigente_desde: string | Date;
      vigente_hasta: string | Date | null;
    }>(
      `select zone_id, importe_cents, umbral_gratis_cents, max_piezas, max_importe_cents,
              plazo_min_dias, plazo_max_dias, publicada, vigente_desde, vigente_hasta
         from shipping_rates
        where publicada = true`,
    ),
  ]);

  return {
    // Ruling 3: recogida apagada por defecto hasta la tarea 14
    recogidaActiva: false,
    cobertura: areas.map((a) => ({
      zoneId: Number(a.zone_id),
      departamentoCodigo: a.departamento_codigo ? String(a.departamento_codigo).trim() : null,
      municipioCodigo: a.municipio_codigo ? String(a.municipio_codigo).trim() : null,
      activa: Boolean(a.activa),
    })),
    zonas: zonas.map((z) => ({
      id: Number(z.id),
      codigo: String(z.codigo),
      nombre: String(z.nombre),
      metodo: z.metodo as "mensajero_propio" | "paqueteria",
      activa: Boolean(z.activa),
    })),
    tarifas: tarifas.map((t) => ({
      zoneId: Number(t.zone_id),
      importeCents: Number(t.importe_cents),
      umbralGratisCents: t.umbral_gratis_cents !== null ? Number(t.umbral_gratis_cents) : null,
      maxPiezas: t.max_piezas !== null ? Number(t.max_piezas) : null,
      maxImporteCents: t.max_importe_cents !== null ? Number(t.max_importe_cents) : null,
      plazoMinDias: Number(t.plazo_min_dias),
      plazoMaxDias: Number(t.plazo_max_dias),
      publicada: Boolean(t.publicada),
      vigenteDesde: new Date(t.vigente_desde),
      vigenteHasta: t.vigente_hasta ? new Date(t.vigente_hasta) : null,
    })),
  };
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

/**
 * Cálculo autenticado. Recibe SOLO el destino y lee el carrito y cliente desde el servidor.
 */
export async function cotizarEnvioDelCliente(
  destino: DestinoDeEnvio,
): Promise<ResultadoDeEnvio> {
  const { leerClienteActual } = await import("../identidad/sesion.server");
  const cliente = await leerClienteActual();
  if (!cliente) {
    return {
      estimacion: false,
      tipo: "no_disponible",
      causa: "configuracion",
    };
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
      }>(
        `select departamento_codigo, municipio_codigo
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
        municipioCodigo: fila.municipio_codigo
          ? String(fila.municipio_codigo).trim()
          : null,
      };
    },
    ahora: () => new Date(),
  };

  return orquestar(destino, depsReales, { estimacion: false });
}

/**
 * Estimación anónima. Recibe referencias públicas y cantidades, nunca precios.
 */
export async function estimarEnvio(
  destino: DestinoDeEnvio,
  lineas: readonly { econoluzReference: string; cantidad: number }[],
): Promise<ResultadoDeEnvio> {
  const depsReales: DependenciasEnvios = {
    leerConfiguracion: leerConfiguracionReal,
    resolverProductos: resolverProductosReal,
    leerDireccion: async () => null,
    ahora: () => new Date(),
  };

  return orquestar(destino, depsReales, { estimacion: true, lineas });
}
