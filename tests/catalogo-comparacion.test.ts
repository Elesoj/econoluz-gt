import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canonicoDesdeLegacy,
  canonicoDesdeRelacional,
  catalogoCanonicoDesdeLegacy,
  catalogoCanonicoDesdeRelacional,
  compararCatalogos,
  ejecutarComparacion,
  huella,
  LIMITE_DE_DIFERENCIAS,
} from "../app/data/catalogo/comparacion";
import type { FilaDeCatalogo } from "../app/data/catalogo/importacion";
import type { ProductoRelacional } from "../app/data/catalogo/lectura";
import type { Ejecutor } from "../app/lib/datos/consulta";

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

// --- El motor de diferencias -------------------------------------------------------

const legacyDe = (filas: FilaDeCatalogo[]) => catalogoCanonicoDesdeLegacy(filas);
const relacionalDe = (productos: ProductoRelacional[]) =>
  catalogoCanonicoDesdeRelacional(productos, AHORA);

test("dos catálogos equivalentes no producen ninguna diferencia", () => {
  const resumen = compararCatalogos(legacyDe([FILA]), relacionalDe([RELACIONAL]));
  assert.equal(resumen.totalDiferencias, 0);
  assert.deepEqual(resumen.diferencias, []);
  assert.equal(resumen.comparados, 1);
});

test("un producto que falta en el relacional se detecta como ausente", () => {
  const resumen = compararCatalogos(legacyDe([FILA]), relacionalDe([]));
  assert.equal(resumen.diferencias[0].tipo, "producto_ausente");
  assert.equal(resumen.diferencias[0].producto, "eco-ele-0001");
  // Son dos y no una: al desaparecer el producto también cambia el orden servido, y esa
  // segunda diferencia es igual de real que la primera.
  assert.equal(resumen.totalDiferencias, 2);
  assert.equal(resumen.porTipo.producto_ausente, 1);
  assert.equal(resumen.porTipo.orden_distinto, 1);
  assert.equal(resumen.comparados, 0);
});

test("un producto de más en el relacional se detecta como adicional", () => {
  const extra: ProductoRelacional = {
    ...RELACIONAL,
    id: "apl-002",
    nucleo: { ...RELACIONAL.nucleo, econoluz_reference: "ECO-ELE-0002", position: 20 },
  };
  const resumen = compararCatalogos(legacyDe([FILA]), relacionalDe([RELACIONAL, extra]));
  const adicional = resumen.diferencias.find((d) => d.tipo === "producto_adicional");
  assert.equal(adicional?.producto, "eco-ele-0002");
});

test("un campo público distinto se detecta con su nombre de campo", () => {
  const distinto: ProductoRelacional = {
    ...RELACIONAL,
    nucleo: { ...RELACIONAL.nucleo, public_name: "Otro nombre" },
  };
  const resumen = compararCatalogos(legacyDe([FILA]), relacionalDe([distinto]));
  assert.equal(
    resumen.diferencias.some((d) => d.campo === "proyeccion.public_name"),
    true,
  );
  assert.equal(
    resumen.diferencias.every((d) => d.tipo !== "producto_ausente"),
    true,
  );
});

test("un precio distinto se detecta en su propio campo", () => {
  const distinto: ProductoRelacional = {
    ...RELACIONAL,
    precios: [{ id: "5", centavos: 999, tipo: "normal", desde: null, hasta: null }],
  };
  const resumen = compararCatalogos(legacyDe([FILA]), relacionalDe([distinto]));
  assert.equal(
    resumen.diferencias.some((d) => d.campo === "precioNormalCentavos"),
    true,
  );
});

test("una categoría principal distinta se detecta", () => {
  const distinto: ProductoRelacional = {
    ...RELACIONAL,
    categorias: [{ ...RELACIONAL.categorias[0], slug: "otra-cosa" }],
  };
  const campos = compararCatalogos(legacyDe([FILA]), relacionalDe([distinto])).diferencias.map(
    (d) => d.campo,
  );
  assert.equal(campos.includes("categorias"), true);
  assert.equal(campos.includes("categoriaPrincipal"), true);
});

