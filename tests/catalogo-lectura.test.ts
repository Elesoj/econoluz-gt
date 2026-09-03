import assert from "node:assert/strict";
import { test } from "node:test";

import type { Ejecutor } from "../app/lib/datos/consulta";
import {
  buscarPorCodigoDeProveedor,
  crearLectorCatalogoPublicoCacheado,
  leerCatalogoPublicoDesdeProyeccion,
  leerCatalogoRelacional,
  leerProductoRelacional,
  proyeccionDesdeRelacional,
  type ProductoRelacional,
} from "../app/data/catalogo/lectura";
import type { PublicProduct } from "../app/data/publicProduct";
import { planificarProducto } from "../app/data/catalogo/importacion";
import { fromProductRow } from "../app/data/productRow";
import { aFilaProyeccion } from "../app/data/proyeccionPublica";
import { verificarCatalogoRelacional } from "../scripts/verificar-catalogo-relacional.mjs";

type Respuesta = { patron: RegExp; filas: Record<string, unknown>[] };

function ejecutorFalso(respuestas: readonly Respuesta[]) {
  const sentencias: { texto: string; parametros: readonly unknown[] }[] = [];
  const ejecutar: Ejecutor = async (texto, parametros = []) => {
    sentencias.push({ texto, parametros });
    return respuestas.find((respuesta) => respuesta.patron.test(texto))?.filas ?? [];
  };
  return { ejecutar, sentencias };
}

function cacheFalsa() {
  let valor: PublicProduct[] | undefined;
  let tags: string[] = [];
  const cachear = (
    leer: () => Promise<PublicProduct[]>,
    _claves: string[],
    opciones: { tags: string[]; revalidate: number },
  ) => {
    tags = opciones.tags;
    return async () => {
      if (valor !== undefined) return structuredClone(valor);
      const resultado = await leer();
      valor = structuredClone(resultado);
      return structuredClone(resultado);
    };
  };
  return {
    cachear,
    invalidar(tag: string) {
      if (tags.includes(tag)) valor = undefined;
    },
  };
}

const PRODUCTO_PUBLICO: PublicProduct = {
  id: "prod-1",
  econoluzReference: "ECO-ARQ-0001",
  publicName: "Downlight orientable",
  publicDescription: "Iluminación arquitectónica interior.",
  image: "/catalogos/arquitectonico/eco-arq-0001.png",
  productType: "iluminacion_arquitectonica",
  application: "empotrables",
  finish: "blanco",
  labels: {
    productType: "Iluminación arquitectónica",
    application: "Empotrables",
    finish: "Blanco",
  },
};

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

test("leerCatalogoRelacional emite exactamente 6 consultas globales para varios productos", async () => {
  const filas = [
    { id: "apl-001", ...PRODUCTO.nucleo },
    { id: "apl-002", ...PRODUCTO.nucleo, econoluz_reference: "ECO-ELE-0002" },
  ];
  const { ejecutar, sentencias } = ejecutorFalso([
    { patron: /select [\s\S]* from products\b/i, filas },
    { patron: /from product_private_data/i, filas: [{ product_id: "apl-001", ...PRODUCTO.privados }] },
    {
      patron: /from product_categories/i,
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
      patron: /from product_images/i,
      filas: [{ product_id: "apl-001", ...PRODUCTO.imagenes[0] }],
    },
    { patron: /from product_attribute_values/i, filas: [] },
    { patron: /from product_prices/i, filas: [] },
  ]);

  const productos = await leerCatalogoRelacional(ejecutar);
  assert.equal(productos.length, 2);
  assert.deepEqual(
    productos.map((producto) => producto.id),
    ["apl-001", "apl-002"],
  );
  assert.equal(sentencias.length, 6, "debe emitir exactamente 6 consultas globales");
  // Comprobar que no hay cruce de relaciones: apl-001 tiene privados y categorias, apl-002 no
  assert.deepEqual(productos[0].privados, PRODUCTO.privados);
  assert.equal(productos[0].categorias.length, 1);
  assert.equal(productos[0].imagenes.length, 1);
  assert.equal(productos[1].privados, null);
  assert.equal(productos[1].categorias.length, 0);
  assert.equal(productos[1].imagenes.length, 0);
});

