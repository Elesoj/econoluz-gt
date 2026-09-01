// Comprueba el aprovisionamiento concurrente contra la rama de desarrollo.
// La fila de prueba se elimina siempre; ninguna credencial se imprime.

import { randomUUID } from "node:crypto";
import { Client, neonConfig } from "@neondatabase/serverless";

neonConfig.webSocketConstructor = globalThis.WebSocket;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Falta DATABASE_URL.");
  process.exit(1);
}

const SQL = `
  insert into users (firebase_uid, email, email_verificado, nombre)
  values ($1, $2, $3, $4)
  on conflict (firebase_uid) do update
    set email = excluded.email,
        email_verificado = excluded.email_verificado,
        ultimo_acceso_en = now(),
        actualizado_en = now()
  returning id, (xmax = 0) as recien_creada
`;

const SQL_BLOQUEAR = `
  select pg_advisory_xact_lock(hashtextextended($1, 0))
`;

const uid = `prueba-concurrente-${randomUUID()}`;
const email = `${uid}@example.com`;
const parametros = [uid, email, true, "Quien Prueba"];
const clientes = [new Client(connectionString), new Client(connectionString)];

let fallos = 0;
const mal = (mensaje) => {
  console.error(`  FALLA  ${mensaje}`);
  fallos += 1;
};
const bien = (mensaje) => console.log(`  ok     ${mensaje}`);

console.log(`Base de datos:  ${new URL(connectionString).host}`);
console.log("");

await Promise.all(clientes.map((cliente) => cliente.connect()));

try {
  await Promise.all(clientes.map((cliente) => cliente.query("begin")));

  const consultas = clientes.map(async (cliente, indice) => {
    await cliente.query(SQL_BLOQUEAR, [uid]);
    const resultado = await cliente.query(SQL, parametros);
    return { cliente, indice, resultado };
  });

  const primero = await Promise.race(consultas);
  await primero.cliente.query("commit");
  const segundo = await consultas[primero.indice === 0 ? 1 : 0];
  await segundo.cliente.query("commit");

  const filas = [primero.resultado.rows[0], segundo.resultado.rows[0]];
  const nuevas = filas.filter((fila) => fila.recien_creada === true).length;
  const existentes = filas.filter((fila) => fila.recien_creada === false).length;

  if (nuevas === 1) {
    bien("exactamente una petición crea el usuario");
  } else {
    mal(`${nuevas} peticiones se marcaron como creación`);
  }
  if (existentes === 1) {
    bien("la otra petición reutiliza el usuario existente");
  } else {
    mal(`${existentes} peticiones reutilizaron el usuario`);
  }
  if (filas[0].id === filas[1].id) {
    bien("las dos peticiones devuelven el mismo usuario");
  } else {
    mal("las peticiones devolvieron usuarios distintos");
  }

  const { rows } = await clientes[0].query(
    "select count(*)::int as n from users where firebase_uid = $1",
    [uid],
  );
  if (rows[0].n === 1) {
    bien("hay exactamente una fila");
  } else {
    mal(`hay ${rows[0].n} filas`);
  }

  console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} fallo(s).`);
  process.exitCode = fallos === 0 ? 0 : 1;
} finally {
  await Promise.all(clientes.map((cliente) => cliente.query("rollback").catch(() => undefined)));
  await clientes[0].query("delete from users where firebase_uid = $1", [uid]).catch(() => undefined);
  await Promise.all(clientes.map((cliente) => cliente.end()));
  console.log("  limpieza: no queda el usuario de prueba");
}
