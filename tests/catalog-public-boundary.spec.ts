import { expect, test } from "@playwright/test";
import baseline from "./fixtures/catalog-baseline.json";
import { products } from "../app/data/products";
import nextConfig from "../next.config";
import { sanitizePublicSupplierText } from "../app/data/publicProductPrivacy";
import {
  getPopulatedApplicationIds,
  productTypes,
} from "../app/data/catalogTaxonomy";

type PermanentReferenceModule = {
  productReferenceByInternalId: Readonly<Record<string, string>>;
  validatePermanentReferences: (
    internalIds: readonly string[],
    references?: Readonly<Record<string, string>>,
  ) => void;
};

const loadPermanentReferences = async (): Promise<PermanentReferenceModule | null> => {
  try {
    return await import("../app/data/productReferences");
  } catch {
    return null;
  }
};

const expectedPublicTechnicalSpecKeys = [
  "acrylic",
  "amperage",
  "applicationType",
  "battery",
  "batteryLifetime",
  "beamAngle",
  "certification",
  "certifications",
  "chargingTime",
  "colorTemperature",
  "configuration",
  "cri",
  "cutout",
  "dielectricVoltage",
  "dimensions",
  "dimming",
  "disconnectSpeed",
  "driver",
  "efficiency",
  "equivalent",
  "finish",
  "finishOptions",
  "fixing",
  "frequency",
  "functions",
  "gfciSupport",
  "humidity",
  "impactRating",
  "installation",
  "installationHeight",
  "ledType",
  "lifetime",
  "lightSource",
  "luminousFlux",
  "material",
  "mountingHeight",
  "operatingTemperature",
  "panelLifetime",
  "pcbSize",
  "power",
  "powerFactor",
  "presentation",
  "protection",
  "range",
  "recommendedUse",
  "savings",
  "shortCircuitCurrent",
  "solarPanel",
  "specialFeatures",
  "standard",
  "surgeProtection",
  "switchablePower",
  "switchingLevel",
  "ugr",
  "usbOutput",
  "voltage",
  "weight",
] as const;

type PublicProductModule = {
  PUBLIC_TECHNICAL_SPEC_KEYS: readonly string[];
  PUBLIC_TECHNICAL_SPEC_REGISTRY: readonly { key: string; label: string }[];
  toPublicProduct: (product: never) => Record<string, unknown>;
};

const loadPublicProductModule = async (): Promise<PublicProductModule | null> => {
  try {
    return await import("../app/data/publicProduct");
  } catch {
    return null;
  }
};

const collectKeys = (value: unknown, keys = new Set<string>()) => {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectKeys(entry, keys));
    return keys;
  }

  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, entry]) => {
      keys.add(key);
      collectKeys(entry, keys);
    });
  }

  return keys;
};

test("keeps every ECONOLUZ reference permanently keyed by internal product identity", async () => {
  const permanentReferences = await loadPermanentReferences();

  expect(permanentReferences).not.toBeNull();

  const expectedByInternalId = Object.fromEntries(
    baseline.products.map((product) => [product.id, product.econoluzReference]),
  );

  expect(permanentReferences?.productReferenceByInternalId).toEqual(expectedByInternalId);
  expect(
    [...products]
      .reverse()
      .map((product) => permanentReferences?.productReferenceByInternalId[product.id]),
  ).toEqual([...baseline.references].reverse());
});

test("rejects missing and duplicate permanent reference assignments", async () => {
  const permanentReferences = await loadPermanentReferences();

  expect(permanentReferences).not.toBeNull();

  const references = permanentReferences?.productReferenceByInternalId ?? {};
  const internalIds = products.map((product) => product.id);
  const firstId = internalIds[0];
  const secondId = internalIds[1];
  const missingReferenceMap = { ...references };
  delete missingReferenceMap[firstId];
  const duplicateReferenceMap = {
    ...references,
    [secondId]: references[firstId],
  };

  expect(() =>
    permanentReferences?.validatePermanentReferences(internalIds, missingReferenceMap),
  ).toThrow(`missing permanent reference for ${firstId}`);
  expect(() =>
    permanentReferences?.validatePermanentReferences(internalIds, duplicateReferenceMap),
  ).toThrow(`duplicate permanent reference ${references[firstId]}`);
});

test("projects internal products through a strict public allowlist and safe ID", async () => {
  const publicProductModule = await loadPublicProductModule();

  expect(publicProductModule).not.toBeNull();

  const internal = products[0] as unknown as Record<string, unknown>;
  const withSentinels = {
    ...internal,
    id: "supplier-derived-internal-id",
    price: 123,
    cost: 45,
    inventory: 6,
    warranty: "secret",
    futureSupplierSecret: "must-not-cross",
  };
  const projected = publicProductModule?.toPublicProduct(withSentinels as never) ?? {};
  const sameReferenceDifferentInternalId = publicProductModule?.toPublicProduct({
    ...withSentinels,
    id: "another-internal-id",
  } as never);
  const forbiddenKeys = [
    "name",
    "description",
    "sku",
    "brand",
    "supplierCode",
    "supplierBrand",
    "productCode",
    "availability",
    "warranty",
    "price",
    "cost",
    "discount",
    "inventory",
    "stock",
    "futureSupplierSecret",
  ];

  expect(projected.id).toBe(sameReferenceDifferentInternalId?.id);
  expect(projected.id).not.toContain("supplier-derived-internal-id");
  expect([...collectKeys(projected)].filter((key) => forbiddenKeys.includes(key))).toEqual([]);
});

