// Comprueba contra la base los invariantes de la identidad de clientes.
// Todo ocurre dentro de una transacción que se deshace: no deja rastro.

import { Client, neonConfig } from "@neondatabase/serverless";

neonConfig.webSocketConstructor = globalThis.WebSocket;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Falta DATABASE_URL.");
  process.exit(1);
}

const cliente = new Client(connectionString);
await cliente.connect();

let fallos = 0;
const mal = (mensaje) => {
  console.error(`  FALLA  ${mensaje}`);
  fallos += 1;
};
const bien = (mensaje) => console.log(`  ok     ${mensaje}`);

const alta = (uid, email) =>
  cliente.query("insert into users (firebase_uid, email) values ($1, $2) returning id", [
    uid,
    email,
  ]);

console.log(`Base de datos:  ${new URL(connectionString).host}`);
console.log("");

try {
  await cliente.query("begin");

  const { rows } = await alta("uid-uno", "persona@example.com");
  const id = rows[0].id;
  bien("se puede dar de alta una cuenta");

  await cliente.query("savepoint correo_duplicado");
  try {
    await alta("uid-dos", "persona@example.com");
    mal("aceptó dos cuentas activas con el mismo correo");
  } catch {
    bien("rechaza dos cuentas activas con el mismo correo");
  } finally {
    await cliente.query("rollback to savepoint correo_duplicado");
  }

  await cliente.query("savepoint anonimizada_sin_fecha");
  try {
    await cliente.query("update users set estado = 'anonimizada' where id = $1", [id]);
    mal("aceptó una cuenta anonimizada sin fecha");
  } catch {
    bien("rechaza una cuenta anonimizada sin fecha");
  } finally {
    await cliente.query("rollback to savepoint anonimizada_sin_fecha");
  }

  await cliente.query(
    "update users set estado = 'anonimizada', anonimizado_en = now(), email = $2, firebase_uid = $3 where id = $1",
    [id, `borrado+${id}@invalid`, `borrado:${id}`],
  );
  const { rows: segundaAlta } = await alta("uid-tres", "persona@example.com");
  const idActivo = segundaAlta[0].id;
  bien("tras anonimizar, el mismo correo puede registrarse otra vez");

  await cliente.query(
    `insert into user_addresses
       (user_id, destinatario, telefono, departamento, municipio, direccion, predeterminada)
     values ($1, 'Quien recibe', '4042 8790', 'Guatemala', 'Guatemala', '21 Avenida 0-18', true)`,
    [idActivo],
  );

  await cliente.query("savepoint direccion_duplicada");
  try {
    await cliente.query(
      `insert into user_addresses
         (user_id, destinatario, telefono, departamento, municipio, direccion, predeterminada)
       values ($1, 'Otra', '4042 8790', 'Guatemala', 'Mixco', 'Otra calle', true)`,
      [idActivo],
    );
    mal("aceptó dos direcciones predeterminadas");
  } catch {
    bien("rechaza dos direcciones predeterminadas del mismo cliente");
  } finally {
    await cliente.query("rollback to savepoint direccion_duplicada");
  }

  console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} fallo(s).`);
  process.exitCode = fallos === 0 ? 0 : 1;
} finally {
  await cliente.query("rollback");
  await cliente.end();
  console.log("  rollback: la base queda como estaba");
}
