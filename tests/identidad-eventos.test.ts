import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAXIMO_DE_FALLOS,
  SQL_CONTAR_FALLOS,
  SQL_REGISTRAR_EVENTO,
  hayDemasiadosFallos,
  parametrosDeEvento,
} from "../app/identidad/eventos";

const BASE = {
  userId: "7",
  tipo: "acceso" as const,
  proveedor: "google.com",
  resultado: "correcto" as const,
  ip: "190.56.100.25",
  userAgent: "Mozilla/5.0 (Linux; Android 13) Chrome/120.0.0.0 Mobile Safari/537.36",
  pimienta: "pimienta-de-prueba",
};

test("la IP no viaja a la base: viaja su huella", () => {
  const parametros = parametrosDeEvento(BASE);
  assert.equal(parametros.includes("190.56.100.25"), false);
  assert.match(String(parametros[4]), /^[0-9a-f]{32}$/);
});

test("del navegador solo va la familia", () => {
  assert.equal(parametrosDeEvento(BASE)[5], "Chrome en Android");
});

test("un evento sin usuario conocido se guarda igual", () => {
  const parametros = parametrosDeEvento({
    ...BASE,
    userId: null,
    tipo: "fallo",
    resultado: "fallido",
  });
  assert.equal(parametros[0], null);
  assert.equal(parametros[1], "fallo");
  assert.equal(parametros[3], "fallido");
});

test("sin pimienta no se guarda huella, y el evento no se pierde por eso", () => {
  const parametros = parametrosDeEvento({ ...BASE, pimienta: undefined });
  assert.equal(parametros[4], null);
  assert.equal(parametros[1], "acceso");
});

test("la sentencia escribe en auth_events y no en otra tabla", () => {
  assert.match(SQL_REGISTRAR_EVENTO, /insert into auth_events/);
});

test("se cuentan los fallos por huella y dentro de una ventana de tiempo", () => {
  assert.match(SQL_CONTAR_FALLOS, /ip_huella = \$1/);
  assert.match(SQL_CONTAR_FALLOS, /resultado = 'fallido'/);
  assert.match(SQL_CONTAR_FALLOS, /ocurrido_en/);
});

test("por debajo del límite no se frena a nadie", () => {
  assert.equal(hayDemasiadosFallos([{ n: MAXIMO_DE_FALLOS - 1 }]), false);
});

test("alcanzado el límite, sí", () => {
  assert.equal(hayDemasiadosFallos([{ n: MAXIMO_DE_FALLOS }]), true);
  assert.equal(hayDemasiadosFallos([{ n: MAXIMO_DE_FALLOS + 10 }]), true);
});

test("sin datos no se bloquea: no saber no autoriza a frenar", () => {
  assert.equal(hayDemasiadosFallos([]), false);
});
