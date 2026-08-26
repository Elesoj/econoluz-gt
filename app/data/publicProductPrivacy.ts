// Esta capa solo transforma lo que sale al catálogo público. Los nombres,
// marcas, series, códigos y rutas originales siguen intactos en el producto
// interno para que el personal autorizado pueda identificar al proveedor.

import type { InternalProduct } from "./products";

type SupplierPrivacyContext = Pick<
  InternalProduct,
  "name" | "series" | "supplierBrand" | "supplierCode" | "labels"
>;

const normalizeSupplierIdentifier = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const safePublicIdentifiers = new Set(
  [
    "Bronce",
    "Wallpack",
    "Wallpack CCT",
    "Uplight",
    "Landscape",
    "Slim",
    "Bright",
    "Canopy CCT",
    "Spotlight COB",
    "Module",
    "Sombra",
  ].map(normalizeSupplierIdentifier),
);

const genericSupplierIdentifierPrefixes = [
  "perfil",
  "luminario",
  "luminaria",
  "tubo",
  "tira",
  "manguera",
  "modulo",
  "lampara",
  "downlight",
  "panel",
  "proyector",
  "emergencia",
  "senalizacion",
  "poste",
  "bolardo",
  "arbotante",
  "riel",
  "placa",
  "driver",
  "kit",
  "altomontaje",
  "bajomontaje",
] as const;

const publicTextReplacements: ReadonlyArray<readonly [RegExp, string]> = [
  [
    /\bLos rieles, luminarios, drivers y accesorios Magnetrack no son compatibles con el sistema Magnetrack Pro\b/gi,
    "Los componentes de otro sistema de riel magnético no son compatibles con el sistema de microrriel magnético de 48 V",
  ],
  [
    /\briel suspendido o sobrepuesto Magnetrack Pro\b/gi,
    "microrriel magnético de 48 V suspendido o sobrepuesto",
  ],
  [/\bARTIC\s+ofrece\b/gi, "Luminaria hermética ofrece"],
  [/\bmicrorriel\s+Magnetrack Pro\b/gi, "microrriel magnético de 48 V"],
  [/\brieles\s+Magnetrack Pro\b/gi, "rieles del sistema magnético de 48 V"],
  [/\bsistema\s+Magnetrack Pro\b/gi, "sistema de microrriel magnético de 48 V"],
  [/\bsistema\s+Magnetrack\b/gi, "otro sistema de riel magnético"],
  [/\bMagnetrack Pro\b/gi, "microrriel magnético de 48 V"],
  [/\bMagnetrack\b/gi, "riel magnético"],
  [/\bLED Infinite D3 COB\b/gi, "tira LED COB"],
  [/\bLED Infinite D5 Neon\b/gi, "tira LED neón"],
  [/\bLED Infinite D2\b/gi, "tira LED"],
  [/\bNanovia UL\b/gi, "certificado UL"],
  [/\bVialed UL\b/gi, ""],
  [/\bpara\s+Evolight\b/gi, ""],
  [/\bCubic Bolardo\b/gi, "Bolardo"],
  [/\bRoadlight\b/gi, "de alto tránsito"],
  [/\bGoleta Pro\b/gi, ""],
  [/\bpara\s+Modulare\s+empotrado\b/gi, "para montaje empotrado"],
  [/\bArbotante\s+Sombra\b/gi, "Arbotante"],
  [/\bSoftglow\b/gi, ""],
  [/\bDownled\b/gi, ""],
  [/\bEvolight\b/gi, ""],
  [/\bNanovia\b/gi, ""],
  [/\bVialed\b/gi, ""],
  [/\bCorvus\b/gi, ""],
  [/\bModulare\b/gi, ""],
];

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const supplierIdentifiersFor = (product: SupplierPrivacyContext) =>
  [
    product.supplierBrand,
    product.labels.brand,
    product.labels.series,
    product.series,
    product.supplierCode,
    product.name,
  ].filter((identifier, index, identifiers) => {
    const normalized = normalizeSupplierIdentifier(identifier);

    return (
      normalized.length >= 4 &&
      /[a-z]/.test(normalized) &&
      !safePublicIdentifiers.has(normalized) &&
      !genericSupplierIdentifierPrefixes.some((prefix) => normalized.startsWith(prefix)) &&
      identifiers.indexOf(identifier) === index
    );
  });

const removeProductSupplierIdentifiers = (
  text: string,
  product?: SupplierPrivacyContext,
) => {
  if (!product) {
    return text;
  }

  return supplierIdentifiersFor(product).reduce((value, identifier) => {
    const pattern = identifier
      .trim()
      .split(/[\s_-]+/)
      .map(escapeRegExp)
      .join("[\\s_-]*");

    return value.replace(new RegExp(`\\b${pattern}\\b`, "giu"), "");
  }, text);
};

export const sanitizePublicSupplierText = (
  text: string,
  product?: SupplierPrivacyContext,
) => {
  const withExplicitReplacements = publicTextReplacements.reduce(
    (value, [pattern, replacement]) => value.replace(pattern, replacement),
    text,
  );
  const sanitized = removeProductSupplierIdentifiers(withExplicitReplacements, product);

  return sanitized
    .replace(/\bTira LED\s+tira LED\b/gi, "Tira LED")
    .replace(/\bLuminaria\s+microrriel\b/gi, "Luminaria para microrriel")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
};

export const toPublicApplicationId = (application: string) =>
  application === "magnetrack_pro" ? "microrriel_magnetico_48v" : application;

const publicImageRootReplacements: ReadonlyArray<readonly [string, string]> = [
  [
    "/catalogos/construlita/magnetrackpro/",
    "/catalogos/arquitectonico/microrriel-48v/",
  ],
  ["/catalogos/construlita/", "/catalogos/arquitectonico/"],
  ["/catalogos/highlum/", "/catalogos/lineal/"],
  ["/catalogos/artlite/", "/catalogos/electrico/"],
];

export const toPublicImagePath = (imagePath: string) => {
  const replacement = publicImageRootReplacements.find(([source]) =>
    imagePath.startsWith(source),
  );

  return replacement
    ? `${replacement[1]}${imagePath.slice(replacement[0].length)}`
    : imagePath;
};
