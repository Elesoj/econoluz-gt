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
  /** Precio público en quetzales; ausente significa «Precio a consultar». */
  priceGtq?: number;
  /**
   * Unidades apuntadas en el panel.
   *
   * Opcional por el mismo motivo que `priceGtq`, y con una distinción que
   * importa: que no exista significa «no se ha contado el inventario», que es
   * distinto de `0`, que significa «se agotó». La tienda solo avisa del plazo
   * de entrega cuando hay un número apuntado; sin él no promete nada.
   */
  stock?: number;
};
