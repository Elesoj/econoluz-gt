"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ProductCard from "../components/ProductCard";
import ProductTechnicalDrawer from "../components/ProductTechnicalDrawer";
import QuoteDrawer from "../components/QuoteDrawer";
import SectionHeader from "../components/SectionHeader";
import SiteFooter from "../components/SiteFooter";
import SiteNavbar from "../components/SiteNavbar";
import { catalogFilters, products, type Product } from "../data/products";
import {
  contact,
  mainNavItems,
  quoteBudgetRanges,
  quoteLightingTypes,
  quoteProjectTypes,
} from "../data/siteData";
import { formatCurrency } from "../lib/formatters";

const PAGE_SIZE = 40;

const catalogTypeCards = [
  {
    title: "Iluminación industrial",
    description: "Luminarias para bodegas, plantas, producción y grandes alturas.",
    marker: "IND",
  },
  {
    title: "Iluminación arquitectónica",
    description: "Soluciones para acento, integración y lectura espacial.",
    marker: "ARQ",
  },
  {
    title: "Iluminación exterior",
    description: "Equipos para fachadas, perímetros, jardines y áreas abiertas.",
    marker: "EXT",
  },
  {
    title: "Iluminación residencial",
    description: "Luz funcional y decorativa para vivienda e interiores.",
    marker: "RES",
  },
  {
    title: "Placas y accesorios eléctricos",
    description: "Apagadores, contactos, conectividad y acabados de línea.",
    marker: "APL",
  },
  {
    title: "Tiras LED",
    description: "Líneas flexibles para integración, detalle y luz indirecta.",
    marker: "LED",
  },
  {
    title: "Emergencia y señalización",
    description: "Soluciones para rutas, respaldo y seguridad operativa.",
    marker: "SEG",
  },
];

const applicationGroups: Record<string, string[]> = {
  "Iluminación industrial": [
    "Alto montaje",
    "Altura media",
    "Lineales industriales",
    "Gabinetes",
    "A prueba de vapor",
    "Wallpacks",
  ],
  "Iluminación arquitectónica": [
    "Downlights",
    "Luminarios para riel",
    "Suspendidos",
    "Empotrados en piso",
    "Arbotantes",
    "Decorativos",
  ],
  "Iluminación exterior": ["Wallpacks", "Arbotantes", "Decorativos"],
  "Iluminación residencial": ["Downlights", "Decorativos", "Placas y apagadores"],
  "Placas y accesorios eléctricos": [
    "Placas y apagadores",
    "Contactos",
    "USB y conectividad",
    "Datos / LAN",
    "TV / coaxial",
    "Atenuadores",
    "Timbres",
    "Tapas ciegas",
  ],
  "Tiras LED": ["Decorativos"],
  "Emergencia y señalización": ["Gabinetes"],
};

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

type QuoteFormErrors = Partial<Record<keyof QuoteFormState, string>>;

