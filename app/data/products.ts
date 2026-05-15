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

const productTypeByPlateSubcategory: Record<string, string> = {
  Apagadores: "Placas y apagadores",
  Contactos: "Contactos",
  "Contactos USB": "USB y conectividad",
  "Datos / LAN": "USB y conectividad",
  "TV / coaxial": "USB y conectividad",
  Atenuadores: "Placas y apagadores",
  Timbres: "Placas y apagadores",
  "Tapas ciegas": "Placas y apagadores",
};

const getPlateProductType = (code: string) =>
  productTypeByPlateSubcategory[getPlateSubcategory(code)] ?? "Placas y apagadores";

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
  voltage: "",
  amperage: "",
  frequency: "",
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
  Partial<
    ReturnType<typeof baseTechnicalSpecs> & {
      protection: string;
      standard: string;
      disconnectSpeed: string;
      operatingTemperature: string;
      humidity: string;
      dielectricVoltage: string;
      shortCircuitCurrent: string;
      switchingLevel: string;
      luminousFlux: string;
      power: string;
      efficiency: string;
      dimming: string;
      colorTemperature: string;
      cri: string;
      beamAngle: string;
      impactRating: string;
      productCode: string;
    }
  >
> = {
  "APL-001": {
    voltage: "127/250V",
    amperage: "15A",
    frequency: "50/60Hz",
    material: "Policarbonato + Hierro Galvanizado",
    dimensions: "24 x 48 x 34 mm",
    protection: "IP20",
    applicationType: "Modulo apagador de 1 interruptor y 4 vias",
    specialFeatures: ["Compatible con APL-203", "Compatible con APL-206", "Compatible con APL-212"],
  },
  "APL-101": {
    voltage: "127/250V",
    amperage: "15A",
    frequency: "50/60Hz",
    material: "Acero Inox. + PC + Hierro Galvanizado",
    dimensions: "77 x 124 mm",
    protection: "IP20",
    applicationType: "Placa apagador 1 interruptor y 3 vias",
  },
  "APL-102": {
    voltage: "127/250V",
    amperage: "15A",
    frequency: "50/60Hz",
    material: "Acero Inox. + PC + Hierro Galvanizado",
    dimensions: "77 x 124 mm",
    protection: "IP20",
    applicationType: "Placa apagadores 2 interruptores y 3 vias",
  },
  "APL-002": {
    voltage: "100-132V~50/60Hz",
    amperage: "20A",
    frequency: "50/60Hz",
    material: "CU + PC + Acero galvanizado",
    dimensions: "70 x 115 x 40 mm",
    finish: "Blanco brillante",
    gfciSupport: "Si",
    protection: "IP20",
    standard: "UL943 / UL498",
    disconnectSpeed: "0.025 seg.",
    operatingTemperature: "-35 a 66 C",
    humidity: "95%",
    dielectricVoltage: "Hasta 1250V AC",
    shortCircuitCurrent: "10 kA",
    switchingLevel: "Clase A (de 4 a 6 mA)",
    applicationType: "Placa de circuito fallo a tierra GFCI",
    specialFeatures: ["GFCI", "Blanco brillante"],
  },
  "APL-103": {
    voltage: "127/250V",
    amperage: "15A",
    frequency: "50/60Hz",
    material: "Acero Inox. + PC + Hierro Galvanizado",
    dimensions: "77 x 124 mm",
    protection: "IP20",
    applicationType: "Placa apagadores 3 interruptores y 3 vias",
  },
  "APL-104": {
    voltage: "127/250V",
    amperage: "15A",
    frequency: "50/60Hz",
    material: "Acero Inox. + PC + Hierro Galvanizado",
    dimensions: "77 x 124 mm",
    protection: "IP20",
    applicationType: "Placa de contacto doble",
  },
  "APL-105": {
    voltage: "127/250V",
    amperage: "15A",
    frequency: "50/60Hz",
    material: "Acero Inox. + PC + Hierro Galvanizado",
    dimensions: "77 x 124 mm",
    protection: "IP20",
    applicationType: "Placa de contacto y apagador 1 interruptor y 3 vias",
  },
  "APL-106": {
    voltage: "127/250V",
    amperage: "15A",
    frequency: "50/60Hz",
    material: "Acero Inox. + PC + Hierro Galvanizado",
    dimensions: "77 x 124 mm",
    protection: "IP20",
    applicationType: "Placa de contacto y apagadores 2 interruptores y 3 vias",
  },
  "APL-107": {
    voltage: "127/250V",
    amperage: "15A",
    frequency: "50/60Hz",
    material: "Acero Inox. + PC + Hierro Galvanizado",
    dimensions: "77 x 124 mm",
    usbOutput: "5V Max. 2.1A",
    protection: "IP20",
    applicationType: "Placa de contacto y 2 salidas USB (Tipo A y Tipo C)",
    specialFeatures: ["USB", "Tipo C", "Carga regular"],
  },
  "APL-108": {
    material: "Acero Inox. + PC + Hierro Galvanizado",
    dimensions: "77 x 124 mm",
    protection: "IP20",
    applicationType: "Placa de contacto telefonico",
    specialFeatures: ["Telefonico"],
  },
  "APL-109": {
    material: "Acero Inox. + PC + Hierro Galvanizado",
    dimensions: "77 x 124 mm",
    protection: "IP20",
    applicationType: "Placa de contacto Red LAN RJ45 CAT5",
    specialFeatures: ["LAN", "RJ45 CAT5"],
  },
  "APL-110": {
    material: "Acero Inox. + PC + Hierro Galvanizado",
    dimensions: "77 x 124 mm",
    protection: "IP20",
    applicationType: "Placa de contacto coaxial para television",
    specialFeatures: ["TV", "Coaxial"],
  },
  "APL-111": {
    voltage: "100-127V",
    amperage: "0.78A",
    frequency: "50/60Hz",
    material: "Acero Inox. + PC + Hierro Galvanizado",
    dimensions: "77 x 124 mm",
    protection: "IP20",
    applicationType: "Placa de contacto atenuador",
    specialFeatures: ["Atenuador", "Iluminacion maxima de 100W"],
  },
  "APL-112": {
    material: "Acero Inox. + PC + Hierro Galvanizado",
    dimensions: "77 x 124 mm",
    protection: "IP20",
    applicationType: "Placa tapa ciega",
  },
  "APL-113": {
    voltage: "90-127V",
    amperage: "15A",
    frequency: "50/60Hz",
    material: "Acero Inox. + PC + Hierro Galvanizado",
    dimensions: "77 x 124 mm",
    protection: "IP20",
    applicationType: "Placa de contacto timbre",
    specialFeatures: ["Timbre"],
  },
  "APL-201": {
    voltage: "127/250V",
    amperage: "15A",
    frequency: "50/60Hz",
    material: "Policarbonato + Hierro Galvanizado",
    dimensions: "75 x 118 mm",
    protection: "IP20",
    applicationType: "Placa apagador 1 interruptor y 3 vias",
  },
  "APL-202": {
    voltage: "127/250V",
    amperage: "15A",
    frequency: "50/60Hz",
    material: "Policarbonato + Hierro Galvanizado",
    dimensions: "75 x 118 mm",
    protection: "IP20",
    applicationType: "Placa apagadores 2 interruptores y 3 vias",
  },
  "APL-203": {
    voltage: "127/250V",
    amperage: "15A",
    frequency: "50/60Hz",
    material: "Policarbonato + Hierro Galvanizado",
    dimensions: "75 x 118 mm",
    protection: "IP20",
    applicationType: "Placa apagadores 3 interruptores y 3 vias",
  },
  "APL-204": {
    voltage: "127/250V",
    amperage: "15A",
    frequency: "50/60Hz",
    material: "Policarbonato + Hierro Galvanizado",
    dimensions: "75 x 118 mm",
    protection: "IP20",
    applicationType: "Placa de contacto doble",
  },
  "APL-205": {
    voltage: "127/250V",
    amperage: "15A",
    frequency: "50/60Hz",
    material: "Policarbonato + Hierro Galvanizado",
    dimensions: "75 x 118 mm",
    protection: "IP20",
    applicationType: "Placa de contacto apagador 1 interruptor y 3 vias",
  },
  "APL-206": {
    voltage: "127/250V",
    amperage: "15A",
    frequency: "50/60Hz",
    material: "Policarbonato + Hierro Galvanizado",
    dimensions: "75 x 118 mm",
    protection: "IP20",
    applicationType: "Placa de contacto y apagadores 2 interruptores y 3 vias",
  },
  "APL-207": {
    voltage: "127/250V",
    amperage: "15A",
    frequency: "50/60Hz",
    material: "Policarbonato + Hierro Galvanizado",
    dimensions: "75 x 118 mm",
    usbOutput: "5V Max. 2.1A",
    protection: "IP20",
    applicationType: "Placa de contacto y 2 salidas USB (Tipo A y Tipo C)",
    specialFeatures: ["USB", "Tipo C", "Carga regular"],
  },
  "APL-208": {
    material: "Policarbonato + Hierro Galvanizado",
    dimensions: "75 x 118 mm",
    protection: "IP20",
    applicationType: "Placa de contacto telefonico",
    specialFeatures: ["Telefonico"],
  },
  "APL-209": {
    material: "Policarbonato + Hierro Galvanizado",
    dimensions: "75 x 118 mm",
    protection: "IP20",
    applicationType: "Placa de contacto Red LAN RJ45 CAT5",
    specialFeatures: ["LAN", "RJ45 CAT5"],
  },
  "APL-210": {
    material: "Policarbonato + Hierro Galvanizado",
    dimensions: "75 x 118 mm",
    protection: "IP20",
    applicationType: "Placa contacto coaxial para television",
    specialFeatures: ["TV", "Coaxial"],
  },
  "APL-211": {
    voltage: "100-127V",
    amperage: "0.78A",
    frequency: "50/60Hz",
    material: "Policarbonato + Hierro Galvanizado",
    dimensions: "75 x 118 mm",
    protection: "IP20",
    applicationType: "Placa de contacto atenuador",
    specialFeatures: ["Atenuador", "Iluminacion maxima de 100W"],
  },
  "APL-212": {
    material: "Policarbonato + Hierro Galvanizado",
    dimensions: "75 x 118 mm",
    protection: "IP20",
    applicationType: "Placa tapa ciega",
  },
  "APL-213": {
    voltage: "90-127V",
    amperage: "15A",
    frequency: "50/60Hz",
    material: "Policarbonato + Hierro Galvanizado",
    dimensions: "75 x 118 mm",
    protection: "IP20",
    applicationType: "Placa de contacto timbre",
    specialFeatures: ["Timbre"],
  },
  "APL-301": {
    voltage: "127/250V",
    amperage: "15A",
    frequency: "50/60Hz",
    material: "Policarbonato + Hierro Galvanizado",
    dimensions: "75 x 118 mm",
    protection: "IP20",
    applicationType: "Placa apagador 1 interruptor y 3 vias",
  },
  "APL-302": {
    voltage: "127/250V",
    amperage: "15A",
    frequency: "50/60Hz",
    material: "Policarbonato + Hierro Galvanizado",
    dimensions: "75 x 118 mm",
    protection: "IP20",
    applicationType: "Placa apagadores 2 interruptores y 3 vias",
  },
  "APL-303": {
    voltage: "127/250V",
    amperage: "15A",
    frequency: "50/60Hz",
    material: "Policarbonato + Hierro Galvanizado",
    dimensions: "75 x 118 mm",
    protection: "IP20",
    applicationType: "Placa apagadores 3 interruptores y 3 vias",
  },
  "APL-304": {
    voltage: "127/250V",
    amperage: "15A",
    frequency: "50/60Hz",
    material: "Policarbonato + Hierro Galvanizado",
    dimensions: "75 x 118 mm",
    protection: "IP20",
    applicationType: "Placa de contacto doble",
  },
  "APL-305": {
    voltage: "127/250V",
    amperage: "15A",
    frequency: "50/60Hz",
    material: "Policarbonato + Hierro Galvanizado",
    dimensions: "75 x 118 mm",
    protection: "IP20",
    applicationType: "Placa de contacto y apagador 1 interruptor y 3 vias",
  },
  "APL-306": {
    voltage: "127/250V",
    amperage: "15A",
    frequency: "50/60Hz",
    material: "Policarbonato + Hierro Galvanizado",
    dimensions: "75 x 118 mm",
    protection: "IP20",
    applicationType: "Placa de contacto y apagadores 2 interruptores y 3 vias",
  },
  "APL-307": {
    voltage: "127/250V",
    amperage: "15A",
    frequency: "50/60Hz",
    material: "Policarbonato + Hierro Galvanizado",
    dimensions: "75 x 118 mm",
    usbOutput: "5V Max. 2.1A",
    protection: "IP20",
    applicationType: "Placa de contacto y 2 salidas USB (Tipo A y Tipo C)",
    specialFeatures: ["USB", "Tipo C", "Carga regular"],
  },
  "APL-308": {
    material: "Policarbonato + Hierro Galvanizado",
    dimensions: "75 x 118 mm",
    protection: "IP20",
    applicationType: "Placa de contacto telefonico",
    specialFeatures: ["Telefonico"],
  },
  "APL-309": {
    material: "Policarbonato + Hierro Galvanizado",
    dimensions: "75 x 118 mm",
    protection: "IP20",
    applicationType: "Placa de contacto Red LAN RJ45 CAT5",
    specialFeatures: ["LAN", "RJ45 CAT5"],
  },
  "APL-310": {
    material: "Policarbonato + Hierro Galvanizado",
    dimensions: "75 x 118 mm",
    protection: "IP20",
    applicationType: "Placa de contacto coaxial para television",
    specialFeatures: ["TV", "Coaxial"],
  },
  "APL-311": {
    voltage: "100-127V",
    amperage: "0.78A",
    frequency: "50/60Hz",
    material: "Policarbonato + Hierro Galvanizado",
    dimensions: "75 x 118 mm",
    protection: "IP20",
    applicationType: "Placa de contacto atenuador",
    specialFeatures: ["Atenuador", "Iluminacion maxima de 100W"],
  },
  "APL-312": {
    material: "Policarbonato + Hierro Galvanizado",
    dimensions: "75 x 118 mm",
    protection: "IP20",
    applicationType: "Placa tapa ciega",
  },
  "APL-313": {
    voltage: "90-127V",
    amperage: "15A",
    frequency: "50/60Hz",
    material: "Policarbonato + Hierro Galvanizado",
    dimensions: "75 x 118 mm",
    protection: "IP20",
    applicationType: "Placa de contacto timbre",
    specialFeatures: ["Timbre"],
  },
};

