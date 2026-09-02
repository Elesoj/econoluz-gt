import assert from "node:assert/strict";
import { test } from "node:test";
import { mensajeDeFaltan, validarDireccion } from "../app/identidad/direcciones";

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

/**
 * La acción descartaba en silencio lo que no validaba: el cliente rellenaba, guardaba y no
 * pasaba nada, sin saber por qué. Estas pruebas fijan el mensaje que ahora recibe.
 */
test("sin nada que corregir no hay mensaje", () => {
  assert.equal(mensajeDeFaltan([]), "");
});

test("un solo campo se nombra en singular y con su etiqueta de pantalla", () => {
  const mensaje = mensajeDeFaltan(["telefono"]);
  assert.match(mensaje, /teléfono/);
  assert.match(mensaje, /campo/);
  assert.equal(mensaje.includes("campos"), false, "Con uno solo no se habla en plural.");
});

test("varios campos se enumeran, sin nombres tecnicos", () => {
  const mensaje = mensajeDeFaltan(["destinatario", "direccion"]);
  assert.match(mensaje, /quién recibe/);
  assert.match(mensaje, /dirección/);
  assert.match(mensaje, /campos/);
  assert.equal(mensaje.includes("destinatario"), false, "«destinatario» es el nombre del campo, no lo que ve el cliente.");
});

/**
 * `referencias` es opcional y solo falla por larga, así que el mensaje no puede decir que
 * no pueda quedar vacía: sería mentira y mandaría a rellenar algo que no hace falta.
 */
test("el mensaje no afirma que las referencias sean obligatorias", () => {
  const mensaje = mensajeDeFaltan(["referencias"]);
  assert.match(mensaje, /referencias/);
  assert.equal(/obligatori/i.test(mensaje) && !/no pueden quedar vac/i.test(mensaje), false);
  assert.match(mensaje, /300/, "Conviene decir cuál es el límite, no solo que se pasó.");
});

test("un campo desconocido no rompe el mensaje ni filtra el nombre interno", () => {
  const mensaje = mensajeDeFaltan(["campo_raro"]);
  assert.equal(mensaje.length > 0, true);
  assert.equal(mensaje.includes("campo_raro"), false);
});
