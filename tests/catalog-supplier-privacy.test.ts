import assert from "node:assert/strict";
import { existsSync } from "node:fs";
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
      } as Record<string, unknown>,
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
