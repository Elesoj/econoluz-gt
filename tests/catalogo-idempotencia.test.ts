import assert from "node:assert/strict";
import { test } from "node:test";

import type { EntradaDeProducto } from "../app/data/catalogo/escritura";
import { productoCoincideConEntrada } from "../app/data/catalogo/idempotencia";
import type { ProductoRelacional } from "../app/data/catalogo/lectura";

const AHORA = new Date("2026-09-02T12:00:00Z");

const ENTRADA: EntradaDeProducto = {
  id: "apl-001",
  nucleo: {
    econoluz_reference: "ECO-0001",
    position: 10,
    public_name: "Módulo apagador",
    public_description: "Descripción pública",
    image: "/principal.png",
    images: ["/segunda.png"],
    technical_specs: { amperage: "15A" },
    product_type: "placas_accesorios",
    product_type_label: "Placas y accesorios",
    application: "apagadores",
    application_label: "Apagadores",
    finish: "blanco",
    finish_label: "Blanco",
    family_label: "Artlite",
    published: true,
  },
  privados: {
    supplier_brand: "artlite",
    supplier_brand_label: "Artlite",
    supplier_series: "linea_artlite",
    supplier_series_label: "Línea Artlite",
    supplier_code: "APL-001",
    supplier_name: "Nombre privado",
    supplier_description: "Descripción privada",
  },
  categorias: [{ categoriaId: "cat-1", principal: true }],
  imagenes: [
    {
      url: "/principal.png",
      alt: "Módulo apagador",
      posicion: 0,
      visible: true,
      principal: true,
    },
    {
      url: "/segunda.png",
      alt: "Módulo apagador",
      posicion: 10,
      visible: true,
      principal: false,
    },
  ],
  atributos: [
    {
      atributoId: "atr-1",
      tipo: "numero",
      asignacion: { clase: "escalar", valor: 15 },
    },
  ],
  precioNormalCentavos: 129900,
  actor: { tipo: "sistema", id: null },
};

const PRODUCTO: ProductoRelacional = {
  id: ENTRADA.id,
  nucleo: { ...ENTRADA.nucleo },
  privados: { ...ENTRADA.privados },
  categorias: [
    {
      id: "cat-1",
      parentId: "raiz-1",
      slug: "placas-accesorios-apagadores",
      nombre: "Apagadores",
      principal: true,
    },
  ],
  imagenes: ENTRADA.imagenes.map((imagen, indice) => ({ id: `img-${indice}`, ...imagen })),
  atributos: [
    {
      id: "valor-1",
      atributoId: "atr-1",
      clave: "amperage",
      nombre: "Amperaje",
      tipo: "numero",
      unidad: "A",
      filterable: false,
      comparable: false,
      active: true,
      valueNumber: 15,
      valueText: null,
      valueBool: null,
      optionId: null,
      optionClave: null,
      optionEtiqueta: null,
    },
  ],
  precios: [
    {
      id: "precio-1",
      centavos: 129900,
      tipo: "normal",
      desde: new Date("2026-09-01T00:00:00Z"),
      hasta: null,
    },
  ],
};

test("un producto relacional idéntico se omite en la siguiente importación", () => {
  assert.equal(productoCoincideConEntrada(PRODUCTO, ENTRADA, AHORA), true);
});

test("los identificadores generados y las fechas no rompen la idempotencia", () => {
  const producto = {
    ...PRODUCTO,
    imagenes: PRODUCTO.imagenes.map((imagen) => ({ ...imagen, id: "otro-id" })),
    precios: [{ ...PRODUCTO.precios[0], id: "otro-precio", desde: new Date("2025-01-01") }],
  };

  assert.equal(productoCoincideConEntrada(producto, ENTRADA, AHORA), true);
});

test("un cambio privado obliga a actualizar el producto", () => {
  const producto = {
    ...PRODUCTO,
    privados: { ...PRODUCTO.privados!, supplier_code: "OTRO" },
  };

  assert.equal(productoCoincideConEntrada(producto, ENTRADA, AHORA), false);
});

test("un cambio en categoría, imagen o atributo obliga a actualizar", () => {
  assert.equal(
    productoCoincideConEntrada(
      { ...PRODUCTO, categorias: [{ ...PRODUCTO.categorias[0], principal: false }] },
      ENTRADA,
      AHORA,
    ),
    false,
  );
  assert.equal(
    productoCoincideConEntrada(
      { ...PRODUCTO, imagenes: [{ ...PRODUCTO.imagenes[0], url: "/otra.png" }] },
      ENTRADA,
      AHORA,
    ),
    false,
  );
  assert.equal(
    productoCoincideConEntrada(
      { ...PRODUCTO, atributos: [{ ...PRODUCTO.atributos[0], valueNumber: 16 }] },
      ENTRADA,
      AHORA,
    ),
    false,
  );
});

test("solo compara el precio normal vigente, no el histórico", () => {
  const producto = {
    ...PRODUCTO,
    precios: [
      {
        id: "anterior",
        centavos: 100000,
        tipo: "normal" as const,
        desde: new Date("2025-01-01"),
        hasta: new Date("2026-01-01"),
      },
      ...PRODUCTO.precios,
    ],
  };

  assert.equal(productoCoincideConEntrada(producto, ENTRADA, AHORA), true);
  assert.equal(
    productoCoincideConEntrada(
      { ...producto, precios: producto.precios.map((precio, i) => i === 1 ? { ...precio, centavos: 1 } : precio) },
      ENTRADA,
      AHORA,
    ),
    false,
  );
});

test("un producto sin precio deseado admite solo precios normales ya vencidos", () => {
  const entrada = { ...ENTRADA, precioNormalCentavos: null };
  const producto = {
    ...PRODUCTO,
    precios: [
      {
        id: "anterior",
        centavos: 100000,
        tipo: "normal" as const,
        desde: new Date("2025-01-01"),
        hasta: new Date("2026-01-01"),
      },
    ],
  };

  assert.equal(productoCoincideConEntrada(producto, entrada, AHORA), true);
});
