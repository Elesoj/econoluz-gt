import assert from "node:assert/strict";
import { test } from "node:test";
import { proyectarProductoEnTransaccion } from "../app/data/proyeccionPublicaTransaccion";

import { products } from "../app/data/products";
import { toProductRow } from "../app/data/productRow";

type Registro = { text: string; params: readonly unknown[] };

function mockEjecutor(respuestas: Record<string, unknown>[][], registro: Registro[] = []) {
  let llamada = 0;
  return {
    registro,
    ejecutar: async (text: string, params?: readonly unknown[]) => {
      registro.push({ text, params: params ?? [] });
      return respuestas[llamada++] ?? [];
    },
  };
}


const FILA_BASE_CATALOGO = {
  ...toProductRow(products[0], 0),
  technical_specs: {
    power: "15 W",
    lifetime: "40000",
    amperage: "15A",
    frequency: "50/60Hz",
    warranty: "5 años",
  },
  price_gtq: "1250.00",
  published: true,
};

test("proyectarProductoEnTransaccion inserta/actualiza en public_products si el producto está publicado", async () => {
  const { ejecutar, registro } = mockEjecutor([[FILA_BASE_CATALOGO], []]);

  await proyectarProductoEnTransaccion(ejecutar, "ECO-CAT-0007");

  assert.equal(registro.length, 2);
  assert.match(registro[0].text, /from products/);
  assert.deepEqual(registro[0].params, ["ECO-CAT-0007"]);

  assert.match(registro[1].text, /insert into public_products/);
  assert.match(registro[1].text, /on conflict \(id\) do update/);

  const technicalSpecsParam = registro[1].params[13];
  assert.ok(typeof technicalSpecsParam === "string");
  const specs = JSON.parse(technicalSpecsParam as string);
  assert.equal(specs.lifetime, "40000");
  assert.equal(specs.amperage, "15A");
  assert.equal(specs.frequency, "50/60Hz");
  assert.equal("warranty" in specs, false, "warranty NUNCA debe proyectarse");
});

test("proyectarProductoEnTransaccion elimina de public_products si el producto no está publicado", async () => {
  const filaDespublicada = { ...FILA_BASE_CATALOGO, published: false };
  const { ejecutar, registro } = mockEjecutor([[filaDespublicada], []]);

  await proyectarProductoEnTransaccion(ejecutar, "ECO-CAT-0007");

  assert.equal(registro.length, 2);
  assert.match(registro[1].text, /delete from public_products/);
  assert.deepEqual(registro[1].params, ["ECO-CAT-0007"]);
});

test("proyectarProductoEnTransaccion elimina de public_products si el producto no existe en products", async () => {
  const { ejecutar, registro } = mockEjecutor([[], []]);

  await proyectarProductoEnTransaccion(ejecutar, "ECO-CAT-9999");

  assert.equal(registro.length, 2);
  assert.match(registro[1].text, /delete from public_products/);
  assert.deepEqual(registro[1].params, ["ECO-CAT-9999"]);
});
