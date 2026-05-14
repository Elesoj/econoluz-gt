export const catalogCategories = [
  "Todos",
  "Iluminación arquitectónica",
  "Iluminación decorativa",
  "Iluminación exterior",
  "Iluminación comercial",
];

export const products = [
  {
    id: "spot-led-empotrable",
    name: "Spot LED empotrable",
    category: "Iluminación arquitectónica",
    description: "Spot empotrable de bajo deslumbramiento para acento, pasillos y áreas sociales.",
    price: 285,
    image:
      "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1000&q=85",
  },
  {
    id: "panel-led-ultra-delgado",
    name: "Panel LED ultra delgado",
    category: "Iluminación arquitectónica",
    description: "Panel de luz uniforme para oficinas, cocinas, salas de reunión y cielos modulares.",
    price: 320,
    image:
      "https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1000&q=85",
  },
  {
    id: "riel-magnetico-modular",
    name: "Riel magnético modular",
    category: "Iluminación arquitectónica",
    description: "Sistema de riel magnético con módulos orientables para residencias y galerías.",
    price: 1650,
    image:
      "https://images.unsplash.com/photo-1600210491892-03d54c0aaf87?auto=format&fit=crop&w=1000&q=85",
  },
  {
    id: "lampara-colgante-cristal",
    name: "Lámpara colgante de cristal",
    category: "Iluminación decorativa",
    description: "Colgante decorativo para comedores, barras, lobbies y espacios de hospitalidad.",
    price: 890,
    image:
      "https://images.unsplash.com/photo-1540932239986-30128078f3c5?auto=format&fit=crop&w=1000&q=85",
  },
  {
    id: "aplique-led-interior",
    name: "Aplique LED interior",
    category: "Iluminación decorativa",
    description: "Aplique de pared con luz indirecta para pasillos, dormitorios y recepciones.",
    price: 540,
    image:
      "https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?auto=format&fit=crop&w=1000&q=85",
  },
  {
    id: "luminaria-lineal-suspendida",
    name: "Luminaria lineal suspendida",
    category: "Iluminación decorativa",
    description: "Perfil suspendido de luz continua para mesas largas, salas y áreas colaborativas.",
    price: 2350,
    image:
      "https://images.unsplash.com/photo-1519710164239-da123dc03ef4?auto=format&fit=crop&w=1000&q=85",
  },
  {
    id: "wall-washer-exterior",
    name: "Wall washer exterior",
    category: "Iluminación exterior",
    description: "Bañador lineal IP65 para fachadas, muros de piedra y volúmenes arquitectónicos.",
    price: 720,
    image:
      "https://images.unsplash.com/photo-1598228723793-52759bba239c?auto=format&fit=crop&w=1000&q=85",
  },
  {
    id: "baliza-led-jardin",
    name: "Baliza LED para jardín",
    category: "Iluminación exterior",
    description: "Baliza minimalista para recorridos, terrazas y jardines con luz controlada.",
    price: 390,
    image:
      "https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?auto=format&fit=crop&w=1000&q=85",
  },
  {
    id: "proyector-led-exterior",
    name: "Proyector LED exterior",
    category: "Iluminación exterior",
    description: "Proyector exterior compacto para volúmenes, vegetación y detalles de fachada.",
    price: 680,
    image:
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1000&q=85",
  },
  {
    id: "iluminacion-comercial-led",
    name: "Iluminación comercial LED",
    category: "Iluminación comercial",
    description: "Solución LED para tiendas, vitrinas y zonas de venta con alta reproducción visual.",
    price: 520,
    image:
      "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1000&q=85",
  },
  {
    id: "panel-led-oficina-ugr",
    name: "Panel LED para oficina UGR",
    category: "Iluminación comercial",
    description: "Panel LED de bajo deslumbramiento para oficinas, salas y áreas operativas.",
    price: 310,
    image:
      "https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1000&q=85",
  },
  {
    id: "cilindro-led-sobrepuesto",
    name: "Cilindro LED sobrepuesto",
    category: "Iluminación comercial",
    description: "Cilindro sobrepuesto para galerías, lobbies y circulaciones comerciales.",
    price: 620,
    image:
      "https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&w=1000&q=85",
  },
] as const;

export type Product = (typeof products)[number];
