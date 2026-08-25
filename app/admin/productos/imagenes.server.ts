import "server-only";

import { put } from "@vercel/blob";
import { nombreParaBlob, validarFoto } from "./imagenes";

export type SubidaFoto = { ok: true; url: string } | { ok: false; error: string };

/**
 * Sube una foto al almacén del proyecto y devuelve su URL pública.
 *
 * El archivo se guarda con un nombre construido a partir de la referencia, no
 * con el nombre que traía: ver `nombreParaBlob`.
 */
export async function subirFoto(referencia: string, archivo: File): Promise<SubidaFoto> {
  const validacion = validarFoto(archivo.name, archivo.type, archivo.size);
  if (!validacion.ok) {
    return validacion;
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return {
      ok: false,
      error: "Falta configurar el almacén de fotos. Revisa BLOB_READ_WRITE_TOKEN.",
    };
  }

  try {
    const subida = await put(nombreParaBlob(referencia, archivo.name), archivo, {
      access: "public",
      contentType: archivo.type,
    });
    return { ok: true, url: subida.url };
  } catch {
    // El detalle del fallo se queda en el servidor: puede llevar el token.
    return { ok: false, error: "No se pudo subir la foto. Inténtalo de nuevo." };
  }
}
