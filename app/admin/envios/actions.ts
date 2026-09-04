"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { escribir } from "../../lib/datos";
import { validarTarifa, validarZona } from "../../envios/validacion";
import { verificarPermisoParaAccion } from "../auth/authorization.server";
import { publicarTarifaEnBase } from "./tarifas.server";

export type EstadoAccion = {
  ok: boolean;
  mensaje?: string;
  error?: string;
};

/**
 * 1. crearZona(formData: FormData)
 * Valida con validarZona, inserta en shipping_zones y audit_log, e invalida "envios-tarifas".
 */
export async function crearZona(formData: FormData) {
  const admin = await verificarPermisoParaAccion("envios:escribir");

  const codigo = String(formData.get("codigo") ?? "").trim().toLowerCase();
  const nombre = String(formData.get("nombre") ?? "").trim();
  const metodo = String(formData.get("metodo") ?? "").trim();
  const notas = String(formData.get("notas") ?? "").trim();

  if (metodo !== "mensajero_propio" && metodo !== "paqueteria") {
    redirect(
      `/admin/envios?error=${encodeURIComponent(
        "El método de envío debe ser 'mensajero_propio' o 'paqueteria'.",
      )}`,
    );
  }

  const validacion = validarZona({ codigo, nombre, notas });
  if (!validacion.ok) {
    redirect(`/admin/envios?error=${encodeURIComponent(validacion.error)}`);
  }

  let slugRedireccion = codigo;

  try {
    await escribir(
      async (ejecutar) => {
        // Verificar si el código ya existe para ofrecer un mensaje claro en castellano
        const existentes = await ejecutar(
          "select id from shipping_zones where codigo = $1",
          [codigo],
        );
        if (existentes.length > 0) {
          throw new Error(
            `El código de zona '${codigo}' ya está en uso. Elige un código diferente.`,
          );
        }

        const insertadas = (await ejecutar(
          `insert into shipping_zones (codigo, nombre, metodo, activa, notas)
           values ($1, $2, $3, false, $4)
           returning id, codigo, nombre, metodo, activa, notas`,
          [codigo, nombre, metodo, notas],
        )) as { id: number | string; codigo: string }[];

        const nueva = insertadas[0];
        slugRedireccion = nueva.codigo;

        await ejecutar(
          `insert into audit_log (actor_tipo, actor_id, accion, entidad, entidad_id, antes, despues)
           values ('admin', $1, 'crear', 'shipping_zone', $2, null, $3::jsonb)`,
          [admin.id, String(nueva.id), JSON.stringify(nueva)],
        );
      },
      { suceso: "crear-zona-envio" },
    );

    updateTag("envios-tarifas");
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.message
        : "No se pudo crear la zona. Revisa los datos e inténtalo de nuevo.";
    redirect(`/admin/envios?error=${encodeURIComponent(msg)}`);
  }

  redirect(`/admin/envios/${slugRedireccion}?guardado=1`);
}

/**
 * 2. editarZona(zoneId: number, formData: FormData)
 * Edita nombre, método y notas (el código es inmutable). Audita e invalida caché.
 */
