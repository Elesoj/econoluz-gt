import type { Ejecutor } from "../lib/datos/consulta";
import type { CarritoPublico, CuerpoDeFusion, ErrorDeCarrito } from "./carritoContratos";
import {
  decidirFusion,
  fusionarLineas,
  type Descarte,
  type LineaDeCarrito,
  type ProductoDelCatalogo,
} from "./carritoServidor";

/**
 * El carrito del cliente contra Postgres.
 *
 * Cada función recibe el **ejecutor** y el identificador del usuario **ya verificado**.
 * Ninguna abre su propia conexión y ninguna acepta el usuario del cuerpo de la petición:
 * eso lo resuelve la ruta leyendo la cookie de sesión, y aquí llega decidido. Recibir el
 * ejecutor es además lo que permite probar el bloqueo, el orden de las sentencias y el
 * aislamiento entre clientes sin base de datos.
 *
 * Las funciones terminadas en `Con` son la versión inyectable; `carrito.server.ts` las
 * envuelve con la conexión y la transacción de verdad.
 */

/**
 * El puerto hacia el catálogo, en una sola consulta.
 *
 * Pide **solo** lo necesario para decidir si un producto se puede comprar: su clave, su
 * referencia, si está publicado y si tiene precio. Ninguna columna `supplier_*` entra en
 * el proceso, y `select *` está descartado justamente por eso.
 *
 * Cuando el subproyecto 11 retire `products`, se cambia esta función y nada más: la
 * lógica de fusión no sabe de dónde salen los datos.
 */
async function leerCatalogo(
  ejecutar: Ejecutor,
  referencias: readonly string[],
): Promise<Map<string, ProductoDelCatalogo>> {
  if (referencias.length === 0) return new Map();

  const filas = await ejecutar(
    `select id, econoluz_reference, published, price_gtq
       from products
      where econoluz_reference = any($1)`,
    [[...referencias]],
  );

  return new Map(
    (filas as Record<string, unknown>[]).map((fila) => {
      const referencia = String(fila.econoluz_reference);
      const precio = fila.price_gtq;
      return [
        referencia,
        {
          productId: String(fila.id),
          econoluzReference: referencia,
          publicado: Boolean(fila.published),
          // El importe se recalcula al pintar; aquí solo importa si **hay** precio.
          precioCentavos:
            precio === null || precio === undefined ? null : Math.round(Number(precio) * 100),
        },
      ];
    }),
  );
}

/**
 * Devuelve el carrito del usuario, creándolo si no existía.
 *
 * `on conflict do nothing` más una lectura acotada: dos peticiones simultáneas del mismo
 * cliente no pueden acabar con dos carritos, porque `user_id` es único.
 */
async function asegurarCarrito(ejecutar: Ejecutor, userId: string): Promise<string> {
  const creado = await ejecutar(
    `insert into carts (user_id) values ($1)
     on conflict (user_id) do update set actualizado_en = now()
     returning id::text`,
    [userId],
  );
  return String((creado as { id: string }[])[0].id);
}

const aCarritoPublico = (filas: unknown[]): CarritoPublico => ({
  lineas: (filas as Record<string, unknown>[]).map((fila) => ({
    econoluzReference: String(fila.econoluz_reference),
    cantidad: Number(fila.cantidad),
  })),
});

/**
 * Las líneas del carrito de un usuario.
 *
 * Se une por `user_id` en vez de recibir el identificador del carrito: así **ninguna
 * consulta puede leer el carrito de otro**, ni siquiera equivocándose de parámetro.
 */
const SQL_LINEAS = `
  select ci.cantidad, p.econoluz_reference
    from cart_items ci
    join carts c on c.id = ci.cart_id
    join products p on p.id = ci.product_id
   where c.user_id = $1
   order by ci.creado_en, p.econoluz_reference`;

export async function leerCarritoCon(
  ejecutar: Ejecutor,
  userId: string,
): Promise<CarritoPublico> {
  return aCarritoPublico(await ejecutar(SQL_LINEAS, [userId]));
}

export type ResultadoDeEscritura =
  | { ok: true; carrito: CarritoPublico }
  | { ok: false; error: ErrorDeCarrito };

