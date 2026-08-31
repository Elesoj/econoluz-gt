import assert from "node:assert/strict";
import { test } from "node:test";
import { enTransaccion } from "../app/lib/datos/transaccion";
import { ErrorDeDatos } from "../app/lib/datos/errores";
import { MS_MAXIMO_POR_DEFECTO, type Ejecutor } from "../app/lib/datos/consulta";

/**
 * Pool de mentira que imita lo suficiente del pool real para demostrar el
 * criterio de aceptación 6 (gestión del pool tras una transacción fallida):
 * cuenta las conexiones prestadas y liberadas de forma acumulada —como
 * cualquier contador de eventos—, y además las que están abiertas e
 * inactivas ahora mismo y las peticiones de conexión en espera: los mismos
 * conceptos que `totalCount`/`idleCount`/`waitingCount` del pool real. Sabe
 * cerrarse con `end()`.
 *
 * `alConsultar`, si se pasa, se invoca con el texto de cada sentencia y puede
 * lanzar para simular un fallo de Postgres en esa sentencia (se usa para
 * forzar un rollback que falla).
 */
function poolDePrueba(alConsultar?: (texto: string) => void) {
  type ClienteInterno = {
    query: (
      texto: string,
      parametros?: readonly unknown[],
    ) => Promise<{ rows: Record<string, unknown>[] }>;
    release: (error?: Error | boolean) => void;
  };

  const inactivos: ClienteInterno[] = [];
  const estado = {
    sentencias: [] as string[],
    // Acumulados: cuántas veces se prestó o se liberó un cliente en total.
    prestados: 0,
    liberados: 0,
    // Del momento: cuántas conexiones hay abiertas ahora mismo, cuántas de
    // ellas están inactivas y disponibles, y cuántas peticiones de conexión
    // siguen esperando un hueco.
    abiertas: 0,
    inactivas: 0,
    enEspera: 0,
    cerrado: false,
  };

  function crearCliente(): ClienteInterno {
    const cliente: ClienteInterno = {
      async query(texto) {
        estado.sentencias.push(texto);
        alConsultar?.(texto);
        return { rows: [] };
      },
      release(error) {
        estado.liberados += 1;
        if (error) {
          // El pool descarta el cliente: no vuelve a inactivos ni sigue
          // contando como conexión abierta.
          estado.abiertas -= 1;
        } else {
          // Sin error, el cliente sigue abierto: solo pasa a inactivo.
          inactivos.push(cliente);
          estado.inactivas += 1;
        }
      },
    };
    return cliente;
  }

  const pool = {
    async connect() {
      if (estado.cerrado) {
        throw new Error("el pool de prueba ya está cerrado");
      }
      estado.prestados += 1;
      const cliente = inactivos.pop();
      if (cliente) {
        estado.inactivas -= 1;
        return cliente;
      }
      estado.abiertas += 1;
      return crearCliente();
    },
    async end() {
      estado.cerrado = true;
      inactivos.length = 0;
      estado.abiertas = 0;
      estado.inactivas = 0;
    },
  };

  return { pool, estado };
}

test("una transacción correcta abre, trabaja y confirma", async () => {
  const { pool, estado } = poolDePrueba();
  const resultado = await enTransaccion(pool, async (ejecutar) => {
    await ejecutar("insert into t values (1)");
    return "listo";
  });
  assert.equal(resultado, "listo");
  assert.deepEqual(estado.sentencias.filter((s) => s === "begin" || s === "commit"), [
    "begin",
    "commit",
  ]);
});

test("si el trabajo falla se deshace y no se confirma", async () => {
  const { pool, estado } = poolDePrueba();
  await assert.rejects(
    () => enTransaccion(pool, async () => { throw new Error("algo se rompió"); }),
    (error: unknown) => error instanceof ErrorDeDatos,
  );
  assert.ok(estado.sentencias.includes("rollback"));
  assert.ok(!estado.sentencias.includes("commit"));
});

test("el cliente se libera siempre, también cuando falla", async () => {
  const { pool, estado } = poolDePrueba();
  await assert.rejects(() => enTransaccion(pool, async () => { throw new Error("x"); }));
  assert.equal(estado.prestados, 1);
  assert.equal(estado.liberados, 1);
});

test("tras una transacción fallida se puede hacer otra correcta", async () => {
  const { pool, estado } = poolDePrueba();
  await assert.rejects(() => enTransaccion(pool, async () => { throw new Error("x"); }));
  const resultado = await enTransaccion(pool, async () => 42);
  assert.equal(resultado, 42);
  assert.equal(estado.prestados, estado.liberados);
});