export async function editarZona(zoneId: number, formData: FormData) {
  const admin = await verificarPermisoParaAccion("envios:escribir");

  const nombre = String(formData.get("nombre") ?? "").trim();
  const metodo = String(formData.get("metodo") ?? "").trim();
  const notas = String(formData.get("notas") ?? "").trim();
  const slugZona = String(formData.get("slug") ?? "").trim();

  if (metodo !== "mensajero_propio" && metodo !== "paqueteria") {
    redirect(
      `/admin/envios/${slugZona || zoneId}?error=${encodeURIComponent(
        "El método de envío debe ser 'mensajero_propio' o 'paqueteria'.",
      )}`,
    );
  }

  const validacion = validarZona({ codigo: slugZona || "dummy-slug", nombre, notas });
  if (!validacion.ok) {
    redirect(`/admin/envios/${slugZona || zoneId}?error=${encodeURIComponent(validacion.error)}`);
  }

  try {
    await escribir(
      async (ejecutar) => {
        const actuales = (await ejecutar(
          "select id, codigo, nombre, metodo, activa, notas from shipping_zones where id = $1 for update",
          [zoneId],
        )) as {
          id: number | string;
          codigo: string;
          nombre: string;
          metodo: string;
          activa: boolean;
          notas: string;
        }[];

        const actual = actuales[0];
        if (!actual) {
          throw new Error("La zona de reparto no existe.");
        }

        const actualizadas = (await ejecutar(
          `update shipping_zones
              set nombre = $2, metodo = $3, notas = $4
            where id = $1
            returning id, codigo, nombre, metodo, activa, notas`,
          [zoneId, nombre, metodo, notas],
        )) as { id: number | string; codigo: string }[];

        const despues = actualizadas[0];

        await ejecutar(
          `insert into audit_log (actor_tipo, actor_id, accion, entidad, entidad_id, antes, despues)
           values ('admin', $1, 'editar', 'shipping_zone', $2, $3::jsonb, $4::jsonb)`,
          [admin.id, String(zoneId), JSON.stringify(actual), JSON.stringify(despues)],
        );
      },
      { suceso: "editar-zona-envio" },
    );

    updateTag("envios-tarifas");
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Error al actualizar los datos de la zona.";
    redirect(`/admin/envios/${slugZona || zoneId}?error=${encodeURIComponent(msg)}`);
  }

  redirect(`/admin/envios/${slugZona || zoneId}?guardado=1`);
}

/**
 * 3. activarZona(zoneId: number, activa: boolean)
 * Cambia estado en shipping_zones, audita e invalida caché.
 */
export async function activarZona(zoneId: number, activa: boolean, slug?: string) {
  const admin = await verificarPermisoParaAccion("envios:escribir");

  let slugRedireccion = slug ?? "";

  try {
    await escribir(
      async (ejecutar) => {
        const actuales = (await ejecutar(
          "select id, codigo, nombre, metodo, activa, notas from shipping_zones where id = $1 for update",
          [zoneId],
        )) as { id: number | string; codigo: string; activa: boolean }[];

        const actual = actuales[0];
        if (!actual) {
          throw new Error("La zona de reparto no existe.");
        }

        slugRedireccion = actual.codigo;

        const actualizadas = (await ejecutar(
          `update shipping_zones
              set activa = $2
            where id = $1
            returning id, codigo, nombre, metodo, activa, notas`,
          [zoneId, activa],
        )) as { id: number | string; codigo: string; activa: boolean }[];

        const despues = actualizadas[0];

        await ejecutar(
          `insert into audit_log (actor_tipo, actor_id, accion, entidad, entidad_id, antes, despues)
           values ('admin', $1, $2, 'shipping_zone', $3, $4::jsonb, $5::jsonb)`,
          [
            admin.id,
            activa ? "activar" : "desactivar",
            String(zoneId),
            JSON.stringify(actual),
            JSON.stringify(despues),
          ],
        );
      },
      { suceso: "toggle-activar-zona" },
    );

    updateTag("envios-tarifas");
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Error al cambiar el estado de la zona.";
    redirect(`/admin/envios/${slugRedireccion || zoneId}?error=${encodeURIComponent(msg)}`);
  }

  redirect(`/admin/envios/${slugRedireccion || zoneId}?guardado=1`);
}

/**
 * 4. eliminarZona(zoneId: number)
 * Si tiene coberturas o tarifas, captura restricción de clave foránea y devuelve mensaje en castellano.
 * Si no, borra, audita y redirige a /admin/envios.
 */
