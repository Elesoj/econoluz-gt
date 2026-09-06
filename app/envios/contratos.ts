// app/envios/contratos.ts
//
// Contratos del modelo operativo de envíos. Sustituyen a los de 9A: aquí ya no
// hay zonas de reparto configurables, ni tarifas por tramo, ni plazos de entrega.
//
// La regla que gobierna estos tipos: Guatex tiene coste **desconocido**, y eso se
// escribe `envioCents: null`. Nunca cero, porque cero significa «el envío es
// gratuito» y prometeríamos algo que no sabemos.

export type DestinoDeEnvio =
  | { tipo: "recogida_en_tienda" }
  | { tipo: "direccion_guardada"; direccionId: string }
  | {
      tipo: "destino_directo";
      departamentoCodigo: string;
      municipioCodigo: string;
      zonaCapitalina?: number | null;
    };

export type MotivoDeCotizacion =
  | "sin_cobertura"
  | "zona_inactiva"
  | "cobertura_desactivada"
  | "sin_tarifa_vigente"
  | "direccion_sin_codigos"
  | "pedido_grande";

export type MetodoEnvioOperativo = "mensajero_propio" | "guatex";

export type LineaDeEntrada = {
  econoluzReference: string;
  cantidad: number;
};

export type ResultadoDeEnvioBase =
  | { tipo: "sin_coste"; metodo: "recogida_en_tienda"; envioCents: 0 }
  | {
      tipo: "calculado";
      metodo: "mensajero_propio";
      envioCents: number;
      gratuito: boolean;
      faltanParaGratisCents: number | null;
    }
  | {
      tipo: "solicitud_contacto";
      metodo: "guatex";
      envioCents: null;
      gratuito: false;
      faltanParaGratisCents: null;
    }
  | { tipo: "requiere_cotizacion"; motivo: MotivoDeCotizacion }
  | { tipo: "metodo_no_disponible"; metodo: "recogida_en_tienda" }
  | { tipo: "carrito_no_comprable"; referencias: readonly string[] }
  | { tipo: "no_disponible"; causa: "datos" | "configuracion" };

export type ResultadoDeEnvio = { estimacion: boolean } & ResultadoDeEnvioBase;

export type EnvioPublico = { estimacion: boolean } & (
  | {
      estado: "calculado";
      metodo: "mensajero_propio";
      envioCents: number;
      gratuito: boolean;
      faltanParaGratisCents: number | null;
    }
  | {
      estado: "solicitud_contacto";
      metodo: "guatex";
      envioCents: null;
      gratuito: false;
      faltanParaGratisCents: null;
    }
  | { estado: "recogida_en_tienda"; envioCents: 0 }
  | { estado: "cotizacion_requerida" }
  | { estado: "recogida_no_disponible" }
  | { estado: "carrito_no_comprable"; referencias: readonly string[] }
  | { estado: "servicio_no_disponible" }
);

/**
 * Traduce el resultado interno al que sale al navegador. El motivo de cotización
 * nunca cruza: al visitante le basta con saber que hay que cotizar, y los motivos
 * describen la configuración interna.
 */
export function aEnvioPublico(r: ResultadoDeEnvio): EnvioPublico {
  switch (r.tipo) {
    case "sin_coste":
      return {
        estimacion: r.estimacion,
        estado: "recogida_en_tienda",
        envioCents: 0,
      };
    case "calculado":
      return {
        estimacion: r.estimacion,
        estado: "calculado",
        metodo: r.metodo,
        envioCents: r.envioCents,
        gratuito: r.gratuito,
        faltanParaGratisCents: r.faltanParaGratisCents,
      };
    case "solicitud_contacto":
      return {
        estimacion: r.estimacion,
        estado: "solicitud_contacto",
        metodo: r.metodo,
        envioCents: null,
        gratuito: false,
        faltanParaGratisCents: null,
      };
    case "requiere_cotizacion":
      return {
        estimacion: r.estimacion,
        estado: "cotizacion_requerida",
      };
    case "metodo_no_disponible":
      return {
        estimacion: r.estimacion,
        estado: "recogida_no_disponible",
      };
    case "carrito_no_comprable":
      return {
        estimacion: r.estimacion,
        estado: "carrito_no_comprable",
        referencias: r.referencias,
      };
    case "no_disponible":
      return {
        estimacion: r.estimacion,
        estado: "servicio_no_disponible",
      };
  }
}
