import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";
import { leer } from "../lib/datos";
import { verificarCookieDeSesion } from "./firebase.server";
import {
  COOKIE_SESION_CLIENTE,
  clasificarFalloDeSesion,
  debeRenovarSesion,
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
  /**
   * La cookie de sesión de Firebase no se puede alargar desde aquí: hace falta un testigo
   * de identidad nuevo y eso solo lo produce el navegador. Esto es la señal de que hay que
   * pedírselo, y la consume `app/cuenta/RenovarSesion.tsx`.
   */
  debeRenovar: boolean;
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
      debeRenovar: false,
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
        debeRenovar: false,
      };
    }

    return {
      estado: interpretarSesion({ hayCookie: true, verificada: true, fallo: null }),
      debeRenovar: debeRenovarSesion({
        valida: true,
        expiraEnSegundos: identidad.expiraEnSegundos,
        ahora: new Date(),
      }),
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
      debeRenovar: false,
    };
  }
});

/** La identidad del visitante que usan las pantallas públicas. */
export async function leerClienteActual(): Promise<ClienteActual | null> {
  return (await leerSesionDeCliente()).cliente;
}

/** Si toca pedirle al navegador un testigo nuevo para alargar la sesión. */
export async function debeRenovarLaSesion(): Promise<boolean> {
  return (await leerSesionDeCliente()).debeRenovar;
}
