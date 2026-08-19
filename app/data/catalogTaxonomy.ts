export const productTypes = {
  iluminacion_industrial: {
    id: "iluminacion_industrial",
    label: "Iluminación industrial",
    marker: "IND",
    description: "Luminarias para bodegas, plantas, producción y grandes alturas.",
    applications: [
      "alto_montaje",
      "altura_media",
      "lineales_industriales",
      "gabinetes",
      "a_prueba_de_vapor",
    ],
  },
  iluminacion_arquitectonica: {
    id: "iluminacion_arquitectonica",
    label: "Iluminación arquitectónica",
    marker: "ARQ",
    description: "Soluciones para acento, integración y lectura espacial.",
    applications: [
      "downlights",
      "luminarios_riel",
      "magnetrack_pro",
      "suspendidos",
      "empotrados_piso",
      "decorativos",
    ],
  },
  iluminacion_exterior: {
    id: "iluminacion_exterior",
    label: "Iluminación exterior",
    marker: "EXT",
    description: "Equipos para fachadas, perímetros, jardines y áreas abiertas.",
    applications: [
      "wallpacks",
      "proyectores_gran_amplitud",
      "vialidades",
      "minipostes",
      "luminarios_poste",
      "postes",
      "sumergibles",
      "arbotantes",
      "decorativos",
    ],
  },
  tiras_led: {
    id: "tiras_led",
    label: "Tiras LED",
    marker: "LED",
    description: "Líneas flexibles para integración, detalle y luz indirecta.",
    applications: ["tiras", "drivers", "perfiles"],
  },
  sistemas_lineales_tubos: {
    id: "sistemas_lineales_tubos",
    label: "Sistemas lineales y tubos",
    marker: "LIN",
    description: "Tubos y barras lineales para integración interior, exterior o retrofit.",
    applications: ["tubos_led", "barras_lineales"],
  },
  placas_accesorios: {
    id: "placas_accesorios",
    label: "Placas y accesorios",
    marker: "APL",
    description: "Apagadores, contactos, conectividad y acabados de línea.",
    applications: [
      "placas_apagadores",
      "contactos",
      "usb_conectividad",
      "atenuadores",
      "datos_lan",
      "tv_coaxial",
      "timbres",
      "tapas_ciegas",
    ],
  },
  emergencia_senalizacion: {
    id: "emergencia_senalizacion",
    label: "Emergencia y señalización",
    marker: "SEG",
    description: "Soluciones para rutas, respaldo y seguridad operativa.",
    applications: ["emergencia_senalizacion"],
  },
} as const;

export const applications = {
  alto_montaje: { id: "alto_montaje", label: "Alto montaje" },
  altura_media: { id: "altura_media", label: "Altura media" },
  lineales_industriales: { id: "lineales_industriales", label: "Lineales industriales" },
  gabinetes: { id: "gabinetes", label: "Gabinetes" },
  a_prueba_de_vapor: { id: "a_prueba_de_vapor", label: "A prueba de vapor" },
  downlights: { id: "downlights", label: "Downlights" },
  luminarios_riel: { id: "luminarios_riel", label: "Luminarios para riel" },
  magnetrack_pro: { id: "magnetrack_pro", label: "Magnetrack Pro" },
  suspendidos: { id: "suspendidos", label: "Suspendidos" },
  empotrados_piso: { id: "empotrados_piso", label: "Empotrados en piso" },
  decorativos: { id: "decorativos", label: "Decorativos" },
  wallpacks: { id: "wallpacks", label: "Wallpacks" },
  proyectores_gran_amplitud: {
    id: "proyectores_gran_amplitud",
    label: "Proyectores de gran amplitud",
  },
  vialidades: { id: "vialidades", label: "Vialidades" },
  minipostes: { id: "minipostes", label: "Minipostes" },
  luminarios_poste: { id: "luminarios_poste", label: "Luminarios para poste" },
  postes: { id: "postes", label: "Postes" },
  sumergibles: { id: "sumergibles", label: "Sumergibles" },
  arbotantes: { id: "arbotantes", label: "Arbotantes" },
  tiras: { id: "tiras", label: "Tiras" },
  drivers: { id: "drivers", label: "Drivers" },
  perfiles: { id: "perfiles", label: "Perfiles" },
  tubos_led: { id: "tubos_led", label: "Tubos LED" },
  barras_lineales: { id: "barras_lineales", label: "Barras lineales" },
  placas_apagadores: { id: "placas_apagadores", label: "Placas y apagadores" },
  contactos: { id: "contactos", label: "Contactos" },
  usb_conectividad: { id: "usb_conectividad", label: "USB y conectividad" },
  atenuadores: { id: "atenuadores", label: "Atenuadores" },
  datos_lan: { id: "datos_lan", label: "Datos / LAN" },
  tv_coaxial: { id: "tv_coaxial", label: "TV / coaxial" },
  timbres: { id: "timbres", label: "Timbres" },
  tapas_ciegas: { id: "tapas_ciegas", label: "Tapas ciegas" },
  emergencia_senalizacion: {
    id: "emergencia_senalizacion",
    label: "Emergencia y señalización",
  },
} as const;

