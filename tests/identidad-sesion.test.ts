import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COOKIE_SESION_CLIENTE,
  MS_DE_SESION,
  caducidadDesde,
  debeRenovarse,
  normalizarCorreo,
  opcionesDeCookie,
} from "../app/identidad/sesion";

test("la cookie del cliente no se llama como la del panel", () => {
  assert.notEqual(COOKIE_SESION_CLIENTE, "econoluz_admin");
  assert.match(COOKIE_SESION_CLIENTE, /cliente/);
});

test("el correo se normaliza a minúsculas y sin espacios", () => {
  assert.equal(normalizarCorreo("  Persona@Example.COM "), "persona@example.com");
  assert.equal(normalizarCorreo(""), "");
  assert.equal(normalizarCorreo(null), "");
  assert.equal(normalizarCorreo(42), "");
});

test("la sesión dura cinco días", () => {
  assert.equal(MS_DE_SESION, 5 * 24 * 60 * 60 * 1000);
  const ahora = new Date("2026-09-01T00:00:00.000Z");
  assert.equal(caducidadDesde(ahora).toISOString(), "2026-09-06T00:00:00.000Z");
});

test("la cookie es httpOnly, laxa y con ámbito de todo el sitio", () => {
  const opciones = opcionesDeCookie(new Date("2026-09-06T00:00:00.000Z"), true);
  assert.equal(opciones.httpOnly, true);
  assert.equal(opciones.sameSite, "lax");
  assert.equal(opciones.secure, true);
  assert.equal(opciones.path, "/");
});

test("fuera de producción la cookie no exige https, o no habría desarrollo local", () => {
  assert.equal(opcionesDeCookie(new Date(), false).secure, false);
});

test("se renueva cuando ha pasado más de la mitad de su vida", () => {
  const ahora = new Date("2026-09-03T00:00:00.000Z");
  assert.equal(debeRenovarse(new Date("2026-09-07T00:00:00.000Z"), ahora), false);
  assert.equal(debeRenovarse(new Date("2026-09-04T00:00:00.000Z"), ahora), true);
});

test("una sesión ya caducada no se renueva: se rehace entrando", () => {
  const ahora = new Date("2026-09-03T00:00:00.000Z");
  assert.equal(debeRenovarse(new Date("2026-09-01T00:00:00.000Z"), ahora), false);
});
