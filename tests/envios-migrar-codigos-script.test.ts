import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  decidirModoDirecciones,
  procesarMigracionDirecciones,
  CONFIRMACION_DIRECCIONES_PRODUCCION,
} from "../scripts/migrar-codigos-direcciones.mjs";

const DESARROLLO = "ep-test-branch-12345.c-11.us-east-1.aws.neon.tech";
const PRODUCCION = "ep-misty-sun-avmcbgly.c-11.us-east-1.aws.neon.tech";

const catalogoFicticio = {
  departamentos: [
    { codigo: "01", nombre: "Guatemala" },
    { codigo: "03", nombre: "Chimaltenango" },
  ],
  municipios: [
    { codigo: "0101", departamento: "01", nombre: "Guatemala" },
    { codigo: "0108", departamento: "01", nombre: "Mixco" },
    { codigo: "0301", departamento: "03", nombre: "Chimaltenango" },
  ],
};

type FilaDireccionMock = {
  id: number;
  departamento: string;
  municipio: string;
  destinatario?: string;
  telefono?: string;
};

type SentenciaMock = { sql: string; params: unknown[] };

function crearClienteMock({ filas = [] }: { filas?: FilaDireccionMock[] } = {}) {
  const sentencias: SentenciaMock[] = [];
  return {
    sentencias,
    async query(sql: string | { text?: string }, params: unknown[] = []) {
      const texto = typeof sql === "string" ? sql.trim() : (sql?.text ?? "");
      sentencias.push({ sql: texto, params });
      if (texto.includes("from user_addresses")) {
        return { rows: filas };
      }
      if (texto.includes("from app_settings")) {
        return { rows: [{ valor: "envios-tarifas-dev" }] };
      }
      return { rows: [] };
    },
  };
}