test("leerCatalogoRelacional con catálogo vacío emite exactamente 6 consultas y devuelve lista vacía", async () => {
  const { ejecutar, sentencias } = ejecutorFalso([
    { patron: /select [\s\S]* from products\b/i, filas: [] },
    { patron: /from product_private_data/i, filas: [] },
    { patron: /from product_categories/i, filas: [] },
    { patron: /from product_images/i, filas: [] },
    { patron: /from product_attribute_values/i, filas: [] },
    { patron: /from product_prices/i, filas: [] },
  ]);

  const productos = await leerCatalogoRelacional(ejecutar);
  assert.deepEqual(productos, []);
  assert.equal(sentencias.length, 6, "incluso vacío debe emitir 6 consultas constantes");
});

test("leerCatalogoRelacional con 313 productos no escala en consultas (emite exactamente 6)", async () => {
  const filas = Array.from({ length: 313 }, (_, i) => ({
    id: `prod-${i + 1}`,
    ...PRODUCTO.nucleo,
    econoluz_reference: `ECO-TEST-${String(i + 1).padStart(4, "0")}`,
    position: i * 10,
  }));
  const { ejecutar, sentencias } = ejecutorFalso([
    { patron: /select [\s\S]* from products\b/i, filas },
    { patron: /from product_private_data/i, filas: [] },
    { patron: /from product_categories/i, filas: [] },
    { patron: /from product_images/i, filas: [] },
    { patron: /from product_attribute_values/i, filas: [] },
    { patron: /from product_prices/i, filas: [] },
  ]);

  const productos = await leerCatalogoRelacional(ejecutar);
  assert.equal(productos.length, 313);
  assert.equal(
    sentencias.length,
    6,
    `esperadas 6 consultas globales, pero se ejecutaron ${sentencias.length}`,
  );
});

test("existe un lector público independiente del lector relacional completo", async () => {
  const lectura = await import("../app/data/catalogo/lectura");

  assert.equal(typeof lectura.leerCatalogoPublicoDesdeProyeccion, "function");
});

test("existe una fábrica separada para cachear solo la lectura pública", async () => {
  const lectura = await import("../app/data/catalogo/lectura");

  assert.equal(typeof lectura.crearLectorCatalogoPublicoCacheado, "function");
});

test("el lector público hace una sola consulta determinista a public_products y devuelve PublicProduct saneado", async () => {
  const { ejecutar, sentencias } = ejecutorFalso([
    {
      patron: /from public_products/i,
      filas: [
        {
          id: "prod-1",
          econoluz_reference: "ECO-ARQ-0001",
          position: 10,
          public_name: "Downlight orientable",
          public_description: "Iluminación arquitectónica interior.",
          image: "/catalogos/arquitectonico/eco-arq-0001.png",
          images: ["/catalogos/arquitectonico/eco-arq-0001-2.png"],
          product_type: "iluminacion_arquitectonica",
          application: "empotrables",
          finish: "blanco",
          label_product_type: "Iluminación arquitectónica",
          label_application: "Empotrables",
          label_finish: "Blanco",
          technical_specs: { power: "12 W" },
          price_cents: 129900,
          supplier_code: "SECRETO-NO-PUBLICABLE",
        },
      ],
    },
  ]);

  const resultado = await leerCatalogoPublicoDesdeProyeccion(ejecutar);

  assert.deepEqual(resultado, [
    {
      id: "prod-1",
      econoluzReference: "ECO-ARQ-0001",
      publicName: "Downlight orientable",
      publicDescription: "Iluminación arquitectónica interior.",
      image: "/catalogos/arquitectonico/eco-arq-0001.png",
      images: ["/catalogos/arquitectonico/eco-arq-0001-2.png"],
      productType: "iluminacion_arquitectonica",
      application: "empotrables",
      finish: "blanco",
      labels: {
        productType: "Iluminación arquitectónica",
        application: "Empotrables",
        finish: "Blanco",
      },
      technicalSpecs: { power: "12 W" },
      priceGtq: 1299,
    },
  ]);
  assert.equal(sentencias.length, 1);
  assert.match(sentencias[0].texto, /from public_products/i);
  assert.match(sentencias[0].texto, /order by position, econoluz_reference, id/i);
  assert.doesNotMatch(sentencias[0].texto, /product_private_data|\bproducts\b|supplier_/i);
  assert.doesNotMatch(JSON.stringify(resultado), /SECRETO-NO-PUBLICABLE/);
});

