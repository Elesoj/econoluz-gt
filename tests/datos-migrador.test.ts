import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CONFIRMACION_MIGRAR_PRODUCCION,
  decidirModoMigracion,
  ejecutarMigrador,
} from "../scripts/migrate.mjs";

const DESARROLLO = "ep-test-branch-12345.c-11.us-east-1.aws.neon.tech";
const PRODUCCION = "ep-misty-sun-avmcbgly.c-11.us-east-1.aws.neon.tech";

test("los archivos de db/ tienen el encabezado de uso repetible", () => {
  const ruta = join(process.cwd(), "db", "005_proyeccion_publica.sql");
  const contenido = readFileSync(ruta, "utf8");

  assert.match(contenido, /create table if not exists public_products/i);
});

test("007_app_settings.sql es idempotente", () => {
  const ruta = join(process.cwd(), "db", "007_app_settings.sql");
  const contenido = readFileSync(ruta, "utf8");

  assert.match(contenido, /create table if not exists app_settings/i);
  assert.match(contenido, /insert into app_settings/i);
  assert.match(contenido, /on conflict \(clave\) do nothing/i);
});

test("008_audit_log.sql crea la tabla y sus dos índices con IF NOT EXISTS", () => {
  const ruta = join(process.cwd(), "db", "008_audit_log.sql");
  const contenido = readFileSync(ruta, "utf8");

  assert.match(contenido, /create table if not exists audit_log/i);
  assert.match(contenido, /create index if not exists audit_log_entidad_idx/i);
  assert.match(contenido, /create index if not exists audit_log_ocurrido_en_idx/i);
});

test("009_identidad_clientes.sql es idempotente y no borra nada", () => {
  const ruta = join(process.cwd(), "db", "009_identidad_clientes.sql");
  const contenido = readFileSync(ruta, "utf8");

  assert.match(contenido, /create table if not exists users/i);
  assert.match(contenido, /create table if not exists user_addresses/i);
  assert.match(contenido, /create table if not exists user_consents/i);
  assert.match(contenido, /create table if not exists auth_events/i);
  assert.ok(!contenido.toLowerCase().includes("drop table"));
});

test("011_carrito.sql es idempotente y no borra nada", () => {
  const ruta = join(process.cwd(), "db", "011_carrito.sql");
  const contenido = readFileSync(ruta, "utf8");

  assert.match(contenido, /create table if not exists carts/i);
  assert.match(contenido, /create table if not exists cart_items/i);
  assert.match(contenido, /on delete cascade/i);
  assert.ok(!contenido.toLowerCase().includes("drop table"));
});

test("decidirModoMigracion selecciona simular, aplicar o aplicar-produccion", () => {
  assert.equal(decidirModoMigracion([]), "aplicar");
  assert.equal(decidirModoMigracion(["--simular"]), "simular");
  assert.equal(decidirModoMigracion(["--aplicar-produccion"]), "aplicar-produccion");
  assert.equal(decidirModoMigracion(["--simular", "--aplicar-produccion"]), "simular");
});

type SentenciaEspia = { texto: string; params: unknown[] };

function crearClienteEspia({
  errorEnSql = null,
  schemaMigrationsExiste = true,
}: {
  errorEnSql?: string | null;
  schemaMigrationsExiste?: boolean;
} = {}) {
  const sentencias: SentenciaEspia[] = [];
  return {
    sentencias,
    cliente: {
      query: async (sql: string | { text?: string }, params: unknown[] = []) => {
        const texto = typeof sql === "string" ? sql.trim() : (sql?.text ?? "");
        sentencias.push({ texto, params });
        if (errorEnSql && texto.includes(errorEnSql)) {
          throw new Error(`Fallo simulado en ${errorEnSql}`);
        }
        if (texto.startsWith("select filename from schema_migrations")) {
          return { rows: schemaMigrationsExiste ? [{ filename: "001_inicial.sql" }] : [] };
        }
        if (texto.startsWith("select valor from app_settings where clave = $1")) {
          return { rows: [{ valor: "envios-tarifas-dev" }] };
        }
        return { rows: [], rowCount: 1 };
      },
    },
  };
}

