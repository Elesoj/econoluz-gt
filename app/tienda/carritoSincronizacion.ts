import { reducirCarrito, type AccionCarrito, type LineaCarrito } from "./carrito";
import { guardarCarrito, leerCarrito, type AlmacenCarrito } from "./carritoPersistencia";
import type { Descarte } from "./carritoServidor";

/**
 * La orquestación del carrito cuando hay sesión.
 *
 * Vive fuera del store y fuera de React a propósito: aquí están las tres reglas que más
 * duelen si fallan —la reversión de la actualización optimista, borrar el carrito anónimo
 * solo tras el éxito, y no dejar la compra de nadie en un dispositivo compartido—, y
 * probarlas necesita poder inyectar el transporte y el almacén, no montar un navegador.
 */

export type ResultadoRemoto =
  | { ok: true; lineas: LineaCarrito[] }
  /**
   * `sinSesion` distingue «la sesion se acabo» de «algo fue mal». No es lo mismo: un
   * fallo se reintenta, pero una sesion terminada obliga a volver al carrito anonimo y a
   * no dejar el privado en un dispositivo que puede ser compartido.
   */
  | { ok: false; sinSesion?: true };

/** El transporte hacia la API. Lo implementa `carritoRemoto.ts`. */
export type Sincronizador = {
  fijar(econoluzReference: string, cantidad: number): Promise<ResultadoRemoto>;
  quitar(econoluzReference: string): Promise<ResultadoRemoto>;
  vaciar(): Promise<ResultadoRemoto>;
};

/**
 * Qué petición le toca a cada acción.
 *
 * `aceptarEspera` no aparece: pertenece al aviso de existencias, que no viaja al servidor
 * —ECONOLUZ no maneja inventario— y que el subproyecto 11 retirará. Se aplica en pantalla
 * y no genera ninguna petición.
 */
function peticionDe(
  accion: AccionCarrito,
  resultantes: readonly LineaCarrito[],
  sincronizador: Sincronizador,
): (() => Promise<ResultadoRemoto>) | null {
  if (accion.tipo === "vaciar") return () => sincronizador.vaciar();
  if (accion.tipo === "quitar") return () => sincronizador.quitar(accion.econoluzReference);
  if (accion.tipo === "aceptarEspera") return null;

  const linea = resultantes.find((l) => l.econoluzReference === accion.econoluzReference);
  // Fijar a cero es la forma de borrar desde el selector de cantidad: la línea desaparece
  // del resultado, así que lo que corresponde es quitarla también en el servidor.
  return linea
    ? () => sincronizador.fijar(accion.econoluzReference, linea.cantidad)
    : () => sincronizador.quitar(accion.econoluzReference);
}

export type ResultadoDeAplicacion = {
  lineas: readonly LineaCarrito[];
  revertido: boolean;
  /** La sesion habia terminado: quien llama tiene que volver al carrito anonimo. */
  sinSesion?: true;
};

/**
 * Aplica la acción en pantalla **antes** de preguntar al servidor, y la deshace si el
 * servidor no la acepta.
 *
 * La actualización optimista solo es honesta si revierte bien: se guarda la lista de
 * antes y se vuelve a ella tal cual, no a una reconstrucción. Cuando el servidor responde
 * bien, **manda su versión**: es la única que ha pasado por las validaciones y por el
 * catálogo vigente.
 */
export async function aplicarConReversion(
  previas: readonly LineaCarrito[],
  accion: AccionCarrito,
  sincronizador: Sincronizador,
  pintar: (lineas: readonly LineaCarrito[]) => void,
): Promise<ResultadoDeAplicacion> {
  const optimistas = reducirCarrito(previas, accion);
  pintar(optimistas);

  const peticion = peticionDe(accion, optimistas, sincronizador);
  if (!peticion) return { lineas: optimistas, revertido: false };

  let resultado: ResultadoRemoto;
  try {
    resultado = await peticion();
  } catch {
    // Un fallo de red y un error del servidor se tratan igual: la acción no ocurrió.
    resultado = { ok: false };
  }

  if (!resultado.ok) {
    pintar(previas);
    return resultado.sinSesion
      ? { lineas: previas, revertido: true, sinSesion: true }
      : { lineas: previas, revertido: true };
  }

  pintar(resultado.lineas);
  return { lineas: resultado.lineas, revertido: false };
}

