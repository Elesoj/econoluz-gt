// Reconstruye la proyección pública entera desde `products`. Idempotente:
// ejecutarlo dos veces deja el mismo resultado.
//
// **Simula por defecto.** Hasta el 02/09/2026 este script escribía por el mero hecho de
// ejecutarlo, y sin ningún guardián: reproyectaba lo que hubiera al otro lado de
// `DATABASE_URL`, Producción incluida. Ahora hay que pedir la escritura por su nombre:
//
//   npm run catalogo:reproyectar                      simula y no escribe nada
//   npm run catalogo:reproyectar -- --aplicar         escribe en la rama de desarrollo
//   npm run catalogo:reproyectar -- --aplicar-produccion   escribe en Producción
//
// El último exige las tres llaves a la vez: endpoint de Producción verificado,
// PERMITIR_ESCRITURA_PRODUCCION=true y CONFIRMAR_PRODUCCION con la palabra literal.
//
// Nunca imprime la cadena de conexión, igual que scripts/migrate.mjs.

import { Client, neonConfig } from "@neondatabase/serverless";
import { fromProductRow, CATALOG_COLUMNS } from "../app/data/productRow.ts";
import { aFilaProyeccion } from "../app/data/proyeccionPublica.ts";
import { construirUpsertProyeccion } from "../app/data/proyeccionPublicaSql.ts";
import { autorizarEscritura, comprobarConteo, decidirModo } from "./guarda-neon.mjs";

/** La palabra literal que exige este comando para tocar Producción. */
export const CONFIRMACION_PRODUCCION = "reproyectar-en-produccion";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Falta DATABASE_URL. Ponla en frontend/.env.local y repite.");
  process.exit(1);
}

neonConfig.webSocketConstructor = globalThis.WebSocket;
console.log(`Base de datos:  ${new URL(connectionString).host}`);

const modo = decidirModo(process.argv.slice(2));
const client = new Client(connectionString);
await client.connect();

try {
  const { escribe, destino } = await autorizarEscritura(client, {
    modo,
    confirmacionEsperada: CONFIRMACION_PRODUCCION,
  });
  console.log(`Modo:           ${modo} (${destino})`);

  await client.query("begin");

  // `position` ya viene dentro de CATALOG_COLUMNS (ver app/data/productRow.ts),
  // así que no se repite aquí: pedirla dos veces solo duplicaría la columna en
  // el resultado sin aportar nada.
  const { rows } = await client.query(
    `select ${CATALOG_COLUMNS.join(", ")}, price_gtq
     from products where published order by position`,
  );

  let proyectados = 0;
  for (const fila of rows) {
    const proyectada = aFilaProyeccion(
      fromProductRow(fila),
      fila.price_gtq === null ? null : Number(fila.price_gtq),
      fila.position,
    );

    const consulta = construirUpsertProyeccion(proyectada);
    await client.query(consulta.texto, consulta.parametros);
    proyectados += 1;
  }

  // Lo que ya no está publicado deja de existir para el visitante.
  const retiradas = await client.query(
    `delete from public_products
     where econoluz_reference not in (
       select econoluz_reference from products where published
     )`,
  );

  // Cada producto publicado tiene que haberse proyectado: ni uno menos, ni uno de más.
  const conteo = comprobarConteo({
    esperado: rows.length,
    obtenido: proyectados,
    etiqueta: "productos proyectados",
  });
  if (!conteo.ok) {
    await client.query("rollback");
    console.error(conteo.motivo);
    process.exitCode = 1;
  } else if (escribe) {
    await client.query("commit");
    console.log(`Proyectados:  ${proyectados}`);
    console.log(`Retirados:    ${retiradas.rowCount}`);
  } else {
    // En simulación se hace el trabajo entero y se tira: así el ensayo comprueba de
    // verdad que las filas se pueden escribir, en vez de suponerlo.
    await client.query("rollback");
    console.log(`Proyectaría:  ${proyectados}`);
    console.log(`Retiraría:    ${retiradas.rowCount}`);
    console.log("\nSimulación: no se escribió nada. Añade -- --aplicar para hacerlo.");
  }
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
