import type { AdminAuthQuery } from "../auth/types";

/**
 * Con 313 productos, veinticinco por página caben en pantalla sin scroll
 * infinito y no obligan a paginar cada dos por tres.
 */
export const PRODUCTOS_POR_PAGINA = 25;

export type EstadoProducto = "todos" | "publicados" | "ocultos" | "incompletos" | "sin_precio";

export type FiltrosProductos = {
  busqueda?: string;
  tipo?: string;
  estado?: EstadoProducto;
  pagina?: number;
};

export type ContadoresEstado = {
  todos: number;
  publicados: number;
  ocultos: number;
  incompletos: number;
};

/**
 * Lo que el listado necesita de cada producto. Incluye el código del
 * fabricante para gestión interna pero sin exponer datos sensibles del proveedor.
 */
export type ProductoAdmin = {
  referencia: string;
  nombre: string;
  tipo: string;
  tipoEtiqueta: string;
  imagen: string;
  proveedorCodigo?: string;
  precio: number | null;
  existencias: number | null;
  publicado: boolean;
  incompleto?: boolean;
  motivoIncompleto?: string;
};

export type ResultadoListado = {
  productos: ProductoAdmin[];
  total: number;
  contadores: ContadoresEstado;
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
      `(public_name ilike $${params.length} or econoluz_reference ilike $${params.length} or supplier_code ilike $${params.length})`,
    );
  }

  if (filtros.tipo) {
    params.push(filtros.tipo);
    condiciones.push(`product_type = $${params.length}`);
  }

  if (filtros.estado === "publicados") condiciones.push("published");
  if (filtros.estado === "ocultos") condiciones.push("not published");
  if (filtros.estado === "incompletos") {
    condiciones.push("(published and (supplier_code is null or trim(supplier_code) = ''))");
  }
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
      supplier_code,
      price_gtq,
      stock,
      published,
      count(*) over () as total_filtrado,
      count(*) over () as total_todos,
      count(*) filter (where published) over () as total_publicados,
      count(*) filter (where not published) over () as total_ocultos,
      count(*) filter (where published and (supplier_code is null or trim(supplier_code) = '')) over () as total_incompletos
    from products
    ${clausula}
    order by position
    limit $${params.length - 1}
    offset $${params.length}
  `;

  const filas = await query(texto, params);

  const productos: ProductoAdmin[] = filas.map((fila) => {
    const proveedorCodigo = fila.supplier_code ? String(fila.supplier_code).trim() : undefined;
    const publicado = Boolean(fila.published);
    const faltaCodigo = !proveedorCodigo || proveedorCodigo.length === 0;
    const incompleto = publicado && faltaCodigo;

    return {
      referencia: String(fila.econoluz_reference),
      nombre: String(fila.public_name),
      tipo: String(fila.product_type),
      tipoEtiqueta: String(fila.product_type_label),
      imagen: String(fila.image),
      proveedorCodigo,
      precio: aNumeroONulo(fila.price_gtq),
      existencias: aNumeroONulo(fila.stock),
      publicado,
      incompleto,
      motivoIncompleto: incompleto ? "Falta código del fabricante" : undefined,
    };
  });

  const total = filas.length > 0 ? Number(filas[0].total_filtrado) : 0;

  const contadores: ContadoresEstado =
    filas.length > 0 && "total_todos" in filas[0]
      ? {
          todos: Number(filas[0].total_todos ?? total),
          publicados: Number(filas[0].total_publicados ?? 0),
          ocultos: Number(filas[0].total_ocultos ?? 0),
          incompletos: Number(filas[0].total_incompletos ?? 0),
        }
      : {
          todos: total,
          publicados: filtros.estado === "publicados" ? total : 0,
          ocultos: filtros.estado === "ocultos" ? total : 0,
          incompletos: filtros.estado === "incompletos" ? total : 0,
        };

  return {
    productos,
    total,
    contadores,
    pagina,
    paginas: Math.max(1, Math.ceil(total / PRODUCTOS_POR_PAGINA)),
  };
}

/**
 * Acepta el precio tal y como se escribe de verdad: con separador de miles,
 * con coma decimal o con la Q delante.
 *
 * Vacío significa "todavía sin precio", que es un estado legítimo: el producto
 * se enseña en el catálogo pero no se compra, y la tarjeta ofrece consultar.
 * Borrar el precio es, de hecho, la forma de retirar un producto de la venta.
 *
 * Cero, en cambio, no se acepta: significaría regalar el producto, y nadie
 * carga un cero queriendo eso. Casi siempre es un dedo o un campo a medio
 * escribir, y el precio se publica en cuanto se guarda.
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
  if (numero <= 0) {
    return {
      ok: false,
      error: "El precio tiene que ser mayor que cero. Déjalo vacío si aún no lo tienes.",
    };
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
