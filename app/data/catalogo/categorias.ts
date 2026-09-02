/**
 * El árbol de categorías y la regla de la categoría principal.
 *
 * Una categoría **clasifica** productos y nada más: no determina qué características puede
 * tener un producto. Por eso no existe ninguna tabla que relacione categorías con atributos.
 *
 * Módulo puro: sin red, sin base de datos y sin `server-only`.
 */

export type Pertenencia = { categoriaId: string; principal: boolean };
export type Categoria = { id: string; parentId: string | null; nombre: string };

export type ResultadoDePertenencias = { ok: true } | { ok: false; motivo: string };

/**
 * **Exactamente una principal cuando hay al menos una categoría.**
 *
 * El índice único parcial del esquema impide que haya *dos*, pero no puede exigir que haya
 * *una*: sobre cero filas marcadas no hay nada que comparar. De ahí que el diseño pida
 * además una comprobación diferible al cerrar la transacción, y que esta función exista
 * para poder avisar antes con un mensaje entendible.
 *
 * Sin categorías es válido: un producto a medio cargar no es un producto inválido.
 */
export function validarPertenencias(
  pertenencias: readonly Pertenencia[],
): ResultadoDePertenencias {
  if (pertenencias.length === 0) {
    return { ok: true };
  }

  const ids = pertenencias.map((pertenencia) => pertenencia.categoriaId);
  if (new Set(ids).size !== ids.length) {
    return { ok: false, motivo: "Hay una categoría repetida en el mismo producto." };
  }

  const principales = pertenencias.filter((pertenencia) => pertenencia.principal).length;

  if (principales === 0) {
    return {
      ok: false,
      motivo: "El producto tiene categorías pero ninguna principal: hace falta una.",
    };
  }

  if (principales > 1) {
    return {
      ok: false,
      motivo: `Solo puede haber una categoría principal, y hay ${principales}.`,
    };
  }

  return { ok: true };
}

/** Sube por los padres desde `id`, sin repetir ninguno. */
function ascendencia(
  categorias: readonly Categoria[],
  id: string,
): { cadena: Categoria[]; ciclo: boolean } {
  const porId = new Map(categorias.map((categoria) => [categoria.id, categoria]));
  const cadena: Categoria[] = [];
  const vistos = new Set<string>();

  let actual = porId.get(id);
  while (actual) {
    // Si ya pasamos por aquí, los datos traen un ciclo: se corta en vez de dar vueltas.
    if (vistos.has(actual.id)) {
      return { cadena, ciclo: true };
    }

    vistos.add(actual.id);
    cadena.push(actual);
    actual = actual.parentId ? porId.get(actual.parentId) : undefined;
  }

  return { cadena, ciclo: false };
}

/**
 * Si alguna categoría cuelga de sí misma, directa o indirectamente. Un padre que no existe
 * es un dato roto, pero no un ciclo: se distingue a propósito, porque se arreglan distinto.
 */
export function hayCiclo(categorias: readonly Categoria[]): boolean {
  return categorias.some((categoria) => ascendencia(categorias, categoria.id).ciclo);
}

/**
 * La ruta desde la raíz hasta la categoría pedida, para migas y URLs. Vacía si no existe
 * o si los datos contienen un ciclo.
 *
 * Una cadena parcial causada por un ciclo no es una ruta válida: presentarla como miga o
 * URL ocultaría que el árbol está roto.
 */
export function rutaDeCategoria(categorias: readonly Categoria[], id: string): Categoria[] {
  const { cadena, ciclo } = ascendencia(categorias, id);
  return ciclo ? [] : cadena.reverse();
}