const getTechnicalSpecs = (code: string, finish: string) => ({
  ...baseTechnicalSpecs(code, finish),
  ...(technicalSpecsByCode[code] ?? {}),
});

const descriptionByCode: Record<string, string> = {
  "APL-001":
    "Modulo apagador de 1 interruptor y 4 vias en blanco brillante, 15A, 127/250V~50/60Hz, compatible con APL-203, APL-206 y APL-212.",
  "APL-002":
    "Placa de circuito fallo a tierra GFCI en blanco brillante, 20A, 100-132V~50/60Hz, protección IP20 y estándar UL943 / UL498.",
  "APL-101":
    "Placa apagador 1 interruptor y 3 vias en gris metalico, 15A, 127/250V~50/60Hz, proteccion IP20.",
  "APL-102":
    "Placa apagadores 2 interruptores y 3 vias en gris metalico, 15A, 127/250V~50/60Hz, proteccion IP20.",
  "APL-103":
    "Placa apagadores 3 interruptores y 3 vias en gris metalico, 15A, 127/250V~50/60Hz, proteccion IP20.",
  "APL-104":
    "Placa de contacto doble en gris metalico, 15A, 127/250V~50/60Hz, proteccion IP20.",
  "APL-105":
    "Placa de contacto y apagador 1 interruptor y 3 vias en gris metalico, 15A, 127/250V~50/60Hz, proteccion IP20.",
  "APL-106":
    "Placa de contacto y apagadores 2 interruptores y 3 vias en gris metalico, 15A, 127/250V~50/60Hz, proteccion IP20.",
  "APL-107":
    "Placa de contacto y 2 salidas USB Tipo A y Tipo C en gris metalico, 15A, 127/250V~50/60Hz, salida USB 5V Max. 2.1A.",
  "APL-108":
    "Placa de contacto telefonico en gris metalico con material Acero Inox. + PC + Hierro Galvanizado, 77 x 124 mm, IP20.",
  "APL-109":
    "Placa de contacto Red LAN RJ45 CAT5 en gris metalico con material Acero Inox. + PC + Hierro Galvanizado, 77 x 124 mm, IP20.",
  "APL-110":
    "Placa de contacto coaxial para television en gris metalico con material Acero Inox. + PC + Hierro Galvanizado, 77 x 124 mm, IP20.",
  "APL-111":
    "Placa de contacto atenuador en gris metalico, 0.78A, 100-127V~50/60Hz, iluminacion maxima de 100W.",
  "APL-112":
    "Placa tapa ciega en gris metalico con material Acero Inox. + PC + Hierro Galvanizado, 77 x 124 mm, IP20.",
  "APL-113":
    "Placa de contacto timbre en gris metalico, 15A, 90-127V~50/60Hz, proteccion IP20.",
  "APL-201":
    "Placa apagador 1 interruptor y 3 vias en blanco brillante, 15A, 127/250V~50/60Hz, proteccion IP20.",
  "APL-202":
    "Placa apagadores 2 interruptores y 3 vias en blanco brillante, 15A, 127/250V~50/60Hz, proteccion IP20.",
  "APL-203":
    "Placa apagadores 3 interruptores y 3 vias en blanco brillante, 15A, 127/250V~50/60Hz, proteccion IP20.",
  "APL-204":
    "Placa de contacto doble en blanco brillante, 15A, 127/250V~50/60Hz, proteccion IP20.",
  "APL-205":
    "Placa de contacto apagador 1 interruptor y 3 vias en blanco brillante, 15A, 127/250V~50/60Hz, proteccion IP20.",
  "APL-206":
    "Placa de contacto y apagadores 2 interruptores y 3 vias en blanco brillante, 15A, 127/250V~50/60Hz, proteccion IP20.",
  "APL-207":
    "Placa de contacto y 2 salidas USB Tipo A y Tipo C en blanco brillante, 15A, 127/250V~50/60Hz, salida USB 5V Max. 2.1A.",
  "APL-208":
    "Placa de contacto telefonico en blanco brillante con material Policarbonato + Hierro Galvanizado, 75 x 118 mm, IP20.",
  "APL-209":
    "Placa de contacto Red LAN RJ45 CAT5 en blanco brillante con material Policarbonato + Hierro Galvanizado, 75 x 118 mm, IP20.",
  "APL-210":
    "Placa contacto coaxial para television en blanco brillante con material Policarbonato + Hierro Galvanizado, 75 x 118 mm, IP20.",
  "APL-211":
    "Placa de contacto atenuador en blanco brillante, 0.78A, 100-127V~50/60Hz, iluminacion maxima de 100W.",
  "APL-212":
    "Placa tapa ciega en blanco brillante con material Policarbonato + Hierro Galvanizado, 75 x 118 mm, IP20.",
  "APL-213":
    "Placa de contacto timbre en blanco brillante, 15A, 90-127V~50/60Hz, proteccion IP20.",
  "APL-301":
    "Placa apagador 1 interruptor y 3 vias en negro mate, 15A, 127/250V~50/60Hz, proteccion IP20.",
  "APL-302":
    "Placa apagadores 2 interruptores y 3 vias en negro mate, 15A, 127/250V~50/60Hz, proteccion IP20.",
  "APL-303":
    "Placa apagadores 3 interruptores y 3 vias en negro mate, 15A, 127/250V~50/60Hz, proteccion IP20.",
  "APL-304":
    "Placa de contacto doble en negro mate, 15A, 127/250V~50/60Hz, proteccion IP20.",
  "APL-305":
    "Placa de contacto y apagador 1 interruptor y 3 vias en negro mate, 15A, 127/250V~50/60Hz, proteccion IP20.",
  "APL-306":
    "Placa de contacto y apagadores 2 interruptores y 3 vias en negro mate, 15A, 127/250V~50/60Hz, proteccion IP20.",
  "APL-307":
    "Placa de contacto y 2 salidas USB Tipo A y Tipo C en negro mate, 15A, 127/250V~50/60Hz, salida USB 5V Max. 2.1A.",
  "APL-308":
    "Placa de contacto telefonico en negro mate con material Policarbonato + Hierro Galvanizado, 75 x 118 mm, IP20.",
  "APL-309":
    "Placa de contacto Red LAN RJ45 CAT5 en negro mate con material Policarbonato + Hierro Galvanizado, 75 x 118 mm, IP20.",
  "APL-310":
    "Placa de contacto coaxial para television en negro mate con material Policarbonato + Hierro Galvanizado, 75 x 118 mm, IP20.",
  "APL-311":
    "Placa de contacto atenuador en negro mate, 0.78A, 100-127V~50/60Hz, iluminacion maxima de 100W.",
  "APL-312":
    "Placa tapa ciega en negro mate con material Policarbonato + Hierro Galvanizado, 75 x 118 mm, IP20.",
  "APL-313":
    "Placa de contacto timbre en negro mate, 15A, 90-127V~50/60Hz, proteccion IP20.",
};

