// Series comerciales del fabricante (Cuasar, HB Pure, Highlens...). Viven en un
// módulo interno, y no en la taxonomía, porque la taxonomía la importa el
// catálogo del navegador: cualquier cosa que esté ahí acaba dentro del bundle y
// se puede leer en el código fuente de la página. Estos nombres identificarían
// al proveedor ante el cliente, así que solo pueden usarse en el servidor, al
// construir el producto público. Mismo criterio que catalogBrands.internal.ts.

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

const seriesByLabel = Object.fromEntries(
  Object.entries(series).map(([id, item]) => [item.label.toLowerCase(), id]),
) as Record<string, keyof typeof series>;

export const getSeriesId = (label = "") =>
  (seriesByLabel[label.toLowerCase()] as SeriesId | undefined) ?? slugify(label);

export const getSeriesLabel = (id: string) =>
  series[id as keyof typeof series]?.label ?? id;
