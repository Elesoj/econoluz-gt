import type { InternalProduct } from "./products";
import { getApplicationLabel } from "./catalogTaxonomy";

export const PUBLIC_TECHNICAL_SPEC_REGISTRY = [
  { key: "acrylic", label: "Acrílico" },
  { key: "amperage", label: "Amperaje" },
  { key: "applicationType", label: "Aplicación" },
  { key: "battery", label: "Batería" },
  { key: "batteryLifetime", label: "Vida útil de batería" },
  { key: "beamAngle", label: "Ángulo" },
  { key: "certification", label: "Certificaciones" },
  { key: "certifications", label: "Certificaciones" },
  { key: "chargingTime", label: "Tiempo de carga" },
  { key: "colorTemperature", label: "TCC" },
  { key: "configuration", label: "Configuración" },
  { key: "cri", label: "IRC" },
  { key: "cutout", label: "Corte" },
  { key: "dielectricVoltage", label: "Voltaje dieléctrico" },
  { key: "dimensions", label: "Dimensiones" },
  { key: "dimming", label: "Atenuación" },
  { key: "disconnectSpeed", label: "Velocidad de desconexión" },
  { key: "driver", label: "Driver" },
  { key: "efficiency", label: "Eficiencia" },
  { key: "equivalent", label: "Equivalente" },
  { key: "finish", label: "Acabado / color" },
  { key: "finishOptions", label: "Opciones de acabado" },
  { key: "fixing", label: "Fijación" },
  { key: "frequency", label: "Frecuencia" },
  { key: "functions", label: "Funciones" },
  { key: "gfciSupport", label: "Soporte GFCI" },
  { key: "humidity", label: "Humedad" },
  { key: "impactRating", label: "IK" },
  { key: "installation", label: "Instalación" },
  { key: "installationHeight", label: "Altura de instalación" },
  { key: "ledType", label: "Tipo LED" },
  { key: "lifetime", label: "Vida útil" },
  { key: "lightSource", label: "Fuente de luz" },
  { key: "luminousFlux", label: "Flujo luminoso" },
  { key: "material", label: "Material" },
  { key: "mountingHeight", label: "Altura de montaje" },
  { key: "operatingTemperature", label: "Temperatura de operación" },
  { key: "panelLifetime", label: "Vida útil del panel" },
  { key: "pcbSize", label: "Tamaño PCB" },
  { key: "power", label: "Potencia" },
  { key: "powerFactor", label: "Factor de potencia" },
  { key: "presentation", label: "Presentación" },
  { key: "protection", label: "Protección" },
  { key: "range", label: "Alcance" },
  { key: "recommendedUse", label: "Uso recomendado" },
  { key: "savings", label: "Ahorro" },
  { key: "shortCircuitCurrent", label: "SCCR" },
  { key: "solarPanel", label: "Panel solar" },
  { key: "specialFeatures", label: "Características especiales" },
  { key: "standard", label: "Estándar" },
  { key: "surgeProtection", label: "Protección contra sobretensión" },
  { key: "switchablePower", label: "Potencia seleccionable" },
  { key: "switchingLevel", label: "Nivel de conmutación" },
  { key: "ugr", label: "UGR" },
  { key: "usbOutput", label: "Salida USB" },
  { key: "voltage", label: "Voltaje" },
  { key: "weight", label: "Peso" },
] as const;

export const PUBLIC_TECHNICAL_SPEC_KEYS = PUBLIC_TECHNICAL_SPEC_REGISTRY.map(
  ({ key }) => key,
);

export type PublicTechnicalSpecKey =
  (typeof PUBLIC_TECHNICAL_SPEC_REGISTRY)[number]["key"];
export type PublicTechnicalSpecValue = string | string[];
export type PublicTechnicalSpecs = Partial<
  Record<PublicTechnicalSpecKey, PublicTechnicalSpecValue>
>;

// La serie del fabricante (Cuasar, HB Pure, Highlens...) no viaja al navegador:
// identificaría al proveedor ante el cliente, igual que su marca y sus códigos,
// que ya se limpian en products.ts. No basta con no pintarla en pantalla, porque
// el dato quedaría legible en el código fuente de la página.
export type PublicProduct = {
  id: string;
  econoluzReference: string;
  publicName: string;
  publicDescription: string;
  image: string;
  images?: string[];
  productType: string;
  application: string;
  finish: string;
  labels: {
    productType: string;
    application: string;
    finish: string;
  };
  technicalSpecs?: PublicTechnicalSpecs;
  /**
   * Precio de venta al público en quetzales.
   *
   * Es **opcional a propósito**: mientras un producto no tenga precio puesto,
   * el campo no existe, y el catálogo enseña que hay que consultarlo. Si en su
   * lugar viajara un `null`, los 313 productos cambiarían de forma y la huella
   * congelada del catálogo dejaría de coincidir sin que nada haya cambiado.
   */
  priceGtq?: number;
};

const projectTechnicalSpecs = (
  technicalSpecs: InternalProduct["technicalSpecs"],
): PublicTechnicalSpecs | undefined => {
  if (!technicalSpecs) {
    return undefined;
  }

  const publicTechnicalSpecs: PublicTechnicalSpecs = {};

  for (const key of PUBLIC_TECHNICAL_SPEC_KEYS) {
    const value = technicalSpecs[key];

    if (value !== undefined) {
      publicTechnicalSpecs[key] = Array.isArray(value) ? [...value] : value;
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
};

export const toPublicProduct = (
  product: InternalProduct,
  extras?: PublicProductExtras,
): PublicProduct => {
  const application =
    restoredApplicationBySourceFamily[product.labels.family] ?? product.application;
  const publicProduct: PublicProduct = {
    id: getPublicProductId(product.econoluzReference),
    econoluzReference: product.econoluzReference,
    publicName: product.publicName,
    publicDescription: product.publicDescription,
    image: product.image,
    productType: product.productType,
    application,
    finish: product.finish,
    labels: {
      productType: product.labels.productType,
      application: getApplicationLabel(application),
      finish: product.labels.finish,
    },
    technicalSpecs: projectTechnicalSpecs(product.technicalSpecs),
  };

  if (product.images?.length) {
    publicProduct.images = [...product.images];
  }

  // Cero es un precio válido; `null`, `undefined` y cualquier cosa que no sea
  // un número finito significan "todavía sin precio".
  if (typeof extras?.priceGtq === "number" && Number.isFinite(extras.priceGtq)) {
    publicProduct.priceGtq = extras.priceGtq;
  }

  return publicProduct;
};
