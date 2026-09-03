import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { series } from "../app/data/catalogSeries.internal";
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

// La principal **y** la galería, no una u otra. Hasta el 02/09/2026 esto tomaba la
// galería cuando existía y la principal cuando no, y funcionaba solo por accidente: las
// 64 galerías repetían su foto principal, así que nunca faltaba ninguna. Al quitar esa
// repetición, la principal de los 6 productos con galería real se caía de la lista.
// Con la derivación correcta la huella congelada sale idéntica a la de siempre.
const knownPublicImagePaths = [
  ...new Set(
    products.flatMap((product) => {
      const publicProduct = toPublicProduct(product);

      return [publicProduct.image, ...(publicProduct.images ?? [])];
    }),
  ),
].sort((left, right) => right.length - left.length);

const CAPTURED_PUBLIC_IMAGE_PATH_COUNT = 326;
const CAPTURED_PUBLIC_IMAGE_PATH_SHA256 =
  "4a76256a2011a11e8ad6ba2a59733f24fae5f552a09c94077fe427f11c4fb165";

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
    fingerprint.count !== CAPTURED_PUBLIC_IMAGE_PATH_COUNT ||
    fingerprint.sha256 !== CAPTURED_PUBLIC_IMAGE_PATH_SHA256
  ) {
    throw new Error(
      `captured catalog image path fingerprint mismatch: expected ${CAPTURED_PUBLIC_IMAGE_PATH_COUNT}/${CAPTURED_PUBLIC_IMAGE_PATH_SHA256}, received ${fingerprint.count}/${fingerprint.sha256}`,
    );
  }
};

validateCapturedPhysicalImagePaths(knownPublicImagePaths);

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
    token: "Spotlight COB",
    publicReference: "ECO-CAT-0198",
    publicField: "publicDescription",
    value:
      "Spotlight COB compacto para interior, con haz de acento, temperatura calida y opciones de control con dimmer TRIAC o sin dimmer.",
  },
  {
    token: "Spotlight COB",
    publicReference: "ECO-CAT-0198",
    publicField: "technicalSpecs.applicationType",
    value: "Spotlight COB compacto para interior",
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

/**
 * Serializa el **par `"campo":valor`** del campo público que aprueba la colisión: de
 * `technicalSpecs.specialFeatures[11]` sale `"specialFeatures":[…lista entera…]`, y de
 * `publicDescription` sale `"publicDescription":"…"`.
 *
 * Un par no depende del orden de las claves hermanas, que es justo lo que rompía la
 * exención anterior, y conserva el ámbito del campo: el valor aprobado sigue sin eximirse
 * si aparece en otro campo o suelto.
 *
 * Se exige además que el valor declarado en la lista **esté de verdad ahí dentro**: si
 * alguien renombra el campo o cambia el texto, la prueba falla en vez de quedarse sin
 * exención y empezar a reportar la colisión aprobada como si fuera una fuga.
 */
const serializeApprovedFieldPair = (
  publicProduct: unknown,
  publicField: string,
  approvedValue: string,
): string => {
  const path = publicField.replace(/\[\d+\]$/, "").split(".");
  const leafKey = path[path.length - 1];
  const fieldValue = path.reduce<unknown>(
    (value, key) =>
      value && typeof value === "object"
        ? (value as Record<string, unknown>)[key]
        : undefined,
    publicProduct,
  );

  if (fieldValue === undefined) {
    throw new Error(`missing approved collision field: ${publicField}`);
  }

  const serializedValue = JSON.stringify(fieldValue);
  if (!serializedValue.includes(approvedValue)) {
    throw new Error(`approved collision value is no longer in ${publicField}`);
  }

  return `${JSON.stringify(leafKey)}:${serializedValue}`;
};

const approvedSerializedCollisionContexts: ApprovedSerializedCollisionContext[] =
  expectedApprovedInternalTokenCollisions.flatMap(
    ({ token, publicReference, publicField, value }) => {
      const internalProduct = products.find(
        (product) => product.econoluzReference === publicReference,
      );

      if (!internalProduct) {
        throw new Error(`missing collision product ${publicReference}`);
      }

      const publicProduct = toPublicProduct(internalProduct);
      // Se exime **el contenedor del campo aprobado**, no el producto entero.
      //
      // Antes se comparaba el JSON completo de `toPublicProduct`, y eso ataba la exención
      // al orden de claves de `app/data/products.ts`. Desde la Fase D la carga sale de
      // `public_products`, donde `technical_specs` es `jsonb` y **devuelve sus claves en
      // su propio orden**: mismos valores, distinta serialización, y la exención dejaba
      // de encajar. Es la misma trampa que ya está anotada en `docs/CONTINUAR-PANEL.md`.
      //
      // El contenedor es un array —`specialFeatures`—, y los arrays sí conservan su orden
      // en `jsonb`, así que su serialización es idéntica en los dos modelos. Además la
      // exención queda **más estrecha** que antes: cubre una lista concreta de un producto
      // concreto en vez de todos sus campos.
      const serializedField = serializeApprovedFieldPair(publicProduct, publicField, value);
      const catalogPayloadContexts = [
        serializedField,
        JSON.stringify(serializedField).slice(1, -1),
        serializedField
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
          knownPublicImagePaths,
          PHYSICAL_IMAGE_MARKER,
        ).stripped,
      }));

      return catalogPayloadContexts;
    },
  );

const stripCapturedPhysicalImagePaths = (
  content: string,
  imagePaths: readonly string[] = knownPublicImagePaths,
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
  const changedImagePaths = [...knownPublicImagePaths];
  changedImagePaths[0] = changedImagePaths[0].replace(
    /\.webp$/,
    "-changed.webp",
  );

  expect(() =>
    stripCapturedPhysicalImagePaths(changedImagePaths[0], changedImagePaths),
  ).toThrow("captured catalog image path fingerprint mismatch");
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
  const classifiedImagePaths: { file: string; value: string; occurrences: number }[] = [];
  const classifiedPublicCollisions: {
    file: string;
    value: string;
    occurrences: number;
  }[] = [];
  const findings = textArtifactFiles.flatMap((path) => {
    const relativePath = relative(process.cwd(), path);
    const imageClassification = imageClassifications.get(path)!;
    // Los artefactos estáticos ya no tienen exención propia: desde que la serie
    // salió del catálogo público, ningún nombre de proveedor debe sobrevivir en
    // el bundle, y el ámbito "static" no aprueba ninguna colisión.
    const publicCollisionClassification = stripApprovedPublicCollisionContexts(
      imageClassification.stripped,
      path.startsWith(staticArtifactRoot) ? "static" : "catalog-payload",
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
