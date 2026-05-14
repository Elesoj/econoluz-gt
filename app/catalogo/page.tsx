"use client";

import { type FormEvent, useMemo, useState } from "react";
import ProductCard from "../components/ProductCard";
import QuoteDrawer from "../components/QuoteDrawer";
import SectionHeader from "../components/SectionHeader";
import SiteFooter from "../components/SiteFooter";
import SiteNavbar from "../components/SiteNavbar";

const categories = [
  "Todos",
  "Iluminación arquitectónica",
  "Iluminación decorativa",
  "Iluminación exterior",
  "Iluminación comercial",
];

const products = [
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
];

const navItems = [
  { label: "Inicio", href: "/#inicio" },
  { label: "Empresa", href: "/#empresa" },
  { label: "Catálogo", href: "/catalogo" },
  { label: "Proyectos", href: "/#proyectos" },
  { label: "Contacto", href: "/#contacto" },
];

const projectTypes = [
  "Residencial",
  "Comercial",
  "Restaurante / hotel",
  "Oficina",
  "Exterior / fachada",
  "Otro",
];

const budgetRanges = [
  "Menos de GTQ 5,000",
  "GTQ 5,000 - GTQ 15,000",
  "GTQ 15,000 - GTQ 35,000",
  "GTQ 35,000 - GTQ 75,000",
  "Más de GTQ 75,000",
];

const lightingTypes = [
  "Arquitectónica",
  "Decorativa",
  "Exterior",
  "Comercial",
  "Proyecto integral",
];

type Product = (typeof products)[number];

type QuoteItem = {
  product: Product;
  quantity: number;
};

type QuoteFormState = {
  fullName: string;
  phone: string;
  email: string;
  projectType: string;
  estimatedArea: string;
  budgetRange: string;
  lightingType: string;
  message: string;
};

const initialFormState: QuoteFormState = {
  fullName: "",
  phone: "",
  email: "",
  projectType: "",
  estimatedArea: "",
  budgetRange: "",
  lightingType: "",
  message: "",
};

const formatPrice = (price: number) =>
  new Intl.NumberFormat("es-GT", {
    style: "currency",
    currency: "GTQ",
    maximumFractionDigits: 0,
  }).format(price);

