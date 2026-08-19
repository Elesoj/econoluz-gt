import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { series } from "../app/data/catalogTaxonomy";
import { products } from "../app/data/products";
import { toPublicProduct } from "../app/data/publicProduct";

const collectFiles = (path: string): string[] => {
  if (!existsSync(path)) {
    return [];
  }

  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(path, entry.name);
    return entry.isDirectory() ? collectFiles(entryPath) : [entryPath];
  });
};

const publicStaticFiles = () =>
  collectFiles(join(process.cwd(), ".next", "static"));

const publicCatalogPayloadFiles = () =>
  [
    join(process.cwd(), ".next", "server", "app", "catalogo.html"),
    join(process.cwd(), ".next", "server", "app", "catalogo.rsc"),
    ...collectFiles(join(process.cwd(), ".next", "server", "app", "catalogo.segments")),
  ].filter(existsSync);

const textArtifactExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".map",
  ".rsc",
  ".txt",
]);

const knownPhysicalImagePaths = [
  ...new Set(
    products.flatMap((product) =>
      product.images?.length ? product.images : [product.image],
    ),
  ),
].sort((left, right) => right.length - left.length);

const CAPTURED_PHYSICAL_IMAGE_PATH_COUNT = 326;
const CAPTURED_PHYSICAL_IMAGE_PATH_SHA256 =
  "75aeb25adffde0a579118a00a4097a2ac5594e6432a885b27b86d1771fca0d24";

const getPhysicalImagePathFingerprint = (imagePaths: readonly string[]) => {
  const canonicalPaths = [...new Set(imagePaths)].sort();

  return {
    count: canonicalPaths.length,
    sha256: createHash("sha256")
      .update(JSON.stringify(canonicalPaths))
      .digest("hex"),
  };
};

const validateCapturedPhysicalImagePaths = (imagePaths: readonly string[]) => {
  const fingerprint = getPhysicalImagePathFingerprint(imagePaths);

  if (
    fingerprint.count !== CAPTURED_PHYSICAL_IMAGE_PATH_COUNT ||
    fingerprint.sha256 !== CAPTURED_PHYSICAL_IMAGE_PATH_SHA256
  ) {
    throw new Error(
      `captured catalog image path fingerprint mismatch: expected ${CAPTURED_PHYSICAL_IMAGE_PATH_COUNT}/${CAPTURED_PHYSICAL_IMAGE_PATH_SHA256}, received ${fingerprint.count}/${fingerprint.sha256}`,
    );
  }
};

validateCapturedPhysicalImagePaths(knownPhysicalImagePaths);

const CAPTURED_PUBLIC_SERIES_REGISTRY_COUNT = 72;
const CAPTURED_PUBLIC_SERIES_REGISTRY_SHA256 =
  "57163223f0a4e36e6a14fb8796f4461ff7b2ff04b1b5a856c8c79412cd44ecf5";

const canonicalPublicSeriesRegistry = Object.fromEntries(
  Object.entries(series).sort(([left], [right]) => left.localeCompare(right)),
);

const validateCapturedPublicSeriesRegistry = () => {
  const count = Object.keys(canonicalPublicSeriesRegistry).length;
  const sha256 = createHash("sha256")
    .update(JSON.stringify(canonicalPublicSeriesRegistry))
    .digest("hex");

  if (
    count !== CAPTURED_PUBLIC_SERIES_REGISTRY_COUNT ||
    sha256 !== CAPTURED_PUBLIC_SERIES_REGISTRY_SHA256
  ) {
    throw new Error(
      `captured public series registry fingerprint mismatch: expected ${CAPTURED_PUBLIC_SERIES_REGISTRY_COUNT}/${CAPTURED_PUBLIC_SERIES_REGISTRY_SHA256}, received ${count}/${sha256}`,
    );
  }
};

validateCapturedPublicSeriesRegistry();

const expandInternalCode = (value: string) => {
  const parts = value
    .split(/\s*\/\s*/)
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.length > 1 ? [value, ...parts] : [value];
};

type InternalTokenSource = {
  token: string;
  internalField: string;
  internalReference: string;
};

