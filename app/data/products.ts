const artlitePlateCodes = [
  "APL-001",
  "APL-002",
  "APL-101",
  "APL-102",
  "APL-103",
  "APL-104",
  "APL-105",
  "APL-106",
  "APL-107",
  "APL-108",
  "APL-109",
  "APL-110",
  "APL-111",
  "APL-112",
  "APL-113",
  "APL-201",
  "APL-202",
  "APL-203",
  "APL-204",
  "APL-205",
  "APL-206",
  "APL-207",
  "APL-208",
  "APL-209",
  "APL-210",
  "APL-211",
  "APL-212",
  "APL-213",
  "APL-301",
  "APL-302",
  "APL-303",
  "APL-304",
  "APL-305",
  "APL-306",
  "APL-307",
  "APL-308",
  "APL-309",
  "APL-310",
  "APL-311",
  "APL-312",
  "APL-313",
];

const artliteSubcategories = [
  "Apagadores",
  "Contactos",
  "Contactos USB",
  "Datos / LAN",
  "TV / coaxial",
  "Atenuadores",
  "Timbres",
  "Tapas ciegas",
];

const getPlateSuffix = (code: string) => code.slice(-3);

const subcategoryBySuffix: Record<string, string> = {
  "001": "Apagadores",
  "002": "Contactos",
  "101": "Apagadores",
  "102": "Apagadores",
  "103": "Apagadores",
  "104": "Contactos",
  "105": "Contactos",
  "106": "Contactos",
  "107": "Contactos USB",
  "108": "Datos / LAN",
  "109": "Datos / LAN",
  "110": "TV / coaxial",
  "111": "Atenuadores",
  "112": "Tapas ciegas",
  "113": "Timbres",
  "201": "Apagadores",
  "202": "Apagadores",
  "203": "Apagadores",
  "204": "Contactos",
  "205": "Contactos",
  "206": "Contactos",
  "207": "Contactos USB",
  "208": "Datos / LAN",
  "209": "Datos / LAN",
  "210": "TV / coaxial",
  "211": "Atenuadores",
  "212": "Tapas ciegas",
  "213": "Timbres",
  "301": "Apagadores",
  "302": "Apagadores",
  "303": "Apagadores",
  "304": "Contactos",
  "305": "Contactos",
  "306": "Contactos",
  "307": "Contactos USB",
  "308": "Datos / LAN",
  "309": "Datos / LAN",
  "310": "TV / coaxial",
  "311": "Atenuadores",
  "312": "Tapas ciegas",
  "313": "Timbres",
};

const getPlateSubcategory = (code: string) =>
  subcategoryBySuffix[getPlateSuffix(code)] ?? "Consultar ficha técnica";

const getPlateFinish = (code: string) => {
  if (code.startsWith("APL-3")) {
    return "Negro mate";
  }

  if (code.startsWith("APL-2") || code === "APL-001" || code === "APL-002") {
    return "Blanco brillante";
  }

  return "Gris metálico";
};

const getPlateMaterial = (finish: string) =>
  finish === "Gris metálico"
    ? "Acero inoxidable + PC + hierro galvanizado"
    : "Policarbonato + hierro galvanizado";

const getPlateDimensions = (finish: string) =>
  finish === "Gris metálico" ? "7.7 cm x 12.4 cm" : "7.5 cm x 11.8 cm";

const baseTechnicalSpecs = (code: string, finish: string) => ({
  voltage: "Consultar ficha técnica",
  amperage: "Consultar ficha técnica",
  frequency: "Consultar ficha técnica",
  material: getPlateMaterial(finish),
  dimensions: getPlateDimensions(finish),
  finish,
  usbOutput: "",
  gfciSupport: "",
  applicationType: getPlateSubcategory(code),
  specialFeatures: [] as string[],
});

const technicalSpecsByCode: Record<
  string,
  Partial<ReturnType<typeof baseTechnicalSpecs>>
> = {
  "APL-002": {
    gfciSupport: "Sí",
    applicationType: "Contacto dúplex GFCI",
    specialFeatures: ["Indicador LED", "Botones TEST y RESET"],
  },
  "APL-107": {
    usbOutput: "USB Type C",
    applicationType: "Contacto + salidas USB",
    specialFeatures: ["Contacto con salidas USB", "Puerto USB Type C"],
  },
  "APL-109": {
    applicationType: "Salida de comunicación LAN",
    specialFeatures: ["Salida LAN / comunicación"],
  },
  "APL-110": {
    applicationType: "Salida TV coaxial",
    specialFeatures: ["Salida coaxial para televisión"],
  },
  "APL-111": {
    applicationType: "Dimmer / atenuador",
    specialFeatures: ["Atenuador", "Iluminación máxima 100 W"],
  },
};

const getTechnicalSpecs = (code: string, finish: string) => ({
  ...baseTechnicalSpecs(code, finish),
  ...(technicalSpecsByCode[code] ?? {}),
});

export const catalogFilters = {
  brands: ["Artlite"],
  categories: ["Placas y accesorios eléctricos"],
  subcategories: artliteSubcategories,
  finishes: ["Gris metálico", "Blanco brillante", "Negro mate"],
};

export const catalogCategories = [
  "Todos",
  ...catalogFilters.categories,
];

export const products = artlitePlateCodes.map((code) => {
  const finish = getPlateFinish(code);

  return {
    id: code.toLowerCase(),
    sku: code,
    name: code,
    brand: "Artlite",
    category: "Placas y accesorios eléctricos",
    subcategory: getPlateSubcategory(code),
    finish,
    description: "Placa ARTLITE para proyecto. Información técnica pendiente de actualización.",
    price: 0,
    image: `/catalogos/artlite/placas/${code.toLowerCase()}.png`,
    technicalSpecs: getTechnicalSpecs(code, finish),
  };
});

export type Product = (typeof products)[number];