export type ResultadoDeFusionLocal =
  | { ok: true; lineas: LineaCarrito[]; descartes: Descarte[] }
  | { ok: false };

/**
 * La fusión al iniciar sesión.
 *
 * El carrito anónimo se borra **solo después** de que el servidor confirme. Si la fusión
 * falla, se conserva entero: perderlo sería perderle la compra al cliente por un problema
 * de red que no es suyo, y el reintento con el mismo token no duplicará nada.
 *
 * Se llama también con el carrito local vacío, porque entrar desde otro dispositivo tiene
 * que traerse el carrito ya guardado.
 */
export async function sincronizarAlEntrar({
  almacen,
  token,
  fusionar,
}: {
  almacen: AlmacenCarrito;
  token: string;
  fusionar: (
    lineas: { econoluzReference: string; cantidad: number }[],
    token: string,
  ) => Promise<ResultadoDeFusionLocal>;
}): Promise<ResultadoDeFusionLocal> {
  let locales: LineaCarrito[] = [];
  try {
    const lectura = leerCarrito(almacen);
    if (lectura.estado === "ok") locales = lectura.lineas;
  } catch {
    // Sin acceso al almacén se fusiona con las manos vacías, que es lo único honesto.
  }

  let resultado: ResultadoDeFusionLocal;
  try {
    resultado = await fusionar(
      locales.map((linea) => ({
        econoluzReference: linea.econoluzReference,
        cantidad: linea.cantidad,
      })),
      token,
    );
  } catch {
    return { ok: false };
  }

  if (resultado.ok) limpiarCarritoPrivado(almacen);
  return resultado;
}

/**
 * Borra el carrito del navegador.
 *
 * Se usa tras una fusión correcta —ya vive en el servidor— y **al cerrar sesión**: un
 * dispositivo compartido no puede quedarse con la compra de quien acaba de salir.
 */
export function limpiarCarritoPrivado(almacen: AlmacenCarrito): void {
  try {
    guardarCarrito(almacen, []);
  } catch {
    // `localStorage` puede lanzar solo con tocarlo. No hay nada mejor que hacer aquí.
  }
}

export type ResultadoDeComprobacion = "omitido" | "anonimo" | "fusionado" | "fallo";

/**
 * Decide si toca preguntar por la sesión y, si la hay, fusiona.
 *
 * La comprobación es **una por pestaña** para no cobrarle al visitante anónimo una
 * petición por navegación. Pero iniciar sesión **no remonta el layout** —Next conserva el
 * árbol en una navegación de cliente—, así que la pantalla de acceso tiene que pedir la
 * comprobación explícitamente con `forzar`. Sin eso, quien acaba de entrar seguiría viendo
 * su carrito local hasta la siguiente recarga.
 *
 * La pestaña se marca como comprobada **solo cuando la respuesta es concluyente**: un
 * fallo de red no puede dejarla marcada, porque entonces el reintento no llegaría nunca.
 */
export async function comprobarSesionYSincronizar({
  forzar,
  yaComprobado,
  anotarComprobado,
  haySesion,
  entrar,
}: {
  forzar: boolean;
  yaComprobado: () => boolean;
  anotarComprobado: () => void;
  haySesion: () => Promise<boolean>;
  entrar: () => Promise<ResultadoDeFusionLocal>;
}): Promise<ResultadoDeComprobacion> {
  if (!forzar && yaComprobado()) return "omitido";

  let sesion: boolean;
  try {
    sesion = await haySesion();
  } catch {
    return "fallo";
  }

  if (!sesion) {
    anotarComprobado();
    return "anonimo";
  }

  const resultado = await entrar();
  if (!resultado.ok) return "fallo";

  anotarComprobado();
  return "fusionado";
}