const internalTokenSources: InternalTokenSource[] = products.flatMap((product) => {
  const internal = product as unknown as Record<string, unknown>;
  const technicalSpecs = (internal.technicalSpecs ?? {}) as Record<string, unknown>;
  const tokenFields = [
    ["id", internal.id],
    ["sku", internal.sku],
    ["supplierCode", internal.supplierCode],
    ["technicalSpecs.productCode", technicalSpecs.productCode],
    ["brand", internal.brand],
    ["supplierBrand", internal.supplierBrand],
    [
      "labels.brand",
      (internal.labels as Record<string, unknown> | undefined)?.brand,
    ],
  ] as const;

  return tokenFields.flatMap(([internalField, value]) =>
    typeof value === "string" && value.length > 0
      ? expandInternalCode(value).map((token) => ({
          token,
          internalField,
          internalReference: product.econoluzReference,
        }))
      : [],
  );
});

const knownInternalTokens = [
  ...new Set(internalTokenSources.map(({ token }) => token)),
].sort((left, right) => right.length - left.length);

type PublicValueContext = {
  publicReference: string;
  publicField: string;
  value: string;
};

const collectPublicValues = (
  value: unknown,
  publicReference: string,
  path = "",
): PublicValueContext[] => {
  if (typeof value === "string") {
    return path === "image" || path.startsWith("images[")
      ? []
      : [{ publicReference, publicField: path, value }];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      collectPublicValues(entry, publicReference, `${path}[${index}]`),
    );
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  return Object.entries(value).flatMap(([key, entry]) =>
    collectPublicValues(entry, publicReference, path ? `${path}.${key}` : key),
  );
};

const approvedPublicValues = products.flatMap((product) =>
  collectPublicValues(
    toPublicProduct(product),
    product.econoluzReference,
  ),
);

const approvedInternalTokenCollisions = approvedPublicValues.flatMap(
  (publicValue) => {
    const matchingTokens = knownInternalTokens.filter((token) =>
      new RegExp(
        `(^|[^A-Za-z0-9_-])${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Za-z0-9_-]|$)`,
      ).test(publicValue.value),
    );

    return matchingTokens.map((token) => ({ token, ...publicValue }));
  },
);