export const finishes = {
  blanco: { id: "blanco", label: "Blanco" },
  blanco_brillante: { id: "blanco_brillante", label: "Blanco brillante" },
  negro: { id: "negro", label: "Negro" },
  negro_mate: { id: "negro_mate", label: "Negro mate" },
  gris: { id: "gris", label: "Gris" },
  gris_metalico: { id: "gris_metalico", label: "Gris metálico" },
  grafito: { id: "grafito", label: "Grafito" },
  bronce: { id: "bronce", label: "Bronce" },
  cafe: { id: "cafe", label: "Café" },
  satin: { id: "satin", label: "Satin" },
  satinado: { id: "satinado", label: "Satinado" },
  transparente: { id: "transparente", label: "Transparente" },
  blanco_negro: { id: "blanco_negro", label: "Blanco / Negro" },
  negro_blanco: { id: "negro_blanco", label: "Negro / Blanco" },
  blanco_grafito_gris_negro: {
    id: "blanco_grafito_gris_negro",
    label: "Blanco / Grafito / Gris / Negro",
  },
  negro_gris_grafito: {
    id: "negro_gris_grafito",
    label: "Negro / Gris / Grafito",
  },
} as const;

export const series = {
  alba: { id: "alba", label: "Alba" },
  alfa: { id: "alfa", label: "Alfa" },
  apl: { id: "apl", label: "APL" },
  artic: { id: "artic", label: "Artic" },
  aurora: { id: "aurora", label: "Aurora" },
  barra_pro: { id: "barra_pro", label: "Barra Pro" },
  bollard: { id: "bollard", label: "Bollard" },
  bright: { id: "bright", label: "Bright" },
  bronce: { id: "bronce", label: "Bronce" },
  canopy_cct: { id: "canopy_cct", label: "Canopy CCT" },
  canyon_pro: { id: "canyon_pro", label: "Canyon Pro" },
  comfort_dot: { id: "comfort_dot", label: "Comfort Dot" },
  comfort_soft: { id: "comfort_soft", label: "Comfort Soft" },
  corvus: { id: "corvus", label: "Corvus" },
  corvus_miniposte: { id: "corvus_miniposte", label: "Corvus Miniposte" },
  cuasar: { id: "cuasar", label: "Cuasar" },
  cubic_bolardo: { id: "cubic_bolardo", label: "Cubic Bolardo" },
  cubic_pro: { id: "cubic_pro", label: "Cubic Pro" },
  cylinder: { id: "cylinder", label: "Cylinder" },
  cylinder_pro: { id: "cylinder_pro", label: "Cylinder Pro" },
  downled: { id: "downled", label: "Downled" },
  drivers_tiras_led: { id: "drivers_tiras_led", label: "Drivers Tiras LED" },
  emergencia: { id: "emergencia", label: "Emergencia" },
  escafandra: { id: "escafandra", label: "Escafandra" },
  evolight: { id: "evolight", label: "Evolight" },
  faro_led_colonial: { id: "faro_led_colonial", label: "Faro LED Colonial" },
  focus: { id: "focus", label: "Focus" },
  fragata_pro: { id: "fragata_pro", label: "Fragata Pro" },
  goleta_pro: { id: "goleta_pro", label: "Goleta Pro" },
  hb_infinity: { id: "hb_infinity", label: "HB Infinity" },
  hb_pure: { id: "hb_pure", label: "HB Pure" },
  hb_steel: { id: "hb_steel", label: "HB Steel" },
  highlens: { id: "highlens", label: "Highlens" },
  landscape: { id: "landscape", label: "Landscape" },
  lowbay: { id: "lowbay", label: "Lowbay" },
  lynlight: { id: "lynlight", label: "Lynlight" },
  magnetrack_pro: { id: "magnetrack_pro", label: "Magnetrack Pro" },
  metroled: { id: "metroled", label: "Metroled" },
  microsystem: { id: "microsystem", label: "Microsystem" },
  modulare: { id: "modulare", label: "Modulare" },
  module: { id: "module", label: "Module" },
  nanovia: { id: "nanovia", label: "Nanovia" },
  nanovia_ul: { id: "nanovia_ul", label: "Nanovia UL" },
  nova: { id: "nova", label: "Nova" },
  ocean: { id: "ocean", label: "Ocean" },
  paneled: { id: "paneled", label: "Paneled" },
  paneled_highbay: { id: "paneled_highbay", label: "Paneled Highbay" },
  perfiles_tiras_led: { id: "perfiles_tiras_led", label: "Perfiles Tiras LED" },
  performa_pro: { id: "performa_pro", label: "Performa PRO" },
  poste: { id: "poste", label: "Poste" },
  roadlight: { id: "roadlight", label: "Roadlight" },
  skylight: { id: "skylight", label: "Skylight" },
  slim: { id: "slim", label: "Slim" },
  softglow: { id: "softglow", label: "Softglow" },
  sombra: { id: "sombra", label: "Sombra" },
  sphere: { id: "sphere", label: "Sphere" },
  supreme: { id: "supreme", label: "Supreme" },
  tiras_led_exterior: { id: "tiras_led_exterior", label: "Tiras LED Exterior" },
  tiras_led_interior: { id: "tiras_led_interior", label: "Tiras LED Interior" },
  tubo_led_t8: { id: "tubo_led_t8", label: "Tubo LED T8" },
  trazzo: { id: "trazzo", label: "Trazzo" },
  uplight: { id: "uplight", label: "Uplight" },
  uplight_lineal_dirigible: { id: "uplight_lineal_dirigible", label: "Uplight lineal dirigible" },
  uplights_dirigibles: { id: "uplights_dirigibles", label: "Uplights dirigibles" },
  urban_city: { id: "urban_city", label: "Urban City" },
  vector_system: { id: "vector_system", label: "Vector System" },
  vialed: { id: "vialed", label: "Vialed" },
  vialed_ul: { id: "vialed_ul", label: "Vialed UL" },
  walklights: { id: "walklights", label: "Walklights" },
  wallpack: { id: "wallpack", label: "Wallpack" },
  wallpack_cct: { id: "wallpack_cct", label: "Wallpack CCT" },
  walltrack: { id: "walltrack", label: "Walltrack" },
} as const;

