import test from "node:test";
import assert from "node:assert/strict";
import {
  ZONAS_CAPITALINAS_VALIDAS,
  ZONAS_DEFECTO_GUATEX,
  esZonaCapitalinaValida,
  metodoPorDefectoZona,
  mapaMetodosPorDefecto,
} from "../app/envios/zonasCapitalinas";

test("las 22 zonas capitalinas válidas son exactamente 1 a 19, 21, 24 y 25", () => {
  assert.equal(ZONAS_CAPITALINAS_VALIDAS.length, 22);
  const esperadas = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 24, 25];
  assert.deepEqual([...ZONAS_CAPITALINAS_VALIDAS], esperadas);
});

test("las zonas 20, 22 y 23 no son válidas", () => {
  assert.equal(esZonaCapitalinaValida(20), false);
  assert.equal(esZonaCapitalinaValida(22), false);
  assert.equal(esZonaCapitalinaValida(23), false);
  assert.equal(esZonaCapitalinaValida(0), false);
  assert.equal(esZonaCapitalinaValida(26), false);
  assert.equal(esZonaCapitalinaValida(null), false);
  assert.equal(esZonaCapitalinaValida("1"), false);
});

test("las zonas 6, 17 y 18 tienen guatex como método por defecto", () => {
  assert.equal(metodoPorDefectoZona(6), "guatex");
  assert.equal(metodoPorDefectoZona(17), "guatex");
  assert.equal(metodoPorDefectoZona(18), "guatex");
});

test("las demás zonas capitalinas tienen mensajero_propio por defecto", () => {
  const zonasMensajero = ZONAS_CAPITALINAS_VALIDAS.filter(
    (z) => !ZONAS_DEFECTO_GUATEX.includes(z)
  );
  assert.equal(zonasMensajero.length, 19);
  for (const z of zonasMensajero) {
    assert.equal(metodoPorDefectoZona(z), "mensajero_propio");
  }
});

test("el mapa por defecto contiene exactamente las 22 claves válidas", () => {
  const mapa = mapaMetodosPorDefecto();
  assert.equal(Object.keys(mapa).length, 22);
  assert.equal(mapa[6], "guatex");
  assert.equal(mapa[10], "mensajero_propio");
});
