/** Comparación pura usada por el importador para no tocar productos que ya coinciden. */

import { validarValor } from "./atributos";
import type { EntradaDeProducto } from "./escritura";
import type { ProductoRelacional } from "./lectura";

function canonizar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(canonizar);
  if (valor !== null && typeof valor === "object" && !(valor instanceof Date)) {
    return Object.fromEntries(
      Object.entries(valor as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([clave, contenido]) => [clave, canonizar(contenido)]),
    );
  }
  return valor;
}

const iguales = (a: unknown, b: unknown) =>
  JSON.stringify(canonizar(a)) === JSON.stringify(canonizar(b));

const ordenar = <T>(valores: T[]) =>
  valores.sort((a, b) => JSON.stringify(canonizar(a)).localeCompare(JSON.stringify(canonizar(b))));

function atributosDeseados(entrada: EntradaDeProducto) {
  return ordenar(
    entrada.atributos.map((atributo) => {
      if (atributo.asignacion.clase === "opcion") {
        return {
          atributoId: atributo.atributoId,
          tipo: atributo.tipo,
          valueNumber: null,
          valueText: null,
          valueBool: null,
          optionId: atributo.asignacion.opcion.id,
        };
      }

      const resultado = validarValor(atributo.tipo, atributo.asignacion.valor);
      if (!resultado.ok) return { invalido: resultado.motivo };
      return {
        atributoId: atributo.atributoId,
        tipo: atributo.tipo,
        valueNumber: resultado.columnas.value_number,
        valueText: resultado.columnas.value_text,
        valueBool: resultado.columnas.value_bool,
        optionId: resultado.columnas.option_id,
      };
    }),
  );
}

function estaVigente(
  precio: ProductoRelacional["precios"][number],
  ahora: Date,
): boolean {
  return (
    precio.tipo === "normal" &&
    (precio.desde === null || precio.desde.getTime() <= ahora.getTime()) &&
    (precio.hasta === null || precio.hasta.getTime() > ahora.getTime())
  );
}

/**
 * Ignora solo identidades generadas, historial de precios y fechas. Cualquier diferencia
 * material devuelve `false`, para que el contrato de escritura la repare y audite.
 */
export function productoCoincideConEntrada(
  producto: ProductoRelacional | null,
  entrada: EntradaDeProducto,
  ahora: Date,
): boolean {
  if (!producto || producto.id !== entrada.id) return false;
  if (!iguales(producto.nucleo, entrada.nucleo)) return false;
  if (!iguales(producto.privados, entrada.privados)) return false;

  const categoriasActuales = ordenar(
    producto.categorias.map((categoria) => ({
      categoriaId: categoria.id,
      principal: categoria.principal,
    })),
  );
  if (!iguales(categoriasActuales, ordenar(entrada.categorias.map((categoria) => ({ ...categoria }))))) {
    return false;
  }

  const imagenesActuales = producto.imagenes.map(({ id: _id, ...imagen }) => imagen);
  if (!iguales(ordenar(imagenesActuales), ordenar(entrada.imagenes.map((imagen) => ({ ...imagen }))))) {
    return false;
  }

  const atributosActuales = ordenar(
    producto.atributos.map((atributo) => ({
      atributoId: atributo.atributoId,
      tipo: atributo.tipo,
      valueNumber: atributo.valueNumber,
      valueText: atributo.valueText,
      valueBool: atributo.valueBool,
      optionId: atributo.optionId,
    })),
  );
  if (!iguales(atributosActuales, atributosDeseados(entrada))) return false;

  const normalesVigentes = producto.precios.filter((precio) => estaVigente(precio, ahora));
  if (entrada.precioNormalCentavos === null) return normalesVigentes.length === 0;
  return (
    normalesVigentes.length === 1 &&
    normalesVigentes[0].centavos === entrada.precioNormalCentavos
  );
}
