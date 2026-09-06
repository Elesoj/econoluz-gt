// tests/envios-verificar-script.test.ts
//
// El verificador de invariantes habla con una base de datos real, así que aquí se
// prueba con un cliente simulado: lo que se comprueba es su lógica de decisión
// —a qué base se deja conectar, qué hace cuando las tablas de 9A no están, y que
// el ROLLBACK ocurre pase lo que pase—, no el comportamiento de PostgreSQL.
import test from "node:test";
import assert from "node:assert/strict";
import {
  TABLAS_9A,
  clasificarEstadoTablas9A,
  contarTablasConfiguracion,
  decidirDestinoVerificacion,
  ejecutarVerificaciones,
  obtenerTablasExistentes9A,
  validarDestinoVerificacion,
  verificarPreflightTablas9A,
} from "../scripts/verificar-envios.mjs";

const PRODUCCION = "ep-misty-sun-avmcbgly.c-11.us-east-1.aws.neon.tech";
const DESARROLLO = "ep-crimson-bonus-av5c0mvh.c-11.us-east-1.aws.neon.tech";

test("decidirDestinoVerificacion distingue --produccion de ejecucion normal", () => {
  assert.equal(decidirDestinoVerificacion([]), "desarrollo");
  assert.equal(decidirDestinoVerificacion(["--contar"]), "desarrollo");
  assert.equal(decidirDestinoVerificacion(["--produccion"]), "produccion");
  assert.equal(decidirDestinoVerificacion(["--produccion", "--contar"]), "produccion");
});

test("validarDestinoVerificacion rechaza Producción sin bandera --produccion", () => {
  const res = validarDestinoVerificacion({
    destino: "desarrollo",
    host: PRODUCCION,
    hostProduccion: PRODUCCION,
  });
  assert.equal(res.ok, false);
  assert.match(res.motivo ?? "", /requiere la bandera explícita --produccion/i);
});

test("validarDestinoVerificacion con --produccion rechaza si el host conectado no es Producción", () => {
  const res = validarDestinoVerificacion({
    destino: "produccion",
    host: DESARROLLO,
    hostProduccion: PRODUCCION,
  });
  assert.equal(res.ok, false);
  assert.match(res.motivo ?? "", /no es el de Producción/i);
});

test("validarDestinoVerificacion con --produccion rechaza si falta hostProduccion", () => {
  const res = validarDestinoVerificacion({
    destino: "produccion",
    host: PRODUCCION,
    hostProduccion: "",
  });
  assert.equal(res.ok, false);
  assert.match(res.motivo ?? "", /NEON_ENDPOINT_PRODUCCION/i);
});

test("validarDestinoVerificacion acepta Producción con --produccion cuando coincide exactamente", () => {
  const res = validarDestinoVerificacion({
    destino: "produccion",
    host: PRODUCCION,
    hostProduccion: PRODUCCION,
  });
  assert.equal(res.ok, true);
});

test("validarDestinoVerificacion acepta pooler de Producción con --produccion", () => {
  // El sufijo -pooler solo indica el modo de conexión: no convierte Producción en
  // otra base, y por eso el endpoint canónico lo ignora.
  const poolerHost = PRODUCCION.replace("ep-misty-sun-avmcbgly", "ep-misty-sun-avmcbgly-pooler");
  const res = validarDestinoVerificacion({
    destino: "produccion",
    host: poolerHost,
    hostProduccion: PRODUCCION,
  });
  assert.equal(res.ok, true);
});

test("validarDestinoVerificacion rechaza el pooler de Producción sin la bandera", () => {
  const poolerHost = PRODUCCION.replace("ep-misty-sun-avmcbgly", "ep-misty-sun-avmcbgly-pooler");
  const res = validarDestinoVerificacion({
    destino: "desarrollo",
    host: poolerHost,
    hostProduccion: PRODUCCION,
  });
  assert.equal(res.ok, false);
});

