import { expect, test } from "@playwright/test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";
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

const approvedCollisionContexts = [
  ...new Set(
    expectedApprovedInternalTokenCollisions.flatMap(
      ({ token, publicReference, publicField, value }) => {
        if (value !== token) {
          return [value];
        }

        const fieldName = publicField.split(".").at(-1)?.replace(/\[\d+\]$/, "");
        const publicProduct = toPublicProduct(
          products.find(
            (product) => product.econoluzReference === publicReference,
          )!,
        );
        const serializedFieldContexts = [
          `"${fieldName}":"${value}"`,
          `\\"${fieldName}\\":\\"${value}\\"`,
        ];
        const publicSeriesRegistryContext =
          fieldName === "series"
            ? `${publicProduct.series}:{id:"${publicProduct.series}",label:"${publicProduct.labels.series}"}`
            : undefined;

        return publicSeriesRegistryContext
          ? [...serializedFieldContexts, publicSeriesRegistryContext]
          : serializedFieldContexts;
      },
    ),
  ),
].sort((left, right) => right.length - left.length);

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
  const classifiedImagePaths: { file: string; value: string; occurrences: number }[] = [];
  const classifiedPublicCollisions: {
    file: string;
    value: string;
    occurrences: number;
  }[] = [];
  const findings = textArtifactFiles.flatMap((path) => {
    const content = readFileSync(path, "utf8");
    const relativePath = relative(process.cwd(), path);
    const imageClassification = stripExactValues(
      content,
      knownPhysicalImagePaths,
      "<known-catalog-image-path>",
    );
    const publicCollisionClassification = stripExactValues(
      imageClassification.stripped,
      approvedCollisionContexts,
      "<approved-public-value>",
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