export const catalogFilters = {
  brands: ["Artlite", "Construlita"],
  categories: [
    "Iluminación industrial",
    "Iluminación arquitectónica",
    "Iluminación exterior",
    "Iluminación residencial",
    "Placas y accesorios eléctricos",
    "Tiras LED",
    "Emergencia y señalización",
  ],
  subcategories: [
    ...artliteSubcategories,
    "Cuasar",
    "HB Pure",
    "HB Steel",
    "Highlens",
    "Supreme",
  ],
  finishes: ["Gris metálico", "Blanco brillante", "Negro mate"],
  applications: [
    "Alto montaje",
    "Altura media",
    "Lineales industriales",
    "Gabinetes",
    "A prueba de vapor",
    "Wallpacks",
    "Downlights",
    "Luminarios para riel",
    "Suspendidos",
    "Empotrados en piso",
    "Arbotantes",
    "Decorativos",
    "Placas y apagadores",
    "Contactos",
    "USB y conectividad",
    "Datos / LAN",
    "TV / coaxial",
    "Atenuadores",
    "Timbres",
    "Tapas ciegas",
  ],
};

export const catalogCategories = [
  "Todos",
  ...catalogFilters.categories,
];

const artliteProducts = artlitePlateCodes.map((code) => {
  const finish = getPlateFinish(code);

  return {
    id: code.toLowerCase(),
    sku: code,
    name: code,
    brand: "Artlite",
    category: "Placas y accesorios eléctricos",
    subcategory: getPlateSubcategory(code),
    collection: "APL",
    application: getPlateProductType(code),
    finish,
    description:
      descriptionByCode[code] ??
      "Placa ARTLITE para proyecto. Información técnica pendiente de actualización.",
    price: 0,
    image: `/catalogos/artlite/placas/${code.toLowerCase()}.png`,
    technicalSpecs: getTechnicalSpecs(code, finish),
  };
});

