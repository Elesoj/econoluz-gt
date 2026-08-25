"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { CATALOG_CACHE_TAG } from "../../data/catalog.server";
import { verificarSesionParaAccion } from "../auth/authorization.server";
import { parsearExistencias, parsearPrecio } from "./list";
import { guardarCambiosProducto } from "./list.server";

/** Se muestran los primeros errores; la URL no es sitio para una lista larga. */
const MAXIMO_ERRORES_MOSTRADOS = 3;

/**
 * Guarda de una vez los cambios de toda la página del listado. Es un solo
 * formulario a propósito: poner precio a 313 productos entrando y saliendo de
 * cada ficha sería inviable, y guardar fila a fila obligaría a esperar una
 * recarga por cada precio escrito.
 */
export async function guardarProductos(datos: FormData) {
  await verificarSesionParaAccion();

  const referencias = datos.getAll("referencia").map(String);
  const errores: string[] = [];
  let guardados = 0;

  for (const referencia of referencias) {
    const precioEscrito = String(datos.get(`precio_${referencia}`) ?? "");
    const existenciasEscritas = String(datos.get(`existencias_${referencia}`) ?? "");
    const publicado = datos.get(`publicado_${referencia}`) === "on";

    // Solo se escribe en la base de datos lo que de verdad cambió: guardar 25
    // filas para modificar una sería castigar a Neon sin motivo.
    const comoEstaba = String(datos.get(`original_${referencia}`) ?? "");
    const comoQueda = `${precioEscrito.trim()}|${existenciasEscritas.trim()}|${publicado}`;
    if (comoEstaba === comoQueda) {
      continue;
    }

    const precio = parsearPrecio(precioEscrito);
    if (!precio.ok) {
      errores.push(`${referencia}: ${precio.error}`);
      continue;
    }

    const existencias = parsearExistencias(existenciasEscritas);
    if (!existencias.ok) {
      errores.push(`${referencia}: ${existencias.error}`);
      continue;
    }

    await guardarCambiosProducto({
      referencia,
      precio: precio.valor,
      existencias: existencias.valor,
      publicado,
    });
    guardados += 1;
  }

  if (guardados > 0) {
    // Sin esto se guarda de verdad, pero la web pública sigue enseñando lo
    // viejo y parece que el panel no funciona. `updateTag` caduca la entrada
    // al momento; `revalidateTag(tag, "max")` seguiría sirviendo la anterior.
    updateTag(CATALOG_CACHE_TAG);
  }

  const destino = new URLSearchParams(String(datos.get("volverA") ?? ""));
  destino.set("guardados", String(guardados));
  if (errores.length > 0) {
    destino.set("errores", errores.slice(0, MAXIMO_ERRORES_MOSTRADOS).join(" · "));
    destino.set("fallidos", String(errores.length));
  }

  // `redirect` lanza para cortar el render: siempre fuera de un try/catch.
  redirect(`/admin/productos?${destino.toString()}`);
}