test("en modo simulación, BEGIN se ejecuta ANTES de cualquier DDL incluida schema_migrations", async () => {
  const espia = crearClienteEspia();
  const entorno = {
    DATABASE_URL: `postgresql://u:p@${DESARROLLO}/neondb`,
    NEON_ENDPOINT_ESPERADO: DESARROLLO,
    NEON_ENDPOINT_PRODUCCION: PRODUCCION,
    NEON_RAMA_ESPERADA: "envios-tarifas-dev",
  } as unknown as NodeJS.ProcessEnv;

  const resultado = await ejecutarMigrador({
    client: espia.cliente as unknown as Parameters<typeof ejecutarMigrador>[0]["client"],
    migrations: ["001_inicial.sql", "002_segunda.sql"],
    leerSql: (f: string) => `-- SQL de ${f}`,
    modo: "simular",
    entorno,
  });

  assert.equal(resultado.simular, true);
  // El primer query ejecutable debe ser "begin"
  assert.equal(espia.sentencias[0].texto.toLowerCase(), "begin");
  // La creación de schema_migrations debe ir después de begin
  const idxBegin = espia.sentencias.findIndex((s) => s.texto.toLowerCase() === "begin");
  const idxSchemaMigrations = espia.sentencias.findIndex((s) =>
    s.texto.toLowerCase().includes("create table if not exists schema_migrations"),
  );
  assert.ok(idxBegin < idxSchemaMigrations, "begin debe ejecutarse antes de crear schema_migrations");
  // El último query debe ser rollback
  const ultimo = espia.sentencias[espia.sentencias.length - 1];
  assert.equal(ultimo.texto.toLowerCase(), "rollback");
});

test("la simulación termina en ROLLBACK incluso cuando una migración falla", async () => {
  const espia = crearClienteEspia({ errorEnSql: "002_segunda.sql" });
  const entorno = {
    DATABASE_URL: `postgresql://u:p@${DESARROLLO}/neondb`,
    NEON_ENDPOINT_ESPERADO: DESARROLLO,
    NEON_ENDPOINT_PRODUCCION: PRODUCCION,
    NEON_RAMA_ESPERADA: "envios-tarifas-dev",
  } as unknown as NodeJS.ProcessEnv;

  await assert.rejects(
    () =>
      ejecutarMigrador({
        client: espia.cliente as unknown as Parameters<typeof ejecutarMigrador>[0]["client"],
        migrations: ["001_inicial.sql", "002_segunda.sql"],
        leerSql: (f: string) => `/* migración ${f} */`,
        modo: "simular",
        entorno,
      }),
    /Fallo simulado en 002_segunda.sql/,
  );

  const rollbacks = espia.sentencias.filter((s) => s.texto.toLowerCase() === "rollback");
  assert.ok(rollbacks.length >= 1, "debe haberse ejecutado rollback tras el fallo");
  const ultimo = espia.sentencias[espia.sentencias.length - 1];
  assert.equal(ultimo.texto.toLowerCase(), "rollback", "el último comando debe ser rollback");
});

test("el modo normal sin --aplicar-produccion nunca puede escribir en Producción", async () => {
  const espia = crearClienteEspia();
  const entorno = {
    DATABASE_URL: `postgresql://u:p@${PRODUCCION}/neondb`,
    NEON_ENDPOINT_ESPERADO: DESARROLLO,
    NEON_ENDPOINT_PRODUCCION: PRODUCCION,
    NEON_RAMA_ESPERADA: "envios-tarifas-dev",
  } as unknown as NodeJS.ProcessEnv;

  await assert.rejects(
    () =>
      ejecutarMigrador({
        client: espia.cliente as unknown as Parameters<typeof ejecutarMigrador>[0]["client"],
        migrations: ["001_inicial.sql"],
        leerSql: () => "-- sql",
        modo: "aplicar",
        entorno,
      }),
    /endpoint/i,
  );
});

