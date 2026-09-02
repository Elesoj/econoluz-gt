import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canonicoDesdeLegacy,
  canonicoDesdeRelacional,
  catalogoCanonicoDesdeLegacy,
} from "../app/data/catalogo/comparacion";
import type { FilaDeCatalogo } from "../app/data/catalogo/importacion";
import type { ProductoRelacional } from "../app/data/catalogo/lectura";

const FILA: FilaDeCatalogo = {
  id: "apl-001",
  econoluz_reference: "ECO-ELE-0001",
  position: 10,
  public_name: "Módulo eléctrico apagador",
  public_description: "Módulo apagador de un interruptor.",
  image: "/catalogos/electrico/apl-001.png",
  images: ["/catalogos/electrico/apl-001-b.png"],
  technical_specs: { amperage: "15 A" },
  product_type: "placas_accesorios",
  product_type_label: "Placas y accesorios",
  application: "placas_apagadores",
  application_label: "Placas y apagadores",
  finish: "blanco_brillante",
  finish_label: "Blanco brillante",
  family_label: "Placas",
  supplier_brand: "artlite",
  supplier_brand_label: "Artlite",
  supplier_series: "linea_artlite",
  supplier_series_label: "Línea Artlite",
  supplier_code: "APL-001",
  supplier_name: "Modulo apagador ARTLITE APL-001",
  supplier_description: "Modulo apagador de 1 interruptor.",
  price_gtq: 125,
  published: true,
};

const RELACIONAL: ProductoRelacional = {
  id: "apl-001",
  nucleo: {
    econoluz_reference: "ECO-ELE-0001",
    position: 10,
    public_name: "Módulo eléctrico apagador",
    public_description: "Módulo apagador de un interruptor.",
    image: "/catalogos/electrico/apl-001.png",
    images: ["/catalogos/electrico/apl-001-b.png"],
    technical_specs: { amperage: "15 A" },
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
      id: "1",
      url: "/catalogos/electrico/apl-001.png",
      alt: "Módulo eléctrico apagador",
      posicion: 0,
      visible: true,
      principal: true,
    },
    {
      id: "2",
      url: "/catalogos/electrico/apl-001-b.png",
      alt: "Módulo eléctrico apagador",
      posicion: 10,
      visible: true,
      principal: false,
    },
  ],
  atributos: [
    {
      id: "9",
      atributoId: "3",
      clave: "amperage",
      nombre: "Amperaje",
      tipo: "numero",
      unidad: "A",
      filterable: true,
      comparable: true,
      active: true,
      valueNumber: 15,
      valueText: null,
      valueBool: null,
      optionId: null,
      optionClave: null,
      optionEtiqueta: null,
    },
  ],
  precios: [{ id: "5", centavos: 12500, tipo: "normal", desde: null, hasta: null }],
};

const AHORA = new Date("2026-09-02T12:00:00Z");

test("el canónico de un producto no contiene ningún dato del proveedor", () => {
  const texto = JSON.stringify(canonicoDesdeLegacy(FILA));
  for (const privado of [
    "APL-001",
    "artlite",
    "Artlite",
    "linea_artlite",
    "Línea Artlite",
    "Modulo apagador ARTLITE APL-001",
    "Modulo apagador de 1 interruptor.",
  ]) {
    assert.equal(texto.includes(privado), false, `se coló ${privado}`);
  }
});

test("las dos fuentes producen exactamente el mismo canónico", () => {
  assert.deepEqual(canonicoDesdeRelacional(RELACIONAL, AHORA), canonicoDesdeLegacy(FILA));
});

test("el canónico usa el identificador público, no el id interno", () => {
  assert.equal(canonicoDesdeLegacy(FILA).id, "eco-ele-0001");
});

test("el orden del catálogo solo lleva los productos publicados", () => {
  const oculto = {
    ...FILA,
    id: "apl-002",
    econoluz_reference: "ECO-ELE-0002",
    position: 20,
    published: false,
  };
  const canonico = catalogoCanonicoDesdeLegacy([FILA, oculto]);
  assert.deepEqual(canonico.orden, ["eco-ele-0001"]);
  assert.equal(canonico.productos.length, 2);
});

test("el orden respeta position y no el orden de llegada", () => {
  const segundo = { ...FILA, id: "apl-002", econoluz_reference: "ECO-ELE-0002", position: 5 };
  assert.deepEqual(catalogoCanonicoDesdeLegacy([FILA, segundo]).orden, [
    "eco-ele-0002",
    "eco-ele-0001",
  ]);
});

test("el orden de llegada de imágenes, categorías y atributos no cambia el canónico", () => {
  const revuelto: ProductoRelacional = {
    ...RELACIONAL,
    imagenes: [...RELACIONAL.imagenes].reverse(),
    atributos: [...RELACIONAL.atributos].reverse(),
    categorias: [...RELACIONAL.categorias].reverse(),
  };
  assert.deepEqual(
    canonicoDesdeRelacional(revuelto, AHORA),
    canonicoDesdeRelacional(RELACIONAL, AHORA),
  );
});

test("una promoción vigente se compara aparte del precio normal", () => {
  const conPromocion: ProductoRelacional = {
    ...RELACIONAL,
    precios: [
      ...RELACIONAL.precios,
      { id: "6", centavos: 9900, tipo: "promocion", desde: null, hasta: null },
    ],
  };
  const canonico = canonicoDesdeRelacional(conPromocion, AHORA);
  assert.equal(canonico.precioNormalCentavos, 12500);
  assert.equal(canonico.precioPromocionCentavos, 9900);
});
