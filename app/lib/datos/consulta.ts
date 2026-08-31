import { traducirErrorDePostgres, ErrorDeDatos } from "./errores";

/**
 * Un ejecutor es cualquier cosa capaz de correr SQL con parámetros. Es el
 * mismo contrato que ya usaban `panelStats` y el repositorio del panel, y es lo
 * que permite probar sin base de datos.
 */
export type Ejecutor = (
  texto: string,
  parametros?: readonly unknown[],
) => Promise<Record<string, unknown>[]>;

/** Diez segundos. Ninguna consulta legítima de este sitio tarda más. */
const MS_MAXIMO_POR_DEFECTO = 10_000;

export async function consultar<T>(
  ejecutor: Ejecutor,
  texto: string,
  parametros: readonly unknown[] = [],
  opciones: { msMaximo?: number } = {},
): Promise<T[]> {
  const msMaximo = opciones.msMaximo ?? MS_MAXIMO_POR_DEFECTO;
  let temporizador: NodeJS.Timeout | undefined;

  const limite = new Promise<never>((_, rechazar) => {
    temporizador = setTimeout(
      () => rechazar(new ErrorDeDatos("indisponible")),
      msMaximo,
    );
  });

  try {
    const filas = await Promise.race([ejecutor(texto, parametros), limite]);
    return filas as T[];
  } catch (error) {
    throw traducirErrorDePostgres(error);
  } finally {
    clearTimeout(temporizador);
  }
}
