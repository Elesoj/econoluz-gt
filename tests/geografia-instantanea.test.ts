// tests/geografia-instantanea.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const catalogo = JSON.parse(readFileSync("db/datos/geografia-gt.json", "utf8"));

test("el catálogo trae 22 departamentos y 340 municipios", () => {
  assert.equal(catalogo.departamentos.length, 22);
  assert.equal(catalogo.municipios.length, 340);
});

test("los códigos de departamento van de 01 a 22 y son únicos", () => {
  const codigos = catalogo.departamentos.map((d) => d.codigo);
  assert.equal(new Set(codigos).size, 22);
  for (const c of codigos) assert.match(c, /^(0[1-9]|1[0-9]|2[0-2])$/);
});

test("cada municipio tiene cuatro dígitos y pertenece a su departamento", () => {
  const departamentos = new Set(catalogo.departamentos.map((d) => d.codigo));
  for (const m of catalogo.municipios) {
    assert.match(m.codigo, /^\d{4}$/, `código inválido: ${m.codigo}`);
    assert.equal(m.codigo.slice(0, 2), m.departamento, `no encaja: ${m.codigo}`);
    assert.ok(departamentos.has(m.departamento), `departamento desconocido: ${m.departamento}`);
  }
});

test("los códigos de municipio son únicos y ningún nombre está vacío", () => {
  const codigos = catalogo.municipios.map((m) => m.codigo);
  assert.equal(new Set(codigos).size, 340);
  for (const m of catalogo.municipios) {
    assert.ok(m.nombre.trim().length > 0, `sin nombre: ${m.codigo}`);
  }
});

test("no se comprueba continuidad: los saltos de código son legítimos", () => {
  // Esta prueba documenta una decisión: un código oficial no tiene por qué
  // ser correlativo, así que la completitud se mide contra este conjunto
  // versionado y no contra una secuencia.
  const numeros = catalogo.municipios.map((m) => Number(m.codigo)).sort((a, b) => a - b);
  assert.ok(numeros.length === 340);
});

// Las tres filas que la extracción automática no resolvió sola. Se prueban por
// su nombre exacto porque son justo las que un refactor del extractor puede
// volver a romper sin que nadie se entere.
const busca = (codigo) => catalogo.municipios.find((m) => m.codigo === codigo);

test("0923 es La Esperanza, y su vecino 0924 sigue siendo Palestina de los Altos", () => {
  assert.deepEqual(busca("0923"), { codigo: "0923", departamento: "09", nombre: "La Esperanza" });
  assert.deepEqual(busca("0924"), { codigo: "0924", departamento: "09", nombre: "Palestina de los Altos" });
});

test("la errata de 1330 está corregida y no reintroducida", () => {
  assert.equal(busca("1330").nombre, "Santiago Chimaltenango");
  assert.equal(catalogo.municipios.some((m) => m.nombre.includes("Chimaltenanango")), false);
});

test("toda corrección aplicada está documentada en el archivo de procedencia", () => {
  const fuente = readFileSync("db/datos/geografia-gt.FUENTE.md", "utf8");
  for (const codigo of ["0923", "1330"]) {
    assert.ok(fuente.includes(codigo), `sin documentar: ${codigo}`);
  }
  assert.match(fuente, /1eb2a2e3a718c7132c944a26a83a1d2a317c42e7fc4f3ab4862026950da7ca0e/);
});
