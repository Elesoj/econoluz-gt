import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SQL_APROVISIONAR,
  SQL_BLOQUEAR_APROVISIONAMIENTO,
  interpretarAprovisionamiento,
  parametrosDeAprovisionamiento,
} from "../app/identidad/aprovisionamiento";

const IDENTIDAD = {
  uid: "uid-de-firebase",
  email: "  Persona@Example.COM ",
  emailVerificado: true,
  nombre: "Quien Compra",
  proveedor: "google.com",
};

test("el correo llega normalizado a la base, o la restricción lo rechazaría", () => {
  assert.deepEqual(parametrosDeAprovisionamiento(IDENTIDAD), [
    "uid-de-firebase",
    "persona@example.com",
    true,
    "Quien Compra",
  ]);
});

test("la sentencia resuelve el conflicto por firebase_uid y no por correo", () => {
  assert.match(SQL_APROVISIONAR, /on conflict \(firebase_uid\)/);
  assert.equal(SQL_APROVISIONAR.includes("on conflict (email)"), false);
});

test("dos aprovisionamientos del mismo uid se serializan dentro de la transacción", () => {
  assert.match(SQL_BLOQUEAR_APROVISIONAMIENTO, /pg_advisory_xact_lock/);
  assert.match(SQL_BLOQUEAR_APROVISIONAMIENTO, /\$1/);
});

test("la sentencia no pisa datos que el cliente edita en su perfil", () => {
  for (const columna of ["telefono", "nit", "nombre_fiscal"]) {
    assert.equal(
      new RegExp(`set[\\s\\S]*${columna}\\s*=`).test(SQL_APROVISIONAR),
      false,
      `El upsert no debe tocar ${columna}`,
    );
  }
});

test("una fila recién creada se distingue de una que ya existía", () => {
  assert.deepEqual(interpretarAprovisionamiento([{ id: "7", recien_creada: true }]), {
    id: "7",
    recienCreada: true,
  });
  assert.deepEqual(interpretarAprovisionamiento([{ id: "7", recien_creada: false }]), {
    id: "7",
    recienCreada: false,
  });
});

test("un identificador numérico se devuelve como texto, sin perder precisión", () => {
  assert.equal(
    // Neon entrega `bigserial` como texto; convertirlo antes a `Number`
    // perdería el último dígito al superar el entero seguro de JavaScript.
    interpretarAprovisionamiento([{ id: "9007199254740993", recien_creada: true }]).id,
    "9007199254740993",
  );
});

test("una respuesta vacía es un error, no un usuario a medias", () => {
  assert.throws(() => interpretarAprovisionamiento([]), /aprovisionar/i);
});
