import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import baseline from "./fixtures/catalog-baseline.json";
import {
  createCatalogBaseline,
  loadCurrentCatalog,
  validateCatalog,
  verifyCatalogBaseline,
  type CatalogBaseline,
} from "./helpers/catalog-baseline";

const catalogBaseline = baseline as CatalogBaseline;
const { catalog: products, taxonomy } = loadCurrentCatalog();
const firstProduct = products[0];
const fixtureMetadata = catalogBaseline as unknown as {
  capturedAggregateHashes: Record<string, string>;
  verificationAggregateHashes: Record<string, string>;
};
const verificationBaseline = {
  ...catalogBaseline,
  verificationAggregateHashes: {
    publicCanonicalSha256: "69bf6aa565cdbf74268fd1e179a0adc070b867ed13df5675a720bae995093eca",
    internalCanonicalSha256: "2dd3df91d58b4e00cbbfdd4a932a835263eb8052aa9db9c68243c6faea601d64",
    referenceMapSha256: "57307a880fe854730ee43816b3f8f45153b3732e51a28e9aa6b332e7a8a3dcd9",
    productHashMapSha256: "38e5c3779f41924dbf0f70ad0bfa64ed79e7b25543718bdf39cacd9c8c76617d",
  },
} as unknown as CatalogBaseline;

const issuesFor = (catalog = products) =>
  validateCatalog({
    catalog,
    taxonomy,
    assetExists: (imagePath) => existsSync(join(process.cwd(), "public", imagePath)),
  });

test("rejects a mutated product fixture instead of accepting altered catalog content", () => {
  const mutated = products.map((product) =>
    product.id === firstProduct.id ? { ...product, publicName: "Nombre alterado" } : product,
  );

  expect(verifyCatalogBaseline(mutated, catalogBaseline)).toContain(
    `content hash changed for ${firstProduct.id}`,
  );
});

test("rejects a missing product fixture", () => {
  expect(verifyCatalogBaseline(products.slice(1), createCatalogBaseline(products))).toContain(
    `missing product ${firstProduct.id}`,
  );
});

test("rejects duplicate product IDs", () => {
  expect(issuesFor([...products, { ...firstProduct }])).toContain(`duplicate id ${firstProduct.id}`);
});

test("rejects duplicate ECONOLUZ references", () => {
  expect(
    issuesFor([
      ...products,
      { ...firstProduct, id: "duplicate-reference-test", econoluzReference: firstProduct.econoluzReference },
    ]),
  ).toContain(`duplicate reference ${firstProduct.econoluzReference}`);
});

test("rejects a missing product image", () => {
  expect(
    issuesFor(products.map((product) => (product.id === firstProduct.id
      ? { ...product, image: "/catalogos/missing-test-image.webp" }
      : product))),
  ).toContain(`missing image /catalogos/missing-test-image.webp for ${firstProduct.id}`);
});

test("rejects an invalid taxonomy assignment", () => {
  expect(
    issuesFor(products.map((product) => (product.id === firstProduct.id
      ? { ...product, application: "not-a-catalog-application" }
      : product))),
  ).toContain(`invalid application not-a-catalog-application for ${firstProduct.id}`);
});

test("rejects an existing application assigned to the wrong product type", () => {
  expect(
    issuesFor(products.map((product) => (product.id === firstProduct.id
      ? { ...product, application: "downlights" }
      : product))),
  ).toContain(`application downlights is unreachable from placas_accesorios for ${firstProduct.id}`);
});

test("rejects an altered technical specification", () => {
  const productWithSpecification = products.find((product) => product.technicalSpecs?.power);

  expect(productWithSpecification).toBeDefined();

  const altered = products.map((product) => (product.id === productWithSpecification?.id
    ? {
        ...product,
        technicalSpecs: { ...product.technicalSpecs, power: "999 W" },
      }
    : product));

  expect(verifyCatalogBaseline(altered, catalogBaseline)).toContain(
    `technical specification hash changed for ${productWithSpecification?.id}`,
  );
});

test("protects the exact 313 ECONOLUZ references in their current array order", () => {
  expect(products).toHaveLength(313);
  expect(products.map((product) => product.econoluzReference)).toEqual(catalogBaseline.references);
  expect(verifyCatalogBaseline([...products].reverse(), catalogBaseline)).toContain(
    "reference order changed",
  );
});

test("rejects a captured aggregate hash that no longer matches the source catalog", () => {
  expect(
    verifyCatalogBaseline(products, {
      ...verificationBaseline,
      verificationAggregateHashes: {
        ...fixtureMetadata.verificationAggregateHashes,
        referenceMapSha256: "0".repeat(64),
      },
    } as CatalogBaseline),
  ).toContain("reference map hash changed");
});

test("matches the captured baseline against the untouched source catalog", () => {
  expect(catalogBaseline.productCount).toBe(313);
  expect(fixtureMetadata.capturedAggregateHashes.publicCanonicalSha256).toBe(
    "34c8c64fb279deb2068bf48c96083d0b8bf6b37521b63918e57029a6280c1a03",
  );
  expect(fixtureMetadata.capturedAggregateHashes.internalCanonicalSha256).toBe(
    "2aa7e0cbd73f91934b58d1efd4b24b2c6e5ef93e514b101945cdfe148c814be6",
  );
  expect(fixtureMetadata.capturedAggregateHashes.referenceMapSha256).toBe(
    "e5a0a7788e3a86be9c2e6936c242608dcd4884b94a7781c9d8b75af32e73bb8c",
  );
  expect(fixtureMetadata.capturedAggregateHashes.productHashMapSha256).toBe(
    "3d238e8fc944bf4b697d90515e0a1753e0e69010de751b708d8054b72dbf466c",
  );
  expect(fixtureMetadata.verificationAggregateHashes).toEqual(
    verificationBaseline.verificationAggregateHashes,
  );
  expect(verifyCatalogBaseline(products, catalogBaseline)).toEqual([]);
  expect(issuesFor(products)).toEqual([
    "application decorativos is unreachable from iluminacion_exterior for construlita-bronce-ou2001c00k",
    "application decorativos is unreachable from iluminacion_exterior for construlita-bronce-ou6026c00k",
    "application decorativos is unreachable from iluminacion_exterior for construlita-bronce-ou3022c00k",
    "application decorativos is unreachable from iluminacion_exterior for construlita-bronce-ou3023c00k",
    "application decorativos is unreachable from iluminacion_exterior for construlita-bronce-ou7012c00k",
    "application decorativos is unreachable from iluminacion_exterior for construlita-bronce-ou7014c00k",
    "application decorativos is unreachable from iluminacion_exterior for construlita-bronce-re8200c00k",
    "application decorativos is unreachable from iluminacion_exterior for construlita-bronce-re8201c00k",
    "application decorativos is unreachable from iluminacion_exterior for construlita-bronce-ou9010c00k",
    "application decorativos is unreachable from iluminacion_exterior for construlita-bronce-ou9011cbcf",
    "application decorativos is unreachable from iluminacion_exterior for construlita-bronce-ou9012c00k",
    "application decorativos is unreachable from iluminacion_exterior for construlita-bronce-ac7600c",
    "application decorativos is unreachable from iluminacion_exterior for construlita-landscape",
  ]);
});
