import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";
import { leer } from "../lib/datos";
import { verificarCookieDeSesion } from "./firebase.server";
import {
  COOKIE_SESION_CLIENTE,
  clasificarFalloDeSesion,
  interpretarSesion,
  type EstadoDeSesion,
} from "./sesion";

export type ClienteActual = {
  id: string;
  uid: string;
  email: string;
  emailVerificado: boolean;
  nombre: string;
};

export type SesionDeCliente = {
  estado: EstadoDeSesion;
  cliente: ClienteActual | null;
};

/**
 * Devuelve el estado completo para que los flujos sensibles puedan distinguir
 * una visita anónima de una caída temporal de Firebase o Neon.
 */
export const leerSesionDeCliente = cache(async (): Promise<SesionDeCliente> => {
  const almacen = await cookies();
  const cookie = almacen.get(COOKIE_SESION_CLIENTE)?.value;

  if (!cookie) {
    return {
      estado: interpretarSesion({ hayCookie: false, verificada: false, fallo: null }),
      cliente: null,
    };
  }

  try {
    const identidad = await verificarCookieDeSesion(cookie);
    const filas = await leer<{
      id: string;
      nombre: string;
      email: string;
      email_verificado: boolean;
    }>(
      "select id, nombre, email, email_verificado from users where firebase_uid = $1 and estado = 'activa'",
      [identidad.uid],
    );
    const fila = filas[0];

    if (!fila) {
      return {
        estado: interpretarSesion({ hayCookie: true, verificada: false, fallo: "invalida" }),
        cliente: null,
      };
    }

    return {
      estado: interpretarSesion({ hayCookie: true, verificada: true, fallo: null }),
      cliente: {
        id: String(fila.id),
        uid: identidad.uid,
        email: fila.email,
        emailVerificado: fila.email_verificado,
        nombre: fila.nombre,
      },
    };
  } catch (fallo) {
    return {
      estado: interpretarSesion({
        hayCookie: true,
        verificada: false,
        fallo: clasificarFalloDeSesion(fallo),
      }),
      cliente: null,
    };
  }
});

/** La identidad del visitante que usan las pantallas públicas. */
export async function leerClienteActual(): Promise<ClienteActual | null> {
  return (await leerSesionDeCliente()).cliente;
}
