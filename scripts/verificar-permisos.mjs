// Comprueba que el rol de lectura pública solo puede leer la proyección.
//
// Se conecta con DATABASE_URL_PUBLIC y falla con código distinto de cero si
// algo no cuadra. Nunca imprime la cadena de conexión.

import { neon } from "@neondatabase/serverless";

const connectionString = process.env.DATABASE_URL_PUBLIC;
if (!connectionString) {
  console.error("Falta DATABASE_URL_PUBLIC. Ver docs/OPERACION-ROL-PUBLICO.md.");
  process.exit(1);
}

const ROL_ESPERADO = "econoluz_publico";
const PERMITIDAS = ["public_products"];
const PROHIBIDAS = [
  "products",
  "leads",
  "projects",
  "project_images",
  "admin_users",
  "admin_sessions",
  "admin_login_attempts",
  "schema_migrations",
  "app_settings",
  "audit_log",
  "users",
  "user_addresses",
  "user_consents",
  "auth_events",
  "categories",
  "product_categories",
  "product_private_data",
  "product_images",
  "attributes",
  "attribute_options",
  "product_attribute_values",
  "product_prices",
];

const identificador = (nombre) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(nombre)) {
    throw new Error("Nombre de tabla interno no válido.");
  }

  return `"${nombre}"`;
};

const sql = neon(connectionString);
let fallos = 0;
const mal = (mensaje) => {
  console.error(`  FALLA  ${mensaje}`);
  fallos += 1;
};
const bien = (mensaje) => console.log(`  ok     ${mensaje}`);

try {
  // Sin esta comprobación, una cadena del propietario haría que el resto de
  // la prueba pareciese válida aunque se estuviese usando el rol equivocado.
  const [{ usuario }] = await sql.query("select current_user as usuario");
  if (usuario !== ROL_ESPERADO) {
    console.error(`La cadena no conecta como «${ROL_ESPERADO}».`);
    process.exit(1);
  }
  bien(`current_user es ${ROL_ESPERADO}`);

  // Cada tabla prohibida se intenta leer por separado.
  for (const tabla of PROHIBIDAS) {
    try {
      await sql.query(`select 1 from ${identificador(tabla)} limit 1`);
      mal(`${tabla}: se pudo leer y no debería`);
    } catch (error) {
      const codigo = error?.code ?? "";
      // 42501 es permiso denegado; 42P01 indica que la tabla aún no existe.
      if (codigo === "42501") {
        bien(`${tabla}: denegada`);
      } else if (codigo === "42P01") {
        bien(`${tabla}: todavía no existe`);
      } else {
        mal(`${tabla}: error inesperado (${codigo || "sin código SQLSTATE"})`);
      }
    }
  }

  // Y lo que sí debe poder leer.
  for (const tabla of PERMITIDAS) {
    try {
      await sql.query(`select 1 from ${identificador(tabla)} limit 1`);
      bien(`${tabla}: legible`);
    } catch (error) {
      mal(`${tabla}: debería ser legible (${error?.code ?? "sin código SQLSTATE"})`);
    }
  }

  // El catálogo de PostgreSQL también muestra objetos sin privilegios para el
  // rol actual. Así, una tabla o vista nueva no puede quedar invisible para
  // esta comprobación y debe clasificarse expresamente.
  const conocidas = new Set([...PERMITIDAS, ...PROHIBIDAS]);
  const tablas = await sql.query(
    `select clase.relname as table_name
       from pg_catalog.pg_class as clase
       join pg_catalog.pg_namespace as espacio on espacio.oid = clase.relnamespace
      where espacio.nspname = 'public'
        and clase.relkind in ('r', 'p', 'v', 'm')`,
  );

  for (const { table_name: nombre } of tablas) {
    if (!conocidas.has(nombre)) {
      mal(`${nombre}: tabla o vista sin clasificar; añádela a PERMITIDAS o PROHIBIDAS`);
    }
  }

  console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} fallo(s).`);
  process.exitCode = fallos === 0 ? 0 : 1;
} catch (error) {
  console.error(
    `No se pudo completar la prueba de permisos (${error?.code ?? "sin código SQLSTATE"}).`,
  );
  process.exitCode = 1;
}
