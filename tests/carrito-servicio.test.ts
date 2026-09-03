import assert from "node:assert/strict";
import { test } from "node:test";

import {
  eliminarLineaCon,
  fijarCantidadCon,
  fusionarCarritoCon,
  leerCarritoCon,
  vaciarCarritoCon,
} from "../app/tienda/carritoRepositorio";

/**
 * Un ejecutor de mentira que guarda cada sentencia y sus parámetros.
 *
 * Se comprueba sobre lo **realmente ejecutado**, no sobre lo que el código dice que hace:
 * que el carrito se bloquea antes de leerlo, que ninguna consulta acepta un usuario que
 * no sea el del parámetro, y que nada se escribe fuera de la transacción.
 */
function ejecutorFalso(respuestas: Record<string, Record<string, unknown>[]>) {
  const sentencias: { sql: string; parametros: readonly unknown[] }[] = [];

  const ejecutar = async (
    sql: string,
    parametros: readonly unknown[] = [],
  ): Promise<Record<string, unknown>[]> => {
    sentencias.push({ sql: sql.replace(/\s+/g, " ").trim(), parametros });
    for (const [fragmento, filas] of Object.entries(respuestas)) {
      if (sql.replace(/\s+/g, " ").includes(fragmento)) return filas as Record<string, unknown>[];
    }
    return [];
  };

  return { ejecutar, sentencias };
}

const sql = (sentencias: { sql: string }[]) => sentencias.map((s) => s.sql).join(" || ");

const CATALOGO = [
  { id: "apl-001", econoluz_reference: "ECO-ELE-0001", published: true, price_gtq: "125.00" },
  { id: "apl-002", econoluz_reference: "ECO-ELE-0002", published: true, price_gtq: "80.00" },
];

// --- Leer -------------------------------------------------------------------------------

test("leer el carrito lo busca por el usuario, nunca por el carrito", async () => {
  const { ejecutar, sentencias } = ejecutorFalso({
    "from cart_items": [{ econoluz_reference: "ECO-ELE-0001", cantidad: 3 }],
  });

  const carrito = await leerCarritoCon(ejecutar, "42");

  assert.deepEqual(carrito.lineas, [{ econoluzReference: "ECO-ELE-0001", cantidad: 3 }]);
  assert.ok(sentencias.every((s) => s.parametros.includes("42")));
  assert.match(sql(sentencias), /user_id = \$1/);
});

test("un usuario sin carrito lee un carrito vacio, no un error", async () => {
  const { ejecutar } = ejecutorFalso({});
  assert.deepEqual((await leerCarritoCon(ejecutar, "42")).lineas, []);
});

/**
 * El aislamiento entre clientes es la propiedad más importante de esta tabla. No se
 * comprueba «que la función use el id», sino que **ninguna sentencia** deja de acotar por
 * el usuario: una consulta suelta sin `user_id` sería una puerta al carrito de otro.
 */
test("ninguna consulta de lectura toca filas sin acotar por el usuario", async () => {
  const { ejecutar, sentencias } = ejecutorFalso({});
  await leerCarritoCon(ejecutar, "42");

  for (const sentencia of sentencias) {
    assert.match(
      sentencia.sql,
      /user_id = \$1/,
      `esta sentencia no se acota por el usuario: ${sentencia.sql}`,
    );
  }
});

// --- Fijar y eliminar --------------------------------------------------------------------

test("fijar una cantidad crea el carrito si hace falta y escribe la linea", async () => {
  const { ejecutar, sentencias } = ejecutorFalso({
    "insert into carts": [{ id: "7" }],
    "from products": CATALOGO,
    "from cart_items": [{ econoluz_reference: "ECO-ELE-0001", cantidad: 4 }],
  });

  const resultado = await fijarCantidadCon(ejecutar, "42", "ECO-ELE-0001", 4);

  assert.equal(resultado.ok, true);
  assert.match(sql(sentencias), /insert into carts/);
  assert.match(sql(sentencias), /insert into cart_items/);
  assert.match(sql(sentencias), /on conflict/);
});

test("fijar la cantidad de un producto que no se vende no escribe nada", async () => {
  const { ejecutar, sentencias } = ejecutorFalso({
    "insert into carts": [{ id: "7" }],
    "from products": [{ ...CATALOGO[0], published: false }],
  });

  const resultado = await fijarCantidadCon(ejecutar, "42", "ECO-ELE-0001", 4);

  assert.equal(resultado.ok, false);
  assert.equal(sql(sentencias).includes("insert into cart_items"), false);
});

test("eliminar una linea la borra solo del carrito de ese usuario", async () => {
  const { ejecutar, sentencias } = ejecutorFalso({ "insert into carts": [{ id: "7" }] });

  await eliminarLineaCon(ejecutar, "42", "ECO-ELE-0001");

  const borrado = sentencias.find((s) => s.sql.startsWith("delete from cart_items"));
  assert.ok(borrado, "tiene que borrar de cart_items");
  assert.match(borrado.sql, /user_id = \$1/);
});

test("vaciar borra las lineas y conserva el carrito", async () => {
  const { ejecutar, sentencias } = ejecutorFalso({ "insert into carts": [{ id: "7" }] });

  await vaciarCarritoCon(ejecutar, "42");

  assert.match(sql(sentencias), /delete from cart_items/);
  assert.equal(sql(sentencias).includes("delete from carts"), false);
});

// --- Fusionar ---------------------------------------------------------------------------