export async function fijarCantidadCon(
  ejecutar: Ejecutor,
  userId: string,
  econoluzReference: string,
  cantidad: number,
): Promise<ResultadoDeEscritura> {
  const cartId = await asegurarCarrito(ejecutar, userId);
  const catalogo = await leerCatalogo(ejecutar, [econoluzReference]);
  const producto = catalogo.get(econoluzReference);

  // Un producto que no existe, que no está publicado o que no tiene precio no entra en
  // ningún carrito: el checkout no podría cobrarlo.
  if (!producto || !producto.publicado || producto.precioCentavos === null) {
    return { ok: false, error: "referencia-invalida" };
  }

  await ejecutar(
    `insert into cart_items (cart_id, product_id, cantidad)
     values ($1, $2, $3)
     on conflict (cart_id, product_id)
     do update set cantidad = excluded.cantidad, actualizado_en = now()`,
    [cartId, producto.productId, cantidad],
  );

  return { ok: true, carrito: await leerCarritoCon(ejecutar, userId) };
}

export async function eliminarLineaCon(
  ejecutar: Ejecutor,
  userId: string,
  econoluzReference: string,
): Promise<CarritoPublico> {
  await ejecutar(
    `delete from cart_items ci
      using carts c, products p
      where ci.cart_id = c.id
        and ci.product_id = p.id
        and c.user_id = $1
        and p.econoluz_reference = $2`,
    [userId, econoluzReference],
  );
  return leerCarritoCon(ejecutar, userId);
}

export async function vaciarCarritoCon(
  ejecutar: Ejecutor,
  userId: string,
): Promise<CarritoPublico> {
  // Se borran las líneas y **se conserva el carrito**: la fila de `carts` guarda el token
  // de la última fusión, y perderlo haría que un reintento volviera a sumar.
  await ejecutar(
    `delete from cart_items ci
      using carts c
      where ci.cart_id = c.id and c.user_id = $1`,
    [userId],
  );
  return leerCarritoCon(ejecutar, userId);
}

export type ResultadoDeFusionRemota =
  | { ok: true; carrito: CarritoPublico; descartes: Descarte[] }
  | { ok: false; error: ErrorDeCarrito };

export async function fusionarCarritoCon(
  ejecutar: Ejecutor,
  userId: string,
  cuerpo: CuerpoDeFusion,
): Promise<ResultadoDeFusionRemota> {
  await asegurarCarrito(ejecutar, userId);

  // **Bloquear antes de leer.** Si se leyeran las líneas primero, dos fusiones a la vez
  // —dos pestañas, o un reintento que se cruza con el original— leerían el mismo estado
  // y la segunda escribiría encima de la primera.
  const bloqueadas = (await ejecutar(
    `select id::text, fusion_token from carts where user_id = $1 for update`,
    [userId],
  )) as { id: string; fusion_token: string | null }[];

  const carrito = bloqueadas[0] ?? null;
  const cartId = carrito ? String(carrito.id) : await asegurarCarrito(ejecutar, userId);

  if (decidirFusion(carrito ? { fusionToken: carrito.fusion_token } : null, cuerpo.token)
      .accion === "ya-aplicada") {
    // El reintento de una fusión ya aplicada devuelve lo que hay, sin sumar otra vez.
    return { ok: true, carrito: await leerCarritoCon(ejecutar, userId), descartes: [] };
  }

  const guardadas = (await ejecutar(
    `select ci.cantidad, p.id as product_id, p.econoluz_reference
       from cart_items ci
       join carts c on c.id = ci.cart_id
       join products p on p.id = ci.product_id
      where c.user_id = $1
      order by ci.creado_en`,
    [userId],
  )) as Record<string, unknown>[];

  const lineasGuardadas: LineaDeCarrito[] = guardadas.map((fila) => ({
    productId: String(fila.product_id),
    econoluzReference: String(fila.econoluz_reference),
    cantidad: Number(fila.cantidad),
  }));

  const referencias = [
    ...new Set([
      ...lineasGuardadas.map((linea) => linea.econoluzReference),
      ...cuerpo.lineas.map((linea) => linea.econoluzReference),
    ]),
  ];

  const catalogo = await leerCatalogo(ejecutar, referencias);
  const { lineas, descartes } = fusionarLineas(lineasGuardadas, cuerpo.lineas, catalogo);

  // Se reescribe el carrito entero dentro de la misma transacción: borrar y volver a
  // insertar deja el resultado exacto de la fusión, incluidos los descartes, sin tener
  // que razonar sobre qué líneas cambiaron.
  await ejecutar(`delete from cart_items where cart_id = $1`, [cartId]);

  for (const linea of lineas) {
    await ejecutar(
      `insert into cart_items (cart_id, product_id, cantidad) values ($1, $2, $3)`,
      [cartId, linea.productId, linea.cantidad],
    );
  }

  await ejecutar(
    `update carts set fusion_token = $2, actualizado_en = now() where user_id = $1`,
    [userId, cuerpo.token],
  );

  return { ok: true, carrito: await leerCarritoCon(ejecutar, userId), descartes };
}
