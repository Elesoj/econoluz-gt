import type { InternalProduct } from "./products";
import { getApplicationLabel } from "./catalogTaxonomy";
import {
  sanitizePublicSupplierText,
  toPublicApplicationId,
  toPublicImagePath,
} from "./publicProductPrivacy";
import {
  PUBLIC_TECHNICAL_SPEC_KEYS,
  type PublicProduct,
  type PublicTechnicalSpecs,
} from "./publicProductContract";

export {
  PUBLIC_TECHNICAL_SPEC_KEYS,
  PUBLIC_TECHNICAL_SPEC_REGISTRY,
} from "./publicProductContract";
export type {
  PublicProduct,
  PublicTechnicalSpecKey,
  PublicTechnicalSpecs,
  PublicTechnicalSpecValue,
} from "./publicProductContract";

const projectTechnicalSpecs = (
  technicalSpecs: InternalProduct["technicalSpecs"],
  product: InternalProduct,
): PublicTechnicalSpecs | undefined => {
  if (!technicalSpecs) {
    return undefined;
  }

  const publicTechnicalSpecs: PublicTechnicalSpecs = {};

  for (const key of PUBLIC_TECHNICAL_SPEC_KEYS) {
    const value = technicalSpecs[key];

    if (value !== undefined) {
      publicTechnicalSpecs[key] = Array.isArray(value)
        ? value.map((entry) => sanitizePublicSupplierText(entry, product))
        : sanitizePublicSupplierText(value, product);
    }
  }

  return Object.keys(publicTechnicalSpecs).length > 0
    ? publicTechnicalSpecs
    : undefined;
};

const getPublicProductId = (econoluzReference: string) =>
  econoluzReference.toLowerCase();

const restoredApplicationBySourceFamily: Readonly<Record<string, string>> = {
  Atenuadores: "atenuadores",
  "Datos / LAN": "datos_lan",
  "TV / coaxial": "tv_coaxial",
  Timbres: "timbres",
  "Tapas ciegas": "tapas_ciegas",
};

/** Datos que no viven en el catálogo escrito, sino en la base de datos. */
export type PublicProductExtras = {
  priceGtq?: number | null;
  stock?: number | null;
};

export const toPublicProduct = (
  product: InternalProduct,
  extras?: PublicProductExtras,
): PublicProduct => {
  const application = toPublicApplicationId(
    restoredApplicationBySourceFamily[product.labels.family] ?? product.application,
  );
  const publicProduct: PublicProduct = {
    id: getPublicProductId(product.econoluzReference),
    econoluzReference: product.econoluzReference,
    publicName: sanitizePublicSupplierText(product.publicName, product),
    publicDescription: sanitizePublicSupplierText(product.publicDescription, product),
    image: toPublicImagePath(product.image),
    productType: product.productType,
    application,
    finish: product.finish,
    labels: {
      productType: sanitizePublicSupplierText(product.labels.productType, product),
      application: sanitizePublicSupplierText(getApplicationLabel(application), product),
      finish: sanitizePublicSupplierText(product.labels.finish, product),
    },
    technicalSpecs: projectTechnicalSpecs(product.technicalSpecs, product),
  };

  if (product.images?.length) {
    publicProduct.images = product.images.map(toPublicImagePath);
  }

  // Cero es un precio válido; `null`, `undefined` y cualquier cosa que no sea
  // un número finito significan "todavía sin precio".
  if (typeof extras?.priceGtq === "number" && Number.isFinite(extras.priceGtq)) {
    publicProduct.priceGtq = extras.priceGtq;
  }

  // Las existencias tienen que ser un entero: media luminaria no existe.
  if (typeof extras?.stock === "number" && Number.isSafeInteger(extras.stock)) {
    publicProduct.stock = extras.stock;
  }

  return publicProduct;
};