test("una imagen principal distinta se detecta", () => {
  const distinto: ProductoRelacional = {
    ...RELACIONAL,
    imagenes: RELACIONAL.imagenes.map((i) => ({ ...i, principal: !i.principal })),
  };
  const resumen = compararCatalogos(legacyDe([FILA]), relacionalDe([distinto]));
  assert.equal(
    resumen.diferencias.some((d) => d.campo === "imagenes"),
    true,
  );
});

test("un atributo con otra unidad se detecta", () => {
  const distinto: ProductoRelacional = {
    ...RELACIONAL,
    atributos: [{ ...RELACIONAL.atributos[0], unidad: "mA" }],
  };
  const resumen = compararCatalogos(legacyDe([FILA]), relacionalDe([distinto]));
  assert.equal(
    resumen.diferencias.some((d) => d.campo === "atributos"),
    true,
  );
});

test("el estado de publicación distinto se detecta", () => {
  const distinto: ProductoRelacional = {
    ...RELACIONAL,
    nucleo: { ...RELACIONAL.nucleo, published: false },
  };
  const resumen = compararCatalogos(legacyDe([FILA]), relacionalDe([distinto]));
  assert.equal(
    resumen.diferencias.some((d) => d.campo === "publicado"),
    true,
  );
});

test("el orden de las colecciones internas no genera falsos positivos", () => {
  const revuelto: ProductoRelacional = {
    ...RELACIONAL,
    imagenes: [...RELACIONAL.imagenes].reverse(),
    atributos: [...RELACIONAL.atributos].reverse(),
    categorias: [...RELACIONAL.categorias].reverse(),
  };
  assert.equal(compararCatalogos(legacyDe([FILA]), relacionalDe([revuelto])).totalDiferencias, 0);
});

test("un orden de catálogo realmente distinto sí se detecta", () => {
  const segundaFila = {
    ...FILA,
    id: "apl-002",
    econoluz_reference: "ECO-ELE-0002",
    position: 20,
  };
  const segundoRelacional: ProductoRelacional = {
    ...RELACIONAL,
    id: "apl-002",
    nucleo: { ...RELACIONAL.nucleo, econoluz_reference: "ECO-ELE-0002", position: 5 },
  };
  const resumen = compararCatalogos(
    legacyDe([FILA, segundaFila]),
    relacionalDe([RELACIONAL, segundoRelacional]),
  );
  assert.equal(
    resumen.diferencias.some((d) => d.tipo === "orden_distinto"),
    true,
  );
});

test("las diferencias se cuentan por tipo y por campo", () => {
  const distinto: ProductoRelacional = {
    ...RELACIONAL,
    nucleo: { ...RELACIONAL.nucleo, public_name: "Otro nombre" },
  };
  const resumen = compararCatalogos(legacyDe([FILA]), relacionalDe([distinto]));
  assert.equal(resumen.porTipo.campo_distinto >= 1, true);
  assert.equal(resumen.porCampo["proyeccion.public_name"], 1);
});

test("la lista de diferencias nunca crece sin límite", () => {
  const filas = Array.from({ length: 200 }, (_, i) => ({
    ...FILA,
    id: `p-${i}`,
    econoluz_reference: `ECO-ELE-${String(i).padStart(4, "0")}`,
    position: i,
  }));
  const resumen = compararCatalogos(legacyDe(filas), relacionalDe([]), LIMITE_DE_DIFERENCIAS);
  assert.equal(resumen.diferencias.length, LIMITE_DE_DIFERENCIAS);
  assert.equal(resumen.totalDiferencias >= 200, true);
  assert.equal(resumen.omitidas, resumen.totalDiferencias - LIMITE_DE_DIFERENCIAS);
});

test("la huella no deja recuperar el valor y distingue valores distintos", () => {
  assert.equal(huella("Módulo eléctrico apagador").includes("Módulo"), false);
  assert.equal(huella("a"), huella("a"));
  assert.notEqual(huella("a"), huella("b"));
  assert.equal(huella(null), huella(null));
});

// --- La comparación contra un ejecutor -----------------------------------------------

function ejecutorFalso(respuestas: { patron: RegExp; filas: Record<string, unknown>[] }[]) {
  const sentencias: string[] = [];
  const ejecutar: Ejecutor = async (texto) => {
    sentencias.push(texto);
    return respuestas.find((r) => r.patron.test(texto))?.filas ?? [];
  };
  return { ejecutar, sentencias };
}