export async function eliminarZona(zoneId: number, slug?: string) {
  const admin = await verificarPermisoParaAccion("envios:escribir");

  try {
    await escribir(
      async (ejecutar) => {
        // Bloquear zona
        const actuales = (await ejecutar(
          "select id, codigo, nombre, metodo, activa, notas from shipping_zones where id = $1 for update",
          [zoneId],
        )) as { id: number | string; codigo: string; nombre: string }[];

        const actual = actuales[0];
        if (!actual) {
          throw new Error("La zona de reparto no existe.");
        }

        // Comprobación previa para un mensaje claro en castellano (§6.5)
        const [areas, tarifas] = await Promise.all([
          ejecutar("select id from shipping_zone_areas where zone_id = $1 limit 1", [zoneId]),
          ejecutar("select id from shipping_rates where zone_id = $1 limit 1", [zoneId]),
        ]);

        if (areas.length > 0 || tarifas.length > 0) {
          throw new Error(
            "No se puede eliminar una zona que tiene coberturas asignadas o historial de tarifas. Quita primero sus coberturas o desactiva la zona.",
          );
        }

        await ejecutar("delete from shipping_zones where id = $1", [zoneId]);

        await ejecutar(
          `insert into audit_log (actor_tipo, actor_id, accion, entidad, entidad_id, antes, despues)
           values ('admin', $1, 'eliminar', 'shipping_zone', $2, $3::jsonb, null)`,
          [admin.id, String(zoneId), JSON.stringify(actual)],
        );
      },
      { suceso: "eliminar-zona-envio" },
    );

    updateTag("envios-tarifas");
  } catch (err) {
    const errorTexto = err instanceof Error ? err.message : String(err);
    const mensaje = errorTexto.toLowerCase().includes("foreign key") ||
      errorTexto.toLowerCase().includes("restrict") ||
      errorTexto.includes("No se puede eliminar")
      ? "No se puede eliminar una zona con coberturas o tarifas asignadas. Desactívala en su lugar."
      : errorTexto;

    redirect(`/admin/envios/${slug || zoneId}?error=${encodeURIComponent(mensaje)}`);
  }

  redirect("/admin/envios?mensaje=" + encodeURIComponent("Zona eliminada correctamente."));
}

/**
 * 5. asignarCobertura(zoneId: number, formData: FormData)
 * Asigna departamento o municipio a la zona en shipping_zone_areas.
 * Traduce violaciones de exclusión/unicidad a castellano ("X ya pertenece a otra zona...").
 */
export async function asignarCobertura(zoneId: number, formData: FormData) {
  const admin = await verificarPermisoParaAccion("envios:escribir");

  const ambito = String(formData.get("ambito") ?? "").trim();
  const codigo = String(formData.get("codigo") ?? "").trim();
  const slugZona = String(formData.get("slug") ?? "").trim();

  const esDepto = ambito === "departamento";
  const deptoCodigo = esDepto ? codigo : null;
  const munCodigo = !esDepto ? codigo : null;

  if (!codigo) {
    redirect(
      `/admin/envios/${slugZona || zoneId}?error=${encodeURIComponent(
        "Debes seleccionar un departamento o municipio válido.",
      )}`,
    );
  }

  try {
    await escribir(
      async (ejecutar) => {
        // Validar si ya pertenece a otra zona para devolver el mensaje exacto según §6.5
        if (munCodigo) {
          const ocupada = (await ejecutar(
            `select a.id, z.nombre as zona_nombre, m.nombre as muni_nombre
               from shipping_zone_areas a
               join shipping_zones z on z.id = a.zone_id
               join geo_municipios m on m.codigo = a.municipio_codigo
              where a.municipio_codigo = $1`,
            [munCodigo],
          )) as { id: number | string; zona_nombre: string; muni_nombre: string }[];

          if (ocupada.length > 0) {
            throw new Error(
              `${ocupada[0].muni_nombre} ya pertenece a la zona "${ocupada[0].zona_nombre}". Quítalo de ahí primero.`,
            );
          }
        } else if (deptoCodigo) {
          const ocupada = (await ejecutar(
            `select a.id, z.nombre as zona_nombre, d.nombre as depto_nombre
               from shipping_zone_areas a
               join shipping_zones z on z.id = a.zone_id
               join geo_departamentos d on d.codigo = a.departamento_codigo
              where a.departamento_codigo = $1`,
            [deptoCodigo],
          )) as { id: number | string; zona_nombre: string; depto_nombre: string }[];

          if (ocupada.length > 0) {
            throw new Error(
              `El departamento ${ocupada[0].depto_nombre} ya pertenece a la zona "${ocupada[0].zona_nombre}". Quítalo de ahí primero.`,
            );
          }
        }

        const insertadas = (await ejecutar(
          `insert into shipping_zone_areas (zone_id, departamento_codigo, municipio_codigo, activa)
           values ($1, $2, $3, true)
           returning id, zone_id, departamento_codigo, municipio_codigo, activa`,
          [zoneId, deptoCodigo, munCodigo],
        )) as { id: number | string }[];

        const nueva = insertadas[0];

        await ejecutar(
          `insert into audit_log (actor_tipo, actor_id, accion, entidad, entidad_id, antes, despues)
           values ('admin', $1, 'asignar_cobertura', 'shipping_zone_area', $2, null, $3::jsonb)`,
          [admin.id, String(nueva.id), JSON.stringify(nueva)],
        );
      },
      { suceso: "asignar-cobertura-envio" },
    );

    updateTag("envios-tarifas");
  } catch (err) {
    let msg = err instanceof Error ? err.message : "Error al asignar la cobertura.";
    if (msg.includes("duplicate key") || msg.includes("shipping_zone_areas_")) {
      msg = "Esta localidad ya pertenece a otra zona. Quítala de ahí primero.";
    }
    redirect(`/admin/envios/${slugZona || zoneId}?error=${encodeURIComponent(msg)}`);
  }

  redirect(`/admin/envios/${slugZona || zoneId}?guardado=1`);
}

