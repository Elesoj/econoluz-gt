import assert from "node:assert/strict";
import { test } from "node:test";
import { familiaDeNavegador, huellaDeIp } from "../app/identidad/huella";

const PIMIENTA = "pimienta-de-prueba-que-no-es-la-real";

test("la huella no contiene la IP ni permite recuperarla", () => {
  const huella = huellaDeIp("190.56.100.25", PIMIENTA);
  assert.ok(huella);
  assert.equal(huella.includes("190"), false);
  assert.equal(huella.includes("."), false);
  assert.match(huella, /^[0-9a-f]{32}$/);
});

test("la misma IP da la misma huella, e IPs distintas dan huellas distintas", () => {
  assert.equal(huellaDeIp("190.56.100.25", PIMIENTA), huellaDeIp("190.56.100.25", PIMIENTA));
  assert.notEqual(huellaDeIp("190.56.100.25", PIMIENTA), huellaDeIp("190.56.100.26", PIMIENTA));
});

test("cambiar la pimienta cambia la huella: sin ella no se puede reconstruir", () => {
  assert.notEqual(huellaDeIp("190.56.100.25", PIMIENTA), huellaDeIp("190.56.100.25", "otra"));
});

test("sin pimienta no se inventa una huella débil: no hay huella", () => {
  assert.equal(huellaDeIp("190.56.100.25", undefined), null);
  assert.equal(huellaDeIp("190.56.100.25", ""), null);
});

test("sin IP tampoco hay huella", () => {
  assert.equal(huellaDeIp(null, PIMIENTA), null);
  assert.equal(huellaDeIp("", PIMIENTA), null);
});

test("del navegador se guarda la familia, no la cadena entera", () => {
  const ua =
    "Mozilla/5.0 (Linux; Android 13; SM-A536E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
  const familia = familiaDeNavegador(ua);
  assert.equal(familia, "Chrome en Android");
  assert.equal(familia.includes("SM-A536E"), false);
});

test("un navegador desconocido no rompe nada", () => {
  assert.equal(familiaDeNavegador("algo rarísimo"), "Otro");
  assert.equal(familiaDeNavegador(null), null);
});
