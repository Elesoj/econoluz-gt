/**
 * Política de borrado de cuenta.
 *
 * La fila sobrevive anonimizada para conservar futuras relaciones contables;
 * desaparecen la identidad y los datos personales.
 */

/** `.invalid` está reservado: nadie recibirá correo por error. */
export function correoAnonimo(id: string): string {
  return `borrado+${id}@invalid`;
}

/** Determinista y único, sin parecerse a un UID real de Firebase. */
export function uidAnonimo(id: string): string {
  return `borrado:${id}`;
}

export const SQL_ANONIMIZAR_USUARIO = `
  update users
  set email = $2,
      firebase_uid = $3,
      nombre = '',
      telefono = null,
      nit = null,
      nombre_fiscal = null,
      email_verificado = false,
      estado = 'anonimizada',
      anonimizado_en = now(),
      actualizado_en = now()
  where id = $1 and estado = 'activa'
`;

/** La fila de `users` no se borra, así que la cascada no actuaría. */
export const SQL_BORRAR_DIRECCIONES = `delete from user_addresses where user_id = $1`;

/** Conserva el suceso sin mantenerlo unido a una identidad eliminada. */
export const SQL_DESLIGAR_EVENTOS = `update auth_events set user_id = null where user_id = $1`;
