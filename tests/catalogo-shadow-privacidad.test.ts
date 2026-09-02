import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canonicoDesdeLegacy,
  catalogoCanonicoDesdeLegacy,
  catalogoCanonicoDesdeRelacional,
  compararCatalogos,
  ejecutarComparacion,
} from "../app/data/catalogo/comparacion";
import type { FilaDeCatalogo } from "../app/data/catalogo/importacion";
import type { Ejecutor } from "../app/lib/datos/consulta";

/** Cadenas imposibles de encontrar por casualidad, una por campo privado. */
const CENTINELAS = {
  supplier_brand: "CENTINELA-MARCA-9F2A",
  supplier_brand_label: "CENTINELA-ETIQUETA-MARCA-9F2B",
  supplier_series: "CENTINELA-SERIE-9F2C",
  supplier_series_label: "CENTINELA-ETIQUETA-SERIE-9F2D",
  supplier_code: "CENTINELA-CODIGO-9F2E",
  supplier_name: "CENTINELA-NOMBRE-PROVEEDOR-9F2F",
  supplier_description: "CENTINELA-DESCRIPCION-PROVEEDOR-9F30",
};

const FILA: FilaDeCatalogo = {
  id: "cen-001",
  econoluz_reference: "ECO-CEN-0001",
  position: 10,
  public_name: "Luminaria de prueba",
  public_description: "Descripción pública inofensiva.",
  image: "/catalogos/prueba/cen-001.png",
  images: null,
  technical_specs: { amperage: "10 A" },
  product_type: "iluminacion",
  product_type_label: "Iluminación",
  application: "interior",
  application_label: "Interior",
  finish: "blanco",
  finish_label: "Blanco",
  family_label: "Prueba",
  ...CENTINELAS,
  price_gtq: 100,
  published: true,
};

const todos = Object.values(CENTINELAS);

function sinCentinelas(texto: string, donde: string) {
  for (const centinela of todos) {
    assert.equal(texto.includes(centinela), false, `${donde} contiene ${centinela}`);
  }
}

test("el canónico y las diferencias nunca contienen un centinela privado", () => {
  const legacy = catalogoCanonicoDesdeLegacy([FILA]);
  sinCentinelas(JSON.stringify(legacy), "el canónico legacy");

  // Un relacional vacío fuerza diferencias reales, para comprobar que tampoco las llevan.
  const resumen = compararCatalogos(legacy, catalogoCanonicoDesdeRelacional([], new Date()));
  sinCentinelas(JSON.stringify(resumen), "el resumen de diferencias");
  assert.equal(resumen.totalDiferencias > 0, true, "la prueba necesita diferencias reales");
});

test("ni el resultado, ni los registros, ni los errores llevan datos privados", async () => {
  const lineas: unknown[] = [];
  const registro = (nivel: "info" | "error", suceso: string, datos = {}) => {
    lineas.push({ nivel, suceso, datos });
  };

  const ejecutar: Ejecutor = async (texto) => {
    if (/supplier_description, price_gtq, published/.test(texto)) {
      return [{ ...FILA }] as unknown as Record<string, unknown>[];
    }
    // Un fallo cuyo mensaje arrastra un centinela y una credencial: ninguno de los dos
    // puede aparecer en ninguna parte.
    throw new Error(
      `fallo leyendo ${CENTINELAS.supplier_code} en postgresql://usuario:clave-secreta@host/db`,
    );
  };

  const resumen = await ejecutarComparacion(ejecutar, registro, new Date());

  const todoJunto = JSON.stringify({ resumen, lineas });
  sinCentinelas(todoJunto, "la salida completa");
  assert.equal(todoJunto.includes("clave-secreta"), false, "se filtró una credencial");
  assert.equal(todoJunto.includes("postgresql://"), false, "se filtró una cadena de conexión");
  assert.equal(lineas.length > 0, true, "el fallo tiene que quedar registrado");
});

test("cambiar solo los campos privados no cambia el canónico público", () => {
  const otro: FilaDeCatalogo = {
    ...FILA,
    supplier_brand: "otra",
    supplier_brand_label: "Otra",
    supplier_series: "otra_serie",
    supplier_series_label: "Otra serie",
    supplier_code: "OTRO-CODIGO",
    supplier_name: "Otro nombre de proveedor",
    supplier_description: "Otra descripción de proveedor",
  };
  assert.deepEqual(canonicoDesdeLegacy(otro), canonicoDesdeLegacy(FILA));
});
