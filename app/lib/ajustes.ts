import type { Ejecutor } from "./datos/consulta";

/**
 * El selector del modelo de catálogo, guardado en `app_settings`.
 *
 * Ante cualquier duda —valor desconocido, fila ausente, base que no responde—
 * se sirve `legacy`, que es el camino probado. Un fallo de configuración no
 * puede cambiar por su cuenta lo que ve el visitante, y menos hacia un camino
 * que todavía no se ha demostrado.
 *
 * La bandera vive en la base y no en una variable de entorno porque cambiar
 * una variable en Vercel exige normalmente un nuevo despliegue: como vuelta
 * atrás urgente no serviría.
 *
 * Este módulo es puro: recibe el ejecutor y no conoce ninguna conexión, así
 * que se prueba sin base de datos. La conexión real la pone `ajustes.server.ts`.
 */

export type ModeloDeCatalogo = "legacy" | "shadow" | "relational_v2";

export const MODELO_POR_DEFECTO: ModeloDeCatalogo = "legacy";

const MODELOS: readonly ModeloDeCatalogo[] = ["legacy", "shadow", "relational_v2"];

/** La clave con la que se guarda la bandera; la crea `db/007_app_settings.sql`. */
export const CLAVE_MODELO_CATALOGO = "modelo_catalogo";

export function interpretarModelo(valor: unknown): ModeloDeCatalogo {
  return typeof valor === "string" && (MODELOS as readonly string[]).includes(valor)
    ? (valor as ModeloDeCatalogo)
    : MODELO_POR_DEFECTO;
}

export async function leerModeloDeCatalogo(ejecutor: Ejecutor): Promise<ModeloDeCatalogo> {
  try {
    const filas = await ejecutor("select valor from app_settings where clave = $1", [
      CLAVE_MODELO_CATALOGO,
    ]);
    return interpretarModelo(filas[0]?.valor);
  } catch {
    // Sin registrar aquí: este módulo no conoce el registro de la capa de
    // datos, y quien conecta ya sabe distinguir «no hay base» de «la base
    // falló». Ver `ajustes.server.ts`.
    return MODELO_POR_DEFECTO;
  }
}

/**
 * Ajuste de recogida en tienda en app_settings.
 *
 * No es una zona geográfica ni una tarifa: es un método de entrega a Q0.
 * Si el ajuste no existe, está corrupto o la base no responde, la recogida
 * se desactiva (camino seguro y conservador).
 */
export type RecogidaEnTienda = {
  activa: boolean;
  texto: string;
};

export const RECOGIDA_POR_DEFECTO: RecogidaEnTienda = {
  activa: false,
  texto: "",
};

export const CLAVE_RECOGIDA_TIENDA = "recogida_en_tienda";

export function leerRecogidaEnTienda(valor: unknown): RecogidaEnTienda {
  if (valor === undefined || valor === null) {
    return { ...RECOGIDA_POR_DEFECTO };
  }

  let obj: unknown = valor;

  if (typeof valor === "string") {
    try {
      obj = JSON.parse(valor);
    } catch {
      return { ...RECOGIDA_POR_DEFECTO };
    }
  }

  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    return { ...RECOGIDA_POR_DEFECTO };
  }

  const candidato = obj as Record<string, unknown>;
  const activa = candidato.activa === true;
  const textoCrudo = typeof candidato.texto === "string" ? candidato.texto : "";
  const texto = textoCrudo.trim().slice(0, 200);

  return { activa, texto };
}

export async function leerAjusteRecogidaEnTienda(ejecutor: Ejecutor): Promise<RecogidaEnTienda> {
  try {
    const filas = await ejecutor("select valor from app_settings where clave = $1", [
      CLAVE_RECOGIDA_TIENDA,
    ]);
    return leerRecogidaEnTienda(filas[0]?.valor);
  } catch {
    return { ...RECOGIDA_POR_DEFECTO };
  }
}

