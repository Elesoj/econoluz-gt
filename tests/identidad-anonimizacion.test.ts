import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SQL_ANONIMIZAR_USUARIO,
  SQL_BORRAR_DIRECCIONES,
  SQL_DESLIGAR_EVENTOS,
  correoAnonimo,
  uidAnonimo,
} from "../app/identidad/anonimizacion";

test("el correo anónimo no puede recibir correo de verdad", () => {
  assert.equal(correoAnonimo("7"), "borrado+7@invalid");
  assert.match(correoAnonimo("7"), /@invalid$/);
});

test("dos cuentas borradas no chocan entre sí", () => {
  assert.notEqual(correoAnonimo("7"), correoAnonimo("8"));
  assert.notEqual(uidAnonimo("7"), uidAnonimo("8"));
});

test("el identificador anónimo no se parece a un uid de Firebase", () => {
  assert.equal(uidAnonimo("7"), "borrado:7");
});

test("la anonimización vacía todo lo personal y marca el estado", () => {
  for (const columna of ["nombre", "telefono", "nit", "nombre_fiscal", "email", "firebase_uid"]) {
    assert.match(SQL_ANONIMIZAR_USUARIO, new RegExp(`${columna}\\s*=`));
  }
  assert.match(SQL_ANONIMIZAR_USUARIO, /estado\s*=\s*'anonimizada'/);
  assert.match(SQL_ANONIMIZAR_USUARIO, /anonimizado_en\s*=\s*now\(\)/);
});

test("las direcciones se borran con un delete explícito", () => {
  assert.match(SQL_BORRAR_DIRECCIONES, /delete from user_addresses/);
});

test("los eventos se desligan pero no se borran", () => {
  assert.match(SQL_DESLIGAR_EVENTOS, /update auth_events/);
  assert.match(SQL_DESLIGAR_EVENTOS, /user_id\s*=\s*null/);
  assert.equal(SQL_DESLIGAR_EVENTOS.includes("delete"), false);
});

test("los consentimientos no se tocan: son la prueba de lo que aceptó", () => {
  assert.equal(SQL_ANONIMIZAR_USUARIO.includes("user_consents"), false);
  assert.equal(SQL_BORRAR_DIRECCIONES.includes("user_consents"), false);
  assert.equal(SQL_DESLIGAR_EVENTOS.includes("user_consents"), false);
});