/**
 * 6. activarCobertura(areaId: number, activa: boolean)
 * Toggle activa en shipping_zone_areas, audita e invalida.
 */
export async function activarCobertura(areaId: number, activa: boolean, slugZona?: string) {
  const admin = await verificarPermisoParaAccion("envios:escribir");

  try {
    await escribir(
      async (ejecutar) => {
        const actuales = (await ejecutar(
          "select id, zone_id, departamento_codigo, municipio_codigo, activa from shipping_zone_areas where id = $1 for update",
          [areaId],
        )) as { id: number | string; activa: boolean }[];

        const actual = actuales[0];
        if (!actual) {
          throw new Error("La cobertura no existe.");
        }

        const actualizadas = (await ejecutar(
          `update shipping_zone_areas
              set activa = $2
            where id = $1
            returning id, zone_id, departamento_codigo, municipio_codigo, activa`,
          [areaId, activa],
        )) as { id: number | string }[];

        const despues = actualizadas[0];

        await ejecutar(
          `insert into audit_log (actor_tipo, actor_id, accion, entidad, entidad_id, antes, despues)
           values ('admin', $1, $2, 'shipping_zone_area', $3, $4::jsonb, $5::jsonb)`,
          [
            admin.id,
            activa ? "activar_cobertura" : "desactivar_cobertura",
            String(areaId),
            JSON.stringify(actual),
            JSON.stringify(despues),
          ],
        );
      },
      { suceso: "toggle-cobertura" },
    );

    updateTag("envios-tarifas");
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Error al cambiar el estado de la cobertura.";
    redirect(`/admin/envios/${slugZona || ""}?error=${encodeURIComponent(msg)}`);
  }

  redirect(`/admin/envios/${slugZona || ""}?guardado=1`);
}

/**
 * 7. eliminarCobertura(areaId: number)
 * Borra de shipping_zone_areas, audita e invalida.
 */
