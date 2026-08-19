import { createHash } from "node:crypto";
import { applications, productTypes } from "../../app/data/catalogTaxonomy";
import { products } from "../../app/data/products";

export type CatalogBaseline = {
  productCount: number;
  publicCanonicalSha256: string;
  internalCanonicalSha256: string;
  referenceMapSha256: string;
  productHashMapSha256: string;
  references: string[];
  products: Array<{
    id: string;
    econoluzReference: string;
    contentSha256: string;
    technicalSpecsSha256: string;
  }>;
};

type CatalogProduct = {
  id: string;
  econoluzReference: string;
  image: string;
  images?: string[];
  publicName: string;
  publicDescription: string;
  productType: string;
  application: string;
  series: string;
  finish: string;
  labels: Record<string, string>;
  technicalSpecs?: Record<string, string | string[]>;
};

type CatalogTaxonomy = {
  productTypes: Record<string, { applications: readonly string[] }>;
  applications: Record<string, unknown>;
};

type CatalogValidationInput = {
  catalog: readonly CatalogProduct[];
  taxonomy: CatalogTaxonomy;
  assetExists: (imagePath: string) => boolean;
  reachableIds: readonly string[];
};

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  }

  return value;
};

const sha256 = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex");

const contentFor = (product: CatalogProduct) => ({
  id: product.id,
  econoluzReference: product.econoluzReference,
  publicName: product.publicName,
  publicDescription: product.publicDescription,
  image: product.image,
  images: product.images ?? [],
  productType: product.productType,
  application: product.application,
  series: product.series,
  finish: product.finish,
  labels: product.labels,
});

const snapshotProduct = (product: CatalogProduct) => ({
  id: product.id,
  econoluzReference: product.econoluzReference,
  contentSha256: sha256(contentFor(product)),
  technicalSpecsSha256: sha256(product.technicalSpecs ?? {}),
});

export const createCatalogBaseline = (catalog: readonly CatalogProduct[]): CatalogBaseline => {
  const snapshotProducts = catalog.map(snapshotProduct);
  const references = catalog.map((product) => product.econoluzReference);

  return {
    productCount: catalog.length,
    publicCanonicalSha256: sha256(catalog.map(contentFor)),
    internalCanonicalSha256: sha256(catalog),
    referenceMapSha256: sha256(references),
    productHashMapSha256: sha256(snapshotProducts),
    references,
    products: snapshotProducts,
  };
};

export const loadCurrentCatalog = () => ({
  catalog: products,
  taxonomy: { productTypes, applications },
});

const duplicateValues = (values: readonly string[], label: string) => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  }

  return [...duplicates].map((value) => `duplicate ${label} ${value}`);
};

export const validateCatalog = ({
  catalog,
  taxonomy,
  assetExists,
  reachableIds,
}: CatalogValidationInput): string[] => {
  const issues = [
    ...duplicateValues(catalog.map((product) => product.id), "id"),
    ...duplicateValues(catalog.map((product) => product.econoluzReference), "reference"),
  ];
  const reachable = new Set(reachableIds);

  for (const product of catalog) {
    if (!taxonomy.productTypes[product.productType]) {
      issues.push(`invalid product type ${product.productType} for ${product.id}`);
    }

    if (!taxonomy.applications[product.application]) {
      issues.push(`invalid application ${product.application} for ${product.id}`);
    }

    for (const imagePath of new Set([product.image, ...(product.images ?? [])])) {
      if (!assetExists(imagePath)) {
        issues.push(`missing image ${imagePath} for ${product.id}`);
      }
    }

    if (!reachable.has(product.id)) {
      issues.push(`unreachable product ${product.id}`);
    }
  }

  return issues;
};

export const verifyCatalogBaseline = (
  _catalog: readonly CatalogProduct[],
  _baseline: CatalogBaseline,
): string[] => {
  const catalog = _catalog;
  const baseline = _baseline;
  const issues = [
    ...duplicateValues(catalog.map((product) => product.id), "id"),
    ...duplicateValues(catalog.map((product) => product.econoluzReference), "reference"),
  ];
  const sourceById = new Map(catalog.map((product) => [product.id, product]));
  const expectedIds = new Set(baseline.products.map((product) => product.id));

  if (catalog.length !== baseline.productCount) {
    issues.push(`product count changed: expected ${baseline.productCount}, received ${catalog.length}`);
  }

  for (const expected of baseline.products) {
    const product = sourceById.get(expected.id);

    if (!product) {
      issues.push(`missing product ${expected.id}`);
      continue;
    }

    if (product.econoluzReference !== expected.econoluzReference) {
      issues.push(`reference changed for ${expected.id}`);
    }

    if (snapshotProduct(product).contentSha256 !== expected.contentSha256) {
      issues.push(`content hash changed for ${expected.id}`);
    }

    if (snapshotProduct(product).technicalSpecsSha256 !== expected.technicalSpecsSha256) {
      issues.push(`technical specification hash changed for ${expected.id}`);
    }
  }

  for (const product of catalog) {
    if (!expectedIds.has(product.id)) {
      issues.push(`unexpected product ${product.id}`);
    }
  }

  if (catalog.map((product) => product.econoluzReference).join("\u0000") !== baseline.references.join("\u0000")) {
    issues.push("reference order changed");
  }

  return issues;
};
