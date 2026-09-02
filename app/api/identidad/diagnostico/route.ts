import { comprobarCredenciales } from "@/app/identidad/firebase.server";

// `firebase-admin` necesita runtime de Node: no funciona en edge.
export const runtime = "nodejs";

/**
 * RUTA TEMPORAL — se retira en la tarea 9 del plan.
 *
 * Existe para demostrar, **desde dentro de una función de Vercel**, lo único que no se
 * puede comprobar desde la máquina de desarrollo: que el testigo OIDC llega por la
 * cabecera `x-vercel-oidc-token` de la petición, que Google lo canjea y que Firebase
 * Authentication acepta la credencial resultante.
 *
 * **No consulta Neon**, ni directa ni indirectamente. Es lo que permite probarla sin
 * tocar `DATABASE_URL`, que en este proyecto comparte valor entre Preview y Production.
 *
 * **No devuelve ningún testigo ni ningún dato de ningún cliente**: el identificador del
 * proyecto, qué camino de credencial se usó y cuántos segundos le quedan de vida.
 *
 * En cuanto cumpla, se borra, y `tests/identidad-frontera.test.ts` impide que vuelva.
 */
export async function GET() {
  try {
    const { projectId, modo, segundosDeVida } = await comprobarCredenciales();
    return Response.json({ ok: true, projectId, modo, segundosDeVida });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "desconocido" },
      { status: 500 },
    );
  }
}
