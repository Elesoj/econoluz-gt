// app/envios/contratos.ts

export type DestinoDeEnvio =
  | { tipo: "recogida_en_tienda" }
  | { tipo: "direccion_guardada"; direccionId: string }
  | { tipo: "destino_directo"; departamentoCodigo: string; municipioCodigo: string };

export type MotivoDeCotizacion =
  | "sin_cobertura"
  | "zona_inactiva"
  | "cobertura_desactivada"
  | "sin_tarifa_vigente"
  | "direccion_sin_codigos"
  | "pedido_grande";

export type ResultadoDeEnvioBase =
  | { tipo: "sin_coste"; metodo: "recogida_en_tienda"; envioCents: 0 }
  | {
      tipo: "con_tarifa";
      zonaCodigo: string;
      zonaNombre: string;
      metodo: "mensajero_propio" | "paqueteria";
      envioCents: number;
      gratuito: boolean;
      faltanParaGratisCents: number | null;
      plazoMinDias: number;
      plazoMaxDias: number;
    }
  | { tipo: "requiere_cotizacion"; motivo: MotivoDeCotizacion }
  | { tipo: "metodo_no_disponible"; metodo: "recogida_en_tienda" }
  | { tipo: "carrito_no_comprable"; referencias: readonly string[] }
  | { tipo: "no_disponible"; causa: "datos" | "configuracion" };

export type ResultadoDeEnvio = { estimacion: boolean } & ResultadoDeEnvioBase;

export type EnvioPublico = { estimacion: boolean } & (
  | {
      estado: "calculado";
      envioCents: number;
      gratuito: boolean;
      faltanParaGratisCents: number | null;
      plazoMinDias: number;
      plazoMaxDias: number;
    }
  | { estado: "recogida_en_tienda"; envioCents: 0 }
  | { estado: "cotizacion_requerida" }
  | { estado: "recogida_no_disponible" }
  | { estado: "carrito_no_comprable"; referencias: readonly string[] }
  | { estado: "servicio_no_disponible" }
);

export function aEnvioPublico(r: ResultadoDeEnvio): EnvioPublico {
  switch (r.tipo) {
    case "sin_coste":
      return {
        estimacion: r.estimacion,
        estado: "recogida_en_tienda",
        envioCents: 0,
      };
    case "con_tarifa":
      return {
        estimacion: r.estimacion,
        estado: "calculado",
        envioCents: r.envioCents,
        gratuito: r.gratuito,
        faltanParaGratisCents: r.faltanParaGratisCents,
        plazoMinDias: r.plazoMinDias,
        plazoMaxDias: r.plazoMaxDias,
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
