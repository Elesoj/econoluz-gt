// Comprueba el carrito persistente contra una base de datos de verdad.
//
// Las pruebas de unidad usan un ejecutor de mentira: demuestran que se emiten las
// sentencias correctas, pero no que PostgreSQL se comporte como se espera. Lo que solo se
// puede comprobar aquí es la concurrencia real —dos transacciones peleando por el mismo
// carrito—, el aislamiento entre clientes y que un fallo a mitad no deja nada escrito.
//
// Trabaja sobre usuarios sintéticos que crea y borra. **Se niega a correr contra
// Producción**: el endpoint se compara antes de tocar nada.
//
// Uso:
//   npm run carrito:verificar

import { fileURLToPath } from "node:url";
import { Pool, neonConfig } from "@neondatabase/serverless";

import {
  fusionarCarritoCon,
  leerCarritoCon,
  fijarCantidadCon,
} from "../app/tienda/carritoRepositorio.ts";

neonConfig.webSocketConstructor = globalThis.WebSocket;

const ENDPOINT_PRODUCCION = "ep-misty-sun-avmcbgly";

const fallos = [];
const comprobar = (condicion, mensaje) => {
  if (condicion) console.log(`  ok     ${mensaje}`);
  else {
    console.log(`  FALLA  ${mensaje}`);
    fallos.push(mensaje);
  }
};

function exigirBaseDeDesarrollo(cadena) {
  const host = new URL(cadena).host;
  if (host.includes(ENDPOINT_PRODUCCION)) {
    throw new Error("Este comando no se ejecuta contra Producción.");
  }
  console.log(`Base de datos:  ${host}`);
}

const ejecutorDe = (cliente) => async (sql, parametros = []) =>
  (await cliente.query(sql, parametros)).rows;

/** Dos usuarios sintéticos, reconocibles y con correo imposible de confundir. */
const SUFIJO = `carrito-prueba-${Date.now()}`;

async function crearUsuario(ejecutar, etiqueta) {
  const filas = await ejecutar(
    `insert into users (firebase_uid, email, nombre)
     values ($1, $2, 'Prueba del carrito')
     returning id::text`,
    [`${SUFIJO}-${etiqueta}`, `${SUFIJO}-${etiqueta}@ejemplo.invalido`],
  );
  return String(filas[0].id);
}

async function referenciasDePrueba(ejecutar) {
  const filas = await ejecutar(
    `select econoluz_reference from products
      where published and price_gtq is not null
      order by position limit 2`,
  );
  return filas.map((fila) => String(fila.econoluz_reference));
}