export async function eliminarCobertura(areaId: number, slugZona?: string) {
  const admin = await verificarPermisoParaAccion("envios:escribir");

  try {
    await escribir(
      async (ejecutar) => {
        const actuales = (await ejecutar(
          "select id, zone_id, departamento_codigo, municipio_codigo, activa from shipping_zone_areas where id = $1 for update",
          [areaId],
        )) as { id: number | string }[];

        const actual = actuales[0];
        if (!actual) {
          throw new Error("La cobertura ya no existe.");
        }

        await ejecutar("delete from shipping_zone_areas where id = $1", [areaId]);

        await ejecutar(
          `insert into audit_log (actor_tipo, actor_id, accion, entidad, entidad_id, antes, despues)
           values ('admin', $1, 'eliminar_cobertura', 'shipping_zone_area', $2, $3::jsonb, null)`,
          [admin.id, String(areaId), JSON.stringify(actual)],
        );
      },
      { suceso: "eliminar-cobertura" },
    );

    updateTag("envios-tarifas");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al eliminar la cobertura.";
    redirect(`/admin/envios/${slugZona || ""}?error=${encodeURIComponent(msg)}`);
  }

  redirect(`/admin/envios/${slugZona || ""}?guardado=1`);
}

/**
 * 8. publicarTarifa(zoneId: number, formData: FormData)
 * Parsea valores, valida con validarTarifa, y llama a publicarTarifaEnBase.
 */
export async function publicarTarifa(zoneId: number, formData: FormData) {
  const admin = await verificarPermisoParaAccion("envios:escribir");

  const slugZona = String(formData.get("slug") ?? "").trim();
  const importeQ = Number(formData.get("importeQuetzales") ?? 0);
  const umbralQRaw = formData.get("umbralGratisQuetzales");
  const umbralQ = umbralQRaw !== null && String(umbralQRaw).trim() !== "" ? Number(umbralQRaw) : null;
  const maxPiezasRaw = formData.get("maxPiezas");
  const maxPiezas = maxPiezasRaw !== null && String(maxPiezasRaw).trim() !== "" ? Number(maxPiezasRaw) : null;
  const maxImporteQRaw = formData.get("maxImporteQuetzales");
  const maxImporteQ = maxImporteQRaw !== null && String(maxImporteQRaw).trim() !== "" ? Number(maxImporteQRaw) : null;
  const plazoMinDias = Number(formData.get("plazoMinDias") ?? 2);
  const plazoMaxDias = Number(formData.get("plazoMaxDias") ?? 3);

  const datosTarifa = {
    importeCents: Math.round(importeQ * 100),
    umbralGratisCents: umbralQ !== null ? Math.round(umbralQ * 100) : null,
    maxPiezas,
    maxImporteCents: maxImporteQ !== null ? Math.round(maxImporteQ * 100) : null,
    plazoMinDias,
    plazoMaxDias,
  };

  const validacion = validarTarifa(datosTarifa);
  if (!validacion.ok) {
    redirect(`/admin/envios/${slugZona || zoneId}?error=${encodeURIComponent(validacion.error)}`);
  }

  const res = await publicarTarifaEnBase(zoneId, datosTarifa, admin.id);
  if (!res.ok) {
    redirect(`/admin/envios/${slugZona || zoneId}?error=${encodeURIComponent(res.error)}`);
  }

  redirect(`/admin/envios/${slugZona || zoneId}?guardado=1`);
}

/**
 * 9. crearBorradorDeTarifa(zoneId: number, formData: FormData)
 * Inserta en shipping_rates con publicada = false. Audita.
 */