const expectedApprovedInternalTokenCollisions = [
  {
    token: "cuasar",
    publicReference: "ECO-IND-0042",
    publicField: "series",
    value: "cuasar",
  },
  {
    token: "hb_pure",
    publicReference: "ECO-IND-0043",
    publicField: "series",
    value: "hb_pure",
  },
  {
    token: "hb_steel",
    publicReference: "ECO-IND-0044",
    publicField: "series",
    value: "hb_steel",
  },
  {
    token: "highlens",
    publicReference: "ECO-IND-0045",
    publicField: "series",
    value: "highlens",
  },
  {
    token: "supreme",
    publicReference: "ECO-IND-0046",
    publicField: "series",
    value: "supreme",
  },
  {
    token: "YS-I",
    publicReference: "ECO-CAT-0161",
    publicField: "technicalSpecs.specialFeatures[11]",
    value: "Conectores tipo I: YS-I/B, YS-I/N, YS-I/S",
  },
  {
    token: "YS-L",
    publicReference: "ECO-CAT-0161",
    publicField: "technicalSpecs.specialFeatures[12]",
    value: "Conectores tipo L: YS-L/B, YS-L/N, YS-L/S",
  },
  {
    token: "YS-I",
    publicReference: "ECO-CAT-0162",
    publicField: "technicalSpecs.specialFeatures[12]",
    value: "Conectores tipo I: YS-I/B, YS-I/N",
  },
  {
    token: "YS-L",
    publicReference: "ECO-CAT-0162",
    publicField: "technicalSpecs.specialFeatures[13]",
    value: "Conectores tipo L: YS-L/B, YS-L/N",
  },
  {
    token: "YS-I",
    publicReference: "ECO-CAT-0164",
    publicField: "technicalSpecs.specialFeatures[8]",
    value: "Conectores tipo I: YS-I/B, YS-I/N",
  },
  {
    token: "YS-L",
    publicReference: "ECO-CAT-0164",
    publicField: "technicalSpecs.specialFeatures[9]",
    value: "Conectores tipo L: YS-L/B, YS-L/N",
  },
  {
    token: "Pecktrack Light",
    publicReference: "ECO-CAT-0168",
    publicField: "labels.series",
    value: "Pecktrack Light",
  },
  {
    token: "FL5",
    publicReference: "ECO-CAT-0173",
    publicField: "labels.series",
    value: "Flood Light FL5",
  },
  {
    token: "Trunk Light",
    publicReference: "ECO-CAT-0196",
    publicField: "labels.series",
    value: "Trunk Light",
  },
  {
    token: "Pull Out Spotlight",
    publicReference: "ECO-CAT-0197",
    publicField: "labels.series",
    value: "Pull Out Spotlight",
  },
  {
    token: "Spotlight COB",
    publicReference: "ECO-CAT-0198",
    publicField: "publicDescription",
    value:
      "Spotlight COB compacto para interior, con haz de acento, temperatura calida y opciones de control con dimmer TRIAC o sin dimmer.",
  },
  {
    token: "Spotlight COB",
    publicReference: "ECO-CAT-0198",
    publicField: "labels.series",
    value: "Spotlight COB",
  },
  {
    token: "Spotlight COB",
    publicReference: "ECO-CAT-0198",
    publicField: "technicalSpecs.applicationType",
    value: "Spotlight COB compacto para interior",
  },
  {
    token: "Flat Panel Redonda",
    publicReference: "ECO-CAT-0199",
    publicField: "labels.series",
    value: "Flat Panel Redonda",
  },
  {
    token: "Flat Panel Redonda",
    publicReference: "ECO-CAT-0200",
    publicField: "labels.series",
    value: "Flat Panel Redonda",
  },
  {
    token: "Flat Panel Redonda",
    publicReference: "ECO-CAT-0201",
    publicField: "labels.series",
    value: "Flat Panel Redonda",
  },
  {
    token: "Flat Panel Cuadrada",
    publicReference: "ECO-CAT-0202",
    publicField: "labels.series",
    value: "Flat Panel Cuadrada",
  },
  {
    token: "Flat Panel Cuadrada",
    publicReference: "ECO-CAT-0203",
    publicField: "labels.series",
    value: "Flat Panel Cuadrada",
  },
  {
    token: "Glass Flat Panel",
    publicReference: "ECO-CAT-0204",
    publicField: "labels.series",
    value: "Glass Flat Panel",
  },
] as const;

const forbiddenFieldNames = [
  "supplierCode",
  "supplierBrand",
  "productCode",
  "availability",
  "warranty",
  "sku",
  "brand",
  "price",
  "cost",
  "discount",
  "inventory",
  "stock",
] as const;

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const containsExactToken = (content: string, token: string) =>
  new RegExp(`(^|[^A-Za-z0-9_-])${escapeRegExp(token)}([^A-Za-z0-9_-]|$)`).test(
    content,
  );

const containsProperty = (content: string, fieldName: string) => {
  const escapedField = escapeRegExp(fieldName);

  return (
    new RegExp(`(?:\\\\?["'])${escapedField}(?:\\\\?["'])\\s*:`, "i").test(
      content,
    ) ||
    new RegExp(`(?:^|[,{])\\s*${escapedField}\\s*:`, "i").test(content)
  );
};

const stripExactValues = (content: string, values: readonly string[], marker: string) => {
  const classified: { value: string; occurrences: number }[] = [];
  let stripped = content;

  for (const value of values) {
    const occurrences = stripped.split(value).length - 1;

    if (occurrences > 0) {
      classified.push({ value, occurrences });
      stripped = stripped.split(value).join(marker);
    }
  }

  return { classified, stripped };
};

const countExactOccurrences = (content: string, value: string) =>
  content.split(value).length - 1;

const stripOneExactValue = (content: string, value: string, marker: string) => {
  const index = content.indexOf(value);

  if (index < 0) {
    throw new Error(`expected serialized value is missing: ${value}`);
  }

  return `${content.slice(0, index)}${marker}${content.slice(index + value.length)}`;
};

type PublicArtifactScope = "catalog-payload" | "static";

const PHYSICAL_IMAGE_MARKER = "<known-catalog-image-path>";
const PUBLIC_COLLISION_MARKER = "<approved-public-value>";

