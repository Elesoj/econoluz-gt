"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { CATALOG_CACHE_TAG } from "../../data/catalog.server";
import { verificarSesionParaAccion } from "../auth/authorization.server";
import { fichaTecnicaDesdeFormulario, validarFichaProducto, CAMPOS_FICHA_TECNICA } from "./ficha";
import { getProductoFicha, saveProductoFicha } from "./ficha.server";
import { esRutaDeImagenValida } from "./imagenes";
import { subirFoto } from "./imagenes.server";
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

/**
 * Guarda la ficha completa de un producto.
 *
 * Devuelve el error por la dirección, sin JavaScript de cliente: el formulario
 * entero es de servidor, que es lo que exige §4.1 para que los datos del
 * proveedor no acaben en un chunk descargable.
 */
export async function guardarFicha(datos: FormData) {
  await verificarSesionParaAccion();

  const referencia = String(datos.get("referencia") ?? "");
  const destino = new URLSearchParams();

  const actual = await getProductoFicha(referencia);
  if (!actual) {
    redirect("/admin/productos?errores=" + encodeURIComponent("Ese producto ya no existe."));
  }

  // La foto nueva, si la hay, se sube antes de tocar la base de datos: si
  // fallara la subida, el producto se queda como estaba.
  let imagen = String(datos.get("imagen") ?? "").trim();
  const archivo = datos.get("foto");
  if (archivo instanceof File && archivo.size > 0) {
    const subida = await subirFoto(referencia, archivo);
    if (!subida.ok) {
      destino.set("error", subida.error);
      redirect(`/admin/productos/${referencia}?${destino.toString()}`);
    }
    imagen = subida.url;
  }

  if (!esRutaDeImagenValida(imagen)) {
    destino.set(
      "error",
      "La ruta de la imagen no vale. Tiene que empezar por / o ser una URL del almacén de fotos.",
    );
    redirect(`/admin/productos/${referencia}?${destino.toString()}`);
  }

  const validacion = validarFichaProducto({
    nombre: String(datos.get("nombre") ?? ""),
    descripcion: String(datos.get("descripcion") ?? ""),
    imagen,
    tipo: String(datos.get("tipo") ?? ""),
    aplicacion: String(datos.get("aplicacion") ?? ""),
    acabado: actual.acabado,
    acabadoEtiqueta: actual.acabadoEtiqueta,
    familia: String(datos.get("familia") ?? ""),
  });

  if (!validacion.ok) {
    destino.set("error", validacion.errores.join(" "));
    redirect(`/admin/productos/${referencia}?${destino.toString()}`);
  }

  const precio = parsearPrecio(String(datos.get("precio") ?? ""));
  const existencias = parsearExistencias(String(datos.get("existencias") ?? ""));
  if (!precio.ok || !existencias.ok) {
    destino.set("error", !precio.ok ? precio.error : "Revisa las existencias.");
    redirect(`/admin/productos/${referencia}?${destino.toString()}`);
  }

  const campos: Record<string, string> = {};
  for (const campo of CAMPOS_FICHA_TECNICA) {
    campos[campo.clave] = String(datos.get(`spec_${campo.clave}`) ?? "");
  }

  await saveProductoFicha({
    referencia,
    ...validacion.datos,
    galeria: String(datos.get("galeria") ?? "")
      .split(/\r?\n/)
      .map((linea) => linea.trim())
      .filter((linea) => linea.length > 0),
    fichaTecnica: fichaTecnicaDesdeFormulario(campos, String(datos.get("caracteristicas") ?? "")),
    proveedorCodigo: String(datos.get("proveedorCodigo") ?? "").trim(),
    proveedorNombre: String(datos.get("proveedorNombre") ?? "").trim(),
    proveedorDescripcion: String(datos.get("proveedorDescripcion") ?? "").trim(),
    precio: precio.valor,
    existencias: existencias.valor,
    seVendeEnLinea: datos.get("seVendeEnLinea") === "on",
    publicado: datos.get("publicado") === "on",
  });

  updateTag(CATALOG_CACHE_TAG);

  redirect(`/admin/productos/${referencia}?guardado=1`);
}