export type ProductTypeId = keyof typeof productTypes;
export type ApplicationId = keyof typeof applications;
export type FinishId = keyof typeof finishes;
export type SeriesId = string;

const slugify = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " y ")
    .replace(/\+/g, " ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const labelLookup = <T extends Record<string, { label: string }>>(items: T) =>
  Object.fromEntries(
    Object.entries(items).map(([id, item]) => [item.label.toLowerCase(), id]),
  ) as Record<string, keyof T>;

const productTypeByLabel = labelLookup(productTypes);
const applicationByLabel = labelLookup(applications);
const finishByLabel = labelLookup(finishes);
const seriesByLabel = labelLookup(series);

const productTypeAliasesBySlug: Record<string, ProductTypeId> = {
  iluminacion_lineal: "sistemas_lineales_tubos",
  lamparas: "iluminacion_arquitectonica",
  placas_y_accesorios_electricos: "placas_accesorios",
  tubos_led: "sistemas_lineales_tubos",
};

const applicationAliasesBySlug: Record<string, ApplicationId> = {
  barras: "barras_lineales",
  bronce: "decorativos",
  luz_de_cortesia_muro: "decorativos",
  senalizacion: "emergencia_senalizacion",
};

export const productTypeList = Object.values(productTypes);

export const getProductTypeId = (label = "") =>
  (productTypeByLabel[label.toLowerCase()] as ProductTypeId | undefined) ??
  productTypeAliasesBySlug[slugify(label)] ??
  slugify(label);

export const getApplicationId = (label = "") =>
  (applicationByLabel[label.toLowerCase()] as ApplicationId | undefined) ??
  applicationAliasesBySlug[slugify(label)] ??
  slugify(label);

export const getFinishId = (label = "") =>
  (finishByLabel[label.toLowerCase()] as FinishId | undefined) ?? slugify(label);

export const getSeriesId = (label = "") =>
  (seriesByLabel[label.toLowerCase()] as SeriesId | undefined) ?? slugify(label);

export const getProductTypeLabel = (id: string) =>
  productTypes[id as ProductTypeId]?.label ?? id;
export const getApplicationLabel = (id: string) =>
  applications[id as ApplicationId]?.label ?? id;
export const getFinishLabel = (id: string) => finishes[id as FinishId]?.label ?? id;
export const getSeriesLabel = (id: string) => series[id as keyof typeof series]?.label ?? id;

type TaxonomyProduct = {
  productType: string;
  application: string;
};

export const getPopulatedApplicationIds = (
  productTypeId: string,
  catalog: readonly TaxonomyProduct[],
) => {
  const productType = productTypes[productTypeId as ProductTypeId];

  if (!productType) {
    return [];
  }

  const populatedApplications = new Set(
    catalog
      .filter((product) => product.productType === productTypeId)
      .map((product) => product.application),
  );

  return productType.applications.filter((application) =>
    populatedApplications.has(application),
  );
};