test("el lector público rechaza una fila inválida sin repetir su valor en el error", async () => {
  const centinela = "SECRETO-FILA-CORRUPTA";
  const { ejecutar } = ejecutorFalso([
    {
      patron: /from public_products/i,
      filas: [
        {
          id: "prod-1",
          econoluz_reference: "ECO-ARQ-0001",
          position: 10,
          public_name: { valorPrivado: centinela },
          public_description: "Descripción pública",
          image: "/catalogos/arquitectonico/eco-arq-0001.png",
          images: null,
          product_type: "iluminacion_arquitectonica",
          application: "empotrables",
          finish: "blanco",
          label_product_type: "Iluminación arquitectónica",
          label_application: "Empotrables",
          label_finish: "Blanco",
          technical_specs: null,
          price_cents: null,
        },
      ],
    },
  ]);

  await assert.rejects(
    () => leerCatalogoPublicoDesdeProyeccion(ejecutar),
    (error: Error) => error.message === "Fila pública de catálogo inválida." && !error.message.includes(centinela),
  );
});

test("las llamadas repetidas reutilizan el resultado público cacheado", async () => {
  const cache = cacheFalsa();
  let lecturas = 0;
  const leer = crearLectorCatalogoPublicoCacheado(async () => {
    lecturas += 1;
    return [PRODUCTO_PUBLICO];
  }, cache.cachear);

  assert.deepEqual(await leer(), [PRODUCTO_PUBLICO]);
  assert.deepEqual(await leer(), [PRODUCTO_PUBLICO]);
  assert.equal(lecturas, 1);
});

test("invalidar la etiqueta catalogo obliga a realizar una lectura pública nueva", async () => {
  const cache = cacheFalsa();
  let lecturas = 0;
  const leer = crearLectorCatalogoPublicoCacheado(async () => {
    lecturas += 1;
    return [{ ...PRODUCTO_PUBLICO, publicName: `Lectura ${lecturas}` }];
  }, cache.cachear);

  assert.equal((await leer())[0].publicName, "Lectura 1");
  cache.invalidar("catalogo");
  assert.equal((await leer())[0].publicName, "Lectura 2");
  assert.equal(lecturas, 2);
});