async function principal() {
  const cadena = process.env.DATABASE_URL;
  if (!cadena) throw new Error("Falta DATABASE_URL.");
  exigirBaseDeDesarrollo(cadena);

  const pool = new Pool({ connectionString: cadena, max: 4 });
  const cliente = await pool.connect();
  const ejecutar = ejecutorDe(cliente);
  let usuarioA = null;
  let usuarioB = null;

  try {
    const [refA, refB] = await referenciasDePrueba(ejecutar);
    comprobar(Boolean(refA && refB), "hay dos productos con precio para probar");

    usuarioA = await crearUsuario(ejecutar, "a");
    usuarioB = await crearUsuario(ejecutar, "b");

    // --- Creación y suma -------------------------------------------------------------
    const primera = await fusionarCarritoCon(ejecutar, usuarioA, {
      token: `${SUFIJO}-t1`,
      lineas: [{ econoluzReference: refA, cantidad: 2 }],
    });
    comprobar(primera.ok, "la primera fusion crea el carrito");
    comprobar(
      primera.ok && primera.carrito.lineas.length === 1 && primera.carrito.lineas[0].cantidad === 2,
      "el carrito nuevo tiene la linea que se envio",
    );

    const segunda = await fusionarCarritoCon(ejecutar, usuarioA, {
      token: `${SUFIJO}-t2`,
      lineas: [{ econoluzReference: refA, cantidad: 3 }],
    });
    comprobar(
      segunda.ok && segunda.carrito.lineas[0].cantidad === 5,
      "un token nuevo suma sobre lo guardado (2 + 3 = 5)",
    );

    // --- Idempotencia ----------------------------------------------------------------
    const repetida = await fusionarCarritoCon(ejecutar, usuarioA, {
      token: `${SUFIJO}-t2`,
      lineas: [{ econoluzReference: refA, cantidad: 3 }],
    });
    comprobar(
      repetida.ok && repetida.carrito.lineas[0].cantidad === 5,
      "repetir el mismo token no vuelve a sumar",
    );

    // --- Reintento retrasado, fuera de orden -------------------------------------------
    //
    // El duplicado de una fusion antigua que llega despues de otra mas reciente. Con un
    // solo token recordado, su token ya no coincidiria y la fusion se aplicaria por
    // segunda vez.
    const antesDelRetrasado = await leerCarritoCon(ejecutar, usuarioA);
    const retrasada = await fusionarCarritoCon(ejecutar, usuarioA, {
      token: `${SUFIJO}-t1`,
      lineas: [{ econoluzReference: refA, cantidad: 2 }],
    });
    const despuesDelRetrasado = await leerCarritoCon(ejecutar, usuarioA);
    comprobar(
      retrasada.ok &&
        JSON.stringify(antesDelRetrasado) === JSON.stringify(despuesDelRetrasado),
      "un duplicado retrasado de una fusion anterior no vuelve a sumar",
    );

    // --- Tope de 999 ------------------------------------------------------------------
    const tope = await fusionarCarritoCon(ejecutar, usuarioA, {
      token: `${SUFIJO}-t3`,
      lineas: [{ econoluzReference: refA, cantidad: 999 }],
    });
    comprobar(
      tope.ok && tope.carrito.lineas[0].cantidad === 999,
      "la suma se recorta a 999 y la restriccion de la tabla la acepta",
    );

    // --- Producto que no se puede comprar ---------------------------------------------
    const descartes = await fusionarCarritoCon(ejecutar, usuarioA, {
      token: `${SUFIJO}-t4`,
      lineas: [{ econoluzReference: "ECO-ZZZ-9999", cantidad: 1 }],
    });
    comprobar(
      descartes.ok &&
        descartes.descartes.length === 1 &&
        descartes.descartes[0].motivo === "inexistente",
      "un producto inexistente se descarta y se informa",
    );

    // --- Aislamiento entre clientes ----------------------------------------------------
    await fusionarCarritoCon(ejecutar, usuarioB, {
      token: `${SUFIJO}-tb`,
      lineas: [{ econoluzReference: refB, cantidad: 4 }],
    });

    const deA = await leerCarritoCon(ejecutar, usuarioA);
    const deB = await leerCarritoCon(ejecutar, usuarioB);
    comprobar(
      deA.lineas.every((linea) => linea.econoluzReference !== refB),
      "el usuario A no ve nada del carrito de B",
    );
    comprobar(
      deB.lineas.length === 1 && deB.lineas[0].cantidad === 4,
      "el carrito de B es el suyo y no lo toco nadie",
    );

    const borradoAjeno = await ejecutar(
      `delete from cart_items ci using carts c, products p
        where ci.cart_id = c.id and ci.product_id = p.id
          and c.user_id = $1 and p.econoluz_reference = $2
        returning ci.id`,
      [usuarioA, refB],
    );
    comprobar(
      borradoAjeno.length === 0 && (await leerCarritoCon(ejecutar, usuarioB)).lineas.length === 1,
      "A no puede borrar una linea del carrito de B ni por equivocacion",
    );

    // --- Fusiones concurrentes ---------------------------------------------------------
    //
    // Dos transacciones a la vez sobre el mismo carrito. El `select ... for update` tiene
    // que serializarlas: la segunda espera, ve el resultado de la primera y suma encima.
    // Sin el bloqueo, las dos leerían lo mismo y una pisaría a la otra.
    const uno = await pool.connect();
    const dos = await pool.connect();
    try {
      await uno.query("begin");
      await dos.query("begin");

      const tareaUno = fusionarCarritoCon(ejecutorDe(uno), usuarioB, {
        token: `${SUFIJO}-c1`,
        lineas: [{ econoluzReference: refB, cantidad: 10 }],
      });
      // La segunda arranca a la vez y se quedará esperando el bloqueo de la primera.
      const tareaDos = (async () => {
        await new Promise((listo) => setTimeout(listo, 50));
        return fusionarCarritoCon(ejecutorDe(dos), usuarioB, {
          token: `${SUFIJO}-c2`,
          lineas: [{ econoluzReference: refB, cantidad: 20 }],
        });
      })();

      await tareaUno;
      await uno.query("commit");
      await tareaDos;
      await dos.query("commit");
    } finally {
      uno.release();
      dos.release();
    }

    const trasConcurrencia = await leerCarritoCon(ejecutar, usuarioB);
    comprobar(
      trasConcurrencia.lineas[0]?.cantidad === 34,
      `dos fusiones concurrentes suman las dos (4 + 10 + 20 = 34), salio ${trasConcurrencia.lineas[0]?.cantidad}`,
    );

    // --- Reversion completa -------------------------------------------------------------
    const antesDelFallo = await leerCarritoCon(ejecutar, usuarioA);
    const roto = await pool.connect();
    try {
      await roto.query("begin");
      await fijarCantidadCon(ejecutorDe(roto), usuarioA, refB, 7);
      // Un fallo a mitad de la transacción, como el que provocaría un corte de red.
      await roto.query("rollback");
    } finally {
      roto.release();
    }

    const despuesDelFallo = await leerCarritoCon(ejecutar, usuarioA);
    comprobar(
      JSON.stringify(antesDelFallo) === JSON.stringify(despuesDelFallo),
      "una transaccion deshecha no deja ni una linea escrita",
    );

    // --- Privacidad ----------------------------------------------------------------------
    const columnas = await ejecutar(
      `select table_name, column_name from information_schema.columns
        where table_schema = 'public' and table_name in ('carts', 'cart_items')`,
    );
    const nombres = columnas.map((fila) => String(fila.column_name));
    comprobar(
      !nombres.some((nombre) => /price|precio|supplier|stock|nombre|image/i.test(nombre)),
      "las dos tablas no tienen ninguna columna de precio, proveedor ni existencias",
    );
  } finally {
    // Los usuarios sintéticos se van, y con ellos sus carritos por cascada.
    for (const id of [usuarioA, usuarioB].filter(Boolean)) {
      await cliente.query("delete from users where id = $1", [id]);
    }
    const quedan = await cliente.query(
      "select count(*)::int n from users where firebase_uid like $1",
      [`${SUFIJO}%`],
    );
    comprobar(quedan.rows[0].n === 0, "no queda ningun usuario sintetico");

    cliente.release();
    await pool.end();
  }

  console.log("");
  console.log(fallos.length === 0 ? "Todo correcto." : `${fallos.length} fallo(s).`);
  if (fallos.length > 0) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  principal().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
