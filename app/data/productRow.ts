import type { InternalProduct } from "./products";

// Traducción entre el producto del catálogo y su fila en Postgres.
//
// Tiene que ser reversible sin perder nada: `scripts/verify-product-rows.mjs`
// convierte los 313 productos a filas, los reconstruye y compara el resultado
// contra la foto congelada del catálogo (tests/fixtures). Si esta traducción
// deforma un solo campo, esa comprobación lo detecta antes de tocar la base de
// datos de verdad.
//
// Este archivo maneja datos del proveedor (marca, serie, código y textos sin
// sanear), así que solo puede importarse desde código de servidor.

export type ProductRow = {
  id: string;
  econoluz_reference: string;
  position: number;

  public_name: string;
  public_description: string;
  image: string;
  // `null` es "sin galería adicional", que no es lo mismo que una galería vacía.
  images: string[] | null;
  technical_specs: Record<string, string | string[]> | null;

  product_type: string;
  product_type_label: string;
  application: string;
  application_label: string;
  finish: string;
  finish_label: string;
  family_label: string;

  supplier_brand: string;
  supplier_brand_label: string;
  supplier_series: string;
  supplier_series_label: string;
  supplier_code: string;
  supplier_name: string;
  supplier_description: string;

  price_gtq: number | null;
  stock: number | null;
  sellable_online: boolean;
  published: boolean;
};

// Deja huecos entre posiciones para poder intercalar un producto nuevo sin
// renumerar los 313 que ya existen.
export const POSITION_STEP = 10;

export const positionForIndex = (index: number) => (index + 1) * POSITION_STEP;

const asTechnicalSpecs = (
  technicalSpecs: InternalProduct["technicalSpecs"],
): ProductRow["technical_specs"] => {
  if (!technicalSpecs) {
    return null;
  }

  const entries = Object.entries(technicalSpecs).filter(
    (entry): entry is [string, string | string[]] => entry[1] !== undefined,
  );

  return entries.length > 0 ? Object.fromEntries(entries) : null;
};

export const toProductRow = (product: InternalProduct, index: number): ProductRow => ({
  id: product.id,
  econoluz_reference: product.econoluzReference,
  position: positionForIndex(index),

  public_name: product.publicName,
  public_description: product.publicDescription,
  image: product.image,
  images: product.images?.length ? [...product.images] : null,
  technical_specs: asTechnicalSpecs(product.technicalSpecs),

  product_type: product.productType,
  product_type_label: product.labels.productType,
  application: product.application,
  application_label: product.labels.application,
  finish: product.finish,
  finish_label: product.labels.finish,
  family_label: product.labels.family,

  supplier_brand: product.supplierBrand,
  supplier_brand_label: product.labels.brand,
  supplier_series: product.series,
  supplier_series_label: product.labels.series,
  supplier_code: product.supplierCode,
  supplier_name: product.name,
  supplier_description: product.description,

  // El catálogo actual no tiene precios ni existencias: son datos que todavía
  // no existen en ninguna parte y que se cargarán desde el panel.
  price_gtq: null,
  stock: null,
  sellable_online: false,
  published: true,
});

export const fromProductRow = (row: ProductRow): InternalProduct =>
  ({
    id: row.id,
    // `sku` y `supplierCode` son el mismo dato con dos nombres, igual que
    // `brand` y `supplierBrand`. La tabla guarda uno solo de cada par para que
    // no puedan acabar diciendo cosas distintas.
    sku: row.supplier_code,
    name: row.supplier_name,
    description: row.supplier_description,
    image: row.image,
    images: row.images ?? undefined,
    technicalSpecs: row.technical_specs ?? undefined,

    publicName: row.public_name,
    publicDescription: row.public_description,
    econoluzReference: row.econoluz_reference,

    supplierCode: row.supplier_code,
    supplierBrand: row.supplier_brand,
    brand: row.supplier_brand,
    productType: row.product_type,
    application: row.application,
    series: row.supplier_series,
    finish: row.finish,

    labels: {
      brand: row.supplier_brand_label,
      productType: row.product_type_label,
      application: row.application_label,
      series: row.supplier_series_label,
      family: row.family_label,
      finish: row.finish_label,
    },
  }) as InternalProduct;