test("un error de lectura pública no se conserva en la caché", async () => {
  const cache = cacheFalsa();
  let lecturas = 0;
  const leer = crearLectorCatalogoPublicoCacheado(async () => {
    lecturas += 1;
    if (lecturas === 1) throw new Error("fallo transitorio");
    return [PRODUCTO_PUBLICO];
  }, cache.cachear);

  await assert.rejects(() => leer(), /fallo transitorio/);
  assert.deepEqual(await leer(), [PRODUCTO_PUBLICO]);
  assert.equal(lecturas, 2);
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

const CENTINELA_SECRETO = "CODIGO_CENTINELA_SECRETO_XYZ_999";

function clienteVerificadorMock() {
  const entorno: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: "postgres://user:pass@ep-desarrollo-test.c-11.us-east-1.aws.neon.tech/neondb",
    NEON_ENDPOINT_ESPERADO: "ep-desarrollo-test.c-11.us-east-1.aws.neon.tech",
    NEON_ENDPOINT_PRODUCCION: "ep-produccion-test.c-11.us-east-1.aws.neon.tech",
    NEON_RAMA_ESPERADA: "catalogo-relacional-fase-b",
  };

  const query = async (sql: string) => {
    const texto = sql.toLowerCase();

    if (texto.includes("from app_settings where clave = $1")) {
      return { rows: [{ valor: "catalogo-relacional-fase-b" }] };
    }

    if (texto.includes("from information_schema.tables")) {
      return {
        rows: [
          "attribute_options",
          "attributes",
          "categories",
          "product_attribute_values",
          "product_categories",
          "product_images",
          "product_prices",
          "product_private_data",
        ].map((table_name) => ({ table_name })),
      };
    }

    if (texto.includes("from information_schema.columns")) {
      return {
        rows: [
          "product_id",
          "supplier_brand",
          "supplier_brand_label",
          "supplier_code",
          "supplier_description",
          "supplier_name",
          "supplier_series",
          "supplier_series_label",
        ].map((column_name) => ({ column_name })),
      };
    }

    if (texto.includes("pg_extension")) {
      return { rows: [{ extension_ok: true }] };
    }

    if (texto.includes("pg_index")) {
      return {
        rows: [
          { nombre: "product_private_data_supplier_code_idx", unico: false },
          { nombre: "product_categories_principal_idx", unico: false },
          { nombre: "product_images_una_principal", unico: true },
          { nombre: "product_attribute_values_escalar_unico", unico: true },
          { nombre: "product_attribute_values_numero_idx", unico: false },
          { nombre: "product_attribute_values_opcion_idx", unico: false },
        ],
      };
    }

    if (texto.includes("pg_constraint")) {
      return {
        rows: [
          { conname: "product_images_posicion_unica", condeferrable: true, condeferred: true },
          { conname: "product_images_product_id_fkey", confdeltype: "r" },
          { conname: "product_attribute_values_una_columna" },
          { conname: "product_attribute_values_columna_del_tipo" },
          { conname: "product_attribute_values_atributo_fk" },
          { conname: "product_attribute_values_opcion_fk" },
          { conname: "product_prices_sin_promociones_solapadas" },
        ],
      };
    }

    if (texto.includes("pg_trigger")) {
      return {
        rows: [{ tgdeferrable: true, tginitdeferred: true }],
      };
    }

    if (texto.includes("schema_migrations")) {
      return {
        rows: [
          {
            migracion_010: 1,
            modelo: "legacy",
            rama: "catalogo-relacional-fase-b",
          },
        ],
      };
    }

    if (texto.includes("has_table_privilege")) {
      return {
        rows: [
          { tabla: "attribute_options", puede_leer: false },
          { tabla: "attributes", puede_leer: false },
          { tabla: "categories", puede_leer: false },
          { tabla: "product_attribute_values", puede_leer: false },
          { tabla: "product_categories", puede_leer: false },
          { tabla: "product_images", puede_leer: false },
          { tabla: "product_prices", puede_leer: false },
          { tabla: "product_private_data", puede_leer: false },
          { tabla: "public_products", puede_leer: true },
        ],
      };
    }

    if (texto.includes("from products") && texto.includes("order by position, id")) {
      return {
        rows: [
          {
            id: "prod-centinela-1",
            econoluz_reference: "ECO-CEN-0001",
            position: 10,
            public_name: "Lámpara Centinela",
            public_description: "Lámpara para prueba de privacidad.",
            image: "/catalogos/arquitectonico/cen-001.png",
            images: null,
            technical_specs: null,
            product_type: "iluminacion_arquitectonica",
            product_type_label: "Iluminación Arquitectónica",
            application: "empotrables",
            application_label: "Empotrables",
            finish: "blanco",
            finish_label: "Blanco",
            family_label: "Centinelas",
            supplier_brand: "marca_privada",
            supplier_brand_label: "Marca Privada",
            supplier_series: "serie_privada",
            supplier_series_label: "Serie Privada",
            supplier_code: CENTINELA_SECRETO,
            supplier_name: "Nombre Privado",
            supplier_description: "Descripción Privada",
            price_gtq: 150,
            published: true,
          },
        ],
      };
    }

    if (texto.includes("from categories") && !texto.includes("product_categories")) {
      return {
        rows: [
          { id: "1", slug: "iluminacion-arquitectonica" },
          { id: "2", slug: "iluminacion-arquitectonica-empotrables" },
        ],
      };
    }

    if (texto.includes("from product_private_data") && !texto.includes("where supplier_code")) {
      return {
        rows: [
          {
            product_id: "prod-centinela-1",
            supplier_brand: "marca_privada",
            supplier_brand_label: "Marca Privada",
            supplier_series: "serie_privada",
            supplier_series_label: "Serie Privada",
            supplier_code: CENTINELA_SECRETO,
            supplier_name: "Nombre Privado",
            supplier_description: "Descripción Privada",
          },
        ],
      };
    }

    if (texto.includes("from product_categories")) {
      return {
        rows: [
          {
            product_id: "prod-centinela-1",
            slug: "iluminacion-arquitectonica-empotrables",
            principal: true,
          },
        ],
      };
    }

    if (texto.includes("from product_images")) {
      return {
        rows: [
          {
            product_id: "prod-centinela-1",
            url: "/catalogos/arquitectonico/cen-001.png",
            alt: "Lámpara Centinela",
            posicion: 0,
            visible: true,
            principal: true,
          },
        ],
      };
    }

    if (texto.includes("from product_attribute_values")) {
      return { rows: [] };
    }

    if (texto.includes("from product_prices")) {
      return {
        rows: [
          {
            product_id: "prod-centinela-1",
            centavos: "15000",
            tipo: "normal",
            desde: "2026-01-01",
            hasta: null,
          },
        ],
      };
    }

    if (texto.includes("from public_products")) {
      const fila = {
        id: "prod-centinela-1",
        econoluz_reference: "ECO-CEN-0001",
        position: 10,
        public_name: "Lámpara Centinela",
        public_description: "Lámpara para prueba de privacidad.",
        image: "/catalogos/arquitectonico/cen-001.png",
        images: null,
        technical_specs: null,
        product_type: "iluminacion_arquitectonica",
        product_type_label: "Iluminación Arquitectónica",
        application: "empotrables",
        application_label: "Empotrables",
        finish: "blanco",
        finish_label: "Blanco",
        family_label: "Centinelas",
        supplier_brand: "marca_privada",
        supplier_brand_label: "Marca Privada",
        supplier_series: "serie_privada",
        supplier_series_label: "Serie Privada",
        supplier_code: CENTINELA_SECRETO,
        supplier_name: "Nombre Privado",
        supplier_description: "Descripción Privada",
        price_gtq: 150,
        published: true,
      };
      const plan = planificarProducto(fila);
      const imagenesSecundarias = plan.imagenes
        .filter((img) => !img.principal)
        .map((img) => img.url);
      const prodParaProy = {
        ...fila,
        image: plan.imagenes.find((img) => img.principal)?.url ?? fila.image,
        images: imagenesSecundarias.length > 0 ? imagenesSecundarias : null,
        stock: null,
        sellable_online: false,
      };
      const filaPub = aFilaProyeccion(
        fromProductRow(prodParaProy),
        plan.precioNormalCentavos === null ? null : plan.precioNormalCentavos / 100,
        fila.position,
      );
      return {
        rows: [filaPub],
      };
    }

    if (texto.includes("where supplier_code ilike")) {
      return {
        rows: [{ id: "prod-centinela-1", supplier_code: CENTINELA_SECRETO }],
      };
    }

    if (texto.includes("select count(*) from attributes")) {
      return { rows: [{ count: "7" }] };
    }

    if (texto.includes("select count(*) from attribute_options")) {
      return { rows: [{ count: "0" }] };
    }

    return { rows: [] };
  };

  return { cliente: { query }, entorno };
}

test("verificarCatalogoRelacional NUNCA expone supplier_code en su resultado ni en la salida JSON", async () => {
  const { cliente, entorno } = clienteVerificadorMock();
  const resultado = await verificarCatalogoRelacional(cliente, entorno);

  assert.equal(resultado.ok, true, `Fallos inesperados: ${resultado.fallos.join(", ")}`);

  // Serializar el objeto completo que se imprime con console.log en la CLI
  const salidaJson = JSON.stringify(resultado, null, 2);

  // Ningún fragmento del código secreto debe aparecer en la salida
  assert.ok(
    !salidaJson.includes(CENTINELA_SECRETO),
    `El supplier_code no debe aparecer en la salida del verificador`,
  );
  assert.ok(!salidaJson.includes("CENTINELA"), "No debe aparecer ninguna parte del código");
  assert.ok(!salidaJson.includes("XYZ_999"), "No debe aparecer sufijo del código");

  // El objeto de búsqueda privada solo debe contener datos de control no sensibles
  assert.deepEqual(resultado.busquedaPrivada, {
    coincidencias: 1,
    encontrado: true,
  });
});
