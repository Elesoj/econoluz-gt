// Lleva los 313 productos de app/data/products.ts a la tabla `products`.
//
// Se puede ejecutar las veces que haga falta: actualiza el producto que ya
// existe en lugar de duplicarlo. Y respeta a propósito cuatro columnas que
// NO vienen del código sino del panel — precio, existencias, si se vende en
// línea y si está publicado — para que reimportar no borre el trabajo de
// cargar precios, que es la tarea más lenta del proyecto.
//
// Al terminar vuelve a leer la base de datos y compara lo que hay dentro con
// la foto congelada del catálogo. No da por buena la importación porque el
// insert no diera error: la da por buena porque lo que quedó guardado
// reconstruye el catálogo idéntico.
//
// **Simula por defecto.** Hasta el 02/09/2026 escribía por el mero hecho de ejecutarlo,
// sin transacción y sin ningún guardián: importaba sobre lo que hubiera al otro lado de
// `DATABASE_URL`, Producción incluida. Y como `images` está en `CATALOG_COLUMNS`, una
// ejecución distraída deshace correcciones hechas a mano sobre la galería.
//
// Uso:
//   npm run catalogo:importar                        simula y no escribe nada
//   npm run catalogo:importar -- --aplicar           escribe en la rama de desarrollo
//   npm run catalogo:importar -- --aplicar-produccion  escribe en Producción
//
// El último exige las tres llaves a la vez: endpoint de Producción verificado,
// PERMITIR_ESCRITURA_PRODUCCION=true y CONFIRMAR_PRODUCCION con la palabra literal.

import { Client, neonConfig } from "@neondatabase/serverless";
import { products } from "../app/data/products.ts";
import {
  CATALOG_COLUMNS,
  JSON_COLUMNS,
  PANEL_COLUMNS,
  fromProductRow,
  toProductRow,
} from "../app/data/productRow.ts";
import { compareCatalogs, reportProblems } from "./compare-catalog.mjs";
import { autorizarEscritura, comprobarConteo, decidirModo } from "./guarda-neon.mjs";

/** La palabra literal que exige este comando para tocar Producción. */
export const CONFIRMACION_PRODUCCION = "importar-en-produccion";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error(
    "Falta DATABASE_URL.\n\n" +
      "Abre frontend/.env.local y pega ahí la cadena de conexión de Neon.",
  );
  process.exit(1);
}

neonConfig.webSocketConstructor = globalThis.WebSocket;

// Las listas de columnas viven en app/data/productRow.ts, junto a la
// traducción entre producto y fila, para que la aplicación y este script no
// puedan acabar consultando columnas distintas.
const COLUMNS = CATALOG_COLUMNS;
const COLUMNS_DEL_PANEL = PANEL_COLUMNS;

const BATCH_SIZE = 50;

const rows = products.map((product, index) => toProductRow(product, index));
const client = new Client(connectionString);

console.log(`Base de datos:  ${new URL(connectionString).host}`);
console.log(`Productos:      ${rows.length}`);
console.log("");

await client.connect();

try {
  const modo = decidirModo(process.argv.slice(2));
  const { escribe, destino } = await autorizarEscritura(client, {
    modo,
    confirmacionEsperada: CONFIRMACION_PRODUCCION,
  });
  console.log(`Modo:           ${modo} (${destino})`);
  console.log("");

  // Todo el trabajo va dentro de una transacción. En simulación se hace igual y se tira:
  // así el ensayo comprueba de verdad que las filas entran, en vez de suponerlo.
  await client.query("begin");

  const antes = await client.query("select count(*)::int as n from products");
  console.log(`Ya había en la tabla: ${antes.rows[0].n}`);

  // --- Importar ------------------------------------------------------------
  let escritos = 0;

  for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
    const batch = rows.slice(offset, offset + BATCH_SIZE);
    const values = [];
    const placeholders = [];

    for (const row of batch) {
      const slots = COLUMNS.map((column) => {
        const value = JSON_COLUMNS.has(column)
          ? (row[column] === null ? null : JSON.stringify(row[column]))
          : row[column];

        values.push(value);

        return `$${values.length}${JSON_COLUMNS.has(column) ? "::jsonb" : ""}`;
      });

      placeholders.push(`(${slots.join(", ")})`);
    }

    // `excluded` es la fila que se intentaba insertar. Las columnas del panel
    // no aparecen aquí, así que conservan lo que ya hubiera guardado.
    const updates = COLUMNS.filter((column) => column !== "id")
      .map((column) => `${column} = excluded.${column}`)
      .join(", ");

    const result = await client.query(
      `insert into products (${COLUMNS.join(", ")})
       values ${placeholders.join(", ")}
       on conflict (id) do update set ${updates}`,
      values,
    );

    escritos += result.rowCount ?? batch.length;
    process.stdout.write(`\r  escritos ${escritos} / ${rows.length}`);
  }

  console.log("");

  // --- Leer de vuelta y comprobar -----------------------------------------
  console.log("");
  console.log("Comprobando contra la foto congelada del catálogo...");

  const leidos = await client.query(
    `select ${[...COLUMNS, ...COLUMNS_DEL_PANEL].join(", ")}
     from products order by position`,
  );

  const reconstruido = leidos.rows.map((row) => fromProductRow(row));
  const problemas = compareCatalogs(products, reconstruido);

  console.log("");
  console.log(`En la tabla ahora:  ${leidos.rows.length}`);
  console.log(`Con precio puesto:  ${leidos.rows.filter((row) => row.price_gtq !== null).length}`);
  console.log(`Publicados:         ${leidos.rows.filter((row) => row.published).length}`);
  console.log("");

  // Ni una fila de menos ni una de más: si el conteo no cuadra, no se confirma nada.
  const conteo = comprobarConteo({
    esperado: rows.length,
    obtenido: leidos.rows.length,
    etiqueta: "productos en la tabla",
  });

  if (!conteo.ok || problemas.length > 0) {
    await client.query("rollback");
    if (!conteo.ok) console.error(conteo.motivo);
    reportProblems(problemas, "");
    console.error("\nNo se confirmó nada: la transacción se revirtió.");
    process.exitCode = 1;
  } else if (escribe) {
    await client.query("commit");
    reportProblems(
      problemas,
      `OK: los ${products.length} productos están en la base de datos y reconstruyen el\n` +
        "    catálogo exactamente igual que el código, campo por campo.",
    );
  } else {
    // En simulación se hace el trabajo entero y se tira, para que el ensayo compruebe de
    // verdad que las filas entran en lugar de suponerlo.
    await client.query("rollback");
    console.log(
      `OK en simulación: los ${products.length} productos entran y reconstruyen el\n` +
        "    catálogo campo por campo. No se escribió nada; añade -- --aplicar para hacerlo.",
    );
  }
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
