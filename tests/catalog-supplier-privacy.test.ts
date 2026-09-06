import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { products } from "../app/data/products";
import { toPublicProduct } from "../app/data/publicProduct";
import {
  PUBLIC_TECHNICAL_SPEC_KEYS,
  PUBLIC_TECHNICAL_SPEC_REGISTRY,
} from "../app/data/publicProductContract";

const IDENTIFICADORES_PUBLICOS_PROHIBIDOS = [
  "Artlite",
  "Construlita",
  "Highlum",
  "Magnetrack Pro",
  "Magnetrack",
  "magnetrackpro",
  "Vialed",
  "Nanovia",
  "Corvus",
  "LED Infinite D2",
  "LED Infinite D3 COB",
  "LED Infinite D5 Neon",
  "Evolight",
  "Softglow",
  "Downled",
  "Goleta Pro",
  "Roadlight",
  "Cubic Bolardo",
  "Modulare",
] as const;

const serializarCatalogoPublico = () =>
  JSON.stringify(products.map((product) => toPublicProduct(product))).toLocaleLowerCase("es");

test("el catálogo público oculta las marcas y líneas identificadas del proveedor", () => {
  const catalogoPublico = serializarCatalogoPublico();

  for (const identificador of IDENTIFICADORES_PUBLICOS_PROHIBIDOS) {
    assert.equal(
      catalogoPublico.includes(identificador.toLocaleLowerCase("es")),
      false,
      `el catálogo público todavía contiene ${identificador}`,
    );
  }
});

