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

/**
 * Diez segundos. Ninguna consulta legítima de este sitio tarda más. Es la
 * única declaración de este valor: `enTransaccion` lo importa de aquí en vez
 * de mantener su propia copia.
 */
export const MS_MAXIMO_POR_DEFECTO = 10_000;

/**
 * Da por bueno `valor` solo si es un número finito y mayor que cero; en
 * cualquier otro caso devuelve el valor por defecto.
 *
 * Hace falta porque `??` únicamente cubre `null`/`undefined`: un `0` se
 * colaría tal cual, y `0` significa cosas opuestas y ambas malas según quien
 * lo reciba —rechazo instantáneo en `consultar`, límite desactivado en
 * `set local statement_timeout` de `enTransaccion`—. Un `NaN`, un negativo o
 * un `Infinity` son igual de inválidos: el primero produce una espera nula o
 * corrompe el SQL, y el segundo desactiva el límite igual que el cero.
 */
export function resolverMsMaximo(valor: number | undefined): number {
  return typeof valor === "number" && Number.isFinite(valor) && valor > 0
    ? valor
    : MS_MAXIMO_POR_DEFECTO;
}

/**
 * Ejecuta una consulta dentro de un plazo máximo. El navegador deja de esperar tras
 * agotar el tiempo, pero la petición HTTP subyacente puede seguir viva en el servidor
 * hasta que lo cierre. Es aceptable porque por aquí solo pasan lecturas idempotentes;
 * las escrituras van por `enTransaccion` con `statement_timeout`, que sí cancela en el
 * servidor.
 */
export async function consultar<T>(
  ejecutor: Ejecutor,
  texto: string,
  parametros: readonly unknown[] = [],
  opciones: { msMaximo?: number } = {},
): Promise<T[]> {
  const msMaximo = resolverMsMaximo(opciones.msMaximo);
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
