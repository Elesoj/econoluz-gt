import type { Ejecutor } from "./consulta";
import { traducirErrorDePostgres } from "./errores";

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
  release: () => void;
};

export type PoolMinimo = { connect: () => Promise<ClienteDeTransaccion> };

const MS_MAXIMO_POR_DEFECTO = 10_000;

export async function enTransaccion<T>(
  pool: PoolMinimo,
  trabajo: (ejecutar: Ejecutor) => Promise<T>,
  opciones: { msMaximo?: number } = {},
): Promise<T> {
  const msMaximo = opciones.msMaximo ?? MS_MAXIMO_POR_DEFECTO;
  const cliente = await pool.connect();

  try {
    await cliente.query("begin");
    // `set local` solo dura hasta el commit: no contamina la conexión que se
    // devuelve al pool para el siguiente uso.
    await cliente.query(`set local statement_timeout = ${Math.trunc(msMaximo)}`);

    const ejecutar: Ejecutor = async (texto, parametros = []) =>
      (await cliente.query(texto, [...parametros])).rows;

    const resultado = await trabajo(ejecutar);
    await cliente.query("commit");
    return resultado;
  } catch (error) {
    // Si el rollback también falla, el error que importa es el primero.
    await cliente.query("rollback").catch(() => undefined);
    throw traducirErrorDePostgres(error);
  } finally {
    cliente.release();
  }
}
