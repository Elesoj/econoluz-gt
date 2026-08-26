import { reducirCarrito, type AccionCarrito, type LineaCarrito } from "./carrito";
import { guardarCarrito, leerCarrito } from "./carritoPersistencia";

/**
 * El carrito, vivo, compartido por toda la aplicación.
 *
 * Es un store de módulo con suscripción, el mismo patrón que
 * `app/catalogo/floatingQuoteStore.ts`, y no un contexto de React: el contador
 * vive en la barra de navegación y las líneas en la página del carrito, que no
 * son parientes en el árbol. Un contexto obligaría a envolver el layout entero
 * y a convertir en cliente páginas que hoy se sirven desde el servidor.
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
  if (hidratado) {
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

export const despachar = (accion: AccionCarrito) => {
  const siguientes = reducirCarrito(lineas, accion);

  if (siguientes === lineas) {
    return;
  }

  lineas = siguientes;
  persistir();
  avisar();
};