test("clasificarEstadoTablas9A identifica los tres estados: todas, ninguna y presencia parcial", () => {
  const todas = clasificarEstadoTablas9A(TABLAS_9A);
  assert.equal(todas.estado, "todas");
  assert.equal(todas.encontradas.length, 3);
  assert.equal(todas.faltantes.length, 0);

  const ninguna = clasificarEstadoTablas9A([]);
  assert.equal(ninguna.estado, "ninguna");
  assert.equal(ninguna.encontradas.length, 0);
  assert.equal(ninguna.faltantes.length, 3);

  const parcial1 = clasificarEstadoTablas9A(["shipping_zones"]);
  assert.equal(parcial1.estado, "parcial");
  assert.deepEqual(parcial1.encontradas, ["shipping_zones"]);
  assert.deepEqual(parcial1.faltantes, ["shipping_zone_areas", "shipping_rates"]);

  const parcial2 = clasificarEstadoTablas9A(["shipping_zones", "shipping_rates"]);
  assert.equal(parcial2.estado, "parcial");
  assert.deepEqual(parcial2.faltantes, ["shipping_zone_areas"]);
});

test("verificarPreflightTablas9A acepta datos históricos en las tablas de 9A", () => {
  // La especificación manda conservarlas intactas «para recuperación y auditoría
  // histórica». Rechazar la base por tener filas convertiría ese archivo en un
  // motivo de fallo, y además impediría llegar a las comprobaciones 17 y 18.
  const vacias = { shipping_zones: 0, shipping_zone_areas: 0, shipping_rates: 0 };
  assert.equal(verificarPreflightTablas9A(vacias).ok, true);
  assert.equal(verificarPreflightTablas9A(vacias).hayHistorico, false);

  const conFilas = { shipping_zones: 3, shipping_zone_areas: 5, shipping_rates: 2 };
  const res = verificarPreflightTablas9A(conFilas);
  assert.equal(res.ok, true, "tener datos históricos no puede rechazar la base");
  assert.equal(res.hayHistorico, true);
  assert.equal(res.total, 10);
});

