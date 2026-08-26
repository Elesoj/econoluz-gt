export const mainNavItems = [
  { label: "Inicio", href: "/#inicio" },
  { label: "Empresa", href: "/#empresa" },
  { label: "Calculadora LED", href: "/calculadora-led" },
  { label: "Catálogo", href: "/catalogo" },
  { label: "Proyectos", href: "/#proyectos" },
  { label: "Contacto", href: "/#contacto" },
];

export const homeNavItems = mainNavItems.map((item) =>
  item.href.startsWith("/#") ? { ...item, href: item.href.replace("/", "") } : item,
);

export const contact = {
  email: "ventas@econoluz.net",
  phoneHref: "tel:+50223111846",
  phoneLabel: "2311 1846 / 2311 1847",
  whatsappNumber: "50240428790",
  whatsappLabel: "WhatsApp 4042 8790",
  whatsappDefaultMessage: "Hola, quiero cotizar un proyecto de iluminación.",
  address: "21 Avenida 0-18, Vista Hermosa 2, Zona 15.",
  hours: "Lunes a viernes, 8:00 AM - 5:00 PM",
};

export const homeHero = {
  eyebrow: "Iluminación arquitectónica premium",
  title: "Luz precisa para espacios que se sienten extraordinarios",
  description:
    "ECONOLUZ GT acompaña proyectos residenciales, comerciales y de hospitalidad con luminarias LED, asesoría técnica y piezas seleccionadas para arquitectura contemporánea.",
  image: "/proyectos/borghetto/borghetto1.jpg",
  imageAlt: "Interior arquitectónico con iluminación premium",
  primaryCta: { label: "Agendar asesoría", href: "/asesoria" },
  secondaryCta: { label: "Ver catálogo", href: "/catalogo" },
  stats: [
    { value: "2006", label: "Trayectoria" },
    { value: "LED", label: "Tecnología eficiente" },
  ],
};

export const companyStats = [
  { value: "+500", label: "Lámparas" },
  { value: "11", label: "Marcas" },
  { value: "9", label: "Proveedores" },
  { value: "+1,000", label: "Clientes satisfechos" },
];

// Marcas y proveedores que ECONOLUZ GT representa. El nombre no se pinta en
// pantalla: es el texto alternativo de cada logo, lo que lee un lector de
// pantalla y lo que indexa un buscador.
export const suppliers = [
  { name: "Tecnolite", logo: "/proveedores/tecnolite.png" },
  { name: "Construlita", logo: "/proveedores/construlita.png" },
  { name: "Light-Tec", logo: "/proveedores/lighttec.png" },
  { name: "Sylvania", logo: "/proveedores/sylvania.png" },
  { name: "Philips", logo: "/proveedores/philips.png" },
  { name: "OSRAM", logo: "/proveedores/osram.png" },
  { name: "Proelca", logo: "/proveedores/proelca.png" },
  { name: "Ilumitec", logo: "/proveedores/ilumitec.png" },
  { name: "Ilum", logo: "/proveedores/ilum.png" },
  { name: "Highlum", logo: "/proveedores/highlum.png" },
  { name: "Sunnovation", logo: "/proveedores/sunnovation.png" },
];

export const companyHighlights = [
  {
    title: "Especificación",
    text: "Selección de luminarias LED para residencias, edificios, restaurantes, empresas y proyectos especiales.",
  },
  {
    title: "Acompañamiento",
    text: "Asesoría técnica desde la intención visual hasta la selección de producto adecuada.",
  },
  {
    title: "Cobertura",
    text: "Atención en Guatemala y Quetzaltenango para hogares, comercios y proyectos arquitectónicos.",
  },
];

export const collections = [
  {
    title: "Decorativa",
    detail: "Colgantes, apliques y piezas de acento para ambientes memorables.",
    image: "/proyectos/sanmartin/sanmartin1.jpeg",
  },
  {
    title: "Arquitectónica",
    detail: "Perfiles lineales, luz indirecta y soluciones integradas a obra.",
    image: "/proyectos/perfilesled/perfilesled1.jpg",
  },
  {
    title: "Técnica",
    detail: "Downlights, paneles y sistemas LED para precisión, eficiencia y confort.",
    image: "/proyectos/insigne/insigne1.jpeg",
  },
];

export const faqs = [
  {
    question: "¿Dónde puedo comprar lámparas LED en Guatemala?",
    answer:
      "En ECONOLUZ GT puedes explorar referencias en línea y solicitar asesoría para definir luminarias según el tipo de proyecto.",
  },
  {
    question: "¿Qué tipos de lámparas LED ofrecen?",
    answer:
      "Trabajamos iluminación arquitectónica, decorativa, exterior y comercial para residencias, comercios y edificios.",
  },
  {
    question: "¿Realizan envíos a toda Guatemala?",
    answer:
      "Sí. Coordinamos entregas y atención de proyectos según ubicación, disponibilidad y especificación.",
  },
];

export const quoteProjectTypes = [
  "Residencial",
  "Comercial",
  "Restaurante / hotel",
  "Oficina",
  "Exterior / fachada",
  "Otro",
];

export const quoteBudgetRanges = [
  "Menos de GTQ 5,000",
  "GTQ 5,000 - GTQ 15,000",
  "GTQ 15,000 - GTQ 35,000",
  "GTQ 35,000 - GTQ 75,000",
  "Más de GTQ 75,000",
];

export const quoteLightingTypes = [
  "Arquitectónica",
  "Decorativa",
  "Exterior",
  "Comercial",
  "Proyecto integral",
];
