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
    description:
      descriptionByCode[code] ??
      "Placa ARTLITE para proyecto. Información técnica pendiente de actualización.",
    price: 0,
    image: `/catalogos/artlite/placas/${code.toLowerCase()}.png`,
    technicalSpecs: getTechnicalSpecs(code, finish),
  };
});

export type Product = (typeof products)[number];