type ConsultaSql = (sql: string, parametros?: readonly unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;

/**
 * Cliente simulado que responde a las consultas de las comprobaciones 17 y 18.
 * Las inserciones que deben ser rechazadas por las restricciones de la migración
 * 015 se reconocen por el destinatario que llevan escrito.
 */
function clienteSimulado(opciones: {
  tablas9A?: string[];
  appSettings?: Record<string, unknown>[];
  admiteInsercionesInvalidas?: boolean;
  registro?: string[];
  alRollback?: () => void;
  /** Simula una base recién creada, sin ninguna fila en `users`. */
  sinUsuarios?: boolean;
  /** Columnas que `users` exige de verdad; un insert que las omita falla. */
  columnasObligatoriasUsers?: string[];
}): { query: ConsultaSql } {
  const {
    tablas9A = [],
    appSettings = [
      { clave: "envios_zonas_metodos", valor: "{}" },
      { clave: "envios_reglas_propias", valor: "{}" },
    ],
    admiteInsercionesInvalidas = false,
    registro = [],
    alRollback = () => {},
    sinUsuarios = false,
    columnasObligatoriasUsers = ["firebase_uid", "email"],
  } = opciones;

  return {
    async query(sql: string) {
      registro.push(sql);
      if (sql.includes("information_schema.tables")) {
        return { rows: tablas9A.map((t) => ({ table_name: t })) };
      }
      if (sql === "begin" || sql.startsWith("savepoint") || sql.startsWith("release savepoint")) {
        return { rows: [] };
      }
      if (sql.startsWith("rollback to savepoint")) {
        return { rows: [] };
      }
      if (sql === "rollback") {
        alRollback();
        return { rows: [] };
      }
      if (sql.includes("insert into users")) {
        // `users.firebase_uid` es `not null` en db/009: un insert que la omita
        // revienta con 23502, igual que en PostgreSQL.
        const faltan = columnasObligatoriasUsers.filter((c) => !sql.includes(c));
        if (faltan.length > 0) {
          const error = new Error(
            `null value in column "${faltan[0]}" violates not-null constraint`,
          ) as Error & { code?: string };
          error.code = "23502";
          throw error;
        }
        return { rows: [{ id: 77 }] };
      }
      if (sql.includes("from users")) {
        return { rows: sinUsuarios ? [] : [{ id: 42 }] };
      }
      if (sql.includes("insert into user_addresses")) {
        // Las dos que la migración 015 rechaza. La dirección capitalina sin zona
        // NO está aquí: la columna admite NULL a propósito, porque las
        // direcciones históricas no tienen zona.
        const debeFallar = sql.includes("Zona 20") || sql.includes("Mixco con zona");
        if (debeFallar && !admiteInsercionesInvalidas) {
          throw new Error("check constraint violation simulado");
        }
        return { rows: [{ id: 101 }] };
      }
      if (sql.includes("from app_settings")) {
        return { rows: appSettings };
      }
      return { rows: [] };
    },
  };
}

test("preflight con cliente simulado: estado ninguna solo consulta information_schema, no ejecuta conteos 9A y supera checks 17 y 18", async () => {
  const consultasEjecutadas: string[] = [];
  let rollbackEjecutado = false;

  const cliente = clienteSimulado({
    registro: consultasEjecutadas,
    alRollback: () => {
      rollbackEjecutado = true;
    },
  });

  const tablas = await obtenerTablasExistentes9A(cliente);
  assert.deepEqual(tablas, []);

  let aviso9A = false;
  let check17Ok = false;
  let check18Ok = false;

  await ejecutarVerificaciones(cliente, {
    debeContar: false,
    onBien: (msg: string) => {
      if (msg.includes("Aviso 9A: las tablas de 9A no existen")) aviso9A = true;
      if (msg.includes("17. Invariantes de zona_capitalina")) check17Ok = true;
      if (msg.includes("18. Configuración operativa")) check18Ok = true;
    },
  });

  assert.equal(aviso9A, true, "Debe emitir aviso informativo de que 9A no está migrada");
  assert.equal(check17Ok, true, "check17Ok === true: la comprobación 17 debe terminar con éxito");
  assert.equal(check18Ok, true, "check18Ok === true: la comprobación 18 debe terminar con éxito");

  const conteos9A = consultasEjecutadas.filter(
    (q) =>
      q.includes('from "shipping_zones"') ||
      q.includes('from "shipping_zone_areas"') ||
      q.includes('from "shipping_rates"'),
  );
  assert.equal(conteos9A.length, 0, "Cero SELECT count sobre tablas 9A");

  const consultasAppSettings = consultasEjecutadas.filter((q) => q.includes("from app_settings"));
  assert.ok(consultasAppSettings.length > 0, "Existencia de la consulta a app_settings");
  assert.equal(rollbackEjecutado, true, "ROLLBACK ejecutado");
});

test("preflight con cliente simulado: presencia parcial falla antes de consultar filas de tablas 9A", async () => {
  const consultasEjecutadas: string[] = [];
  const cliente = clienteSimulado({
    tablas9A: ["shipping_zones"],
    registro: consultasEjecutadas,
  });

  await assert.rejects(
    async () => {
      await ejecutarVerificaciones(cliente);
    },
    {
      message: /Instalación parcial incompleta del subproyecto 9A/i,
    },
  );

  const conteos9A = consultasEjecutadas.filter(
    (q) => q.includes("select count") || q.includes('from "shipping_zones"'),
  );
  assert.equal(conteos9A.length, 0, "No debe intentar contar ni consultar tablas ante presencia parcial");
});

test("preflight con cliente simulado: estado todas cuenta exclusivamente las 3 tablas canónicas", async () => {
  const tablasContadas: string[] = [];
  const cliente = {
    async query(sql: string) {
      if (sql.includes("information_schema.tables")) {
        return {
          rows: [
            { table_name: "shipping_zones" },
            { table_name: "shipping_zone_areas" },
            { table_name: "shipping_rates" },
          ],
        };
      }
      for (const t of TABLAS_9A) {
        if (sql.includes('from "' + t + '"')) {
          tablasContadas.push(t);
          return { rows: [{ total: 0 }] };
        }
      }
      return { rows: [] };
    },
  };

  const tablas = await obtenerTablasExistentes9A(cliente);
  assert.deepEqual([...tablas].sort(), [...TABLAS_9A].sort());

  const conteos = await contarTablasConfiguracion(cliente, tablas);
  assert.deepEqual(conteos, {
    shipping_zones: 0,
    shipping_zone_areas: 0,
    shipping_rates: 0,
  });
  assert.deepEqual([...tablasContadas].sort(), [...TABLAS_9A].sort());
});

test("caso negativo: si falta envios_reglas_propias en la comprobación 18, ejecutarVerificaciones rechaza y ejecuta ROLLBACK", async () => {
  let rollbackEjecutado = false;
  const fallosRegistrados: Array<{ nombre: string; detalle?: string }> = [];

  const cliente = clienteSimulado({
    appSettings: [{ clave: "envios_zonas_metodos", valor: "{}" }],
    alRollback: () => {
      rollbackEjecutado = true;
    },
  });

  await assert.rejects(
    async () => {
      await ejecutarVerificaciones(cliente, {
        onMal: (nombre: string, detalle?: string) => {
          fallosRegistrados.push({ nombre, detalle });
        },
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /se detectaron 1 fallos en comprobaciones/i);
      assert.match(err.message, /18\. Configuración operativa sembrada en app_settings/);
      return true;
    },
  );

  assert.equal(rollbackEjecutado, true, "El ROLLBACK debe ejecutarse siempre en el bloque finally");
  assert.equal(fallosRegistrados.length, 1);
  assert.equal(fallosRegistrados[0]?.nombre, "18. Configuración operativa sembrada en app_settings");
});

test("demostración de seguridad: una comprobación que invoque registrarMal provoca rechazo, nunca permite certificar éxito y ejecuta ROLLBACK", async () => {
  let rollbackEjecutado = false;
  // La base admite una inserción que debería rechazar: la comprobación 17 falla.
  const cliente = clienteSimulado({
    admiteInsercionesInvalidas: true,
    alRollback: () => {
      rollbackEjecutado = true;
    },
  });

  await assert.rejects(
    async () => {
      await ejecutarVerificaciones(cliente);
    },
    /se detectaron 1 fallos en comprobaciones/i,
  );

  assert.equal(rollbackEjecutado, true, "Garantiza ROLLBACK incluso ante fallo deliberado");
});

test("un fallo inesperado durante las comprobaciones se propaga sin ocultarse, y el ROLLBACK ocurre igual", async () => {
  let rollbackEjecutado = false;
  const cliente: { query: ConsultaSql } = {
    async query(sql: string) {
      if (sql.includes("information_schema.tables")) return { rows: [] };
      if (sql === "begin") return { rows: [] };
      if (sql === "rollback") {
        rollbackEjecutado = true;
        return { rows: [] };
      }
      throw new Error("la conexión se cayó a mitad");
    },
  };

  await assert.rejects(
    async () => {
      await ejecutarVerificaciones(cliente);
    },
    /la conexión se cayó a mitad/,
  );

  assert.equal(rollbackEjecutado, true);
});

test("la comprobación 17 funciona en una base recién creada, sin ninguna fila en users", async () => {
  // El respaldo que crea un usuario sintético es justo el que se usa en una base
  // nueva, que es donde más falta hace que el verificador funcione.
  let rollbackEjecutado = false;
  const consultas: string[] = [];
  const cliente = clienteSimulado({
    sinUsuarios: true,
    registro: consultas,
    alRollback: () => {
      rollbackEjecutado = true;
    },
  });

  let check17Ok = false;
  await ejecutarVerificaciones(cliente, {
    onBien: (msg: string) => {
      if (msg.includes("17. Invariantes de zona_capitalina")) check17Ok = true;
    },
  });

  assert.equal(check17Ok, true, "la 17 debe completarse aunque users esté vacía");
  assert.equal(rollbackEjecutado, true);

  const insertsUsers = consultas.filter((q) => q.includes("insert into users"));
  assert.equal(insertsUsers.length, 1, "debe crear exactamente un usuario sintético");
  assert.match(insertsUsers[0], /firebase_uid/, "y darle su firebase_uid, que es not null");
});

test("--contar no consulta las tablas de 9A cuando no existen", async () => {
  const consultas: string[] = [];
  const cliente = clienteSimulado({ registro: consultas });

  await ejecutarVerificaciones(cliente, { debeContar: true });

  const conteos9A = consultas.filter((q) =>
    TABLAS_9A.some((t) => q.includes('from "' + t + '"')),
  );
  assert.equal(
    conteos9A.length,
    0,
    "contar una tabla inexistente rompe la ejecución justo después de haber pasado todo",
  );
});

test("con las tres tablas de 9A llenas de datos históricos, la verificación se ejecuta entera y no los toca", async () => {
  // Una base con historia de 9A: 2 zonas, 2 coberturas y 1 tarifa que existían
  // antes de empezar. Al terminar tienen que seguir exactamente igual.
  const historico = {
    shipping_zones: 2,
    shipping_zone_areas: 2,
    shipping_rates: 1,
  };
  const consultas: string[] = [];
  let rollbackEjecutado = false;

  const cliente: { query: ConsultaSql } = {
    async query(sql: string) {
      consultas.push(sql);
      if (sql.includes("information_schema.tables")) {
        return { rows: TABLAS_9A.map((t) => ({ table_name: t })) };
      }
      for (const t of TABLAS_9A) {
        if (sql.includes('from "' + t + '"')) {
          return { rows: [{ total: historico[t as keyof typeof historico] }] };
        }
      }
      if (sql === "begin") return { rows: [] };
      if (sql === "rollback") {
        rollbackEjecutado = true;
        return { rows: [] };
      }
      if (sql.startsWith("savepoint") || sql.startsWith("release savepoint")) return { rows: [] };
      if (sql.startsWith("rollback to savepoint")) return { rows: [] };
      if (sql.includes("from users")) return { rows: [{ id: 42 }] };
      if (sql.includes("from app_settings")) {
        return {
          rows: [
            { clave: "envios_zonas_metodos", valor: "{}" },
            { clave: "envios_reglas_propias", valor: "{}" },
          ],
        };
      }
      return { rows: [] };
    },
  };

  let avisoHistorico = false;
  await ejecutarVerificaciones(cliente, {
    debeContar: true,
    onBien: (msg: string) => {
      if (/datos hist[oó]ricos/i.test(msg)) avisoHistorico = true;
    },
  }).catch(() => {
    // Un fallo de comprobación no invalida lo que aquí se mira; el doble no
    // simula PostgreSQL entero. Lo que importa es que no se borre nada.
  });

  assert.equal(avisoHistorico, true, "debe decir que hay datos históricos y que los respeta");
  assert.equal(rollbackEjecutado, true, "y terminar siempre en ROLLBACK");

  // Ni un borrado ni un truncado sobre las tablas históricas fuera de la transacción.
  const destructivas = consultas.filter(
    (q) => /^\s*(truncate|drop)/i.test(q) || /delete from shipping_(zones|zone_areas|rates)\s*$/i.test(q),
  );
  assert.deepEqual(destructivas, [], "nunca se borra ni se trunca el histórico");
});

test("los fixtures de la verificación llevan un sufijo único por ejecución", async () => {
  // Con datos históricos delante, un código fijo como 'test-zona-muni-1' choca con
  // el de una ejecución anterior que no llegó a revertirse, y el fallo se leería
  // como un invariante roto que no lo es.
  const codigos: string[] = [];
  const cliente: { query: ConsultaSql } = {
    async query(sql: string) {
      if (sql.includes("information_schema.tables")) {
        return { rows: TABLAS_9A.map((t) => ({ table_name: t })) };
      }
      for (const t of TABLAS_9A) {
        if (sql.includes('from "' + t + '"')) return { rows: [{ total: 0 }] };
      }
      const m = sql.match(/'(test-zona-[a-z0-9-]+)'/);
      if (m) codigos.push(m[1]);
      if (sql.includes("from users")) return { rows: [{ id: 42 }] };
      if (sql.includes("from app_settings")) {
        return {
          rows: [
            { clave: "envios_zonas_metodos", valor: "{}" },
            { clave: "envios_reglas_propias", valor: "{}" },
          ],
        };
      }
      return { rows: [] };
    },
  };

  await ejecutarVerificaciones(cliente).catch(() => {});

  assert.ok(codigos.length > 0, "la verificación crea zonas de prueba");

  // Todos tienen que acabar en el mismo sufijo de esta ejecución, y ese sufijo
  // tiene que ser lo bastante largo para no repetirse por casualidad.
  const sufijos = new Set(codigos.map((c) => c.split("-").at(-1) ?? ""));
  assert.equal(sufijos.size, 1, `esperaba un solo sufijo y hay ${sufijos.size}: ${[...sufijos].join(", ")}`);

  const sufijo = [...sufijos][0];
  assert.match(sufijo, /^[a-z0-9]{6,}$/, `el sufijo «${sufijo}» no identifica la ejecución`);
});
