import assert from "node:assert/strict";
import { test } from "node:test";
import { validarDireccion } from "../app/identidad/direcciones";

const VALIDA = {
  destinatario: "Quien Recibe",
  telefono: "4042 8790",
  departamento: "Guatemala",
  municipio: "Guatemala",
  direccion: "21 Avenida 0-18, Vista Hermosa 2, Zona 15",
  referencias: "Portón negro frente a la tienda",
  predeterminada: true,
};

test("una dirección completa es válida", () => {
  const resultado = validarDireccion(VALIDA);
  assert.equal(resultado.ok, true);
  assert.equal(resultado.ok && resultado.direccion.municipio, "Guatemala");
});

test("faltan los campos imprescindibles y se dice cuáles", () => {
  const resultado = validarDireccion({ ...VALIDA, destinatario: "  ", municipio: "" });
  assert.equal(resultado.ok, false);
  assert.deepEqual(resultado.ok === false && resultado.faltan, ["destinatario", "municipio"]);
});

test("las referencias son opcionales, porque no todo el mundo las necesita", () => {
  const sinReferencias: Partial<typeof VALIDA> = { ...VALIDA };
  delete sinReferencias.referencias;
  assert.equal(validarDireccion(sinReferencias).ok, true);
});

test("los textos se recortan, para que no entren con espacios de sobra", () => {
  const resultado = validarDireccion({ ...VALIDA, destinatario: "  Quien Recibe  " });
  assert.equal(resultado.ok && resultado.direccion.destinatario, "Quien Recibe");
});

test("un texto desmesurado se rechaza en vez de llegar a la base", () => {
  const resultado = validarDireccion({ ...VALIDA, direccion: "x".repeat(1000) });
  assert.equal(resultado.ok, false);
});

test("lo que no es un objeto no revienta la validación", () => {
  assert.equal(validarDireccion(null).ok, false);
  assert.equal(validarDireccion("texto").ok, false);
});
