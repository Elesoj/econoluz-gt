"use server";

// Las dos únicas escrituras del panel de envíos en el modelo operativo: el método
// que atiende cada zona capitalina y las reglas comerciales del mensajero propio.
//
// Las Server Actions de 9A —crear zonas de reparto, asignar coberturas, publicar
// tarifas por tramos— se retiran porque su modelo ya no existe. Las tablas
// `shipping_zones`, `shipping_zone_areas` y `shipping_rates` se conservan intactas
// en PostgreSQL para auditoría histórica, pero se quedan sin consumidores.

import { redirect } from "next/navigation";
import { verificarPermisoParaAccion } from "../auth/authorization.server";
import { guardarMetodoZona, guardarReglasPropias } from "../../envios/configuracion.server";
import {
  validarFormularioMetodoZona,
  validarFormularioReglasEnvio,
} from "./formularios";

/**
 * El permiso se comprueba **antes** de mirar el formulario, y el rol se relee de
 * la base en cada acción: nunca se toma de la cookie.
 */
export async function cambiarMetodoZonaAction(formData: FormData): Promise<void> {
  const admin = await verificarPermisoParaAccion("envios:escribir");

  const res = validarFormularioMetodoZona(formData);
  if (!res.ok) {
    redirect(`/admin/envios?error=${encodeURIComponent(res.error)}`);
  }

  try {
    await guardarMetodoZona(res.zona, res.metodo, admin.id);
  } catch (err) {
    const mensaje =
      err instanceof Error ? err.message : "Error al guardar el método de la zona.";
    redirect(`/admin/envios?error=${encodeURIComponent(mensaje)}`);
  }

  redirect("/admin/envios?guardado=1");
}

export async function guardarReglasEnvioAction(formData: FormData): Promise<void> {
  const admin = await verificarPermisoParaAccion("envios:escribir");

  const res = validarFormularioReglasEnvio(formData);
  if (!res.ok) {
    redirect(`/admin/envios?error=${encodeURIComponent(res.error)}`);
  }

  try {
    await guardarReglasPropias(res.reglas, admin.id);
  } catch (err) {
    const mensaje =
      err instanceof Error ? err.message : "Error al guardar las reglas de envío.";
    redirect(`/admin/envios?error=${encodeURIComponent(mensaje)}`);
  }

  redirect("/admin/envios?guardado=1");
}
