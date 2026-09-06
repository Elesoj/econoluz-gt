// tests/envios-ajustes-operativos.test.ts
//
// La configuración operativa de envíos vive en `app_settings`, una tabla de
// clave y texto. Lo que aquí se prueba es la parte que decide qué significa ese
// texto: ante cualquier valor que no sea íntegro, se vuelve a la configuración
// comercial aprobada en lugar de fallar o de inventar un importe.
import test from "node:test";
import assert from "node:assert/strict";
import {
  CLAVE_AJUSTE_REGLAS_PROPIAS,
  CLAVE_AJUSTE_ZONAS_METODOS,
  fusionarMetodoZona,
  interpretarReglasPropias,
  interpretarZonasMetodos,
} from "../app/envios/configuracion";
import { ZONAS_CAPITALINAS_VALIDAS } from "../app/envios/zonasCapitalinas";

test("constantes de clave de ajustes", () => {
  assert.equal(CLAVE_AJUSTE_ZONAS_METODOS, "envios_zonas_metodos");
  assert.equal(CLAVE_AJUSTE_REGLAS_PROPIAS, "envios_reglas_propias");
});

test("interpretarZonasMetodos con valor nulo o no objeto devuelve el mapa por defecto", () => {
  const def1 = interpretarZonasMetodos(null);
  assert.equal(Object.keys(def1).length, 22);
  assert.equal(def1[6], "guatex");
  assert.equal(def1[10], "mensajero_propio");

  const def2 = interpretarZonasMetodos("texto-invalido");
  assert.equal(Object.keys(def2).length, 22);
  assert.equal(def2[17], "guatex");
});

test("interpretarZonasMetodos con JSON string parsea correctamente", () => {
  const json = JSON.stringify({
    1: "mensajero_propio",
    2: "mensajero_propio",
    3: "mensajero_propio",
    4: "mensajero_propio",
    5: "mensajero_propio",
    6: "guatex",
    7: "mensajero_propio",
    8: "mensajero_propio",
    9: "mensajero_propio",
    10: "mensajero_propio",
    11: "mensajero_propio",
    12: "mensajero_propio",
    13: "mensajero_propio",
    14: "mensajero_propio",
    15: "mensajero_propio",
    16: "mensajero_propio",
    17: "guatex",
    18: "guatex",
    19: "mensajero_propio",
    21: "mensajero_propio",
    24: "mensajero_propio",
    25: "mensajero_propio",
  });
  const res = interpretarZonasMetodos(json);
  assert.equal(Object.keys(res).length, 22);
  assert.equal(res[1], "mensajero_propio");
  assert.equal(res[6], "guatex");
});

test("interpretarZonasMetodos conserva un cambio legítimo del panel", () => {
  const mapa: Record<string, string> = {};
  for (const z of ZONAS_CAPITALINAS_VALIDAS) {
    mapa[String(z)] = "mensajero_propio";
  }
  mapa["6"] = "guatex";
  mapa["10"] = "guatex";
  const res = interpretarZonasMetodos(mapa);
  assert.equal(res[10], "guatex");
  assert.equal(res[1], "mensajero_propio");
});

test("interpretarZonasMetodos si falta una sola clave de las 22 degrada al mapa por defecto entero", () => {
  const parcial = { 1: "guatex" };
  const res = interpretarZonasMetodos(parcial);
  assert.equal(Object.keys(res).length, 22);
  // Degrada al mapa por defecto entero, no conserva claves parciales incoherentes
  assert.equal(res[1], "mensajero_propio");
  assert.equal(res[6], "guatex");
});

test("interpretarZonasMetodos si contiene zona no permitida (ej. 20) degrada al mapa por defecto", () => {
  const mapaInvalido: Record<string, string> = {};
  for (const z of ZONAS_CAPITALINAS_VALIDAS) {
    mapaInvalido[String(z)] = "mensajero_propio";
  }
  mapaInvalido["20"] = "guatex"; // Zona 20 no permitida
  const res = interpretarZonasMetodos(mapaInvalido);
  assert.equal(res[6], "guatex");
  assert.equal(Object.prototype.hasOwnProperty.call(res, 20), false);
});

