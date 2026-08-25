import type { AdminAuthQuery } from "../auth/types";

/**
 * Con 313 productos, veinticinco por página caben en pantalla sin scroll
 * infinito y no obligan a paginar cada dos por tres.
 */
export const PRODUCTOS_POR_PAGINA = 25;

export type EstadoProducto = "todos" | "publicados" | "ocultos" | "sin_precio";

export type FiltrosProductos = {
  busqueda?: string;
  tipo?: string;
  estado?: EstadoProducto;
  pagina?: number;
};

/**
 * Lo que el listado necesita de cada producto. **Sin el `id` interno**: esa
 * columna es un texto del estilo "construlita-cuasar" y lleva dentro el nombre
 * del fabricante, así que ni se lee. La referencia pública identifica igual de
 * bien y es la que el dueño cita al cotizar.
 */
export type ProductoAdmin = {
  referencia: string;
  nombre: string;
  tipo: string;
  tipoEtiqueta: string;
  imagen: string;
  precio: number | null;
  existencias: number | null;
  seVendeEnLinea: boolean;
  publicado: boolean;
};

export type ResultadoListado = {
  productos: ProductoAdmin[];
  total: number;
  pagina: number;
  paginas: number;
};

export type ValorNumerico =
  | { ok: true; valor: number | null }
  | { ok: false; error: string };

/**
 * Convierte lo que Postgres devuelve. `numeric` y `bigint` llegan como texto,
 * y `null` significa "sin dato", que no es lo mismo que cero: un producto sin
 * precio está sin decidir; uno a cero estaría regalado.
 */
function aNumeroONulo(valor: unknown) {
  if (valor === null || valor === undefined || valor === "") {
    return null;
  }
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

/**
 * Arma el filtro. Todo lo que escribe la persona viaja como parámetro: si se
 * pegara dentro del texto de la consulta, un nombre con una comilla bastaría
 * para romperla, y algo peor que romperla.
 */
function construirFiltro(filtros: FiltrosProductos) {
  const condiciones: string[] = [];
  const params: (string | number)[] = [];

  const busqueda = filtros.busqueda?.trim();
  if (busqueda) {
    params.push(`%${busqueda}%`);
    condiciones.push(
      `(public_name ilike $${params.length} or econoluz_reference ilike $${params.length})`,
    );
  }

  if (filtros.tipo) {
    params.push(filtros.tipo);
    condiciones.push(`product_type = $${params.length}`);
  }

  if (filtros.estado === "publicados") condiciones.push("published");
  if (filtros.estado === "ocultos") condiciones.push("not published");
  if (filtros.estado === "sin_precio") condiciones.push("price_gtq is null");

  return {
    clausula: condiciones.length > 0 ? `where ${condiciones.join(" and ")}` : "",
    params,
  };
}

/**
 * Lee una página del catálogo para el panel. El total llega en la misma
 * consulta con `count(*) over ()`: así paginar no cuesta dos viajes a Neon.
 */
export async function leerProductosAdmin(
  query: AdminAuthQuery,
  filtros: FiltrosProductos,
): Promise<ResultadoListado> {
  const { clausula, params } = construirFiltro(filtros);

  const pagina = Math.max(1, Math.trunc(filtros.pagina ?? 1) || 1);
  const desplazamiento = (pagina - 1) * PRODUCTOS_POR_PAGINA;

  params.push(PRODUCTOS_POR_PAGINA, desplazamiento);

  const texto = `
    select
      econoluz_reference,
      public_name,
      product_type,
      product_type_label,
      image,
      price_gtq,
      stock,
      sellable_online,
      published,
      count(*) over () as total_filtrado
    from products
    ${clausula}
    order by position
    limit $${params.length - 1}
    offset $${params.length}
  `;

  const filas = await query(texto, params);

  const productos = filas.map((fila) => ({
    referencia: String(fila.econoluz_reference),
    nombre: String(fila.public_name),
    tipo: String(fila.product_type),
    tipoEtiqueta: String(fila.product_type_label),
    imagen: String(fila.image),
    precio: aNumeroONulo(fila.price_gtq),
    existencias: aNumeroONulo(fila.stock),
    seVendeEnLinea: Boolean(fila.sellable_online),
    publicado: Boolean(fila.published),
  }));

  const total = filas.length > 0 ? Number(filas[0].total_filtrado) : 0;

  return {
    productos,
    total,
    pagina,
    paginas: Math.max(1, Math.ceil(total / PRODUCTOS_POR_PAGINA)),
  };
}

/**
 * Acepta el precio tal y como se escribe de verdad: con separador de miles,
 * con coma decimal o con la Q delante. Vacío significa "todavía sin precio",
 * que es un estado legítimo y distinto de cero.
 */
export function parsearPrecio(entrada: string): ValorNumerico {
  const limpio = entrada.replace(/[Qq\s]/g, "").replace(/,/g, "");
  if (limpio === "") {
    return { ok: true, valor: null };
  }

  const numero = Number(limpio);
  if (!Number.isFinite(numero)) {
    return { ok: false, error: "Ese precio no es un número." };
  }
  if (numero < 0) {
    return { ok: false, error: "El precio no puede ser negativo." };
  }

  // Dos decimales: es dinero, no una medida.
  return { ok: true, valor: Math.round(numero * 100) / 100 };
}

export function parsearExistencias(entrada: string): ValorNumerico {
  const limpio = entrada.trim();
  if (limpio === "") {
    return { ok: true, valor: null };
  }

  const numero = Number(limpio);
  if (!Number.isInteger(numero)) {
    return { ok: false, error: "Las existencias se cuentan en unidades enteras." };
  }
  if (numero < 0) {
    return { ok: false, error: "Las existencias no pueden ser negativas." };
  }

  return { ok: true, valor: numero };
}
