import { randomBytes } from "node:crypto";

/**
 * Cuatro megas. Ninguna de las 326 fotos actuales pasa de 210 KB, así que este
 * tope es holgado; está para que una foto recién sacada del móvil no se suba
 * tal cual. `next/image` la servirá optimizada, pero el original se guarda.
 *
 * Tampoco puede subirse mucho más: una Server Action manda el archivo por el
 * servidor, y ahí hay un límite propio de tamaño de petición.
 */
export const TAMANO_MAXIMO_FOTO = 4 * 1024 * 1024;

/** Los formatos que el catálogo ya usa. */
const TIPOS_ADMITIDOS: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/avif": "avif",
};

const DOMINIO_DEL_ALMACEN = /^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/;

export type ValidacionFoto = { ok: true; extension: string } | { ok: false; error: string };

export function validarFoto(nombre: string, tipo: string, tamano: number): ValidacionFoto {
  const extension = TIPOS_ADMITIDOS[tipo];
  if (!extension) {
    return { ok: false, error: "El archivo tiene que ser una imagen (webp, jpg, png o avif)." };
  }

  if (tamano <= 0) {
    return { ok: false, error: "Ese archivo está vacío." };
  }

  if (tamano > TAMANO_MAXIMO_FOTO) {
    const megas = (tamano / (1024 * 1024)).toFixed(1);
    return {
      ok: false,
      error: `La foto pesa ${megas} MB y el máximo son 4 MB. Redúcela antes de subirla.`,
    };
  }

  return { ok: true, extension };
}

/**
 * El nombre con el que la foto se guarda en el almacén.
 *
 * **El nombre original se descarta a propósito.** Los archivos del proveedor se
 * llaman como el proveedor, y la URL de una foto es pública: se ve con clic
 * derecho. Es exactamente la deuda que arrastran hoy las rutas de
 * `/catalogos/<marca>/`, y no tiene sentido repetirla en lo nuevo.
 *
 * El sufijo aleatorio evita que volver a subir la foto de un producto sirva la
 * versión vieja desde la caché de alguien.
 */
export function nombreParaBlob(referencia: string, nombreOriginal: string) {
  const extensionOriginal = nombreOriginal.split(".").pop()?.toLowerCase() ?? "";
  const extension = Object.values(TIPOS_ADMITIDOS).includes(extensionOriginal)
    ? extensionOriginal
    : "webp";

  const sufijo = randomBytes(4).toString("hex");
  return `productos/${referencia.toLowerCase()}-${sufijo}.${extension}`;
}

/**
 * Vale una ruta local de las que ya existen o una URL del almacén del proyecto.
 * Cualquier otro dominio se rechaza: `next/image` no lo serviría, y la foto
 * saldría rota sin decir por qué.
 */
export function esRutaDeImagenValida(ruta: string) {
  const limpia = ruta.trim();

  if (limpia.startsWith("/")) {
    return true;
  }

  try {
    const url = new URL(limpia);
    return url.protocol === "https:" && DOMINIO_DEL_ALMACEN.test(url.hostname);
  } catch {
    return false;
  }
}