export async function crearBorradorDeTarifa(zoneId: number, formData: FormData) {
  const admin = await verificarPermisoParaAccion("envios:escribir");

  const slugZona = String(formData.get("slug") ?? "").trim();
  const importeQ = Number(formData.get("importeQuetzales") ?? 0);
  const umbralQRaw = formData.get("umbralGratisQuetzales");
  const umbralQ = umbralQRaw !== null && String(umbralQRaw).trim() !== "" ? Number(umbralQRaw) : null;
  const maxPiezasRaw = formData.get("maxPiezas");
  const maxPiezas = maxPiezasRaw !== null && String(maxPiezasRaw).trim() !== "" ? Number(maxPiezasRaw) : null;
  const maxImporteQRaw = formData.get("maxImporteQuetzales");
  const maxImporteQ = maxImporteQRaw !== null && String(maxImporteQRaw).trim() !== "" ? Number(maxImporteQRaw) : null;
  const plazoMinDias = Number(formData.get("plazoMinDias") ?? 2);
  const plazoMaxDias = Number(formData.get("plazoMaxDias") ?? 3);

  const datosTarifa = {
    importeCents: Math.round(importeQ * 100),
    umbralGratisCents: umbralQ !== null ? Math.round(umbralQ * 100) : null,
    maxPiezas,
    maxImporteCents: maxImporteQ !== null ? Math.round(maxImporteQ * 100) : null,
    plazoMinDias,
    plazoMaxDias,
  };

  const validacion = validarTarifa(datosTarifa);
  if (!validacion.ok) {
    redirect(`/admin/envios/${slugZona || zoneId}?error=${encodeURIComponent(validacion.error)}`);
  }

  try {
    await escribir(
      async (ejecutar) => {
        const insertadas = (await ejecutar(
          `insert into shipping_rates (
             zone_id, importe_cents, umbral_gratis_cents, max_piezas,
             max_importe_cents, plazo_min_dias, plazo_max_dias, publicada
           ) values ($1, $2, $3, $4, $5, $6, $7, false)
           returning id, zone_id, importe_cents, umbral_gratis_cents, max_piezas,
                     max_importe_cents, plazo_min_dias, plazo_max_dias, publicada`,
          [
            zoneId,
            datosTarifa.importeCents,
            datosTarifa.umbralGratisCents,
            datosTarifa.maxPiezas,
            datosTarifa.maxImporteCents,
            datosTarifa.plazoMinDias,
            datosTarifa.plazoMaxDias,
          ],
        )) as { id: number | string }[];

        const nueva = insertadas[0];

        await ejecutar(
          `insert into audit_log (actor_tipo, actor_id, accion, entidad, entidad_id, antes, despues)
           values ('admin', $1, 'crear_borrador', 'shipping_rate', $2, null, $3::jsonb)`,
          [admin.id, String(nueva.id), JSON.stringify(nueva)],
        );
      },
      { suceso: "crear-borrador-tarifa" },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al guardar el borrador de tarifa.";
    redirect(`/admin/envios/${slugZona || zoneId}?error=${encodeURIComponent(msg)}`);
  }

  redirect(`/admin/envios/${slugZona || zoneId}?guardado=1`);
}

/**
 * 10. borrarBorradorDeTarifa(tarifaId: number)
 * Borra sólo si publicada = false (si publicada, rechaza). Audita.
 */
export async function borrarBorradorDeTarifa(tarifaId: number, slugZona?: string) {
  const admin = await verificarPermisoParaAccion("envios:escribir");

  try {
    await escribir(
      async (ejecutar) => {
        const actuales = (await ejecutar(
          "select id, zone_id, publicada from shipping_rates where id = $1 for update",
          [tarifaId],
        )) as { id: number | string; publicada: boolean }[];

        const actual = actuales[0];
        if (!actual) {
          throw new Error("La tarifa ya no existe.");
        }

        if (actual.publicada) {
          throw new Error("Una tarifa publicada no se borra. Publica una nueva para sustituirla.");
        }

        await ejecutar("delete from shipping_rates where id = $1", [tarifaId]);

        await ejecutar(
          `insert into audit_log (actor_tipo, actor_id, accion, entidad, entidad_id, antes, despues)
           values ('admin', $1, 'borrar_borrador', 'shipping_rate', $2, $3::jsonb, null)`,
          [admin.id, String(tarifaId), JSON.stringify(actual)],
        );
      },
      { suceso: "borrar-borrador-tarifa" },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al borrar el borrador de tarifa.";
    redirect(`/admin/envios/${slugZona || ""}?error=${encodeURIComponent(msg)}`);
  }

  redirect(`/admin/envios/${slugZona || ""}?guardado=1`);
}
