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
    image:
      "https://images.unsplash.com/photo-1540932239986-30128078f3c5?auto=format&fit=crop&w=1100&q=85",
  },
  {
    title: "Arquitectónica",
    detail: "Perfiles lineales, luz indirecta y soluciones integradas a obra.",
    image:
      "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1100&q=85",
  },
  {
    title: "Técnica",
    detail: "Downlights, paneles y sistemas LED para precisión, eficiencia y confort.",
    image:
      "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1100&q=85",
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
