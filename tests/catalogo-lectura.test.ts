import assert from "node:assert/strict";
import { test } from "node:test";

import type { Ejecutor } from "../app/lib/datos/consulta";
import {
  buscarPorCodigoDeProveedor,
  leerCatalogoRelacional,
  leerProductoRelacional,
  proyeccionDesdeRelacional,
  type ProductoRelacional,
} from "../app/data/catalogo/lectura";

type Respuesta = { patron: RegExp; filas: Record<string, unknown>[] };

function ejecutorFalso(respuestas: readonly Respuesta[]) {
  const sentencias: { texto: string; parametros: readonly unknown[] }[] = [];
  const ejecutar: Ejecutor = async (texto, parametros = []) => {
    sentencias.push({ texto, parametros });
    return respuestas.find((respuesta) => respuesta.patron.test(texto))?.filas ?? [];
  };
  return { ejecutar, sentencias };
}

const PRODUCTO: ProductoRelacional = {
  id: "apl-001",
  nucleo: {
    econoluz_reference: "ECO-ELE-0001",
    position: 10,
    public_name: "Módulo eléctrico apagador",
    public_description: "Módulo apagador de un interruptor.",
    image: "/catalogos/electrico/apl-001.png",
    images: null,
    technical_specs: { amperage: "15A" },
    product_type: "placas_accesorios",
    product_type_label: "Placas y accesorios",
    application: "placas_apagadores",
    application_label: "Placas y apagadores",
    finish: "blanco_brillante",
    finish_label: "Blanco brillante",
    family_label: "Placas",
    published: true,
  },
  privados: {
    supplier_brand: "artlite",
    supplier_brand_label: "Artlite",
    supplier_series: "linea_artlite",
    supplier_series_label: "Línea Artlite",
    supplier_code: "APL-001",
    supplier_name: "Modulo apagador ARTLITE APL-001",
    supplier_description: "Modulo apagador de 1 interruptor.",
  },
  categorias: [
    {
      id: "7",
      parentId: "1",
      slug: "placas-accesorios-placas-apagadores",
      nombre: "Placas y apagadores",
      principal: true,
    },
  ],
  imagenes: [
    {
      id: "3",
      url: "/catalogos/electrico/apl-001.png",
      alt: "Módulo eléctrico apagador",
      posicion: 0,
      visible: true,
      principal: true,
    },
  ],
  atributos: [],
  precios: [],
};

test("la proyección usa el precio normal vigente y no el histórico", () => {
  const fila = proyeccionDesdeRelacional(
    {
      ...PRODUCTO,
      precios: [
        {
          id: "1",
          centavos: 100000,
          tipo: "normal",
          desde: new Date("2026-01-01T00:00:00Z"),
          hasta: new Date("2026-06-01T00:00:00Z"),
        },
        {
          id: "2",
          centavos: 129900,
          tipo: "normal",
          desde: new Date("2026-06-01T00:00:00Z"),
          hasta: null,
        },
      ],
    },
    new Date("2026-09-02T00:00:00Z"),
  );
  assert.equal(fila.price_cents, 129900);
});

test("una promoción vigente prevalece sobre el precio normal", () => {
  const fila = proyeccionDesdeRelacional(
    {
      ...PRODUCTO,
      precios: [
        { id: "1", centavos: 129900, tipo: "normal", desde: null, hasta: null },
        {
          id: "2",
          centavos: 99900,
          tipo: "promocion",
          desde: new Date("2026-09-01T00:00:00Z"),
          hasta: new Date("2026-09-03T00:00:00Z"),
        },
      ],
    },
    new Date("2026-09-02T00:00:00Z"),
  );
  assert.equal(fila.price_cents, 99900);
});

test("la proyección de un producto sin precio vigente no lleva importe", () => {
  const fila = proyeccionDesdeRelacional(PRODUCTO, new Date("2026-09-02T00:00:00Z"));
  assert.equal(fila.price_cents, null);
});