type StoredLedResults = {
  summary?: string;
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

const getStoredLedResultsSummary = () => {
  if (typeof window === "undefined") {
    return "";
  }

  const storedResults = window.localStorage.getItem("econoluz_led_results");

  if (!storedResults) {
    return "";
  }

  try {
    const parsedResults = JSON.parse(storedResults) as StoredLedResults;
    return parsedResults.summary ?? "";
  } catch {
    return "";
  }
};

const buildInitialFormState = () => {
  const ledResultsSummary = getStoredLedResultsSummary();

  if (!ledResultsSummary) {
    return initialFormState;
  }

  return {
    ...initialFormState,
    message: `${ledResultsSummary}\n\nNecesito asesoría para interpretar estos resultados y elegir luminarias adecuadas.`,
  };
};

const clearTemporaryQuoteData = () => {
  window.localStorage.removeItem("econoluz_quote_context");
  window.localStorage.removeItem("econoluz_led_results");
  window.dispatchEvent(new Event("econoluz-quote-updated"));
};

export default function Catalogo() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBrand, setSelectedBrand] = useState("Todos");
  const [selectedCategory, setSelectedCategory] = useState("Todos");
  const [selectedCollection, setSelectedCollection] = useState("Todos");
  const [selectedApplication, setSelectedApplication] = useState("Todos");
  const [selectedFinish, setSelectedFinish] = useState("Todos");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [isCatalogTransitioning, setIsCatalogTransitioning] = useState(false);
  const [quoteItems, setQuoteItems] = useState<QuoteItem[]>([]);
  const [isQuoteOpen, setIsQuoteOpen] = useState(false);
  const [technicalProduct, setTechnicalProduct] = useState<Product | null>(null);
  const [formState, setFormState] = useState<QuoteFormState>(buildInitialFormState);
  const [formErrors, setFormErrors] = useState<QuoteFormErrors>({});
  const [ledResultsSummary] = useState(getStoredLedResultsSummary);
  const catalogStageRef = useRef<HTMLDivElement>(null);

  const filterOptions = useMemo(() => {
    const uniqueValues = (values: string[]) =>
      Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));

    const matchesBrand = (product: Product) =>
      selectedBrand === "Todos" || product.brand === selectedBrand;
    const matchesCategory = (product: Product) =>
      selectedCategory === "Todos" || product.category === selectedCategory;
    const matchesCollection = (product: Product) =>
      selectedCollection === "Todos" || product.collection === selectedCollection;
    const matchesApplication = (product: Product) =>
      selectedApplication === "Todos" || product.application === selectedApplication;
    const matchesFinish = (product: Product) =>
      selectedFinish === "Todos" || product.finish === selectedFinish;

    return {
      brands: catalogFilters.brands,
      categories: catalogFilters.categories.filter((category) =>
        products.some(
          (product) =>
            product.category === category &&
            matchesBrand(product) &&
            matchesCollection(product) &&
            matchesApplication(product) &&
            matchesFinish(product),
        ),
      ),
      collections: uniqueValues(
        products
          .filter(
            (product) =>
              matchesBrand(product) &&
              matchesCategory(product) &&
              matchesApplication(product) &&
              matchesFinish(product),
          )
          .map((product) => product.collection ?? ""),
      ),
      applications: catalogFilters.applications.filter((application) =>
        products.some(
          (product) =>
            product.application === application &&
            matchesBrand(product) &&
            matchesCategory(product) &&
            matchesCollection(product) &&
            matchesFinish(product),
        ),
      ),
      finishes: catalogFilters.finishes.filter((finish) =>
        products.some(
          (product) =>
            product.finish === finish &&
            matchesBrand(product) &&
            matchesCategory(product) &&
            matchesApplication(product) &&
            matchesCollection(product),
        ),
      ),
    };
  }, [
    selectedApplication,
    selectedBrand,
    selectedCategory,
    selectedFinish,
    selectedCollection,
  ]);

  const filteredProducts = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    return products.filter((product) => {
      const matchesBrand = selectedBrand === "Todos" || product.brand === selectedBrand;
      const matchesCategory =
        selectedCategory === "Todos" || product.category === selectedCategory;
      const matchesCollection =
        selectedCollection === "Todos" || product.collection === selectedCollection;
      const matchesApplication =
        selectedApplication === "Todos" || product.application === selectedApplication;
      const matchesFinish = selectedFinish === "Todos" || product.finish === selectedFinish;
      const searchableText = [
        product.name,
        product.sku,
        product.brand,
        product.category,
        product.subcategory,
        product.collection,
        product.application,
        product.finish,
        product.description,
        ...(product.technicalSpecs ? Object.values(product.technicalSpecs).flat() : []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const matchesSearch =
        !normalizedSearch || searchableText.includes(normalizedSearch);

      return (
        matchesSearch &&
        matchesBrand &&
        matchesCategory &&
        matchesCollection &&
        matchesApplication &&
        matchesFinish
      );
    });
  }, [
    searchQuery,
    selectedApplication,
    selectedBrand,
    selectedCategory,
    selectedFinish,
    selectedCollection,
  ]);

  const visibleProducts = filteredProducts.slice(0, visibleCount);
  const hasMoreProducts = visibleCount < filteredProducts.length;

  const activeFilters = [
    ["Buscar", searchQuery.trim()],
    ["Marca", selectedBrand],
    ["Tipo", selectedCategory],
    ["Serie", selectedCollection],
    ["Aplicación", selectedApplication],
    ["Color", selectedFinish],
  ].filter(([, value]) => value && value !== "Todos");

  const selectedApplications =
    selectedCategory === "Todos" ? [] : applicationGroups[selectedCategory] ?? [];
  const shouldShowApplications =
    selectedCategory !== "Todos" &&
    selectedApplication === "Todos" &&
    !searchQuery.trim();
  const shouldShowProducts = Boolean(searchQuery.trim()) || selectedApplication !== "Todos";
  const breadcrumbItems = [
    "Catálogo",
    selectedCategory !== "Todos" ? selectedCategory : "",
    selectedApplication !== "Todos" ? selectedApplication : "",
    selectedCollection !== "Todos" ? selectedCollection : "",
  ].filter(Boolean);
  const canGoBack =
    selectedCategory !== "Todos" ||
    selectedApplication !== "Todos" ||
    selectedCollection !== "Todos" ||
    Boolean(searchQuery.trim());

  const goBackInCatalog = () => {
    if (selectedApplication !== "Todos") {
      setSelectedApplication("Todos");
      setSelectedCollection("Todos");
      return;
    }

    if (selectedCategory !== "Todos") {
      setSelectedCategory("Todos");
      return;
    }

    setSearchQuery("");
  };

  const resetCatalogNavigation = () => {
    setSearchQuery("");
    setSelectedCategory("Todos");
    setSelectedApplication("Todos");
    setSelectedCollection("Todos");
  };

  const scrollCatalogStageIntoView = () => {
    window.requestAnimationFrame(() => {
      catalogStageRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  const transitionCatalog = (updateNavigation: () => void) => {
    setIsCatalogTransitioning(true);

    window.setTimeout(() => {
      updateNavigation();
      setIsCatalogTransitioning(false);
      scrollCatalogStageIntoView();
    }, 180);
  };

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [
    searchQuery,
    selectedApplication,
    selectedBrand,
    selectedCategory,
    selectedFinish,
    selectedCollection,
  ]);

  const quoteCount = quoteItems.reduce((total, item) => total + item.quantity, 0);
  const quoteTotal = quoteItems.reduce(
    (total, item) => total + item.product.price * item.quantity,
    0,
  );

  const whatsappMessage = useMemo(() => {
    const selectedProducts = quoteItems.map(
      (item) => `${item.product.name} (${item.quantity})`,
    );
    const details = [
      formState.fullName ? `Nombre: ${formState.fullName}` : "",
      formState.phone ? `Teléfono: ${formState.phone}` : "",
      formState.email ? `Email: ${formState.email}` : "",
      formState.projectType ? `Tipo de proyecto: ${formState.projectType}` : "",
      formState.estimatedArea ? `Área estimada: ${formState.estimatedArea} m²` : "",
      formState.budgetRange ? `Presupuesto: ${formState.budgetRange}` : "",
      formState.lightingType ? `Tipo de iluminación: ${formState.lightingType}` : "",
      selectedProducts.length ? `Productos: ${selectedProducts.join(", ")}` : "",
      formState.message ? `Mensaje: ${formState.message}` : "",
      ledResultsSummary ? ledResultsSummary : "",
    ].filter(Boolean);

    return `${contact.whatsappDefaultMessage}${
      details.length ? `\n${details.join("\n")}` : ""
    }`;
  }, [formState, ledResultsSummary, quoteItems]);

  const whatsappHref = `https://wa.me/${contact.whatsappNumber}?text=${encodeURIComponent(whatsappMessage)}`;

  useEffect(() => {
    const hasQuoteContext =
      quoteItems.length > 0 ||
      formState.fullName ||
      formState.projectType ||
      formState.estimatedArea ||
      formState.budgetRange;

    if (!hasQuoteContext) {
      window.localStorage.removeItem("econoluz_quote_context");
      window.dispatchEvent(new Event("econoluz-quote-updated"));
      return;
    }

    window.localStorage.setItem(
      "econoluz_quote_context",
      JSON.stringify({
        clientName: formState.fullName,
        projectType: formState.projectType,
        estimatedArea: formState.estimatedArea,
        budgetRange: formState.budgetRange,
        products: quoteItems.map((item) => `${item.product.name} (${item.quantity})`),
      }),
    );
    window.dispatchEvent(new Event("econoluz-quote-updated"));
  }, [formState, quoteItems]);

  useEffect(() => {
    window.addEventListener("beforeunload", clearTemporaryQuoteData);

    return () => {
      window.removeEventListener("beforeunload", clearTemporaryQuoteData);
    };
  }, []);

  useEffect(() => {
    window.addEventListener("econoluz-catalog-reset", resetCatalogNavigation);

    return () => {
      window.removeEventListener("econoluz-catalog-reset", resetCatalogNavigation);
    };
  }, []);

  const addToQuote = (product: Product, openQuote = true) => {
    setQuoteItems((currentItems) => {
      const existingItem = currentItems.find((item) => item.product.id === product.id);

      if (existingItem) {
        return currentItems.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }

      return [...currentItems, { product, quantity: 1 }];
    });

    if (openQuote) {
      setIsQuoteOpen(true);
    }
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
    setFormErrors((currentErrors) => ({ ...currentErrors, [field]: undefined }));
  };

  return (
    <main className="min-h-screen bg-white text-black">
      <SiteNavbar
        items={mainNavItems}
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
          <div className="grid gap-6 border-b border-neutral-200 pb-8">
            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
                Buscar en catálogo
              </span>
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Busca por nombre, código, serie, color o especificación"
                className="w-full border border-neutral-200 bg-white px-4 py-4 text-base font-semibold text-black outline-none transition placeholder:text-neutral-400 focus:border-black"
              />
            </label>

          </div>
        </div>
      </section>

      <section className="px-5 pb-20 pt-6 sm:px-8 sm:pb-24 lg:pb-32">
        <div ref={catalogStageRef} className="mx-auto scroll-mt-28 max-w-7xl">
          {!searchQuery.trim() && selectedCategory === "Todos" && (
            <div
              key="catalog-types"
              className={`catalog-stage ${isCatalogTransitioning ? "catalog-stage-out" : ""}`}
            >
              <SectionHeader
                eyebrow="Catálogo guiado"
                title="¿Qué tipo de producto buscas?"
                description="Elige una familia principal para entrar al catálogo de forma ordenada."
              />
              <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {catalogTypeCards.map((type) => (
                  <button
                    key={type.title}
                    type="button"
                    onClick={() =>
                      transitionCatalog(() => {
                        setSelectedCategory(type.title);
                        setSelectedApplication("Todos");
                        setSelectedCollection("Todos");
                      })
                    }
                    className="group min-h-44 overflow-hidden border border-neutral-200 bg-white p-5 text-left transition duration-300 hover:-translate-y-1 hover:border-black hover:shadow-[0_18px_44px_rgba(0,0,0,0.10)] active:scale-[0.99]"
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-[0.26em] text-neutral-400">
                      {type.marker}
                    </span>
                    <h2 className="mt-7 text-2xl font-semibold leading-tight">
                      {type.title}
                    </h2>
                    <p className="mt-4 text-sm leading-6 text-neutral-500">
                      {type.description}
                    </p>
                    <span className="mt-6 block h-px w-10 bg-black transition duration-300 group-hover:w-20" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {shouldShowApplications && (
            <div
              key={`applications-${selectedCategory}`}
              className={`catalog-stage ${isCatalogTransitioning ? "catalog-stage-out" : ""}`}
            >
              <SectionHeader
                eyebrow="Aplicación"
                title={selectedCategory}
                description="Selecciona dónde se instalará o qué función debe resolver el producto."
              />
              <div className="mt-6 grid gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {breadcrumbItems.map((item, index) => (
                    <div key={`${item}-${index}`} className="flex items-center gap-2">
                      {index > 0 && (
                        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-300">
                          /
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          if (index === 0) {
                            transitionCatalog(resetCatalogNavigation);
                            return;
                          }

                          if (index === 1) {
                            transitionCatalog(() => {
                              setSelectedApplication("Todos");
                              setSelectedCollection("Todos");
                            });
                            return;
                          }

                          if (index === 2) {
                            transitionCatalog(() => setSelectedCollection("Todos"));
                          }
                        }}
                        className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500 transition hover:text-black"
                      >
                        {item}
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">
                    {filteredProducts.length} resultados
                  </span>
                  {activeFilters.map(([label, value]) => (
                    <span
                      key={`${label}-${value}`}
                      className="rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600"
                    >
                      {label}: {value}
                    </span>
                  ))}
                </div>
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => transitionCatalog(goBackInCatalog)}
                  className="rounded-full border border-black px-5 py-3 text-sm font-semibold text-black transition hover:bg-black hover:text-white"
                >
                  Volver
                </button>
                <button
                  type="button"
                  onClick={() => transitionCatalog(resetCatalogNavigation)}
                  className="rounded-full border border-neutral-200 px-5 py-3 text-sm font-semibold text-neutral-700 transition hover:border-black hover:text-black"
                >
                  Inicio del catálogo
                </button>
              </div>
              <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {selectedApplications.map((application) => {
                  const count = products.filter(
                    (product) =>
                      product.category === selectedCategory &&
                      product.application === application &&
                      (selectedBrand === "Todos" || product.brand === selectedBrand) &&
                      (selectedFinish === "Todos" || product.finish === selectedFinish),
                  ).length;

                  return (
                    <button
                      key={application}
                      type="button"
                      onClick={() =>
                        transitionCatalog(() => {
                          setSelectedApplication(application);
                          setSelectedCollection("Todos");
                        })
                      }
                      className="flex min-h-28 items-end justify-between gap-4 border border-neutral-200 bg-white p-5 text-left transition hover:border-black active:scale-[0.99]"
                    >
                      <span className="text-xl font-semibold">{application}</span>
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
                        {count} ref.
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {shouldShowProducts && (
            <div
              key={`products-${searchQuery.trim() || selectedCategory}-${selectedApplication}`}
              className={`catalog-stage ${isCatalogTransitioning ? "catalog-stage-out" : ""}`}
            >
              <div className="mb-8">
                <SectionHeader
                  eyebrow="Referencias para proyecto"
                  title={searchQuery.trim() ? "Resultados de búsqueda" : selectedApplication}
                  description={`${filteredProducts.length} referencias encontradas.`}
                />
                <div className="mt-6 grid gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {breadcrumbItems.map((item, index) => (
                      <div key={`${item}-${index}`} className="flex items-center gap-2">
                        {index > 0 && (
                          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-300">
                            /
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            if (index === 0) {
                              transitionCatalog(resetCatalogNavigation);
                              return;
                            }

                            if (index === 1) {
                              transitionCatalog(() => {
                                setSelectedApplication("Todos");
                                setSelectedCollection("Todos");
                              });
                              return;
                            }

                            if (index === 2) {
                              transitionCatalog(() => setSelectedCollection("Todos"));
                            }
                          }}
                          className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500 transition hover:text-black"
                        >
                          {item}
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">
                      {filteredProducts.length} resultados
                    </span>
                    {activeFilters.map(([label, value]) => (
                      <span
                        key={`${label}-${value}`}
                        className="rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600"
                      >
                        {label}: {value}
                      </span>
                    ))}
                  </div>
                </div>
                {canGoBack && (
                  <div className="mt-6 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => transitionCatalog(goBackInCatalog)}
                      className="rounded-full border border-black px-5 py-3 text-sm font-semibold text-black transition hover:bg-black hover:text-white"
                    >
                      Volver
                    </button>
                    <button
                      type="button"
                      onClick={() => transitionCatalog(resetCatalogNavigation)}
                      className="rounded-full border border-neutral-200 px-5 py-3 text-sm font-semibold text-neutral-700 transition hover:border-black hover:text-black"
                    >
                      Inicio del catálogo
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
                {visibleProducts.map((product) => {
                  const selectedItem = quoteItems.find((item) => item.product.id === product.id);

                  return (
                    <ProductCard
                      key={product.id}
                      product={product}
                      quantity={selectedItem?.quantity}
                      formatPrice={formatCurrency}
                      onAdd={() => addToQuote(product, false)}
                      onDecrease={() =>
                        updateQuantity(product.id, (selectedItem?.quantity ?? 1) - 1)
                      }
                      onViewDetails={() => setTechnicalProduct(product)}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {shouldShowProducts && filteredProducts.length === 0 && (
            <div className="border border-neutral-200 p-8 text-center">
              <p className="text-sm font-semibold text-neutral-700">
                No encontramos referencias con esos filtros.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedBrand("Todos");
                  setSelectedCategory("Todos");
                  setSelectedCollection("Todos");
                  setSelectedApplication("Todos");
                  setSelectedFinish("Todos");
                }}
                className="mt-4 rounded-full border border-black px-5 py-3 text-sm font-semibold transition hover:bg-black hover:text-white"
              >
                Limpiar filtros
              </button>
            </div>
          )}

          {shouldShowProducts && hasMoreProducts && (
            <div className="mt-10 flex justify-center">
              <button
                type="button"
                onClick={() => setVisibleCount((currentCount) => currentCount + PAGE_SIZE)}
                className="rounded-full border border-black px-7 py-3 text-sm font-semibold transition hover:bg-black hover:text-white"
              >
                Cargar más ({filteredProducts.length - visibleProducts.length})
              </button>
            </div>
          )}
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
                          {item.product.price > 0
                            ? `${formatCurrency(item.product.price)} ref.`
                            : "Por cotizar"}
                        </p>
                      </div>
                      <p className="shrink-0 font-semibold">
                        {item.product.price > 0
                          ? formatCurrency(item.product.price * item.quantity)
                          : "Por cotizar"}
                      </p>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-5 flex items-center justify-between border-t border-white/12 pt-4">
                <p className="text-sm uppercase tracking-[0.18em] text-white/44">
                  Total estimado
                </p>
                <p className="text-2xl font-semibold">
                  {quoteTotal > 0 ? formatCurrency(quoteTotal) : "Por cotizar"}
                </p>
              </div>
            </div>

            {!ledResultsSummary && (
              <div className="mt-5 border border-white/12 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/44">
                  Consejo
                </p>
                <p className="mt-3 text-sm leading-6 text-white/62">
                  Para recibir una respuesta más precisa, puedes usar la calculadora LED
                  antes de enviar tu solicitud. Los resultados se agregarán automáticamente
                  al formulario.
                </p>
                <a
                  href="/calculadora-led"
                  className="mt-5 inline-flex text-sm font-semibold text-white underline decoration-white/30 underline-offset-8 transition hover:decoration-white"
                >
                  Usar calculadora LED
                </a>
              </div>
            )}
          </div>

          <div
            className="border border-white/12 bg-white p-5 text-black shadow-[0_24px_80px_rgba(0,0,0,0.28)] sm:p-8"
          >
            {ledResultsSummary && (
              <div className="mb-6 border border-neutral-200 bg-neutral-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500">
                  Resultados LED adjuntos
                </p>
                <p className="mt-3 text-sm leading-6 text-neutral-600">
                  Agregamos los resultados de la calculadora al mensaje adicional para que el
                  equipo pueda revisarlos junto con tu solicitud.
                </p>
              </div>
            )}

            <div className="grid gap-5 sm:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-semibold">Nombre completo</span>
                <input
                  value={formState.fullName}
                  onChange={(event) => updateFormField("fullName", event.target.value)}
                  className={`border px-4 py-3 outline-none transition focus:border-black ${
                    formErrors.fullName ? "border-black bg-neutral-50" : "border-neutral-200"
                  }`}
                  placeholder="Nombre y apellido"
                />
                {formErrors.fullName && (
                  <span className="text-xs font-medium text-neutral-600">
                    {formErrors.fullName}
                  </span>
                )}
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold">Teléfono</span>
                <input
                  value={formState.phone}
                  onChange={(event) => updateFormField("phone", event.target.value)}
                  className={`border px-4 py-3 outline-none transition focus:border-black ${
                    formErrors.phone ? "border-black bg-neutral-50" : "border-neutral-200"
                  }`}
                  placeholder="+502 0000 0000"
                />
                {formErrors.phone && (
                  <span className="text-xs font-medium text-neutral-600">
                    {formErrors.phone}
                  </span>
                )}
              </label>

              <label className="grid gap-2 sm:col-span-2">
                <span className="text-sm font-semibold">Email</span>
                <input
                  type="email"
                  value={formState.email}
                  onChange={(event) => updateFormField("email", event.target.value)}
                  className={`border px-4 py-3 outline-none transition focus:border-black ${
                    formErrors.email ? "border-black bg-neutral-50" : "border-neutral-200"
                  }`}
                  placeholder="correo@empresa.com"
                />
                {formErrors.email && (
                  <span className="text-xs font-medium text-neutral-600">
                    {formErrors.email}
                  </span>
                )}
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold">Tipo de proyecto</span>
                <select
                  value={formState.projectType}
                  onChange={(event) => updateFormField("projectType", event.target.value)}
                  className={`border bg-white px-4 py-3 outline-none transition focus:border-black ${
                    formErrors.projectType ? "border-black bg-neutral-50" : "border-neutral-200"
                  }`}
                >
                  <option value="">Seleccionar</option>
                  {quoteProjectTypes.map((projectType) => (
                    <option key={projectType} value={projectType}>
                      {projectType}
                    </option>
                  ))}
                </select>
                {formErrors.projectType && (
                  <span className="text-xs font-medium text-neutral-600">
                    {formErrors.projectType}
                  </span>
                )}
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
                  {quoteBudgetRanges.map((budgetRange) => (
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
                  {quoteLightingTypes.map((lightingType) => (
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

            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-7 flex w-full items-center justify-center rounded-full bg-black px-7 py-4 text-sm font-semibold text-white transition duration-300 hover:-translate-y-0.5 hover:bg-neutral-800"
            >
              Enviar información por WhatsApp
            </a>
            <p className="mt-4 text-xs leading-5 text-neutral-500">
              Los datos del formulario y productos seleccionados se enviarán por WhatsApp
              al asesor disponible.
            </p>
          </div>
        </div>
      </section>

      {quoteCount > 0 && (
        <button
          type="button"
          onClick={() => setIsQuoteOpen(true)}
          className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-3 rounded-full bg-black px-5 py-3 text-sm font-semibold text-white shadow-[0_20px_60px_rgba(0,0,0,0.28)] transition hover:-translate-y-0.5 hover:bg-neutral-800 sm:bottom-8 sm:right-8"
        >
          Ver carrito
          <span className="rounded-full bg-white px-2 py-0.5 text-xs text-black">
            {quoteCount}
          </span>
        </button>
      )}

      <QuoteDrawer
        isOpen={isQuoteOpen}
        items={quoteItems}
        total={quoteTotal}
        formatPrice={formatCurrency}
        onClose={() => setIsQuoteOpen(false)}
        onRemove={removeFromQuote}
        onUpdateQuantity={updateQuantity}
      />

      <ProductTechnicalDrawer
        key={technicalProduct?.id ?? "closed-technical-product"}
        product={technicalProduct}
        formatPrice={formatCurrency}
        onAdd={(product) => {
          addToQuote(product as Product, false);
        }}
        onClose={() => setTechnicalProduct(null)}
        onViewQuote={() => {
          setTechnicalProduct(null);
          setIsQuoteOpen(true);
        }}
      />

      <SiteFooter />
    </main>
  );
}
