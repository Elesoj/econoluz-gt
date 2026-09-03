import { reducirCarrito, type AccionCarrito, type LineaCarrito } from "./carrito";
import { guardarCarrito, leerCarrito } from "./carritoPersistencia";
import { aplicarConReversion, limpiarCarritoPrivado } from "./carritoSincronizacion";
import { sincronizadorRemoto } from "./carritoRemoto";

/**
 * El carrito, vivo, compartido por toda la aplicación.
 *
 * Es un store de módulo con suscripción y no un contexto de React: el botón
 * flotante vive en el layout y las líneas en la página del carrito, que no son
 * parientes en el árbol. Un contexto obligaría a envolver el layout entero y a
 * convertir en cliente páginas que hoy se sirven desde el servidor.
 */

/**
 * Un carrito vacío, siempre el mismo objeto: `useSyncExternalStore` compara las
 * instantáneas por identidad y un array nuevo en cada llamada haría que React
 * volviera a pintar sin descanso.
 */
const VACIO: readonly LineaCarrito[] = Object.freeze([]);

let lineas: readonly LineaCarrito[] = VACIO;
let hidratado = false;
const oyentes = new Set<() => void>();

const avisar = () => {
  oyentes.forEach((oyente) => oyente());
};

export const obtenerLineas = () => lineas;

/**
 * En el servidor el carrito siempre está vacío: vive en el navegador de cada
 * visitante. Devolver otra cosa provocaría un desajuste al hidratar.
 */
export const obtenerLineasDelServidor = () => VACIO;

export const suscribirse = (oyente: () => void) => {
  oyentes.add(oyente);

  return () => {
    oyentes.delete(oyente);
  };
};

const persistir = () => {
  try {
    guardarCarrito(window.localStorage, lineas);
  } catch {
    // `window.localStorage` puede lanzar solo con acceder. Sin persistencia,
    // el carrito sigue funcionando durante la visita.
  }
};

/**
 * Lee el carrito guardado. Se llama desde un efecto, nunca durante el render:
 * el servidor no tiene `localStorage` y cambiar el estado mientras se pinta
 * rompería la hidratación de React.
 */
export const hidratar = () => {
  // En modo remoto manda el servidor: leer aquí lo guardado en el navegador pondría el
  // carrito de este dispositivo por encima del de la cuenta.
  if (hidratado || modo === "remoto") {
    return;
  }

  hidratado = true;

  let guardadas: readonly LineaCarrito[] = VACIO;

  try {
    const lectura = leerCarrito(window.localStorage);
    guardadas = lectura.estado === "ok" ? lectura.lineas : VACIO;
  } catch {
    return;
  }

  if (guardadas.length === 0) {
    return;
  }

  // Lo que el visitante haya metido antes de que termine la hidratación manda:
  // se conserva encima de lo guardado, no al revés.
  if (lineas.length > 0) {
    return;
  }

  lineas = guardadas;
  avisar();
};

/**
 * De dónde manda el carrito.
 *
 * `local` es el de siempre: `localStorage` y nada más, para el visitante anónimo.
 * `remoto` es el del cliente con sesión, que vive en Neon; en ese modo **no se persiste
 * en el navegador**, porque el carrito ya no es de este dispositivo sino de la cuenta, y
 * dejarlo escrito aquí es justo lo que no debe pasar en un ordenador compartido.
 */
let modo: "local" | "remoto" = "local";

/**
 * Pasa al carrito del cliente con sesión, con lo que ha devuelto el servidor.
 *
 * Se llama después de fusionar, que es cuando el servidor ya tiene la verdad.
 */
export const activarModoRemoto = (delServidor: readonly LineaCarrito[]) => {
  modo = "remoto";
  hidratado = true;
  lineas = delServidor.length === 0 ? VACIO : [...delServidor];
  avisar();
};

/**
 * Vuelve al carrito anónimo al cerrar sesión, **sin dejar rastro del privado**.
 *
 * No basta con vaciar la memoria: el carrito del cliente pudo escribirse en el navegador
 * antes de iniciar sesión, y quien entre después en el mismo dispositivo no puede
 * encontrarse su compra.
 */
export const activarModoLocal = () => {
  const eraRemoto = modo === "remoto";
  modo = "local";

  if (!eraRemoto) return;

  try {
    limpiarCarritoPrivado(window.localStorage);
  } catch {
    // Sin acceso al almacén no hay nada que limpiar ni nada que hacer.
  }

  lineas = VACIO;
  avisar();
};

export const obtenerModo = () => modo;

const pintar = (siguientes: readonly LineaCarrito[]) => {
  lineas = siguientes;
  avisar();
};

export const despachar = (accion: AccionCarrito) => {
  const siguientes = reducirCarrito(lineas, accion);

  if (siguientes === lineas) {
    return;
  }

  if (modo === "remoto") {
    // Se pinta ya y se revierte si el servidor dice que no. La política vive en
    // `carritoSincronizacion`, que está probada sin red.
    void aplicarConReversion(lineas, accion, sincronizadorRemoto, pintar).then(
      (resultado) => {
        // La sesión se acabó mientras el cliente compraba: se vuelve al carrito anónimo y
        // no queda nada suyo en este navegador.
        if (resultado.sinSesion) activarModoLocal();
      },
    );
    return;
  }

  lineas = siguientes;
  persistir();
  avisar();
};
