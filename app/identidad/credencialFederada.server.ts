import "server-only";

import { getVercelOidcToken } from "@vercel/oidc";
import { ExternalAccountClient } from "google-auth-library";

import {
  adaptarCredencial,
  audienciaDelTestigo,
  configuracionFederada,
  type ClienteFederado,
  type CredencialDeFirebase,
} from "./credencial";

/**
 * La única puerta a `google-auth-library` y `@vercel/oidc` de todo el proyecto.
 * `tests/identidad-frontera.test.ts` lo vigila.
 *
 * Aquí solo hay cableado. La configuración del intercambio y la adaptación a la interfaz
 * que espera `firebase-admin` viven en `credencial.ts`, que sí se puede probar sin red.
 *
 * ## Qué ocurre aquí, en orden
 *
 * 1. Vercel firma un testigo OIDC por despliegue y lo entrega en la cabecera
 *    `x-vercel-oidc-token` de cada petición.
 * 2. El Security Token Service de Google lo acepta si cumple la condición de atributos
 *    del proveedor —equipo, proyecto y entorno—, y lo canjea.
 * 3. Con ese canje se suplanta la cuenta de servicio, que tiene cuatro permisos sobre
 *    Firebase Authentication y ninguno más.
 *
 * No hay ninguna clave privada en ningún punto del camino.
 *
 * ## Dos avisos que no conviene descubrir por las malas
 *
 * **`getVercelOidcToken()` no se puede llamar en el nivel de módulo.** Dentro de una
 * función de Vercel el testigo vive en la cabecera de la petición, no en una variable de
 * entorno. Por eso se pasa como función y se invoca cuando toca renovar, siempre dentro
 * de una petición.
 *
 * Por lo mismo, **cualquier trabajo diferido fuera del contexto de una petición fallaría**
 * si le tocara renovar el testigo. Hoy no hay ninguno en este camino.
 */
function crearCliente(): ClienteFederado {
  const configuracion = configuracionFederada(process.env);
  // Ojo: la audiencia que se le pide al testigo NO es la que lleva la configuración del
  // STS. Ver `credencial.ts`, que explica por qué y con qué error se descubrió.
  const audiencia = audienciaDelTestigo(process.env);

  const cliente = ExternalAccountClient.fromJSON({
    ...configuracion,
    subject_token_supplier: {
      getSubjectToken: () => getVercelOidcToken({ audience: audiencia }),
    },
  });

  if (!cliente) {
    throw new Error(
      "google-auth-library no reconoció la configuración de cuenta externa. " +
        "Revisa GCP_AUDIENCE y GCP_SERVICE_ACCOUNT_EMAIL.",
    );
  }

  return cliente;
}

let credencial: CredencialDeFirebase | null = null;

export function credencialFederada(): CredencialDeFirebase {
  credencial ??= adaptarCredencial(crearCliente);
  return credencial;
}
