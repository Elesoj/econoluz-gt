import test from "node:test";
import assert from "node:assert/strict";
import { emparejarMunicipio, normalizar } from "../app/envios/geografia";

const catalogo = [
  { codigo: "0101", departamento: "01", nombre: "Guatemala" },
  { codigo: "0108", departamento: "01", nombre: "Mixco" },
];

test("normaliza tildes, mayúsculas y espacios de más", () => {
  assert.equal(normalizar("  SAN JOSÉ   PINULA "), "san jose pinula");
});

test("empareja lo inequívoco", () => {
  assert.deepEqual(
    emparejarMunicipio(catalogo, "Guatemala", "MIXCO"),
    { codigo: "0108", departamento: "01" },
  );
});

test("no empareja lo que no está", () => {
  assert.equal(emparejarMunicipio(catalogo, "Guatemala", "Guate"), null);
  assert.equal(emparejarMunicipio(catalogo, "Izabal", "Mixco"), null);
});

test("no inventa cuando el texto es ambiguo", () => {
  assert.equal(emparejarMunicipio(catalogo, "", "Mixco"), null);
  assert.equal(emparejarMunicipio(catalogo, "Guatemala", ""), null);
});
