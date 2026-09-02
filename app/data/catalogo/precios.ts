/**
 * Qué precio se cobra hoy, y cómo detectar dos promociones que se pisan.
 *
 * `product_prices` guarda centavos enteros, el tipo y un periodo de validez. Resolver el
 * precio vigente es puro y es donde más fácil es equivocarse: el fallo caro es cobrar una
 * promoción que terminó ayer.
 *
 * **El dinero se compara en centavos enteros** (`CLAUDE.md` §6). Un precio con decimales es
 * un dato corrupto y aquí se ignora en vez de redondearse: redondear en silencio es la
 * forma de cobrar de menos sin que nadie se entere.
 *
 * La base rechaza además las promociones solapadas con una restricción de exclusión;
 * `haySolape` permite detectarlo antes de intentar escribirlo, para poder dar un mensaje
 * en lugar de un error de Postgres.
 */

export type TipoDePrecio = "normal" | "promocion";

export type Precio = {
  id: string;
  centavos: number;
  tipo: TipoDePrecio;
  /** Inclusivo. `null` significa «desde siempre». */
  desde: Date | null;
  /** **Exclusivo.** `null` significa «sin fin». */
  hasta: Date | null;
};

export type PrecioResuelto = { id: string; centavos: number; tipo: TipoDePrecio };

const esImporteValido = (centavos: number) => Number.isInteger(centavos) && centavos >= 0;

/** Inicio inclusivo, final exclusivo: dos periodos consecutivos no se pisan. */
function estaVigente(precio: Precio, ahora: Date): boolean {
  if (precio.desde && precio.desde.getTime() > ahora.getTime()) return false;
  if (precio.hasta && precio.hasta.getTime() <= ahora.getTime()) return false;
  return true;
}

const inicio = (precio: Precio) => precio.desde?.getTime() ?? Number.NEGATIVE_INFINITY;
const fin = (precio: Precio) => precio.hasta?.getTime() ?? Number.POSITIVE_INFINITY;

/**
 * El vigente, o `null` si no hay ninguno: **sin precio no se vende**, que es la regla del
 * catálogo desde el 26/08/2026.
 *
 * Entre los vigentes, una promoción gana al precio normal. Entre dos del mismo tipo gana el
 * que empezó después, que es el que se cargó más recientemente.
 */
export function precioVigente(precios: readonly Precio[], ahora: Date): PrecioResuelto | null {
  const candidatos = precios
    .filter((precio) => esImporteValido(precio.centavos))
    .filter((precio) => estaVigente(precio, ahora));

  if (candidatos.length === 0) return null;

  const mejor = candidatos.reduce((elegido, precio) => {
    if (precio.tipo !== elegido.tipo) {
      return precio.tipo === "promocion" ? precio : elegido;
    }
    return inicio(precio) > inicio(elegido) ? precio : elegido;
  });

  return { id: mejor.id, centavos: mejor.centavos, tipo: mejor.tipo };
}

/**
 * Si dos periodos cualesquiera se pisan. Se comparan todos contra todos porque la lista de
 * promociones de un producto es corta por naturaleza y la claridad vale más aquí que
 * ahorrarse un bucle.
 */
export function haySolape(promociones: readonly Precio[]): boolean {
  for (let i = 0; i < promociones.length; i += 1) {
    for (let j = i + 1; j < promociones.length; j += 1) {
      const a = promociones[i];
      const b = promociones[j];
      if (inicio(a) < fin(b) && inicio(b) < fin(a)) return true;
    }
  }
  return false;
}