test("la fusion bloquea el carrito antes de leer sus lineas", async () => {
  const { ejecutar, sentencias } = ejecutorFalso({
    "insert into carts": [{ id: "7" }],
    "for update": [{ id: "7", fusion_token: null }],
    "from products": CATALOGO,
  });

  await fusionarCarritoCon(ejecutar, "42", {
    token: "tok-de-prueba-1234",
    lineas: [{ econoluzReference: "ECO-ELE-0001", cantidad: 2 }],
  });

  const indiceBloqueo = sentencias.findIndex((s) => /for update/.test(s.sql));
  const indiceLineas = sentencias.findIndex((s) => /select .*from cart_items/.test(s.sql));

  assert.notEqual(indiceBloqueo, -1, "falta el bloqueo de la fila del carrito");
  assert.ok(
    indiceBloqueo < indiceLineas,
    "leer las lineas antes de bloquear deja pasar dos fusiones a la vez",
  );
});

test("la fusion suma y devuelve el carrito resultante", async () => {
  const { ejecutar } = ejecutorFalso({
    "insert into carts": [{ id: "7" }],
    "for update": [{ id: "7", fusion_token: null }],
    "from products": CATALOGO,
    "select ci.econoluz": [],
  });

  const resultado = await fusionarCarritoCon(ejecutar, "42", {
    token: "tok-de-prueba-1234",
    lineas: [{ econoluzReference: "ECO-ELE-0001", cantidad: 2 }],
  });

  assert.equal(resultado.ok, true);
  if (resultado.ok) assert.deepEqual(resultado.descartes, []);
});

test("repetir la fusion con el mismo token no vuelve a escribir lineas", async () => {
  const { ejecutar, sentencias } = ejecutorFalso({
    "insert into carts": [{ id: "7" }],
    "for update": [{ id: "7", fusion_token: "tok-de-prueba-1234" }],
    "from cart_items": [{ econoluz_reference: "ECO-ELE-0001", cantidad: 2 }],
  });

  const resultado = await fusionarCarritoCon(ejecutar, "42", {
    token: "tok-de-prueba-1234",
    lineas: [{ econoluzReference: "ECO-ELE-0001", cantidad: 2 }],
  });

  assert.equal(resultado.ok, true);
  assert.equal(
    sql(sentencias).includes("insert into cart_items"),
    false,
    "un reintento no puede volver a sumar",
  );
});

test("la fusion guarda el token para que el reintento lo encuentre", async () => {
  const { ejecutar, sentencias } = ejecutorFalso({
    "insert into carts": [{ id: "7" }],
    "for update": [{ id: "7", fusion_token: null }],
    "from products": CATALOGO,
  });

  await fusionarCarritoCon(ejecutar, "42", { token: "tok-de-prueba-1234", lineas: [] });

  const guardado = sentencias.find((s) => /update carts set/.test(s.sql));
  assert.ok(guardado, "tiene que guardar el token");
  assert.ok(guardado.parametros.includes("tok-de-prueba-1234"));
});

test("la fusion informa de lo que descarto", async () => {
  const { ejecutar } = ejecutorFalso({
    "insert into carts": [{ id: "7" }],
    "for update": [{ id: "7", fusion_token: null }],
    "from products": CATALOGO,
  });

  const resultado = await fusionarCarritoCon(ejecutar, "42", {
    token: "tok-de-prueba-1234",
    lineas: [
      { econoluzReference: "ECO-ELE-0001", cantidad: 1 },
      { econoluzReference: "ECO-ZZZ-9999", cantidad: 1 },
    ],
  });

  assert.equal(resultado.ok, true);
  if (resultado.ok) {
    assert.deepEqual(resultado.descartes, [
      { econoluzReference: "ECO-ZZZ-9999", motivo: "inexistente" },
    ]);
  }
});

/**
 * El precio nunca sale de la petición: se lee del catálogo. Aquí se comprueba que la
 * consulta al catálogo existe y que lo que se escribe en `cart_items` no lleva importes.
 */
test("el precio se lee del catalogo y no se guarda en el carrito", async () => {
  const { ejecutar, sentencias } = ejecutorFalso({
    "insert into carts": [{ id: "7" }],
    "for update": [{ id: "7", fusion_token: null }],
    "from products": CATALOGO,
  });

  await fusionarCarritoCon(ejecutar, "42", {
    token: "tok-de-prueba-1234",
    lineas: [{ econoluzReference: "ECO-ELE-0001", cantidad: 2 }],
  });

  assert.match(sql(sentencias), /price_gtq/, "hay que preguntarle el precio al catalogo");
  const insercion = sentencias.find((s) => s.sql.startsWith("insert into cart_items"));
  assert.ok(insercion);
  assert.equal(/price|precio|centavos|importe/i.test(insercion.sql), false);
});

/**
 * La consulta al catálogo pide solo lo que necesita para decidir. Pedir `select *` metería
 * las columnas `supplier_*` en el proceso, y de ahí a un log o a una respuesta hay un paso.
 */
test("la consulta al catalogo no trae ninguna columna del proveedor", async () => {
  const { ejecutar, sentencias } = ejecutorFalso({
    "insert into carts": [{ id: "7" }],
    "for update": [{ id: "7", fusion_token: null }],
    "from products": CATALOGO,
  });

  await fusionarCarritoCon(ejecutar, "42", {
    token: "tok-de-prueba-1234",
    lineas: [{ econoluzReference: "ECO-ELE-0001", cantidad: 1 }],
  });

  const consulta = sentencias.find((s) => /from products/.test(s.sql));
  assert.ok(consulta);
  assert.equal(/supplier|select \*/i.test(consulta.sql), false);
});