test("la proyección sanea los datos del proveedor y usa las imágenes relacionales", () => {
  const fila = proyeccionDesdeRelacional(
    {
      ...PRODUCTO,
      imagenes: [
        ...PRODUCTO.imagenes,
        {
          id: "4",
          url: "/catalogos/electrico/apl-002.png",
          alt: "Vista secundaria",
          posicion: 10,
          visible: true,
          principal: false,
        },
      ],
    },
    new Date("2026-09-02T00:00:00Z"),
  );
  assert.deepEqual(fila.images, ["/catalogos/electrico/apl-002.png"]);
  const serializada = JSON.stringify(fila);
  assert.ok(!serializada.includes("APL-001"));
  assert.ok(!serializada.includes("Artlite"));
});

test("leerProductoRelacional reconstruye sus ocho grupos de datos", async () => {
  const { ejecutar, sentencias } = ejecutorFalso([
    { patron: /from products\b/i, filas: [{ id: "apl-001", ...PRODUCTO.nucleo }] },
    { patron: /from product_private_data/i, filas: [{ ...PRODUCTO.privados }] },
    {
      patron: /from product_categories/i,
      filas: [
        {
          category_id: "7",
          parent_id: "1",
          slug: "placas-accesorios-placas-apagadores",
          nombre: "Placas y apagadores",
          principal: true,
        },
      ],
    },
    { patron: /from product_images/i, filas: PRODUCTO.imagenes },
    { patron: /from product_attribute_values/i, filas: [] },
    { patron: /from product_prices/i, filas: [] },
  ]);

  const producto = await leerProductoRelacional(ejecutar, "apl-001");

  assert.deepEqual(producto, PRODUCTO);
  assert.equal(sentencias.length, 6);
  assert.ok(sentencias.every((sentencia) => sentencia.parametros[0] === "apl-001"));
});

test("leerProductoRelacional devuelve null sin consultar satélites si no existe", async () => {
  const { ejecutar, sentencias } = ejecutorFalso([{ patron: /from products\b/i, filas: [] }]);
  assert.equal(await leerProductoRelacional(ejecutar, "ausente"), null);
  assert.equal(sentencias.length, 1);
});

test("leerCatalogoRelacional calcula los productos reales, sin asumir una cantidad", async () => {
  const filas = [
    { id: "apl-001", ...PRODUCTO.nucleo },
    { id: "apl-002", ...PRODUCTO.nucleo, econoluz_reference: "ECO-ELE-0002" },
  ];
  const { ejecutar } = ejecutorFalso([
    { patron: /select [\s\S]* from products\b/i, filas },
    { patron: /from product_private_data/i, filas: [{ ...PRODUCTO.privados }] },
    { patron: /from product_categories/i, filas: [] },
    { patron: /from product_images/i, filas: [] },
    { patron: /from product_attribute_values/i, filas: [] },
    { patron: /from product_prices/i, filas: [] },
  ]);

  const productos = await leerCatalogoRelacional(ejecutar);
  assert.equal(productos.length, 2);
  assert.deepEqual(
    productos.map((producto) => producto.id),
    ["apl-001", "apl-002"],
  );
});

test("la búsqueda interna encuentra un código dentro de una lista", async () => {
  const { ejecutar, sentencias } = ejecutorFalso([
    {
      patron: /from product_private_data/i,
      filas: [{ id: "apl-001", supplier_code: "APL-001 / MT-12" }],
    },
  ]);

  const resultado = await buscarPorCodigoDeProveedor(ejecutar, "MT-12");

  assert.deepEqual(resultado, [{ id: "apl-001", supplier_code: "APL-001 / MT-12" }]);
  assert.match(sentencias[0].texto, /product_private_data/i);
  assert.match(sentencias[0].texto, /ilike/i);
  assert.deepEqual(sentencias[0].parametros, ["MT-12"]);
});

test("una búsqueda vacía no consulta la base", async () => {
  const { ejecutar, sentencias } = ejecutorFalso([]);
  assert.deepEqual(await buscarPorCodigoDeProveedor(ejecutar, "   "), []);
  assert.equal(sentencias.length, 0);
});