const construlitaAltoMontajeProducts = [
  {
    id: "construlita-cuasar",
    sku: "cuasar",
    name: "Cuasar",
    brand: "Construlita",
    category: "Iluminación industrial",
    subcategory: "Cuasar",
    collection: "Cuasar",
    application: "Alto montaje",
    finish: "",
    description:
      "Luminario LED de alto montaje con eficiencia de 170 lm/W, opciones de 75 a 200 W, flujo hasta 34 000 lm y montaje suspendido o sobrepuesto.",
    price: 0,
    image: "/catalogos/construlita/alto_montaje/cuasar1.png",
    images: [
      "/catalogos/construlita/alto_montaje/cuasar1.png",
      "/catalogos/construlita/alto_montaje/cuasar2.png",
    ],
    technicalSpecs: {
      productCode:
        "IN8031NBNA / IN8028NBFA / IN8028NBNA / IN8029NBFA / IN8029NBNA / IN8030NBFA / IN8030NBNA",
      luminousFlux: "12 250 lm / 17 000 lm / 25 500 lm / 34 000 lm",
      power: "75 W / 100 W / 150 W / 200 W",
      efficiency: "170 lm/W",
      voltage: "100-277V~",
      dimming: "0-10V",
      colorTemperature: "4 000 K / 5 000 K",
      cri: "80",
      beamAngle: "90°",
      protection: "IP65",
      impactRating: "IK10",
      dimensions:
        "75 W / 100 W: Ø 275 mm x 166 mm; 150 W: Ø 285 mm x 165 mm; 200 W: Ø 305 mm x 181 mm",
      applicationType: "Alto montaje con convección natural de aire",
      specialFeatures: [
        "Incluye argolla para montaje suspendido",
        "Incluye herraje dirigible para montaje sobrepuesto",
        "Ajuste dirigible ±90°",
        "LEDs distribuidos desde el centro de la PCB",
      ],
    },
  },
  {
    id: "construlita-hb-pure",
    sku: "hb_pure",
    name: "HB Pure",
    brand: "Construlita",
    category: "Iluminación industrial",
    subcategory: "HB Pure",
    collection: "HB Pure",
    application: "Alto montaje",
    finish: "",
    description:
      "Luminario LED de alto montaje para industria alimenticia, con cuerpo autolimpiable, IP66, óptica 120° y potencias de 100 a 200 W.",
    price: 0,
    image: "/catalogos/construlita/alto_montaje/hb_pure.png",
    technicalSpecs: {
      productCode: "IN8025BBNA / IN8026BBNA / IN8027BBNA",
      luminousFlux: "13 500 lm / 20 000 lm / 26 000 lm",
      power: "100 W / 150 W / 200 W",
      efficiency: "135 lm/W / 133 lm/W / 130 lm/W",
      voltage: "100-277V~",
      dimming: "0-10V",
      colorTemperature: "4 000 K",
      cri: "80",
      beamAngle: "120°",
      protection: "IP66",
      impactRating: "IK05",
      dimensions: "Ø 489 mm x 200 mm",
      applicationType: "Alto montaje para industria alimenticia",
      specialFeatures: [
        "Autolimpieza",
        "Cuerpo liso diseñado para evitar acumulación de polvo y agua",
        "Sin tornillería expuesta",
        "Materiales de construcción seguros",
        "Sin vidrio en la pantalla",
        "Lentes de PC",
      ],
    },
  },
  {
    id: "construlita-hb-steel",
    sku: "hb_steel",
    name: "HB Steel",
    brand: "Construlita",
    category: "Iluminación industrial",
    subcategory: "HB Steel",
    collection: "HB Steel",
    application: "Alto montaje",
    finish: "",
    description:
      "Luminario LED lineal de alto montaje para aplicaciones industriales, 160 lm/W, hasta 36 000 lm y opciones de sensor o emergencia.",
    price: 0,
    image: "/catalogos/construlita/alto_montaje/hb_steel.png",
    technicalSpecs: {
      productCode:
        "IN8204BBFA / IN8220BBFA / IN8201BBFA / IN8221BBFA / IN8202BBFA / IN8222BBFA / IN8223BBFA / IN8203BBFA / IN8224BBFA",
      luminousFlux:
        "12 000 lm / 15 000 lm / 18 000 lm / 20 000 lm / 24 000 lm / 26 000 lm / 30 000 lm / 35 000 lm / 36 000 lm",
      power: "73 W / 95 W / 110 W / 126 W / 146 W / 160 W / 184 W / 215 W / 225 W",
      efficiency: "160 lm/W",
      voltage: "100-277V~",
      dimming: "0-10V",
      colorTemperature: "5 000 K",
      cri: "80",
      beamAngle: "105°",
      protection: "IP40",
      dimensions:
        "73 W / 95 W / 110 W / 126 W / 146 W / 160 W: 325 x 612 x 53 mm; 184 W / 215 W / 225 W: 325 x 1 217 x 53 mm",
      applicationType: "Alto montaje lineal para aplicaciones industriales",
      specialFeatures: [
        "Hasta 100,000 horas de vida L70",
        "Driver de emergencia AC7520",
        "Sensor de movimiento AC1300B",
        "Control remoto AC1301B para sensor de movimiento",
        "Sensor PIR AC1302B",
        "Control remoto AC1303N para sensor PIR",
        "Batería de emergencia 90 min",
        "Sensor ideal según proyecto o sensibilidad requerida",
      ],
    },
  },
  {
    id: "construlita-highlens",
    sku: "highlens",
    name: "Highlens",
    brand: "Construlita",
    category: "Iluminación industrial",
    subcategory: "Highlens",
    collection: "Highlens",
    application: "Alto montaje",
    finish: "",
    description:
      "Luminario LED de alto montaje con selector de potencia, selector de lentes, 170 lm/W, IP65 y ángulos configurables de 60°, 85° o 105°.",
    price: 0,
    image: "/catalogos/construlita/alto_montaje/highlens1.png",
    images: [
      "/catalogos/construlita/alto_montaje/highlens1.png",
      "/catalogos/construlita/alto_montaje/highlens2.png",
    ],
    technicalSpecs: {
      productCode: "IN8025BBFA",
      luminousFlux: "15 300 lm / 20 400 lm / 25 500 lm",
      power: "90 W / 120 W / 150 W",
      efficiency: "170 lm/W",
      voltage: "100-277V~",
      dimming: "0-10V",
      colorTemperature: "5 000 K",
      cri: "80",
      beamAngle: "60° / 85° / 105°",
      protection: "IP65",
      impactRating: "IK08",
      dimensions: "Ø 295 mm x 70.5 mm x 181 mm",
      applicationType: "Alto montaje con selector de potencia y selector de lentes",
      specialFeatures: [
        "Selector de potencia 60% / 80% / 100%",
        "Selector de lentes W 105°, M 85°, N 60°",
      ],
    },
  },
  {
    id: "construlita-supreme",
    sku: "supreme",
    name: "Supreme",
    brand: "Construlita",
    category: "Iluminación industrial",
    subcategory: "Supreme",
    collection: "Supreme",
    application: "Alto montaje",
    finish: "",
    description:
      "Luminario LED de alto montaje configurable, 170 lm/W, ópticas intercambiables, IP65 y accesorios para sensor, control remoto o emergencia.",
    price: 0,
    image: "/catalogos/construlita/alto_montaje/supreme.png",
    technicalSpecs: {
      productCode:
        "IN8040NBFA / IN8040NBNA / IN8041NBFA / IN8041NBNA / IN8042NBFA / IN8042NBNA",
      luminousFlux: "17 000 lm / 25 500 lm / 34 000 lm",
      power: "100 W / 150 W / 200 W",
      efficiency: "170 lm/W",
      voltage: "100-277V~",
      dimming: "0-10V",
      colorTemperature: "5 000 K / 4 000 K",
      cri: "80",
      beamAngle: "85° instalado, con opción a sustituirse por 55° o 110°",
      protection: "IP65",
      impactRating: "IK08",
      dimensions: "100 W: Ø 308 mm x 216 mm; 150 W: Ø 321 mm x 220 mm; 200 W: Ø 331 mm x 225 mm",
      applicationType: "Alto montaje configurable con ópticas intercambiables",
      specialFeatures: [
        "Configurable",
        "Argolla para suspender",
        "Sobreponer en superficie horizontal",
        "Sobreponer en superficie vertical",
        "Convección natural de aire",
        "LEDs distribuidos desde el centro de la PCB",
        "Sensor opcional AC1305B",
        "Control remoto AC1304B",
        "Campana Cutoff AC1400N",
        "Batería de emergencia 90 min AC7540N",
        "Óptica AC1410 55°",
        "Óptica instalada 85°",
        "Óptica AC1411 110°",
      ],
    },
  },
];

export const products = [...artliteProducts, ...construlitaAltoMontajeProducts];

export type Product = (typeof products)[number];
