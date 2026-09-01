import type { IdentidadVerificada } from "./firebase.server";
import { normalizarCorreo } from "./sesion";

/**
 * La fila de `users` que corresponde a una identidad de Firebase.
 *
 * El aprovisionamiento es perezoso a propósito: no hay un paso de «registro»
 * que pueda fallar a mitad y dejar una identidad en Firebase sin fila en Neon.
 * La fila aparece la primera vez que hace falta, y es idempotente: dos
 * pestañas entrando a la vez producen un usuario, no dos ni un error.
 */

export type ClienteAprovisionado = { id: string; recienCreada: boolean };

/**
 * El índice único parcial de correo y el de `firebase_uid` pueden competir si
 * dos primeras peticiones llegan a la vez. Este bloqueo transaccional
 * serializa únicamente el mismo UID; otros clientes siguen en paralelo.
 */
export const SQL_BLOQUEAR_APROVISIONAMIENTO = `
  select pg_advisory_xact_lock(hashtextextended($1, 0))
`;

/**
 * `xmax = 0` es el modo habitual de distinguir en un `upsert` si la fila se
 * acaba de crear, pero se apoya en una columna interna de PostgreSQL y no en
 * el estándar. Se usa porque evita una consulta previa y la carrera que trae
 * consigo; la prueba de integración de la tarea 7 lo comprueba de verdad.
 *
 * El `update` **solo** toca lo que manda Firebase. El nombre, el teléfono, el
 * NIT y el nombre fiscal los mantiene el cliente en su perfil: sobrescribirlos
 * en cada acceso borraría lo que acabara de escribir.
 */
export const SQL_APROVISIONAR = `
  insert into users (firebase_uid, email, email_verificado, nombre)
  values ($1, $2, $3, $4)
  on conflict (firebase_uid) do update
    set email = excluded.email,
        email_verificado = excluded.email_verificado,
        ultimo_acceso_en = now(),
        actualizado_en = now()
  returning id, (xmax = 0) as recien_creada
`;

export function parametrosDeAprovisionamiento(identidad: IdentidadVerificada) {
  return [
    identidad.uid,
    normalizarCorreo(identidad.email),
    identidad.emailVerificado,
    identidad.nombre,
  ];
}

export function interpretarAprovisionamiento(
  filas: readonly Record<string, unknown>[],
): ClienteAprovisionado {
  const fila = filas[0];
  if (!fila) {
    throw new Error("No se pudo aprovisionar la cuenta del cliente.");
  }

  return {
    id: String(fila.id),
    recienCreada: fila.recien_creada === true,
  };
}
