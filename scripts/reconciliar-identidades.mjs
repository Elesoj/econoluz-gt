// Termina los borrados que se quedaron a medias.
//
// Uso:
//   npm run identidad:reconciliar
//   npm run identidad:reconciliar -- --aplicar
//
// Sin --aplicar solo informa; nunca escribe por sorpresa.

import { Client, neonConfig } from "@neondatabase/serverless";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

neonConfig.webSocketConstructor = globalThis.WebSocket;

const aplicar = process.argv.includes("--aplicar");
const projectId = process.env.FIREBASE_PROJECT_ID;
const connectionString = process.env.DATABASE_URL;

if (!connectionString || !projectId) {
  console.error("Faltan DATABASE_URL o FIREBASE_PROJECT_ID.");
  process.exit(1);
}

const app = getApps()[0] ?? initializeApp({ credential: applicationDefault(), projectId });
const auth = getAuth(app);
const cliente = new Client(connectionString);
await cliente.connect();

// Nunca se imprime la cadena completa: contiene la contraseña.
console.log(`Base de datos:  ${new URL(connectionString).host}`);
console.log(`Modo:           ${aplicar ? "APLICAR" : "solo informar"}`);
console.log("");

try {
  const { rows } = await cliente.query(
    "select id, firebase_uid from users where estado = 'activa' order by id",
  );
  let huerfanas = 0;

  for (const fila of rows) {
    try {
      await auth.getUser(fila.firebase_uid);
      continue;
    } catch (error) {
      if (error?.code !== "auth/user-not-found") {
        // Una caída o un problema de permisos no convierte a nadie en huérfano.
        throw error;
      }
    }

    huerfanas += 1;
    console.log(`  huérfana     usuario ${fila.id}`);

    if (!aplicar) {
      continue;
    }

    await cliente.query("begin");
    try {
      await cliente.query("delete from user_addresses where user_id = $1", [fila.id]);
      await cliente.query("update auth_events set user_id = null where user_id = $1", [fila.id]);
      await cliente.query(
        `update users
         set email = $2, firebase_uid = $3, nombre = '', telefono = null, nit = null,
             nombre_fiscal = null, email_verificado = false, estado = 'anonimizada',
             anonimizado_en = now(), actualizado_en = now()
         where id = $1 and estado = 'activa'`,
        [fila.id, `borrado+${fila.id}@invalid`, `borrado:${fila.id}`],
      );
      await cliente.query("commit");
      console.log(`  anonimizada  usuario ${fila.id}`);
    } catch (error) {
      await cliente.query("rollback");
      throw error;
    }
  }

  console.log("");
  console.log(
    huerfanas === 0
      ? "No hay identidades huérfanas."
      : `${huerfanas} huérfana(s)${aplicar ? " anonimizada(s)" : "; repite con --aplicar"}.`,
  );
} finally {
  await cliente.end();
}