test("publishes every approved technical value and no internal specification", async () => {
  const publicProductModule = await loadPublicProductModule();

  expect(publicProductModule).not.toBeNull();
  expect(publicProductModule?.PUBLIC_TECHNICAL_SPEC_KEYS).toEqual(
    expectedPublicTechnicalSpecKeys,
  );
  expect(expectedPublicTechnicalSpecKeys).toHaveLength(57);
  expect(publicProductModule?.PUBLIC_TECHNICAL_SPEC_REGISTRY.map(({ key }) => key)).toEqual(
    expectedPublicTechnicalSpecKeys,
  );

  const normalizedKeys = [
    ...new Set(products.flatMap((product) => Object.keys(product.technicalSpecs ?? {}))),
  ].sort();
  expect(normalizedKeys).toHaveLength(58);
  expect(normalizedKeys).toEqual([...expectedPublicTechnicalSpecKeys, "availability"].sort());

  for (const internal of products) {
    const projected = publicProductModule?.toPublicProduct(
      internal as never,
    ) as { technicalSpecs?: Record<string, string | string[]> };
    const expectedSpecs = Object.fromEntries(
      expectedPublicTechnicalSpecKeys
        .filter((key) => internal.technicalSpecs?.[key] !== undefined)
        .map((key) => {
          const value = internal.technicalSpecs?.[key];

          return [
            key,
            Array.isArray(value)
              ? value.map((entry) => sanitizePublicSupplierText(entry, internal))
              : sanitizePublicSupplierText(value as string, internal),
          ];
        }),
    );

    expect(projected.technicalSpecs ?? {}).toEqual(expectedSpecs);
  }

  const certificationLabels = publicProductModule?.PUBLIC_TECHNICAL_SPEC_REGISTRY
    .filter(({ key }) => key === "certification" || key === "certifications")
    .map(({ label }) => label);
  expect(certificationLabels).toEqual(["Certificaciones", "Certificaciones"]);
});

test("makes every public product reachable through corrected catalog taxonomy", async () => {
  const publicProductModule = await loadPublicProductModule();

  expect(publicProductModule).not.toBeNull();

  const publicProducts = products.map((product) =>
    publicProductModule?.toPublicProduct(product as never),
  ) as { productType: string; application: string }[];

  expect(productTypes.iluminacion_exterior.applications).toContain("decorativos");

  for (const product of publicProducts) {
    const productType = productTypes[product.productType as keyof typeof productTypes];

    expect(productType, product.productType).toBeDefined();
    expect(productType.applications, `${product.productType}/${product.application}`).toContain(
      product.application,
    );
  }
});

test("restores five plate applications from their declared source subcategory", async () => {
  const publicProductModule = await loadPublicProductModule();

  expect(publicProductModule).not.toBeNull();

  const expectedApplicationByFamily = {
    Atenuadores: "atenuadores",
    "Datos / LAN": "datos_lan",
    "TV / coaxial": "tv_coaxial",
    Timbres: "timbres",
    "Tapas ciegas": "tapas_ciegas",
  } as const;

  for (const [family, expectedApplication] of Object.entries(expectedApplicationByFamily)) {
    const matchingProducts = products.filter((product) => product.labels.family === family);

    expect(matchingProducts.length, family).toBeGreaterThan(0);
    for (const internal of matchingProducts) {
      const projected = publicProductModule?.toPublicProduct(internal as never) as {
        application: string;
        labels: { application: string };
      };

      expect(projected.application, internal.id).toBe(expectedApplication);
    }
  }
});

test("defensively omits applications that have no products", () => {
  const onlyAtenuadores = [
    { productType: "placas_accesorios", application: "atenuadores" },
  ];

  expect(getPopulatedApplicationIds("placas_accesorios", onlyAtenuadores)).toEqual([
    "atenuadores",
  ]);
});

test("projects supplier image paths through neutral public directories", async () => {
  const publicProductModule = await loadPublicProductModule();

  expect(publicProductModule).not.toBeNull();

  for (const internal of products) {
    const projected = publicProductModule?.toPublicProduct(internal as never) as {
      image: string;
      images?: string[];
    };
    const publicImages = projected.images ?? [projected.image];

    expect(projected.image).toMatch(/^\/catalogos\/(arquitectonico|lineal|electrico)\//);
    expect(publicImages).not.toEqual(internal.images?.length ? internal.images : [internal.image]);

    for (const image of publicImages) {
      expect(image).not.toMatch(/artlite|construlita|highlum|magnetrackpro/i);
    }
  }
});

test("does not configure public catalog image rewrites", () => {
  expect(nextConfig.rewrites).toBeUndefined();
});