type ApprovedSerializedCollisionContext = {
  scope: PublicArtifactScope;
  publicReference: string;
  publicField: string;
  token: string;
  serialized: string;
};

const approvedSerializedCollisionContexts: ApprovedSerializedCollisionContext[] =
  expectedApprovedInternalTokenCollisions.flatMap(
    ({ token, publicReference, publicField }) => {
      const internalProduct = products.find(
        (product) => product.econoluzReference === publicReference,
      );

      if (!internalProduct) {
        throw new Error(`missing collision product ${publicReference}`);
      }

      const publicProduct = toPublicProduct(internalProduct);
      const serializedProduct = JSON.stringify(publicProduct);
      const catalogPayloadContexts = [
        serializedProduct,
        JSON.stringify(serializedProduct).slice(1, -1),
        serializedProduct
          .replace(/&/g, "\\u0026")
          .replace(/>/g, "\\u003e")
          .replace(/</g, "\\u003c")
          .replace(/"/g, '\\"'),
      ].map((serialized) => ({
        scope: "catalog-payload" as const,
        publicReference,
        publicField,
        token,
        serialized: stripExactValues(
          serialized,
          knownPhysicalImagePaths,
          PHYSICAL_IMAGE_MARKER,
        ).stripped,
      }));

      return catalogPayloadContexts;
    },
  );

const serializeSeriesEntry = (
  key: string,
  entry: { readonly id: string; readonly label: string },
) => `${key}:{id:${JSON.stringify(entry.id)},label:${JSON.stringify(entry.label)}}`;

const serializedPublicSeriesRegistry = Object.entries(series)
  .map(([key, entry]) => serializeSeriesEntry(key, entry))
  .join(",");

const STATIC_CATALOG_CLIENT_MARKER = "Filtrar por serie";
const CAPTURED_STATIC_SERIES_COLLISION_CONTEXT_COUNT = 5;

const approvedStaticSeriesCollisionContexts = [
  ...new Map(
    expectedApprovedInternalTokenCollisions.flatMap(
      ({ token, publicReference, publicField }) => {
        if (publicField !== "series" && publicField !== "labels.series") {
          return [];
        }

        const internalProduct = products.find(
          (product) => product.econoluzReference === publicReference,
        );

        if (!internalProduct) {
          throw new Error(`missing collision product ${publicReference}`);
        }

        const publicProduct = toPublicProduct(internalProduct);
        const registryEntry = Object.entries(series).find(
          ([, entry]) => entry.id === publicProduct.series,
        );

        if (!registryEntry) {
          return [];
        }

        const serialized = serializeSeriesEntry(...registryEntry);

        return containsExactToken(serialized, token)
          ? [[serialized, { token, publicReference, publicField, serialized }] as const]
          : [];
      },
    ),
  ).values(),
];

if (
  approvedStaticSeriesCollisionContexts.length !==
  CAPTURED_STATIC_SERIES_COLLISION_CONTEXT_COUNT
) {
  throw new Error(
    `static series collision snapshot mismatch: expected ${CAPTURED_STATIC_SERIES_COLLISION_CONTEXT_COUNT}, received ${approvedStaticSeriesCollisionContexts.length}`,
  );
}

const stripCapturedPhysicalImagePaths = (
  content: string,
  imagePaths: readonly string[] = knownPhysicalImagePaths,
) => {
  validateCapturedPhysicalImagePaths(imagePaths);
  return stripExactValues(content, imagePaths, PHYSICAL_IMAGE_MARKER);
};

const stripApprovedPublicCollisionContexts = (
  content: string,
  scope: PublicArtifactScope,
) => {
  const serializedContexts = [
    ...new Set(
      approvedSerializedCollisionContexts
        .filter((context) => context.scope === scope)
        .map(({ serialized }) => serialized),
    ),
  ].sort((left, right) => right.length - left.length);

  return stripExactValues(content, serializedContexts, PUBLIC_COLLISION_MARKER);
};

type StaticArtifact = { file: string; content: string };
type ArtifactClassification = ReturnType<typeof stripExactValues>;

const stripApprovedStaticSeriesCollisionContexts = (
  artifacts: readonly StaticArtifact[],
) => {
  validateCapturedPublicSeriesRegistry();

  const registryOccurrences = artifacts.reduce(
    (total, artifact) =>
      total +
      countExactOccurrences(artifact.content, serializedPublicSeriesRegistry),
    0,
  );
  const markerOccurrences = artifacts.reduce(
    (total, artifact) =>
      total + countExactOccurrences(artifact.content, STATIC_CATALOG_CLIENT_MARKER),
    0,
  );
  const expectedArtifacts = artifacts.filter(
    ({ file, content }) =>
      extname(file) === ".js" &&
      content.includes(serializedPublicSeriesRegistry) &&
      content.includes(STATIC_CATALOG_CLIENT_MARKER),
  );
  const contextCounts = approvedStaticSeriesCollisionContexts.map(
    ({ serialized }) => ({
      serialized,
      total: artifacts.reduce(
        (count, artifact) =>
          count + countExactOccurrences(artifact.content, serialized),
        0,
      ),
      expectedArtifact:
        expectedArtifacts.length === 1
          ? countExactOccurrences(expectedArtifacts[0].content, serialized)
          : 0,
    }),
  );

  if (
    registryOccurrences !== 1 ||
    markerOccurrences !== 1 ||
    expectedArtifacts.length !== 1 ||
    contextCounts.some(
      ({ total, expectedArtifact }) => total !== 1 || expectedArtifact !== 1,
    )
  ) {
    throw new Error(
      `static series registry collision context mismatch: registry=${registryOccurrences}, marker=${markerOccurrences}, artifacts=${expectedArtifacts.length}, contexts=${contextCounts.map(({ total, expectedArtifact }) => `${total}/${expectedArtifact}`).join(",")}`,
    );
  }

  const expectedArtifactFile = expectedArtifacts[0].file;

  return new Map<string, ArtifactClassification>(
    artifacts.map(({ file, content }): readonly [string, ArtifactClassification] => {
      if (file !== expectedArtifactFile) {
        return [file, { classified: [], stripped: content }];
      }

      const classified: { value: string; occurrences: number }[] = [];
      let stripped = content;

      for (const { serialized } of approvedStaticSeriesCollisionContexts) {
        stripped = stripOneExactValue(
          stripped,
          serialized,
          PUBLIC_COLLISION_MARKER,
        );
        classified.push({ value: serialized, occurrences: 1 });
      }

      return [file, { classified, stripped }];
    }),
  );
};

test("does not exempt a longer collision in the wrong reference, field, or artifact", () => {
  const approvedValue = "Conectores tipo I: YS-I/B, YS-I/N, YS-I/S";
  const mutations: { scope: PublicArtifactScope; content: string }[] = [
    {
      scope: "catalog-payload",
      content: JSON.stringify({
        econoluzReference: "ECO-CAT-9999",
        technicalSpecs: { specialFeatures: [approvedValue] },
      }),
    },
    {
      scope: "catalog-payload",
      content: JSON.stringify({
        econoluzReference: "ECO-CAT-0161",
        publicDescription: approvedValue,
      }),
    },
    {
      scope: "static",
      content: JSON.stringify({
        econoluzReference: "ECO-CAT-0161",
        technicalSpecs: { specialFeatures: [approvedValue] },
      }),
    },
  ];

  for (const mutation of mutations) {
    const result = stripApprovedPublicCollisionContexts(
      mutation.content,
      mutation.scope,
    );

    expect(result.stripped).toBe(mutation.content);
    expect(containsExactToken(result.stripped, "YS-I")).toBe(true);
  }
});

test("rejects a changed physical image path before using it as an exemption", () => {
  const changedImagePaths = [...knownPhysicalImagePaths];
  changedImagePaths[0] = changedImagePaths[0].replace(
    /\.webp$/,
    "-changed.webp",
  );

  expect(() =>
    stripCapturedPhysicalImagePaths(changedImagePaths[0], changedImagePaths),
  ).toThrow("captured catalog image path fingerprint mismatch");
});

test("rejects a copied static series registry entry in another artifact", () => {
  const copiedRegistryEntry = 'cuasar:{id:"cuasar",label:"Cuasar"}';
  const staticArtifacts = publicStaticFiles().map((file) => ({
    file,
    content: readFileSync(file, "utf8"),
  }));

  expect(
    staticArtifacts.some(({ content }) =>
      content.includes(copiedRegistryEntry),
    ),
  ).toBe(true);

  expect(() =>
    stripApprovedStaticSeriesCollisionContexts([
      ...staticArtifacts,
      {
        file: join(
          process.cwd(),
          ".next",
          "static",
          "chunks",
          "counterfeit-series-registry.js",
        ),
        content: copiedRegistryEntry,
      },
    ]),
  ).toThrow("static series registry collision context mismatch");
});

test("does not publish a catalog rewrite table in static build artifacts", () => {
  const staticFiles = publicStaticFiles();
  const findings = staticFiles.flatMap((path) => {
    const content = readFileSync(path).toString("utf8");
    const aliases = content.match(/\/media\/catalogo\//g)?.length ?? 0;
    const physicalDestinations = content.match(/\/catalogos\//g)?.length ?? 0;

    return aliases || physicalDestinations
      ? [{ file: relative(process.cwd(), path), aliases, physicalDestinations }]
      : [];
  });

  expect(staticFiles.length).toBeGreaterThan(0);
  expect(findings).toEqual([]);
});

test("keeps exhaustive internal fields and known codes out of public artifacts", () => {
  const staticFiles = publicStaticFiles();
  const publicArtifactFiles = [
    ...new Set([...staticFiles, ...publicCatalogPayloadFiles()]),
  ];
  const textArtifactFiles = publicArtifactFiles.filter((path) =>
    textArtifactExtensions.has(extname(path)),
  );
  const staticArtifactRoot = join(process.cwd(), ".next", "static");
  const artifactContents = new Map(
    textArtifactFiles.map((path) => [path, readFileSync(path, "utf8")]),
  );
  const imageClassifications = new Map(
    [...artifactContents].map(([path, content]) => [
      path,
      stripCapturedPhysicalImagePaths(content),
    ]),
  );
  const staticSeriesClassifications =
    stripApprovedStaticSeriesCollisionContexts(
      textArtifactFiles
        .filter((path) => path.startsWith(staticArtifactRoot))
        .map((path) => ({
          file: path,
          content: imageClassifications.get(path)!.stripped,
        })),
    );
  const classifiedImagePaths: { file: string; value: string; occurrences: number }[] = [];
  const classifiedPublicCollisions: {
    file: string;
    value: string;
    occurrences: number;
  }[] = [];
  const findings = textArtifactFiles.flatMap((path) => {
    const relativePath = relative(process.cwd(), path);
    const imageClassification = imageClassifications.get(path)!;
    const publicCollisionClassification = path.startsWith(staticArtifactRoot)
      ? staticSeriesClassifications.get(path)!
      : stripApprovedPublicCollisionContexts(
          imageClassification.stripped,
          "catalog-payload",
        );

    classifiedImagePaths.push(
      ...imageClassification.classified.map((entry) => ({
        file: relativePath,
        ...entry,
      })),
    );
    classifiedPublicCollisions.push(
      ...publicCollisionClassification.classified.map((entry) => ({
        file: relativePath,
        ...entry,
      })),
    );

    const inspectedContent = publicCollisionClassification.stripped;
    const fieldNames = forbiddenFieldNames.filter((fieldName) =>
      containsProperty(inspectedContent, fieldName),
    );
    const internalTokens = knownInternalTokens.filter((token) =>
      containsExactToken(inspectedContent, token),
    );
    const unknownPhysicalPaths =
      inspectedContent.match(/\/catalogos\/[A-Za-z0-9_./-]+/g) ?? [];

    return fieldNames.length || internalTokens.length || unknownPhysicalPaths.length
      ? [{ file: relativePath, fieldNames, internalTokens, unknownPhysicalPaths }]
      : [];
  });

  expect(publicArtifactFiles.length).toBeGreaterThan(staticFiles.length);
  expect(textArtifactFiles.length).toBeGreaterThan(0);
  expect(knownInternalTokens.length).toBeGreaterThan(products.length);
  expect(approvedInternalTokenCollisions).toEqual(
    expectedApprovedInternalTokenCollisions,
  );
  expect(classifiedImagePaths.length).toBeGreaterThan(0);
  expect(classifiedPublicCollisions.length).toBeGreaterThan(0);
  expect(findings).toEqual([]);
});
