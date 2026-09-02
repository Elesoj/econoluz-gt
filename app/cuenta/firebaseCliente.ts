import { getApps, initializeApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

/**
 * La configuración pública de Firebase en el navegador, en un solo sitio.
 *
 * **No es secreta**: llega al cliente a propósito, y sin ella el SDK web no puede
 * autenticar a nadie. Lo que sí importa es que falte: se lanza un error claro en vez de
 * dejar un formulario que parece funcionar y no hace nada.
 *
 * Vive aparte porque lo necesitan tanto la pantalla de acceso como la renovación de la
 * sesión, y tener dos copias del mismo `initializeApp` es la forma habitual de acabar con
 * dos aplicaciones de Firebase distintas en la misma página.
 */
const configuracion = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
};

export function auth(): Auth {
  if (!configuracion.apiKey || !configuracion.authDomain || !configuracion.projectId) {
    throw new Error("Falta la configuración pública de Firebase.");
  }

  const app = getApps()[0] ?? initializeApp(configuracion);
  return getAuth(app);
}