test("las rutas públicas de las imágenes son neutras y existen en el repositorio", () => {
  for (const product of products) {
    const publicProduct = toPublicProduct(product);
    const imagePaths = new Set([publicProduct.image, ...(publicProduct.images ?? [])]);

    for (const imagePath of imagePaths) {
      assert.match(imagePath, /^\/catalogos\/(arquitectonico|lineal|electrico)\//);
      assert.doesNotMatch(imagePath, /artlite|construlita|highlum|magnetrackpro/i);
      assert.equal(
        existsSync(join(process.cwd(), "public", imagePath.replace(/^\//, ""))),
        true,
        `no existe la imagen pública ${imagePath}`,
      );
    }
  }
});

test("el catálogo interno conserva los datos que necesita el personal autorizado", () => {
  const catalogoInterno = JSON.stringify(products).toLocaleLowerCase("es");

  for (const marca of ["Artlite", "Construlita", "Highlum"] as const) {
    assert.equal(
      catalogoInterno.includes(marca.toLocaleLowerCase("es")),
      true,
      `el catálogo interno ha perdido la marca ${marca}`,
    );
  }

  assert.equal(catalogoInterno.includes("magnetrack pro"), true);
});

test("la garantía (warranty) es estrictamente interna y nunca forma parte del catálogo público", () => {
  // 1. No debe figurar en el registro de especificaciones públicas ni en sus claves
  const registryKeys: readonly string[] = PUBLIC_TECHNICAL_SPEC_REGISTRY.map((entry) => entry.key);
  assert.equal(
    registryKeys.includes("warranty"),
    false,
    "warranty no debe estar presente en PUBLIC_TECHNICAL_SPEC_REGISTRY",
  );
  assert.equal(
    (PUBLIC_TECHNICAL_SPEC_KEYS as readonly string[]).includes("warranty"),
    false,
    "warranty no debe estar en PUBLIC_TECHNICAL_SPEC_KEYS",
  );

  // 2. Ningún producto público proyectado debe tener la clave warranty en su technicalSpecs
  for (const product of products) {
    const publicProduct = toPublicProduct({
      ...product,
      technicalSpecs: {
        ...product.technicalSpecs,
        warranty: "5 años",
      } as Record<string, string | string[] | undefined>,
    });

    assert.equal(
      "warranty" in (publicProduct.technicalSpecs ?? {}),
      false,
      `warranty se filtró a technicalSpecs del producto público ${publicProduct.econoluzReference}`,
    );
  }
});

test("el código del fabricante (supplier_code) nunca se proyecta en el catálogo público", () => {
  for (const product of products) {
    const publicProduct = toPublicProduct({
      ...product,
      supplier_code: "CODIGO-SECRETO-PROV-123",
    } as unknown as (typeof products)[number]);

    assert.equal(
      "supplier_code" in publicProduct,
      false,
      "supplier_code no debe existir en PublicProduct",
    );
    assert.equal(
      "proveedorCodigo" in publicProduct,
      false,
      "proveedorCodigo no debe existir en PublicProduct",
    );
  }
});

test("migración 016: el SQL de reparación nunca proyecta v_specs ni filtra claves privadas a public_products", () => {
  const sqlContent = readFileSync(
    join(process.cwd(), "db", "016_reparar_eco_ele_0001.sql"),
    "utf8",
  );

  // 1. No debe utilizar la asignación insegura v_specs - 'warranty'
  assert.equal(
    /v_specs\s*-\s*'warranty'/i.test(sqlContent),
    false,
    "La migración 016 no debe utilizar 'v_specs - warranty' para public_products",
  );

  // 2. Debe actualizar únicamente las tres claves públicas autorizadas: lifetime, amperage, frequency
  assert.match(sqlContent, /lifetime/);
  assert.match(sqlContent, /amperage/);
  assert.match(sqlContent, /frequency/);

  // 3. Debe eliminar explícitamente warranty y lifespan de public_products
  assert.match(sqlContent, /-\s*'warranty'/);
  assert.match(sqlContent, /-\s*'lifespan'/);

  // 4. No debe forzar sobrescritura si ya existe valor no vacío
  // Debe comprobar existencia o no vacío antes de asignar valores por defecto
  assert.match(
    sqlContent,
    /coalesce|nullif|\?\s*'amperage'|\?\s*'frequency'|\?\s*'lifetime'|\?\s*'warranty'/i,
    "La migración debe respetar valores preexistentes no vacíos",
  );
});

test("migración 016: la semántica de reparación preserva claves privadas y respeta valores existentes", () => {
  // Función puramente declarativa que emula el bloque PL/pgSQL exacto de la migración 016
  const aplicarMigracion016 = (
    prodSpecsOriginal: Record<string, unknown> | null | undefined,
    pubSpecsOriginal: Record<string, unknown> | null | undefined,
  ) => {
    const v_specs: Record<string, unknown> = { ...(prodSpecsOriginal ?? {}) };
    let v_lifetime = "40000";

    // 1. lifetime y lifespan
    if (typeof v_specs.lifetime === "string" && v_specs.lifetime.trim().length > 0) {
      v_lifetime = v_specs.lifetime.trim();
    } else if (typeof v_specs.lifespan === "string" && v_specs.lifespan.trim().length > 0) {
      v_lifetime = v_specs.lifespan.trim();
    } else {
      v_lifetime = "40000";
    }
    v_specs.lifetime = v_lifetime;
    delete v_specs.lifespan;

    // 2. warranty
    if (!v_specs.warranty || (typeof v_specs.warranty === "string" && v_specs.warranty.trim().length === 0)) {
      v_specs.warranty = "5 años";
    }

    // 3. amperage
    let v_amperage = "15A";
    if (typeof v_specs.amperage === "string" && v_specs.amperage.trim().length > 0) {
      v_amperage = v_specs.amperage.trim();
    } else {
      v_specs.amperage = v_amperage;
    }

    // 4. frequency
    let v_frequency = "50/60Hz";
    if (typeof v_specs.frequency === "string" && v_specs.frequency.trim().length > 0) {
      v_frequency = v_specs.frequency.trim();
    } else {
      v_specs.frequency = v_frequency;
    }

    // 5. public_products (solo claves autorizadas y conservación de existentes)
    const v_pub_specs: Record<string, unknown> = { ...(pubSpecsOriginal ?? {}) };
    delete v_pub_specs.warranty;
    delete v_pub_specs.lifespan;

    v_pub_specs.lifetime = v_lifetime;
    v_pub_specs.amperage = v_amperage;
    v_pub_specs.frequency = v_frequency;

    return { products: v_specs, public_products: v_pub_specs };
  };

  // Escenario A: Clave privada ficticia y productCode no cruzan a public_products
  const casoA = aplicarMigracion016(
    {
      voltage: "127/250V",
      lifespan: "40000",
      clavePrivadaFicticia: "secreto-interno-12345",
      productCode: "APL-001-FAB",
    },
    {
      finish: "Blanco brillante",
      voltage: "127/250V",
    },
  );

  assert.equal(casoA.products.clavePrivadaFicticia, "secreto-interno-12345");
  assert.equal(casoA.products.productCode, "APL-001-FAB");
  assert.equal("clavePrivadaFicticia" in casoA.public_products, false, "clave privada no debe cruzar");
  assert.equal("productCode" in casoA.public_products, false, "productCode no debe cruzar");
  assert.equal("warranty" in casoA.public_products, false, "warranty no debe cruzar");

  // Escenario B: Un amperage o frequency no vacíos distintos de los valores por defecto no deben sobrescribirse
  const casoB = aplicarMigracion016(
    {
      lifetime: "50000",
      lifespan: "30000", // lifespan debe ignorarse ante lifetime existente
      amperage: "20A",
      frequency: "60Hz",
      warranty: "10 años",
    },
    {
      finish: "Negro mate",
      amperage: "20A",
      frequency: "60Hz",
    },
  );

  assert.equal(casoB.products.lifetime, "50000", "lifetime existente tiene prioridad sobre lifespan");
  assert.equal("lifespan" in casoB.products, false, "lifespan debe eliminarse");
  assert.equal(casoB.products.amperage, "20A", "amperage existente no se sobrescribe");
  assert.equal(casoB.products.frequency, "60Hz", "frequency existente no se sobrescribe");
  assert.equal(casoB.products.warranty, "10 años", "warranty existente no se sobrescribe");
  assert.equal(casoB.public_products.amperage, "20A");
  assert.equal(casoB.public_products.frequency, "60Hz");
  assert.equal(casoB.public_products.lifetime, "50000");

  // Escenario C: Idempotencia estricta al ejecutar la lógica dos veces
  const primera = aplicarMigracion016(casoA.products, casoA.public_products);
  const segunda = aplicarMigracion016(primera.products, primera.public_products);
  assert.deepEqual(segunda.products, primera.products);
  assert.deepEqual(segunda.public_products, primera.public_products);
});
