import { resolverMsMaximo, type Ejecutor } from "./consulta";
import { traducirErrorDePostgres, ErrorDeDatos } from "./errores";

/**
 * Transacciones interactivas: leer, decidir y escribir según lo leído, todo
 * dentro de la misma transacción.
 *
 * El controlador HTTP de Neon no puede hacer esto, así que hace falta la
 * conexión agrupada por WebSocket y `runtime = "nodejs"` en la ruta o acción
 * que la use.
 *
 * El cliente se devuelve al pool en el `finally` pase lo que pase: una conexión
 * que no se devuelve es la forma habitual de agotar el pool en producción sin
 * entender por qué. El pool en cambio NO se cierra aquí: se conserva para poder
 * reutilizar conexiones inactivas, que es justo para lo que existe.
 */

export type ClienteDeTransaccion = {
  query: (
    texto: string,
    parametros?: readonly unknown[],
  ) => Promise<{ rows: Record<string, unknown>[] }>;
  /**
   * Igual que el `release` real de `pg`: admite un error (o `true`) para que
   * el pool descarte el cliente en vez de devolverlo al grupo de inactivos.
   * Hace falta cuando el rollback también falla: el cliente puede haber
   * quedado en una transacción abortada, y reutilizarlo envenenaría la
   * siguiente petición que lo tome del pool.
   */
  release: (error?: Error | boolean) => void;
};

export type PoolMinimo = { connect: () => Promise<ClienteDeTransaccion> };

/**
 * `msMaximoPorSentencia` no es lo mismo que el `msMaximo` de `consultar`. Allí
 * es un plazo de reloj medido en el cliente para toda la consulta. Aquí es
 * `statement_timeout` de Postgres, que se aplica **a cada sentencia por
 * separado** dentro de la transacción: una transacción de cinco sentencias
 * puede tardar hasta cinco veces ese plazo en total, no una sola vez.
 */
export async function enTransaccion<T>(
  pool: PoolMinimo,
  trabajo: (ejecutar: Ejecutor) => Promise<T>,
  opciones: { msMaximoPorSentencia?: number } = {},
): Promise<T> {
  const msMaximoPorSentencia = resolverMsMaximo(opciones.msMaximoPorSentencia);
  const cliente = await pool.connect();

  // Se pone a `false` en cuanto el cliente vuelve al pool (en el `finally`).
  // Sin esto, una promesa sin `await` dentro de `trabajo` podría seguir
  // invocando `ejecutar` después de liberado el cliente, y estaría corriendo
  // SQL sobre una conexión que ya sirve a otra petición.
  let vivo = true;
  let errorDeRollback: Error | undefined;

  try {
    await cliente.query("begin");
    // `set local` solo dura hasta el commit: no contamina la conexión que se
    // devuelve al pool para el siguiente uso.
    await cliente.query(
      `set local statement_timeout = ${Math.trunc(msMaximoPorSentencia)}`,
    );

    const ejecutar: Ejecutor = async (texto, parametros = []) => {
      if (!vivo) {
        throw new ErrorDeDatos(
          "indisponible",
          new Error(
            "El ejecutor ya no es válido: la transacción terminó y el cliente volvió al pool.",
          ),
        );
      }
      return (await cliente.query(texto, [...parametros])).rows;
    };

    const resultado = await trabajo(ejecutar);
    await cliente.query("commit");
    return resultado;
  } catch (error) {
    // Si el rollback también falla, el error que importa es el primero. Pero
    // el cliente puede haber quedado en una transacción abortada, así que se
    // recuerda el fallo para que el `finally` libere el cliente con él y el
    // pool lo descarte en vez de reutilizarlo.
    try {
      await cliente.query("rollback");
    } catch (motivo) {
      errorDeRollback = motivo instanceof Error ? motivo : new Error(String(motivo));
    }
    throw traducirErrorDePostgres(error);
  } finally {
    vivo = false;
    cliente.release(errorDeRollback);
  }
}