export default function Catalogo() {
  const [activeCategory, setActiveCategory] = useState("Todos");
  const [quoteItems, setQuoteItems] = useState<QuoteItem[]>([]);
  const [isQuoteOpen, setIsQuoteOpen] = useState(false);
  const [formState, setFormState] = useState<QuoteFormState>(initialFormState);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const filteredProducts = useMemo(() => {
    if (activeCategory === "Todos") {
      return products;
    }

    return products.filter((product) => product.category === activeCategory);
  }, [activeCategory]);

  const quoteCount = quoteItems.reduce((total, item) => total + item.quantity, 0);
  const quoteTotal = quoteItems.reduce(
    (total, item) => total + item.product.price * item.quantity,
    0,
  );

  const addToQuote = (product: Product) => {
    setQuoteItems((currentItems) => {
      const existingItem = currentItems.find((item) => item.product.id === product.id);

      if (existingItem) {
        return currentItems.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }

      return [...currentItems, { product, quantity: 1 }];
    });
    setIsQuoteOpen(true);
  };

  const removeFromQuote = (productId: string) => {
    setQuoteItems((currentItems) =>
      currentItems.filter((item) => item.product.id !== productId),
    );
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity < 1) {
      removeFromQuote(productId);
      return;
    }

    setQuoteItems((currentItems) =>
      currentItems.map((item) =>
        item.product.id === productId ? { ...item, quantity } : item,
      ),
    );
  };

  const updateFormField = (field: keyof QuoteFormState, value: string) => {
    setFormState((currentForm) => ({ ...currentForm, [field]: value }));
    setIsSubmitted(false);
  };

  const submitQuotation = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitted(true);
    setIsQuoteOpen(false);
  };

  return (
    <main className="min-h-screen bg-white text-black">
      <SiteNavbar
        items={navItems}
        ctaHref="/#contacto"
        ctaLabel="Contacto"
        mobileCtaLabel="Solicitar asesoría"
      />

      <section className="bg-black px-5 pb-16 pt-32 text-white sm:px-8 sm:pb-20 lg:pb-24 lg:pt-40">
        <div className="mx-auto max-w-7xl">
          <p className="text-xs font-semibold uppercase tracking-[0.34em] text-white/52">
            Catálogo
          </p>
          <div className="mt-5 grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
            <h1 className="max-w-4xl text-5xl font-semibold leading-[0.96] tracking-normal sm:text-7xl lg:text-8xl">
              Selección curada para proyectos con intención.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-white/66 sm:text-xl sm:leading-8 lg:justify-self-end">
              Explora luminarias de referencia para arquitectura, interiorismo,
              exterior y espacios comerciales. Los precios son estimados en GTQ
              para orientar una primera asesoría de proyecto.
            </p>
          </div>
        </div>
      </section>

      <section className="px-5 py-8 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex gap-2 overflow-x-auto border-b border-neutral-200 pb-5">
            {categories.map((category) => {
              const isActive = activeCategory === category;

              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => setActiveCategory(category)}
                  className={`shrink-0 rounded-full border px-5 py-2.5 text-sm font-semibold transition duration-300 ${
                    isActive
                      ? "border-black bg-black text-white"
                      : "border-neutral-200 bg-white text-neutral-700 hover:border-black hover:text-black"
                  }`}
                >
                  {category}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="px-5 pb-20 pt-6 sm:px-8 sm:pb-24 lg:pb-32">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8">
            <SectionHeader
              eyebrow="Referencias para proyecto"
              title={activeCategory === "Todos" ? "Todas las categorias" : activeCategory}
              description={`${filteredProducts.length} luminarias disponibles como referencia. Agrega productos para preparar una solicitud de asesoría más precisa.`}
            />
          </div>

          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {filteredProducts.map((product) => {
              const selectedItem = quoteItems.find((item) => item.product.id === product.id);

              return (
                <ProductCard
                  key={product.id}
                  product={product}
                  quantity={selectedItem?.quantity}
                  formatPrice={formatPrice}
                  onAdd={() => addToQuote(product)}
                />
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-neutral-950 px-5 py-20 text-white sm:px-8 lg:py-28">
        <div id="asesoria-proyecto" className="-mt-20 scroll-mt-20 pt-20" />
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/46">
              Asesoría de proyecto
            </p>
            <h2 className="mt-4 text-4xl font-semibold leading-tight sm:text-5xl">
              Define tu proyecto de iluminación con asesoría especializada.
            </h2>
            <p className="mt-6 max-w-xl text-base leading-7 text-white/62 sm:text-lg sm:leading-8">
              Las luminarias seleccionadas en el catálogo aparecen aquí automáticamente.
              Completa los datos del proyecto para que el equipo pueda preparar una
              recomendación más precisa.
            </p>

            <div className="mt-8 border border-white/12 p-5 transition duration-500 hover:border-white/24">
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm uppercase tracking-[0.2em] text-white/44">
                  Resumen
                </p>
                <p className="text-sm text-white/60">{quoteCount} unidades</p>
              </div>

              <div className="mt-5 grid max-h-72 gap-3 overflow-y-auto pr-1">
                {quoteItems.length === 0 ? (
                  <p className="text-sm leading-6 text-white/52">
                    Aún no hay luminarias seleccionadas. Puedes enviar la solicitud
                    con datos del proyecto o agregar luminarias desde el catálogo.
                  </p>
                ) : (
                  quoteItems.map((item) => (
                    <div
                      key={item.product.id}
                      className="flex items-center justify-between gap-4 border-t border-white/10 pt-3"
                    >
                      <div>
                        <p className="font-semibold text-white">{item.product.name}</p>
                        <p className="mt-1 text-sm text-white/48">
                          {item.quantity} unidad{item.quantity > 1 ? "es" : ""} /{" "}
                          {formatPrice(item.product.price)} ref.
                        </p>
                      </div>
                      <p className="shrink-0 font-semibold">
                        {formatPrice(item.product.price * item.quantity)}
                      </p>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-5 flex items-center justify-between border-t border-white/12 pt-4">
                <p className="text-sm uppercase tracking-[0.18em] text-white/44">
                  Total estimado
                </p>
                <p className="text-2xl font-semibold">{formatPrice(quoteTotal)}</p>
              </div>
            </div>
          </div>

          <form
            onSubmit={submitQuotation}
            className="border border-white/12 bg-white p-5 text-black shadow-[0_24px_80px_rgba(0,0,0,0.28)] sm:p-8"
          >
            {isSubmitted && (
              <div className="mb-6 border border-black bg-black p-5 text-white">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/54">
                  Solicitud recibida
                </p>
                <p className="mt-3 text-lg font-semibold leading-7">
                  Gracias por solicitar una asesoría especializada. Nuestro equipo se
                  comunicará contigo pronto.
                </p>
              </div>
            )}

            <div className="grid gap-5 sm:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-semibold">Nombre completo</span>
                <input
                  required
                  value={formState.fullName}
                  onChange={(event) => updateFormField("fullName", event.target.value)}
                  className="border border-neutral-200 px-4 py-3 outline-none transition focus:border-black"
                  placeholder="Nombre y apellido"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold">Teléfono</span>
                <input
                  required
                  value={formState.phone}
                  onChange={(event) => updateFormField("phone", event.target.value)}
                  className="border border-neutral-200 px-4 py-3 outline-none transition focus:border-black"
                  placeholder="+502 0000 0000"
                />
              </label>

              <label className="grid gap-2 sm:col-span-2">
                <span className="text-sm font-semibold">Email</span>
                <input
                  required
                  type="email"
                  value={formState.email}
                  onChange={(event) => updateFormField("email", event.target.value)}
                  className="border border-neutral-200 px-4 py-3 outline-none transition focus:border-black"
                  placeholder="correo@empresa.com"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold">Tipo de proyecto</span>
                <select
                  required
                  value={formState.projectType}
                  onChange={(event) => updateFormField("projectType", event.target.value)}
                  className="border border-neutral-200 bg-white px-4 py-3 outline-none transition focus:border-black"
                >
                  <option value="">Seleccionar</option>
                  {projectTypes.map((projectType) => (
                    <option key={projectType} value={projectType}>
                      {projectType}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold">Área estimada en m²</span>
                <input
                  value={formState.estimatedArea}
                  onChange={(event) => updateFormField("estimatedArea", event.target.value)}
                  className="border border-neutral-200 px-4 py-3 outline-none transition focus:border-black"
                  placeholder="Ej. 120"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold">Rango de presupuesto</span>
                <select
                  required
                  value={formState.budgetRange}
                  onChange={(event) => updateFormField("budgetRange", event.target.value)}
                  className="border border-neutral-200 bg-white px-4 py-3 outline-none transition focus:border-black"
                >
                  <option value="">Seleccionar</option>
                  {budgetRanges.map((budgetRange) => (
                    <option key={budgetRange} value={budgetRange}>
                      {budgetRange}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold">Tipo de iluminación</span>
                <select
                  required
                  value={formState.lightingType}
                  onChange={(event) => updateFormField("lightingType", event.target.value)}
                  className="border border-neutral-200 bg-white px-4 py-3 outline-none transition focus:border-black"
                >
                  <option value="">Seleccionar</option>
                  {lightingTypes.map((lightingType) => (
                    <option key={lightingType} value={lightingType}>
                      {lightingType}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 sm:col-span-2">
                <span className="text-sm font-semibold">Mensaje adicional</span>
                <textarea
                  value={formState.message}
                  onChange={(event) => updateFormField("message", event.target.value)}
                  className="min-h-32 resize-none border border-neutral-200 px-4 py-3 outline-none transition focus:border-black"
                  placeholder="Cuéntanos sobre ambientes, acabados, fechas o necesidades técnicas."
                />
              </label>
            </div>

            <button
              type="submit"
              className="mt-7 w-full rounded-full bg-black px-7 py-4 text-sm font-semibold text-white transition duration-300 hover:-translate-y-0.5 hover:bg-neutral-800"
            >
              Solicitar asesoría de proyecto
            </button>
          </form>
        </div>
      </section>

      {quoteCount > 0 && (
        <button
          type="button"
          onClick={() => setIsQuoteOpen(true)}
          className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-3 rounded-full bg-black px-5 py-3 text-sm font-semibold text-white shadow-[0_20px_60px_rgba(0,0,0,0.28)] transition hover:-translate-y-0.5 hover:bg-neutral-800 sm:bottom-8 sm:right-8"
        >
          Ver proyecto
          <span className="rounded-full bg-white px-2 py-0.5 text-xs text-black">
            {quoteCount}
          </span>
        </button>
      )}

      <QuoteDrawer
        isOpen={isQuoteOpen}
        items={quoteItems}
        total={quoteTotal}
        formatPrice={formatPrice}
        onClose={() => setIsQuoteOpen(false)}
        onRemove={removeFromQuote}
        onUpdateQuantity={updateQuantity}
      />

      <SiteFooter />
    </main>
  );
}