function registroEspia() {
  const lineas: { nivel: string; suceso: string; datos: Record<string, unknown> }[] = [];
  const registro = (nivel: "info" | "error", suceso: string, datos = {}) => {
    lineas.push({ nivel, suceso, datos });
  };
  return { lineas, registro };
}

const PATRON_LEGACY = /supplier_description, price_gtq, published/;

/**
 * El núcleo del lector relacional pide las mismas columnas públicas y **ninguna** del
 * proveedor. Como la consulta legacy también termina en `published from products`, este
 * patrón va después del suyo: `find` devuelve la primera coincidencia.
 */
const PATRON_NUCLEO_RELACIONAL = /published\s+from products/;

const RESPUESTAS_IGUALES = [
  { patron: PATRON_LEGACY, filas: [{ ...FILA }] as unknown as Record<string, unknown>[] },
  {
    patron: PATRON_NUCLEO_RELACIONAL,
    filas: [{ id: "apl-001", ...RELACIONAL.nucleo }] as unknown as Record<string, unknown>[],
  },
  {
    patron: /from product_private_data/,
    filas: [{ product_id: "apl-001", ...RELACIONAL.privados }],
  },
  {
    patron: /from product_categories/,
    filas: [
      {
        product_id: "apl-001",
        category_id: "7",
        parent_id: "1",
        slug: "placas-accesorios-placas-apagadores",
        nombre: "Placas y apagadores",
        principal: true,
      },
    ],
  },
  {
    patron: /from product_images/,
    filas: [
      {
        product_id: "apl-001",
        id: "1",
        url: "/catalogos/electrico/apl-001.png",
        alt: "Módulo eléctrico apagador",
        posicion: 0,
        visible: true,
        principal: true,
      },
      {
        product_id: "apl-001",
        id: "2",
        url: "/catalogos/electrico/apl-001-b.png",
        alt: "Módulo eléctrico apagador",
        posicion: 10,
        visible: true,
        principal: false,
      },
    ],
  },
  {
    patron: /from product_attribute_values/,
    filas: [
      {
        product_id: "apl-001",
        id: "9",
        attribute_id: "3",
        clave: "amperage",
        nombre: "Amperaje",
        tipo: "numero",
        unidad: "A",
        filterable: true,
        comparable: true,
        active: true,
        value_number: 15,
        value_text: null,
        value_bool: null,
        option_id: null,
        option_clave: null,
        option_etiqueta: null,
      },
    ],
  },
  {
    patron: /from product_prices/,
    filas: [
      {
        product_id: "apl-001",
        id: "5",
        centavos: "12500",
        tipo: "normal",
        desde: null,
        hasta: null,
      },
    ],
  },
];

test("la comparación emite una lectura legacy y exactamente seis relacionales", async () => {
  const { ejecutar, sentencias } = ejecutorFalso(RESPUESTAS_IGUALES);
  const { registro } = registroEspia();
  await ejecutarComparacion(ejecutar, registro, AHORA);
  assert.equal(sentencias.length, 7, `emitió ${sentencias.length} consultas`);
});

test("la lectura relacional sigue siendo de seis consultas con 313 productos", async () => {
  const muchos = Array.from({ length: 313 }, (_, i) => ({
    ...FILA,
    id: `p-${i}`,
    econoluz_reference: `ECO-ELE-${String(i).padStart(4, "0")}`,
    position: i,
  })) as unknown as Record<string, unknown>[];
  const { ejecutar, sentencias } = ejecutorFalso([
    { patron: PATRON_LEGACY, filas: muchos },
  ]);
  const { registro } = registroEspia();
  await ejecutarComparacion(ejecutar, registro, AHORA);
  assert.equal(sentencias.length, 7, `emitió ${sentencias.length} consultas para 313 productos`);
});

test("la comparación no escribe nunca en la base", async () => {
  const { ejecutar, sentencias } = ejecutorFalso(RESPUESTAS_IGUALES);
  const { registro } = registroEspia();
  await ejecutarComparacion(ejecutar, registro, AHORA);
  assert.equal(sentencias.length > 0, true);
  for (const sentencia of sentencias) {
    assert.match(sentencia.trim().toLowerCase(), /^select\b/, `no es una lectura: ${sentencia}`);
  }
});