describe("scripts/migrar-codigos-direcciones.mjs", () => {
  it("decidirModoDirecciones es simular por defecto", () => {
    assert.equal(decidirModoDirecciones([]), "simular");
    assert.equal(decidirModoDirecciones(["--simular"]), "simular");
    assert.equal(decidirModoDirecciones(["--aplicar"]), "aplicar");
    assert.equal(decidirModoDirecciones(["--aplicar-produccion"]), "aplicar-produccion");
  });

  it("en modo simulación ejecuta BEGIN y termina incondicionalmente en ROLLBACK", async () => {
    const filas: FilaDireccionMock[] = [
      { id: 1, departamento: "Guatemala", municipio: "Mixco" },
      { id: 2, departamento: "Guatemala", municipio: "Desconocido" },
    ];
    const cliente = crearClienteMock({ filas });
    const logs: string[] = [];

    const resultado = await procesarMigracionDirecciones({
      cliente: cliente as unknown as Parameters<typeof procesarMigracionDirecciones>[0]["cliente"],
      catalogo: catalogoFicticio as unknown as Parameters<typeof procesarMigracionDirecciones>[0]["catalogo"],
      modo: "simular",
      entorno: {
        DATABASE_URL: `postgres://user:pass@${DESARROLLO}/neondb`,
        NEON_ENDPOINT_PRODUCCION: PRODUCCION,
      } as unknown as NodeJS.ProcessEnv,
      onLog: (m: string) => {
        logs.push(m);
      },
    });

    assert.equal(resultado.totalPendientes, 2);
    assert.equal(resultado.emparejadas, 1);
    assert.equal(resultado.noEmparejadas, 1);
    assert.equal(resultado.simular, true);

    const sqls = cliente.sentencias.map((s) => s.sql.toLowerCase());
    assert.ok(sqls[0].startsWith("begin"));
    assert.equal(sqls[sqls.length - 1], "rollback");
    assert.ok(!sqls.includes("commit"));
  });

  it("en modo --aplicar en desarrollo ejecuta BEGIN y termina en COMMIT", async () => {
    const filas: FilaDireccionMock[] = [
      { id: 10, departamento: "Guatemala", municipio: "Mixco" },
    ];
    const cliente = crearClienteMock({ filas });

    const resultado = await procesarMigracionDirecciones({
      cliente: cliente as unknown as Parameters<typeof procesarMigracionDirecciones>[0]["cliente"],
      catalogo: catalogoFicticio as unknown as Parameters<typeof procesarMigracionDirecciones>[0]["catalogo"],
      modo: "aplicar",
      entorno: {
        DATABASE_URL: `postgres://user:pass@${DESARROLLO}/neondb`,
        NEON_ENDPOINT_ESPERADO: DESARROLLO,
        NEON_ENDPOINT_PRODUCCION: PRODUCCION,
        NEON_RAMA_ESPERADA: "envios-tarifas-dev",
      } as unknown as NodeJS.ProcessEnv,
    });

    assert.equal(resultado.emparejadas, 1);
    const sqls = cliente.sentencias.map((s) => s.sql.toLowerCase());
    assert.ok(sqls.includes("begin"));
    assert.ok(sqls.includes("commit"));
    assert.ok(!sqls.includes("rollback"));
  });

  it("en modo --aplicar rechaza Producción con error explicativo", async () => {
    const cliente = crearClienteMock();

    await assert.rejects(
      async () => {
        await procesarMigracionDirecciones({
          cliente: cliente as unknown as Parameters<typeof procesarMigracionDirecciones>[0]["cliente"],
          catalogo: catalogoFicticio as unknown as Parameters<typeof procesarMigracionDirecciones>[0]["catalogo"],
          modo: "aplicar",
          entorno: {
            DATABASE_URL: `postgres://user:pass@${PRODUCCION}/neondb`,
            NEON_ENDPOINT_ESPERADO: PRODUCCION,
            NEON_ENDPOINT_PRODUCCION: PRODUCCION,
            NEON_RAMA_ESPERADA: "envios-tarifas-dev",
          } as unknown as NodeJS.ProcessEnv,
        });
      },
      /producción/i,
    );
  });

  it("en modo --aplicar-produccion exige simultáneamente las tres llaves de seguridad", async () => {
    const cliente = crearClienteMock();

    // 1. Falta bandera
    await assert.rejects(
      async () => {
        await procesarMigracionDirecciones({
          cliente: cliente as unknown as Parameters<typeof procesarMigracionDirecciones>[0]["cliente"],
          catalogo: catalogoFicticio as unknown as Parameters<typeof procesarMigracionDirecciones>[0]["catalogo"],
          modo: "aplicar-produccion",
          entorno: {
            DATABASE_URL: `postgres://user:pass@${PRODUCCION}/neondb`,
            NEON_ENDPOINT_PRODUCCION: PRODUCCION,
            CONFIRMAR_PRODUCCION: CONFIRMACION_DIRECCIONES_PRODUCCION,
          } as unknown as NodeJS.ProcessEnv,
        });
      },
      /bandera explícita/i,
    );

    // 2. Falta confirmación literal
    await assert.rejects(
      async () => {
        await procesarMigracionDirecciones({
          cliente: cliente as unknown as Parameters<typeof procesarMigracionDirecciones>[0]["cliente"],
          catalogo: catalogoFicticio as unknown as Parameters<typeof procesarMigracionDirecciones>[0]["catalogo"],
          modo: "aplicar-produccion",
          entorno: {
            DATABASE_URL: `postgres://user:pass@${PRODUCCION}/neondb`,
            NEON_ENDPOINT_PRODUCCION: PRODUCCION,
            PERMITIR_ESCRITURA_PRODUCCION: "true",
            CONFIRMAR_PRODUCCION: "otra-cosa",
          } as unknown as NodeJS.ProcessEnv,
        });
      },
      /confirmación literal/i,
    );

    // 3. Con las tres llaves correctas procede con COMMIT
    const clienteProd = crearClienteMock({ filas: [{ id: 5, departamento: "Guatemala", municipio: "Mixco" }] });
    const res = await procesarMigracionDirecciones({
      cliente: clienteProd as unknown as Parameters<typeof procesarMigracionDirecciones>[0]["cliente"],
      catalogo: catalogoFicticio as unknown as Parameters<typeof procesarMigracionDirecciones>[0]["catalogo"],
      modo: "aplicar-produccion",
      entorno: {
        DATABASE_URL: `postgres://user:pass@${PRODUCCION}/neondb`,
        NEON_ENDPOINT_PRODUCCION: PRODUCCION,
        PERMITIR_ESCRITURA_PRODUCCION: "true",
        CONFIRMAR_PRODUCCION: CONFIRMACION_DIRECCIONES_PRODUCCION,
      } as unknown as NodeJS.ProcessEnv,
    });

    assert.equal(res.emparejadas, 1);
    const sqls = clienteProd.sentencias.map((s) => s.sql.toLowerCase());
    assert.ok(sqls.includes("commit"));
  });

  it("privacidad: los registros informados no contienen identificadores ni datos personales", async () => {
    const filas: FilaDireccionMock[] = [
      { id: 999, departamento: "Guatemala", municipio: "Mixco", destinatario: "Juan Pérez", telefono: "55551234" },
    ];
    const cliente = crearClienteMock({ filas });
    const logs: string[] = [];

    await procesarMigracionDirecciones({
      cliente: cliente as unknown as Parameters<typeof procesarMigracionDirecciones>[0]["cliente"],
      catalogo: catalogoFicticio as unknown as Parameters<typeof procesarMigracionDirecciones>[0]["catalogo"],
      modo: "simular",
      entorno: {
        DATABASE_URL: `postgres://user:pass@${DESARROLLO}/neondb`,
        NEON_ENDPOINT_PRODUCCION: PRODUCCION,
      } as unknown as NodeJS.ProcessEnv,
      onLog: (m: string) => {
        logs.push(m);
      },
    });

    const textoLogs = logs.join("\n");
    assert.ok(!textoLogs.includes("999"), "No debe imprimir id de fila");
    assert.ok(!textoLogs.includes("Juan Pérez"), "No debe imprimir destinatario");
    assert.ok(!textoLogs.includes("55551234"), "No debe imprimir teléfono");
    assert.ok(textoLogs.includes("pendientes"), "Debe mencionar direcciones pendientes");
    assert.ok(textoLogs.includes("1"), "Debe incluir el conteo");
  });

  it("invariante de actualización: solo actualiza departamento_codigo y municipio_codigo", async () => {
    const filas: FilaDireccionMock[] = [{ id: 7, departamento: "Guatemala", municipio: "Mixco" }];
    const cliente = crearClienteMock({ filas });

    await procesarMigracionDirecciones({
      cliente: cliente as unknown as Parameters<typeof procesarMigracionDirecciones>[0]["cliente"],
      catalogo: catalogoFicticio as unknown as Parameters<typeof procesarMigracionDirecciones>[0]["catalogo"],
      modo: "aplicar",
      entorno: {
        DATABASE_URL: `postgres://user:pass@${DESARROLLO}/neondb`,
        NEON_ENDPOINT_ESPERADO: DESARROLLO,
        NEON_ENDPOINT_PRODUCCION: PRODUCCION,
        NEON_RAMA_ESPERADA: "envios-tarifas-dev",
      } as unknown as NodeJS.ProcessEnv,
    });

    const updateQuery = cliente.sentencias.find((s) => s.sql.toLowerCase().startsWith("update user_addresses"));
    assert.ok(updateQuery, "Debe existir consulta UPDATE");
    assert.match(
      updateQuery.sql,
      /set\s+departamento_codigo\s*=\s*\$1,\s*municipio_codigo\s*=\s*\$2\s+where\s+id\s*=\s*\$3/i,
      "No debe modificar los textos de departamento ni municipio",
    );
    assert.deepEqual(updateQuery.params, ["01", "0108", 7]);
  });
});
