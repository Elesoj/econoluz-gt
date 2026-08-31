import assert from "node:assert/strict";
import { test } from "node:test";
import { escribirConPool } from "../app/lib/datos/escritura";
import { ErrorDeDatos } from "../app/lib/datos/errores";
import type { PoolMinimo } from "../app/lib/datos/transaccion";

/**
 * Pool de mentira mínimo: lo justo para que `enTransaccion` funcione (BEGIN,
 * `set local statement_timeout`, la sentencia de `trabajo` y COMMIT/ROLLBACK).
 * No cuenta conexiones ni sentencias: eso ya lo cubre
 * `tests/datos-transaccion.test.ts`. Aquí el contrato que importa es el de
 * `escribirConPool` — registro, relanzado, valor devuelto y etiqueta—, así
 * que el pool solo tiene que dejar pasar cualquier sentencia sin fallar.
 */
function poolDeMentira(): PoolMinimo {
  return {
    async connect() {
      return {
        async query() {
          return { rows: [] };
        },
        release() {
          // No hace falta llevar la cuenta: nadie de esta suite lo comprueba.
        },
      };
    },
  };
}

/**
 * Sustituye `console.log` y `console.error` mientras dura la prueba y
 * devuelve las líneas capturadas en orden. Hay que restaurar siempre los
 * originales en un `finally`: si una prueba lanza antes de restaurar, deja
 * la sustitución puesta y contamina el resto de la suite.
 */
function capturarRegistro() {
  const lineas: string[] = [];
  const logOriginal = console.log;
  const errorOriginal = console.error;
  console.log = (linea: string) => {
    lineas.push(linea);
  };
  console.error = (linea: string) => {
    lineas.push(linea);
  };
  return {
    lineas,
    restaurar() {
      console.log = logOriginal;
      console.error = errorOriginal;
    },
  };
}

test("éxito: devuelve el valor de trabajo y registra una línea info con idPeticion", async () => {
  const captura = capturarRegistro();
  try {
    const resultado = await escribirConPool(poolDeMentira(), async () => "valor-de-prueba");
    assert.equal(resultado, "valor-de-prueba");

    assert.equal(captura.lineas.length, 1);
    const objeto = JSON.parse(captura.lineas[0]);
    assert.equal(objeto.nivel, "info");
    assert.equal(objeto.suceso, "transaccion");
    // 8 bytes en hexadecimal son 16 caracteres, que es lo que produce
    // `nuevoIdPeticion`.
    assert.match(objeto.idPeticion, /^[0-9a-f]{16}$/);
  } finally {
    captura.restaurar();
  }
});

test("dos llamadas seguidas producen idPeticion distintos", async () => {
  const captura = capturarRegistro();
  try {
    await escribirConPool(poolDeMentira(), async () => null);
    await escribirConPool(poolDeMentira(), async () => null);

    assert.equal(captura.lineas.length, 2);
    const [primero, segundo] = captura.lineas.map((linea) => JSON.parse(linea).idPeticion);
    assert.notEqual(primero, segundo);
  } finally {
    captura.restaurar();
  }
});

test("ErrorDeDatos: un fallo de Postgres con code 23505 registra causa conflicto y codigoSql, sin el mensaje original", async () => {
  const captura = capturarRegistro();
  const mensajeDePostgres = 'duplicate key value violates unique constraint "products_pkey"';
  const errorDePostgres = Object.assign(new Error(mensajeDePostgres), { code: "23505" });

  try {
    await assert.rejects(
      () =>
        escribirConPool(poolDeMentira(), async () => {
          throw errorDePostgres;
        }),
      (error: unknown) => {
        assert.ok(error instanceof ErrorDeDatos);
        assert.equal(error.causa, "conflicto");
        // Identidad, no igualdad estructural: debe ser el mismo error que
        // lanzó `trabajo`, sin envolturas intermedias.
        assert.equal(error.cause, errorDePostgres);
        return true;
      },
    );

    assert.equal(captura.lineas.length, 1);
    const linea = captura.lineas[0];
    // El mensaje original de Postgres no debe aparecer en ninguna parte de
    // la línea serializada, ni siquiera dentro de otro campo.
    assert.ok(!linea.includes(mensajeDePostgres));

    const objeto = JSON.parse(linea);
    assert.equal(objeto.nivel, "error");
    assert.equal(objeto.causa, "conflicto");
    assert.equal(objeto.codigoSql, "23505");
  } finally {
    captura.restaurar();
  }
});

test("error desconocido: un Error corriente sin code registra causa indisponible y no trae codigoSql", async () => {
  const captura = capturarRegistro();
  const errorOriginal = new Error("fallo sin code reconocible");

  try {
    await assert.rejects(
      () =>
        escribirConPool(poolDeMentira(), async () => {
          throw errorOriginal;
        }),
      (error: unknown) => {
        assert.ok(error instanceof ErrorDeDatos);
        assert.equal(error.causa, "indisponible");
        assert.equal(error.cause, errorOriginal);
        return true;
      },
    );

    const objeto = JSON.parse(captura.lineas[0]);
    assert.equal(objeto.causa, "indisponible");
    // No basta con que sea `undefined`: el campo no debe existir.
    assert.equal("codigoSql" in objeto, false);
  } finally {
    captura.restaurar();
  }
});

test("la etiqueta suceso personalizada se usa en éxito y por defecto es transaccion", async () => {
  const captura = capturarRegistro();
  try {
    await escribirConPool(poolDeMentira(), async () => null, { suceso: "proyectar-producto" });
    await escribirConPool(poolDeMentira(), async () => null);

    const [conEtiqueta, sinEtiqueta] = captura.lineas.map((linea) => JSON.parse(linea).suceso);
    assert.equal(conEtiqueta, "proyectar-producto");
    assert.equal(sinEtiqueta, "transaccion");
  } finally {
    captura.restaurar();
  }
});

test("la etiqueta suceso personalizada se usa en fallo y por defecto es transaccion", async () => {
  const captura = capturarRegistro();
  try {
    await assert.rejects(() =>
      escribirConPool(
        poolDeMentira(),
        async () => {
          throw new Error("x");
        },
        { suceso: "proyectar-producto" },
      ),
    );
    await assert.rejects(() =>
      escribirConPool(poolDeMentira(), async () => {
        throw new Error("x");
      }),
    );

    const [conEtiqueta, sinEtiqueta] = captura.lineas.map((linea) => JSON.parse(linea).suceso);
    assert.equal(conEtiqueta, "proyectar-producto");
    assert.equal(sinEtiqueta, "transaccion");
  } finally {
    captura.restaurar();
  }
});

test("relanzado: en éxito y en fallo el campo ms es un número finito y no negativo", async () => {
  const captura = capturarRegistro();
  try {
    await escribirConPool(poolDeMentira(), async () => null);
    await assert.rejects(() =>
      escribirConPool(poolDeMentira(), async () => {
        throw new Error("x");
      }),
    );

    for (const linea of captura.lineas) {
      const objeto = JSON.parse(linea);
      assert.equal(typeof objeto.ms, "number");
      assert.ok(Number.isFinite(objeto.ms));
      assert.ok(objeto.ms >= 0);
    }
  } finally {
    captura.restaurar();
  }
});