test("el registro dice cuántas consultas relacionales se ejecutaron de verdad", async () => {
  const { ejecutar } = ejecutorFalso([{ patron: PATRON_LEGACY, filas: [] }]);
  const { lineas, registro } = registroEspia();

  // Un lector que emite nueve consultas en vez de seis. Si el registro publicara una
  // constante, seguiría diciendo 6 y esta prueba no lo detectaría.
  const lectorDeNueveConsultas = async (ejecutarRelacional: Ejecutor) => {
    for (let i = 0; i < 9; i += 1) {
      await ejecutarRelacional("select 1 from product_images", []);
    }
    return [];
  };

  await ejecutarComparacion(ejecutar, registro, AHORA, lectorDeNueveConsultas);

  const cierre = lineas.find((l) => l.suceso === "catalogo-shadow-resumen");
  assert.equal(cierre?.datos.consultasRelacionales, 9);
});

test("con el lector de verdad, las consultas relacionales registradas son seis", async () => {
  const { ejecutar } = ejecutorFalso(RESPUESTAS_IGUALES);
  const { lineas, registro } = registroEspia();
  await ejecutarComparacion(ejecutar, registro, AHORA);
  const cierre = lineas.find((l) => l.suceso === "catalogo-shadow-resumen");
  assert.equal(cierre?.datos.consultasRelacionales, 6);
});

test("la lectura legacy de la comparación no se cuenta como relacional", async () => {
  const { ejecutar, sentencias } = ejecutorFalso(RESPUESTAS_IGUALES);
  const { lineas, registro } = registroEspia();
  await ejecutarComparacion(ejecutar, registro, AHORA);
  const cierre = lineas.find((l) => l.suceso === "catalogo-shadow-resumen");
  assert.equal(sentencias.length, 7);
  assert.equal(cierre?.datos.consultasRelacionales, 6);
});

test("catálogos equivalentes registran cero diferencias, duración y correlación", async () => {
  const { ejecutar } = ejecutorFalso(RESPUESTAS_IGUALES);
  const { lineas, registro } = registroEspia();
  const resumen = await ejecutarComparacion(ejecutar, registro, AHORA);
  assert.equal(resumen?.totalDiferencias, 0);
  const cierre = lineas.find((l) => l.suceso === "catalogo-shadow-resumen");
  assert.ok(cierre, "falta el resumen");
  assert.equal(cierre?.datos.diferencias, 0);
  assert.equal(typeof cierre?.datos.duracionMs, "number");
  assert.equal(typeof cierre?.datos.correlacion, "string");
  assert.equal(cierre?.datos.consultasRelacionales, 6);
});

test("un fallo de la lectura relacional se registra saneado y devuelve null", async () => {
  const ejecutar: Ejecutor = async (texto) => {
    if (PATRON_LEGACY.test(texto)) return [{ ...FILA }] as unknown as Record<string, unknown>[];
    throw new Error("connection to ep-secreto.neon.tech failed: password=supersecreto");
  };
  const { lineas, registro } = registroEspia();
  const resumen = await ejecutarComparacion(ejecutar, registro, AHORA);
  assert.equal(resumen, null);
  const fallo = lineas.find((l) => l.suceso === "catalogo-shadow-error");
  assert.ok(fallo, "falta el registro del fallo");
  assert.equal(fallo?.nivel, "error");
  const serializado = JSON.stringify(lineas);
  assert.equal(serializado.includes("supersecreto"), false);
  assert.equal(serializado.includes("ep-secreto"), false);
});

test("los eventos de diferencia están limitados por comparación", async () => {
  const muchas = Array.from({ length: 200 }, (_, i) => ({
    ...FILA,
    id: `p-${i}`,
    econoluz_reference: `ECO-ELE-${String(i).padStart(4, "0")}`,
    position: i,
  })) as unknown as Record<string, unknown>[];
  const { ejecutar } = ejecutorFalso([{ patron: PATRON_LEGACY, filas: muchas }]);
  const { lineas, registro } = registroEspia();
  const resumen = await ejecutarComparacion(ejecutar, registro, AHORA);
  const eventos = lineas.filter((l) => l.suceso === "catalogo-shadow-diferencia");
  assert.equal(eventos.length <= LIMITE_DE_DIFERENCIAS, true, `registró ${eventos.length}`);
  assert.equal((resumen?.omitidas ?? 0) > 0, true);
});
