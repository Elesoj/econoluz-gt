// tests/envios-admin-operativo.test.ts
//
// La validación de los formularios del panel vive en un módulo puro, sin la
// directiva "use server", precisamente para poder probarla aquí sin levantar el
// entorno de Server Actions. Nada de lo que llega en el `FormData` se acepta sin
// comprobar: el navegador puede mandar cualquier cosa.
import test from "node:test";
import assert from "node:assert/strict";
import {
  validarFormularioMetodoZona,
  validarFormularioReglasEnvio,
} from "../app/admin/envios/formularios";

test("validarFormularioMetodoZona rechaza zonas inexistentes (20, 22, 23)", () => {
  for (const zonaInvalida of [20, 22, 23, 0, 26, -1]) {
    const fd = new FormData();
    fd.set("zona", String(zonaInvalida));
    fd.set("metodo", "mensajero_propio");
    const r = validarFormularioMetodoZona(fd);
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.match(r.error, /zona.*no es válida/i);
    }
  }
});

test("validarFormularioMetodoZona rechaza una zona con decimales o texto libre", () => {
  for (const bruta of ["10.5", "zona 10", "", "diez"]) {
    const fd = new FormData();
    fd.set("zona", bruta);
    fd.set("metodo", "guatex");
    assert.equal(validarFormularioMetodoZona(fd).ok, false, `debería rechazar «${bruta}»`);
  }
});

test("validarFormularioMetodoZona rechaza métodos no permitidos", () => {
  const fd = new FormData();
  fd.set("zona", "10");
  fd.set("metodo", "dron");
  const r = validarFormularioMetodoZona(fd);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.match(r.error, /método.*no está permitido/i);
  }
});

test("validarFormularioMetodoZona acepta pares válidos", () => {
  const fd1 = new FormData();
  fd1.set("zona", "6");
  fd1.set("metodo", "guatex");
  const r1 = validarFormularioMetodoZona(fd1);
  assert.equal(r1.ok, true);
  if (r1.ok) {
    assert.equal(r1.zona, 6);
    assert.equal(r1.metodo, "guatex");
  }

  const fd2 = new FormData();
  fd2.set("zona", "10");
  fd2.set("metodo", "mensajero_propio");
  const r2 = validarFormularioMetodoZona(fd2);
  assert.equal(r2.ok, true);
  if (r2.ok) {
    assert.equal(r2.zona, 10);
    assert.equal(r2.metodo, "mensajero_propio");
  }
});

test("validarFormularioReglasEnvio rechaza decimales y negativos", () => {
  const fd1 = new FormData();
  fd1.set("tarifaCents", "35.5");
  fd1.set("umbralGratisCents", "250000");
  assert.equal(validarFormularioReglasEnvio(fd1).ok, false);

  const fd2 = new FormData();
  fd2.set("tarifaCents", "-100");
  fd2.set("umbralGratisCents", "250000");
  assert.equal(validarFormularioReglasEnvio(fd2).ok, false);

  const fd3 = new FormData();
  fd3.set("tarifaCents", "3500");
  fd3.set("umbralGratisCents", "2500.25");
  assert.equal(validarFormularioReglasEnvio(fd3).ok, false);
});

test("validarFormularioReglasEnvio rechaza campos vacíos o no numéricos", () => {
  for (const [tarifa, umbral] of [
    ["", "250000"],
    ["3500", ""],
    ["mucho", "250000"],
    ["3500", "bastante"],
  ]) {
    const fd = new FormData();
    fd.set("tarifaCents", tarifa);
    fd.set("umbralGratisCents", umbral);
    assert.equal(
      validarFormularioReglasEnvio(fd).ok,
      false,
      `debería rechazar tarifa «${tarifa}» y umbral «${umbral}»`,
    );
  }
});

test("validarFormularioReglasEnvio acepta enteros válidos en centavos", () => {
  const fd = new FormData();
  fd.set("tarifaCents", "3500");
  fd.set("umbralGratisCents", "250000");
  const r = validarFormularioReglasEnvio(fd);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.reglas.tarifaCents, 3500);
    assert.equal(r.reglas.umbralGratisCents, 250000);
  }
});

test("validarFormularioReglasEnvio admite el cero: tarifa gratis y umbral cero son configuraciones legítimas", () => {
  const fd = new FormData();
  fd.set("tarifaCents", "0");
  fd.set("umbralGratisCents", "0");
  const r = validarFormularioReglasEnvio(fd);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.reglas.tarifaCents, 0);
    assert.equal(r.reglas.umbralGratisCents, 0);
  }
});
