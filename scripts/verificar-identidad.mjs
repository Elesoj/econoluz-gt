// Comprueba contra la base los invariantes de la identidad de clientes.
// Todo ocurre dentro de una transacción que se deshace: no deja rastro.

import { Client, neonConfig } from "@neondatabase/serverless";
import { createHmac } from "node:crypto";

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

  const ipDePrueba = "203.0.113.42";
  const pimienta = process.env.AUTH_EVENT_IP_PEPPER;
  if (!pimienta) {
    throw new Error("Falta AUTH_EVENT_IP_PEPPER.");
  }
  const huellaDePrueba = createHmac("sha256", pimienta)
    .update(ipDePrueba)
    .digest("hex")
    .slice(0, 32);
  for (let i = 0; i < 10; i += 1) {
    await cliente.query(
      "insert into auth_events (tipo, resultado, ip_huella) values ('fallo', 'fallido', $1)",
      [huellaDePrueba],
    );
  }
  const { rows: fallos10 } = await cliente.query(
    `select count(*)::int as n from auth_events
     where ip_huella = $1 and resultado = 'fallido'
       and ocurrido_en > now() - ($2 || ' minutes')::interval`,
    [huellaDePrueba, "15"],
  );
  if (fallos10[0].n === 10) {
    bien("la ventana cuenta los diez fallos de la misma huella");
  } else {
    mal(`contó ${fallos10[0].n} fallos y debería contar 10`);
  }

  const { rows: huellasGuardadas } = await cliente.query(
    "select ip_huella from auth_events where ip_huella = $1",
    [huellaDePrueba],
  );
  const huellaSegura =
    huellasGuardadas.length === 10 &&
    huellasGuardadas.every(
      (fila) => fila.ip_huella !== ipDePrueba && /^[a-f0-9]{32}$/.test(fila.ip_huella),
    );
  if (huellaSegura) {
    bien("auth_events guarda la huella HMAC y nunca la IP en claro");
  } else {
    mal("auth_events guardó una huella inválida o una IP en claro");
  }

  const { rows: altaParaBorrar } = await alta("uid-para-borrar", "borrame@example.com");
  const idParaBorrar = altaParaBorrar[0].id;
  await cliente.query(
    `insert into user_addresses
       (user_id, destinatario, telefono, departamento, municipio, direccion)
     values ($1, 'Quien Recibe', '4042 8790', 'Guatemala', 'Guatemala', 'Calle')`,
    [idParaBorrar],
  );
  await cliente.query(
    "insert into user_consents (user_id, tipo, version) values ($1, 'terminos', '2026-09-01')",
    [idParaBorrar],
  );
  const { rows: eventosParaBorrar } = await cliente.query(
    "insert into auth_events (user_id, tipo, resultado) values ($1, 'acceso', 'correcto') returning id",
    [idParaBorrar],
  );
  const idEvento = eventosParaBorrar[0].id;

  await cliente.query("delete from user_addresses where user_id = $1", [idParaBorrar]);
  await cliente.query("update auth_events set user_id = null where user_id = $1", [idParaBorrar]);
  await cliente.query(
    `update users
     set email = $2, firebase_uid = $3, nombre = '', telefono = null, nit = null,
         nombre_fiscal = null, email_verificado = false, estado = 'anonimizada',
         anonimizado_en = now(), actualizado_en = now()
     where id = $1 and estado = 'activa'`,
    [idParaBorrar, `borrado+${idParaBorrar}@invalid`, `borrado:${idParaBorrar}`],
  );

  const { rows: trasBorrado } = await cliente.query("select * from users where id = $1", [
    idParaBorrar,
  ]);
  const filaBorrada = trasBorrado[0];
  const datosLimpios =
    filaBorrada.nombre === "" &&
    filaBorrada.telefono === null &&
    filaBorrada.nit === null &&
    filaBorrada.nombre_fiscal === null &&
    filaBorrada.email === `borrado+${idParaBorrar}@invalid` &&
    filaBorrada.firebase_uid === `borrado:${idParaBorrar}` &&
    filaBorrada.email_verificado === false &&
    filaBorrada.estado === "anonimizada" &&
    filaBorrada.anonimizado_en !== null;
  if (datosLimpios) {
    bien("tras el borrado no queda dato personal en users");
  } else {
    mal("quedaron datos personales en users");
  }

  const { rows: direccionesTrasBorrado } = await cliente.query(
    "select count(*)::int as n from user_addresses where user_id = $1",
    [idParaBorrar],
  );
  if (direccionesTrasBorrado[0].n === 0) {
    bien("las direcciones se borraron");
  } else {
    mal("quedaron direcciones");
  }

  const { rows: consentimientosTrasBorrado } = await cliente.query(
    "select count(*)::int as n from user_consents where user_id = $1",
    [idParaBorrar],
  );
  if (consentimientosTrasBorrado[0].n === 1) {
    bien("el consentimiento se conserva como prueba");
  } else {
    mal("se perdió el consentimiento");
  }

  const { rows: eventosTrasBorrado } = await cliente.query(
    "select user_id from auth_events where id = $1",
    [idEvento],
  );
  if (eventosTrasBorrado[0]?.user_id === null) {
    bien("los eventos quedaron desligados");
  } else {
    mal("los eventos siguen enganchados");
  }

  console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} fallo(s).`);
  process.exitCode = fallos === 0 ? 0 : 1;
} finally {
  await cliente.query("rollback");
  await cliente.end();
  console.log("  rollback: la base queda como estaba");
}