test("aplicar en Producción exige simultáneamente endpoint, bandera y confirmación literal", async () => {
  const espia = crearClienteEspia();
  const entornoValido = {
    DATABASE_URL: `postgresql://u:p@${PRODUCCION}/neondb`,
    NEON_ENDPOINT_PRODUCCION: PRODUCCION,
    PERMITIR_ESCRITURA_PRODUCCION: "true",
    CONFIRMAR_PRODUCCION: CONFIRMACION_MIGRAR_PRODUCCION,
  } as unknown as NodeJS.ProcessEnv;

  const res = await ejecutarMigrador({
    client: espia.cliente as unknown as Parameters<typeof ejecutarMigrador>[0]["client"],
    migrations: ["001_inicial.sql"],
    leerSql: () => "-- sql",
    modo: "aplicar-produccion",
    entorno: entornoValido,
  });

  assert.equal(res.ok, true);
  assert.equal(res.destino, "produccion");
});

test("aplicar en Producción falla si se rompe el endpoint (se conecta a desarrollo)", async () => {
  const espia = crearClienteEspia();
  const entorno = {
    DATABASE_URL: `postgresql://u:p@${DESARROLLO}/neondb`,
    NEON_ENDPOINT_PRODUCCION: PRODUCCION,
    PERMITIR_ESCRITURA_PRODUCCION: "true",
    CONFIRMAR_PRODUCCION: CONFIRMACION_MIGRAR_PRODUCCION,
  } as unknown as NodeJS.ProcessEnv;

  await assert.rejects(
    () =>
      ejecutarMigrador({
        client: espia.cliente as unknown as Parameters<typeof ejecutarMigrador>[0]["client"],
        migrations: ["001_inicial.sql"],
        leerSql: () => "-- sql",
        modo: "aplicar-produccion",
        entorno,
      }),
    /no es el de Producción/i,
  );
});

test("aplicar en Producción falla si se rompe la bandera explícita", async () => {
  const espia = crearClienteEspia();
  for (const bandera of [undefined, "", "false", "1", "True"]) {
    const entorno = {
      DATABASE_URL: `postgresql://u:p@${PRODUCCION}/neondb`,
      NEON_ENDPOINT_PRODUCCION: PRODUCCION,
      PERMITIR_ESCRITURA_PRODUCCION: bandera,
      CONFIRMAR_PRODUCCION: CONFIRMACION_MIGRAR_PRODUCCION,
    } as unknown as NodeJS.ProcessEnv;

    await assert.rejects(
      () =>
        ejecutarMigrador({
          client: espia.cliente as unknown as Parameters<typeof ejecutarMigrador>[0]["client"],
          migrations: ["001_inicial.sql"],
          leerSql: () => "-- sql",
          modo: "aplicar-produccion",
          entorno,
        }),
      /bandera explícita/i,
    );
  }
});

test("aplicar en Producción falla si se rompe la confirmación literal", async () => {
  const espia = crearClienteEspia();
  for (const confirmacion of [undefined, "", "si", "migrar", "MIGRAR-EN-PRODUCCION"]) {
    const entorno = {
      DATABASE_URL: `postgresql://u:p@${PRODUCCION}/neondb`,
      NEON_ENDPOINT_PRODUCCION: PRODUCCION,
      PERMITIR_ESCRITURA_PRODUCCION: "true",
      CONFIRMAR_PRODUCCION: confirmacion,
    } as unknown as NodeJS.ProcessEnv;

    await assert.rejects(
      () =>
        ejecutarMigrador({
          client: espia.cliente as unknown as Parameters<typeof ejecutarMigrador>[0]["client"],
          migrations: ["001_inicial.sql"],
          leerSql: () => "-- sql",
          modo: "aplicar-produccion",
          entorno,
        }),
      /confirmación literal/i,
    );
  }
});