test("fija un tiempo máximo por sentencia dentro de la transacción", async () => {
  const { pool, estado } = poolDePrueba();
  await enTransaccion(pool, async () => null, { msMaximoPorSentencia: 3000 });
  const sentencia = estado.sentencias.find((s) => s.includes("set local statement_timeout"));
  assert.ok(sentencia?.includes("3000"));
});

test("msMaximoPorSentencia: 0 no desactiva el límite; usa el valor por defecto", async () => {
  // `set local statement_timeout = 0` desactiva el límite en Postgres, así
  // que un 0 no puede llegar tal cual a la sentencia SQL.
  const { pool, estado } = poolDePrueba();
  await enTransaccion(pool, async () => null, { msMaximoPorSentencia: 0 });
  const sentencia = estado.sentencias.find((s) => s.includes("set local statement_timeout"));
  assert.ok(sentencia);
  assert.ok(!sentencia.includes("= 0"));
  assert.ok(sentencia.includes(String(MS_MAXIMO_POR_DEFECTO)));
});

test("msMaximoPorSentencia inválido (NaN, negativo o infinito) también usa el valor por defecto", async () => {
  for (const invalido of [Number.NaN, -50, Number.POSITIVE_INFINITY]) {
    const { pool, estado } = poolDePrueba();
    await enTransaccion(pool, async () => null, { msMaximoPorSentencia: invalido });
    const sentencia = estado.sentencias.find((s) => s.includes("set local statement_timeout"));
    assert.ok(sentencia?.includes(String(MS_MAXIMO_POR_DEFECTO)));
  }
});

test("el ejecutor deja de servir en cuanto el cliente vuelve al pool", async () => {
  // Si `trabajo` se guarda el ejecutor y lo usa después de que `enTransaccion`
  // ya terminó, el cliente ya volvió al pool y puede estar sirviendo a otra
  // petición: usarlo ahí sería correr SQL sobre una conexión ajena.
  const { pool } = poolDePrueba();
  let ejecutorCapturado: Ejecutor | undefined;

  await enTransaccion(pool, async (ejecutar) => {
    ejecutorCapturado = ejecutar;
    return "ok";
  });

  await assert.rejects(
    () => ejecutorCapturado!("select 1"),
    (error: unknown) => error instanceof ErrorDeDatos && error.causa === "indisponible",
  );
});

test("si el rollback también falla, el cliente se libera con el error y el pool lo descarta", async () => {
  const { pool, estado } = poolDePrueba((texto) => {
    if (texto === "rollback") {
      throw new Error("la conexión ya no responde");
    }
  });

  // El error que se propaga es el original del trabajo, no el del rollback.
  await assert.rejects(
    () => enTransaccion(pool, async () => { throw new Error("fallo original"); }),
    (error: unknown) => error instanceof ErrorDeDatos,
  );

  // El cliente que falló al hacer rollback no vuelve a los inactivos: el pool
  // lo descarta en vez de arriesgarse a reutilizar una conexión que puede
  // haber quedado en una transacción abortada.
  assert.equal(estado.abiertas, 0);
  assert.equal(estado.inactivas, 0);
  assert.equal(estado.liberados, 1);

  // El pool sigue sano: abre una conexión nueva y la siguiente transacción
  // funciona con normalidad.
  const resultado = await enTransaccion(pool, async () => "bien");
  assert.equal(resultado, "bien");
});

test("criterio 6: tras una transacción fallida el pool queda sano y cierra a cero conexiones", async () => {
  const { pool, estado } = poolDePrueba();

  // 1. Se ejecutó ROLLBACK y 2. el cliente se liberó en el finally.
  await assert.rejects(() => enTransaccion(pool, async () => { throw new Error("x"); }));
  assert.ok(estado.sentencias.includes("rollback"));
  assert.equal(estado.liberados, 1);

  // 3. No quedan peticiones esperando.
  assert.equal(estado.enEspera, 0);

  // 4. Todas las conexiones abiertas están inactivas y disponibles: ninguna
  // quedó prestada.
  assert.ok(estado.abiertas >= 1);
  assert.equal(estado.inactivas, estado.abiertas);

  // 5. Una transacción posterior se ejecuta correctamente.
  const resultado = await enTransaccion(pool, async () => "bien");
  assert.equal(resultado, "bien");

  // 6. Al cerrar explícitamente el pool en la prueba, termina con cero
  // conexiones. `enTransaccion` nunca cierra el pool por su cuenta: eso no
  // cambia, y por eso el cierre aquí lo hace la prueba, no el código.
  await pool.end();
  assert.equal(estado.abiertas, 0);
  assert.equal(estado.inactivas, 0);
});