test("interpretarZonasMetodos si contiene método inválido degrada al mapa por defecto", () => {
  const mapaInvalido: Record<string, string> = {};
  for (const z of ZONAS_CAPITALINAS_VALIDAS) {
    mapaInvalido[String(z)] = "mensajero_propio";
  }
  mapaInvalido["1"] = "avion_privado"; // Método no permitido
  const res = interpretarZonasMetodos(mapaInvalido);
  assert.equal(res[1], "mensajero_propio");
});

test("interpretarReglasPropias valida importes enteros positivos", () => {
  const resValido = interpretarReglasPropias({ tarifaCents: 4000, umbralGratisCents: 300000 });
  assert.equal(resValido.tarifaCents, 4000);
  assert.equal(resValido.umbralGratisCents, 300000);

  const resJson = interpretarReglasPropias('{"tarifaCents":4500,"umbralGratisCents":280000}');
  assert.equal(resJson.tarifaCents, 4500);
  assert.equal(resJson.umbralGratisCents, 280000);

  const resInvalido = interpretarReglasPropias({ tarifaCents: -500, umbralGratisCents: "mucho" });
  assert.equal(resInvalido.tarifaCents, 3500);
  assert.equal(resInvalido.umbralGratisCents, 250000);

  const resDecimal = interpretarReglasPropias({ tarifaCents: 35.5, umbralGratisCents: 2500.25 });
  assert.equal(resDecimal.tarifaCents, 3500);
  assert.equal(resDecimal.umbralGratisCents, 250000);
});

test("interpretarReglasPropias rechaza un JSON roto y un array", () => {
  const roto = interpretarReglasPropias("{no es json");
  assert.deepEqual(roto, { tarifaCents: 3500, umbralGratisCents: 250000 });

  const lista = interpretarReglasPropias([3500, 250000]);
  assert.deepEqual(lista, { tarifaCents: 3500, umbralGratisCents: 250000 });
});

test("fusionarMetodoZona cambia solo la zona pedida y devuelve el texto que se guarda", () => {
  const partida = interpretarZonasMetodos(null);
  const { mapa, valorSerializado, metodoAnterior } = fusionarMetodoZona(partida, 10, "guatex");

  assert.equal(metodoAnterior, "mensajero_propio");
  assert.equal(mapa[10], "guatex");
  assert.equal(mapa[6], "guatex");
  assert.equal(mapa[1], "mensajero_propio");
  assert.equal(Object.keys(mapa).length, 22);

  // El mapa de partida no se muta: lo que se guarda es el nuevo.
  assert.equal(partida[10], "mensajero_propio");

  // Y lo serializado se vuelve a interpretar igual, sin degradar.
  assert.deepEqual(interpretarZonasMetodos(valorSerializado), mapa);
});

test("fusionarMetodoZona sobre un mapa corrupto parte de la configuración por defecto", () => {
  const corrupto = interpretarZonasMetodos({ 1: "guatex" });
  const { mapa } = fusionarMetodoZona(corrupto, 25, "guatex");
  assert.equal(Object.keys(mapa).length, 22);
  assert.equal(mapa[25], "guatex");
  assert.equal(mapa[1], "mensajero_propio");
});

test("interpretarReglasPropias rechaza importes desmesurados guardados en la base", () => {
  // Aunque el panel los acota, la fila de `app_settings` se puede editar por
  // fuera. Un número absurdo vuelve a la configuración comercial aprobada.
  const enorme = interpretarReglasPropias({
    tarifaCents: 100_000_001,
    umbralGratisCents: 250000,
  });
  assert.deepEqual(enorme, { tarifaCents: 3500, umbralGratisCents: 250000 });

  const inseguro = interpretarReglasPropias({
    tarifaCents: 3500,
    umbralGratisCents: Number.MAX_SAFE_INTEGER + 10,
  });
  assert.deepEqual(inseguro, { tarifaCents: 3500, umbralGratisCents: 250000 });
});
