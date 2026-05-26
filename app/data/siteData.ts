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
  primaryCta: { label: "Agendar asesoría", href: "/catalogo#asesoria-proyecto" },
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

export const partnerBrands = [
  { name: "Construlita", src: "/proveedores/construlita.png" },
  { name: "Highlum", src: "/proveedores/highlum.png" },
  { name: "Ilum", src: "/proveedores/ilum.png" },
  { name: "Ilumitec", src: "/proveedores/ilumitec.png" },
  { name: "Lighttec", src: "/proveedores/lighttec.png" },
  { name: "OSRAM", src: "/proveedores/osram.png" },
  { name: "Philips", src: "/proveedores/philips.png" },
  { name: "Proelca", src: "/proveedores/proelca.png" },
  { name: "Sunnovation", src: "/proveedores/sunnovation.png" },
  { name: "Sylvania", src: "/proveedores/sylvania.png" },
  { name: "Tecnolite", src: "/proveedores/tecnolite.png" },
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
