"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ProductCard from "../components/ProductCard";
import ProductTechnicalDrawer from "../components/ProductTechnicalDrawer";
import QuoteDrawer from "../components/QuoteDrawer";
import SectionHeader from "../components/SectionHeader";
import SiteFooter from "../components/SiteFooter";
import SiteNavbar from "../components/SiteNavbar";
import {
  getApplicationLabel,
  getProductTypeLabel,
  productTypeList,
  productTypes,
  type ProductTypeId,
} from "../data/catalogTaxonomy";
import { products, type Product } from "../data/products";
import {
  contact,
  mainNavItems,
  quoteBudgetRanges,
  quoteLightingTypes,
  quoteProjectTypes,
} from "../data/siteData";

const PAGE_SIZE = 40;

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

type StoredQuoteSession = {
  items?: {
    econoluzReference?: string;
    quantity?: number;
  }[];
};

type CatalogHistoryState = {
  econoluzCatalog: true;
  searchQuery: string;
  selectedCategory: string;
  selectedApplication: string;
  showAllProducts: boolean;
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

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const quoteSessionStorageKey = "econoluz_catalog_quote";

const getStoredQuoteSession = (): StoredQuoteSession => {
  if (typeof window === "undefined") {
    return {};
  }

  const storedQuote = window.sessionStorage.getItem(quoteSessionStorageKey);

  if (!storedQuote) {
    return {};
  }

  try {
    return JSON.parse(storedQuote) as StoredQuoteSession;
  } catch {
    return {};
  }
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

const buildInitialQuoteItems = (): QuoteItem[] => {
  const storedItems = getStoredQuoteSession().items ?? [];
  const productsByReference = new Map(
    products.map((product) => [product.econoluzReference, product]),
  );

  return storedItems
    .map((item) => {
      if (!item.econoluzReference) {
        return null;
      }

      const product = productsByReference.get(item.econoluzReference);
      const quantity =
        typeof item.quantity === "number" && Number.isFinite(item.quantity)
          ? Math.max(1, Math.floor(item.quantity))
          : 1;

      return product ? { product, quantity } : null;
    })
    .filter((item): item is QuoteItem => Boolean(item));
};

const clearTemporaryQuoteData = () => {
  window.localStorage.removeItem("econoluz_quote_context");
  window.localStorage.removeItem("econoluz_led_results");
  window.dispatchEvent(new Event("econoluz-quote-updated"));
};

const createCatalogHistoryState = (
  selectedCategory = "Todos",
  selectedApplication = "Todos",
  searchQuery = "",
  showAllProducts = false,
): CatalogHistoryState => ({
  econoluzCatalog: true,
  searchQuery,
  selectedCategory,
  selectedApplication,
  showAllProducts,
});

const getCatalogBaseUrl = () => `${window.location.pathname}${window.location.search}`;

const isCatalogHistoryState = (state: unknown): state is CatalogHistoryState =>
  Boolean(
    state &&
      typeof state === "object" &&
      "econoluzCatalog" in state &&
      (state as CatalogHistoryState).econoluzCatalog,
  );

const getPublicTechnicalSpecValues = (product: Product) => {
  if (!product.technicalSpecs) {
    return [];
  }

  return Object.entries(product.technicalSpecs)
    .filter(([key]) => key !== "productCode")
    .map(([, value]) => value)
    .flat();
};

const buildProductSearchText = (product: Product) =>
  [
    product.publicName,
    product.econoluzReference,
    product.productType,
    product.application,
    product.finish,
    product.labels.productType,
    product.labels.application,
    product.labels.series,
    product.labels.finish,
    product.publicDescription,
    ...getPublicTechnicalSpecValues(product),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

export default function Catalogo() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Todos");
  const [selectedApplication, setSelectedApplication] = useState("Todos");
  const [showAllProducts, setShowAllProducts] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [isCatalogTransitioning, setIsCatalogTransitioning] = useState(false);
  const [quoteItems, setQuoteItems] = useState<QuoteItem[]>([]);
  const [isQuoteSessionReady, setIsQuoteSessionReady] = useState(false);
  const [isQuoteOpen, setIsQuoteOpen] = useState(false);
  const [technicalProduct, setTechnicalProduct] = useState<Product | null>(null);
  const [formState, setFormState] = useState<QuoteFormState>(buildInitialFormState);
  const [formErrors, setFormErrors] = useState<QuoteFormErrors>({});
  const [ledResultsSummary] = useState(getStoredLedResultsSummary);
  const catalogStageRef = useRef<HTMLDivElement>(null);
  const isApplyingBrowserHistoryRef = useRef(false);
  const transitionTimeoutRef = useRef<number | null>(null);
  const searchableProducts = useMemo(
    () =>
      products.map((product) => ({
        product,
        searchText: buildProductSearchText(product),
      })),
    [],
  );

  const filteredProducts = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    return searchableProducts
      .filter(({ product, searchText }) => {
      const matchesCategory =
        showAllProducts || selectedCategory === "Todos" || product.productType === selectedCategory;
      const matchesApplication =
        showAllProducts || selectedApplication === "Todos" || product.application === selectedApplication;
      const matchesSearch =
        !normalizedSearch || searchText.includes(normalizedSearch);

      return (
        matchesSearch &&
        matchesCategory &&
        matchesApplication
      );
    })
      .map(({ product }) => product);
  }, [
    searchQuery,
    searchableProducts,
    selectedApplication,
    selectedCategory,
    showAllProducts,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const activePage = Math.min(currentPage, totalPages);
  const visibleProducts = filteredProducts.slice(
    (activePage - 1) * PAGE_SIZE,
    activePage * PAGE_SIZE,
  );

  const selectedApplications =
    selectedCategory === "Todos"
      ? []
      : productTypes[selectedCategory as ProductTypeId]?.applications ?? [];
  const applicationCounts = useMemo(() => {
    if (selectedCategory === "Todos") {
      return new Map<string, number>();
    }

    return products.reduce((counts, product) => {
      if (product.productType !== selectedCategory) {
        return counts;
      }

      counts.set(product.application, (counts.get(product.application) ?? 0) + 1);
      return counts;
    }, new Map<string, number>());
  }, [selectedCategory]);
  const activeFilters = [
    ["Buscar", searchQuery.trim()],
    ["Vista", showAllProducts ? "Todos los productos" : ""],
    ["Tipo", selectedCategory === "Todos" ? selectedCategory : getProductTypeLabel(selectedCategory)],
    ["Aplicación", selectedApplication === "Todos" ? selectedApplication : getApplicationLabel(selectedApplication)],
  ].filter(([, value]) => value && value !== "Todos");
  const shouldShowApplications =
    !showAllProducts &&
    selectedCategory !== "Todos" &&
    selectedApplication === "Todos" &&
    !searchQuery.trim();
  const shouldShowProducts = showAllProducts || Boolean(searchQuery.trim()) || selectedApplication !== "Todos";
  const breadcrumbItems = [
    "Catálogo",
    showAllProducts ? "Todos los productos" : "",
    selectedCategory !== "Todos" ? getProductTypeLabel(selectedCategory) : "",
    !showAllProducts && selectedApplication !== "Todos" ? getApplicationLabel(selectedApplication) : "",
  ].filter(Boolean);
  const canGoBack =
    showAllProducts ||
    selectedCategory !== "Todos" ||
    selectedApplication !== "Todos" ||
    Boolean(searchQuery.trim());

  const resetCatalogNavigation = useCallback(() => {
    setCurrentPage(1);
    setSearchQuery("");
    setSelectedCategory("Todos");
    setSelectedApplication("Todos");
    setShowAllProducts(false);
  }, []);

  const scrollCatalogStageIntoView = useCallback((behavior: ScrollBehavior = "smooth") => {
    window.requestAnimationFrame(() => {
      catalogStageRef.current?.scrollIntoView({
        behavior,
        block: "start",
      });
    });
  }, []);

  const applyCatalogHistoryState = useCallback((catalogState: CatalogHistoryState) => {
    isApplyingBrowserHistoryRef.current = true;
    setCurrentPage(1);
    setSearchQuery(catalogState.searchQuery);
    setSelectedCategory(catalogState.selectedCategory);
    setSelectedApplication(catalogState.selectedApplication);
    setShowAllProducts(catalogState.showAllProducts);
    setIsCatalogTransitioning(false);
    scrollCatalogStageIntoView();

    window.setTimeout(() => {
      isApplyingBrowserHistoryRef.current = false;
    }, 0);
  }, [scrollCatalogStageIntoView]);

  const replaceCatalogHistoryState = useCallback(
    (catalogState: CatalogHistoryState, url = window.location.href) => {
      window.history.replaceState(catalogState, "", url);
    },
    [],
  );

  const syncCatalogHistoryState = useCallback((catalogState: CatalogHistoryState) => {
    if (isApplyingBrowserHistoryRef.current) {
      return;
    }

    replaceCatalogHistoryState(catalogState, getCatalogBaseUrl());
  }, [replaceCatalogHistoryState]);

  const transitionCatalog = useCallback((
    nextHistoryState: CatalogHistoryState,
    options: { animate?: boolean; scrollBehavior?: ScrollBehavior | false } = {},
  ) => {
    if (transitionTimeoutRef.current) {
      window.clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }

    if (window.location.hash) {
      window.history.replaceState(
        createCatalogHistoryState(
          selectedCategory,
          selectedApplication,
          searchQuery,
          showAllProducts,
        ),
        "",
        getCatalogBaseUrl(),
      );
    }

    const applyNextState = () => {
      setCurrentPage(1);
      setSearchQuery(nextHistoryState.searchQuery);
      setSelectedCategory(nextHistoryState.selectedCategory);
      setSelectedApplication(nextHistoryState.selectedApplication);
      setShowAllProducts(nextHistoryState.showAllProducts);
      syncCatalogHistoryState(nextHistoryState);

      if (options.scrollBehavior !== false) {
        scrollCatalogStageIntoView(options.scrollBehavior);
      }
    };

    if (options.animate === false) {
      setIsCatalogTransitioning(false);
      applyNextState();
      return;
    }

    setIsCatalogTransitioning(true);

    transitionTimeoutRef.current = window.setTimeout(() => {
      transitionTimeoutRef.current = null;
      applyNextState();
      setIsCatalogTransitioning(false);
    }, 180);
  }, [
    syncCatalogHistoryState,
    scrollCatalogStageIntoView,
    searchQuery,
    selectedApplication,
    selectedCategory,
    showAllProducts,
  ]);

  const navigateBackInCatalog = () => {
    if (showAllProducts) {
      transitionCatalog(createCatalogHistoryState(), {
        animate: false,
        scrollBehavior: false,
      });
      return;
    }

    if (searchQuery.trim()) {
      transitionCatalog(
        createCatalogHistoryState(selectedCategory, selectedApplication, "", false),
        { animate: false, scrollBehavior: false },
      );
      return;
    }

    if (selectedApplication !== "Todos") {
      transitionCatalog(createCatalogHistoryState(selectedCategory), {
        animate: false,
        scrollBehavior: false,
      });
      return;
    }

    if (selectedCategory !== "Todos") {
      transitionCatalog(createCatalogHistoryState(), {
        animate: false,
        scrollBehavior: false,
      });
      return;
    }

    scrollCatalogStageIntoView();
  };

  const handleSearchSubmit = () => {
    setCurrentPage(1);
    syncCatalogHistoryState(
      createCatalogHistoryState(
        selectedCategory,
        selectedApplication,
        searchQuery,
        showAllProducts,
      ),
    );
    scrollCatalogStageIntoView();
  };

  const goToProductPage = (page: number) => {
    const nextPage = Math.min(Math.max(page, 1), totalPages);

    if (nextPage === activePage) {
      return;
    }

    setCurrentPage(nextPage);
    scrollCatalogStageIntoView("auto");
  };

  const scrollAdviceFormIntoView = useCallback(() => {
    setIsQuoteOpen(false);
    window.requestAnimationFrame(() => {
      document.getElementById("asesoria-proyecto")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, []);

  const quoteCount = quoteItems.reduce((total, item) => total + item.quantity, 0);

  const whatsappMessage = useMemo(() => {
    const selectedProducts = quoteItems.map(
      (item) =>
        `${item.product.publicName} - Ref. ${item.product.econoluzReference} - Cantidad: ${item.quantity}`,
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
    return () => {
      if (transitionTimeoutRef.current) {
        window.clearTimeout(transitionTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const animationFrame = window.requestAnimationFrame(() => {
      setQuoteItems(buildInitialQuoteItems());
      setIsQuoteSessionReady(true);
    });

    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  useEffect(() => {
    if (!isQuoteSessionReady) {
      return;
    }

    if (quoteItems.length === 0) {
      window.sessionStorage.removeItem(quoteSessionStorageKey);
      return;
    }

    window.sessionStorage.setItem(
      quoteSessionStorageKey,
      JSON.stringify({
        items: quoteItems.map((item) => ({
          econoluzReference: item.product.econoluzReference,
          quantity: item.quantity,
        })),
      }),
    );
  }, [isQuoteSessionReady, quoteItems]);

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
        products: quoteItems.map(
          (item) =>
            `${item.product.publicName} - Ref. ${item.product.econoluzReference} - Cantidad: ${item.quantity}`,
        ),
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
    const handleCatalogReset = () => {
      if (transitionTimeoutRef.current) {
        window.clearTimeout(transitionTimeoutRef.current);
        transitionTimeoutRef.current = null;
      }

      resetCatalogNavigation();
      setIsCatalogTransitioning(false);
      replaceCatalogHistoryState(
        createCatalogHistoryState(),
        getCatalogBaseUrl(),
      );
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    };

    window.addEventListener("econoluz-catalog-reset", handleCatalogReset);

    return () => {
      window.removeEventListener("econoluz-catalog-reset", handleCatalogReset);
    };
  }, [replaceCatalogHistoryState, resetCatalogNavigation]);

  useEffect(() => {
    const hasAdviceHash = window.location.hash === "#asesoria-proyecto";

    replaceCatalogHistoryState(createCatalogHistoryState(), getCatalogBaseUrl());

    if (hasAdviceHash) {
      window.requestAnimationFrame(() => {
        document.getElementById("asesoria-proyecto")?.scrollIntoView({
          behavior: "auto",
          block: "start",
        });
      });
    }

    const handlePopState = (event: PopStateEvent) => {
      if (isCatalogHistoryState(event.state)) {
        applyCatalogHistoryState(event.state);
      }
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [applyCatalogHistoryState, replaceCatalogHistoryState]);

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

  const validateQuoteForm = () => {
    const nextErrors: QuoteFormErrors = {};

    if (!formState.fullName.trim()) {
      nextErrors.fullName = "Ingresa tu nombre completo.";
    }

    if (!formState.phone.trim()) {
      nextErrors.phone = "Ingresa tu teléfono.";
    }

    if (!formState.email.trim()) {
      nextErrors.email = "Ingresa tu email.";
    } else if (!emailPattern.test(formState.email.trim())) {
      nextErrors.email = "Ingresa un email válido.";
    }

    setFormErrors(nextErrors);

    return Object.keys(nextErrors).length === 0;
  };

  const handleQuoteSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!validateQuoteForm()) {
      return;
    }

    window.open(whatsappHref, "_blank", "noopener,noreferrer");
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
              exterior y espacios comerciales. Cada selección se cotiza con
              asesoría técnica según alcance, disponibilidad y especificación.
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
                onChange={(event) => {
                  setCurrentPage(1);
                  setShowAllProducts(false);
                  setSearchQuery(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.currentTarget.blur();
                    handleSearchSubmit();
                  }
                }}
                placeholder="Busca por nombre, referencia, serie, color o especificación"
                className="w-full border border-neutral-200 bg-white px-4 py-4 text-base font-semibold text-black outline-none transition placeholder:text-neutral-400 focus:border-black"
              />
            </label>

          </div>
        </div>
      </section>

      <section className="px-5 pb-20 pt-6 sm:px-8 sm:pb-24 lg:pb-32">
        <div ref={catalogStageRef} className="mx-auto scroll-mt-28 max-w-7xl">
          {!showAllProducts && !searchQuery.trim() && selectedCategory === "Todos" && (
            <div
              key="catalog-types"
              className={`catalog-stage ${isCatalogTransitioning ? "catalog-stage-out" : ""}`}
            >
              <SectionHeader
                eyebrow="Catálogo guiado"
                title="¿Qué tipo de producto buscas?"
                description="Elige una familia principal para entrar al catálogo de forma ordenada."
              />
              <div className="mt-7">
                <button
                  type="button"
                  onClick={() =>
                    transitionCatalog(createCatalogHistoryState("Todos", "Todos", "", true))
                  }
                  disabled={isCatalogTransitioning}
                  className="inline-flex rounded-full bg-black px-6 py-3 text-sm font-semibold text-white transition duration-300 hover:-translate-y-0.5 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Mostrar todos los productos
                </button>
              </div>
              <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {productTypeList.map((type) => (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() =>
                      transitionCatalog(createCatalogHistoryState(type.id))
                    }
                    disabled={isCatalogTransitioning}
                    className="group min-h-44 overflow-hidden border border-neutral-200 bg-white p-5 text-left transition duration-300 hover:-translate-y-1 hover:border-black hover:shadow-[0_18px_44px_rgba(0,0,0,0.10)] active:scale-[0.99]"
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-[0.26em] text-neutral-400">
                      {type.marker}
                    </span>
                    <h2 className="mt-7 text-2xl font-semibold leading-tight">
                      {type.label}
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
                title={getProductTypeLabel(selectedCategory)}
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
                            transitionCatalog(createCatalogHistoryState());
                            return;
                          }

                          if (index === 1) {
                            transitionCatalog(createCatalogHistoryState(selectedCategory));
                            return;
                          }
                        }}
                        disabled={isCatalogTransitioning}
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
                  onClick={navigateBackInCatalog}
                  disabled={isCatalogTransitioning}
                  className="rounded-full border border-black px-5 py-3 text-sm font-semibold text-black transition hover:bg-black hover:text-white"
                >
                  Volver
                </button>
                <button
                  type="button"
                  onClick={() =>
                    transitionCatalog(createCatalogHistoryState())
                  }
                  disabled={isCatalogTransitioning}
                  className="rounded-full border border-neutral-200 px-5 py-3 text-sm font-semibold text-neutral-700 transition hover:border-black hover:text-black"
                >
                  Inicio del catálogo
                </button>
              </div>
              <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {selectedApplications.map((application) => (
                  <button
                    key={application}
                    type="button"
                    onClick={() =>
                      transitionCatalog(createCatalogHistoryState(selectedCategory, application))
                    }
                    disabled={isCatalogTransitioning}
                    className="flex min-h-28 items-end justify-between gap-4 border border-neutral-200 bg-white p-5 text-left transition hover:border-black active:scale-[0.99]"
                  >
                    <span className="text-xl font-semibold">
                      {getApplicationLabel(application)}
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
                      {applicationCounts.get(application) ?? 0} ref.
                    </span>
                  </button>
                ))}
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
                  title={
                    showAllProducts
                      ? "Todos los productos"
                      : searchQuery.trim()
                      ? "Resultados de búsqueda"
                      : getApplicationLabel(selectedApplication)
                  }
                  description={`${filteredProducts.length} referencias encontradas. Página ${activePage} de ${totalPages}.`}
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
                              transitionCatalog(createCatalogHistoryState());
                              return;
                            }

                            if (showAllProducts) {
                              return;
                            }

                            if (index === 1) {
                              transitionCatalog(createCatalogHistoryState(selectedCategory));
                              return;
                            }
                          }}
                          disabled={isCatalogTransitioning}
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
                      onClick={navigateBackInCatalog}
                      disabled={isCatalogTransitioning}
                      className="rounded-full border border-black px-5 py-3 text-sm font-semibold text-black transition hover:bg-black hover:text-white"
                    >
                      Volver
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        transitionCatalog(createCatalogHistoryState())
                      }
                      disabled={isCatalogTransitioning}
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
                onClick={() => transitionCatalog(createCatalogHistoryState())}
                disabled={isCatalogTransitioning}
                className="mt-4 rounded-full border border-black px-5 py-3 text-sm font-semibold transition hover:bg-black hover:text-white"
              >
                Limpiar filtros
              </button>
            </div>
          )}

          {shouldShowProducts && filteredProducts.length > PAGE_SIZE && (
            <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => goToProductPage(activePage - 1)}
                disabled={activePage === 1}
                className="rounded-full border border-neutral-200 px-5 py-3 text-sm font-semibold text-neutral-700 transition hover:border-black hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
              >
                Anterior
              </button>
              {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
                <button
                  key={page}
                  type="button"
                  onClick={() => goToProductPage(page)}
                  aria-current={page === activePage ? "page" : undefined}
                  className={`flex h-11 w-11 items-center justify-center rounded-full border text-sm font-semibold transition ${
                    page === activePage
                      ? "border-black bg-black text-white"
                      : "border-neutral-200 text-neutral-700 hover:border-black hover:text-black"
                  }`}
                >
                  {page}
                </button>
              ))}
              <button
                type="button"
                onClick={() => goToProductPage(activePage + 1)}
                disabled={activePage === totalPages}
                className="rounded-full border border-neutral-200 px-5 py-3 text-sm font-semibold text-neutral-700 transition hover:border-black hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="bg-neutral-950 px-5 py-20 text-white sm:px-8 lg:py-28">
        <div id="asesoria-proyecto" className="-mt-20 scroll-mt-20 pt-20" />
        <div className="mx-auto grid max-w-7xl items-start gap-10 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="min-w-0">
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

              <div className="mt-5 grid max-h-72 min-h-0 gap-3 overflow-y-auto overscroll-contain pr-1">
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
                        <p className="font-semibold text-white">{item.product.publicName}</p>
                        <p className="mt-1 text-sm text-white/48">
                          Ref. {item.product.econoluzReference} / {item.quantity} unidad{item.quantity > 1 ? "es" : ""}
                        </p>
                      </div>
                      <p className="shrink-0 font-semibold">Por cotizar</p>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-5 flex items-center justify-between border-t border-white/12 pt-4">
                <p className="text-sm uppercase tracking-[0.18em] text-white/44">
                  Modalidad
                </p>
                <p className="text-2xl font-semibold">Cotización por asesoría</p>
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

          <form
            onSubmit={handleQuoteSubmit}
            noValidate
            className="self-start border border-white/12 bg-white p-5 text-black shadow-[0_24px_80px_rgba(0,0,0,0.28)] sm:p-8"
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
                  required
                  value={formState.fullName}
                  onChange={(event) => updateFormField("fullName", event.target.value)}
                  aria-invalid={Boolean(formErrors.fullName)}
                  aria-describedby={formErrors.fullName ? "quote-full-name-error" : undefined}
                  className={`border px-4 py-3 outline-none transition focus:border-black ${
                    formErrors.fullName ? "border-black bg-neutral-50" : "border-neutral-200"
                  }`}
                  placeholder="Nombre y apellido"
                />
                {formErrors.fullName && (
                  <span id="quote-full-name-error" className="text-xs font-medium text-neutral-600">
                    {formErrors.fullName}
                  </span>
                )}
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold">Teléfono</span>
                <input
                  required
                  type="tel"
                  value={formState.phone}
                  onChange={(event) => updateFormField("phone", event.target.value)}
                  aria-invalid={Boolean(formErrors.phone)}
                  aria-describedby={formErrors.phone ? "quote-phone-error" : undefined}
                  className={`border px-4 py-3 outline-none transition focus:border-black ${
                    formErrors.phone ? "border-black bg-neutral-50" : "border-neutral-200"
                  }`}
                  placeholder="+502 0000 0000"
                />
                {formErrors.phone && (
                  <span id="quote-phone-error" className="text-xs font-medium text-neutral-600">
                    {formErrors.phone}
                  </span>
                )}
              </label>

              <label className="grid gap-2 sm:col-span-2">
                <span className="text-sm font-semibold">Email</span>
                <input
                  required
                  type="email"
                  value={formState.email}
                  onChange={(event) => updateFormField("email", event.target.value)}
                  aria-invalid={Boolean(formErrors.email)}
                  aria-describedby={formErrors.email ? "quote-email-error" : undefined}
                  className={`border px-4 py-3 outline-none transition focus:border-black ${
                    formErrors.email ? "border-black bg-neutral-50" : "border-neutral-200"
                  }`}
                  placeholder="correo@empresa.com"
                />
                {formErrors.email && (
                  <span id="quote-email-error" className="text-xs font-medium text-neutral-600">
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

            <button
              type="submit"
              className="mt-7 flex w-full items-center justify-center rounded-full bg-black px-7 py-4 text-sm font-semibold text-white transition duration-300 hover:-translate-y-0.5 hover:bg-neutral-800"
            >
              Enviar información por WhatsApp
            </button>
            <p className="mt-4 text-xs leading-5 text-neutral-500">
              Los datos del formulario y productos seleccionados se enviarán por WhatsApp
              al asesor disponible.
            </p>
          </form>
        </div>
      </section>

      {quoteCount > 0 && (
        <button
          type="button"
          onClick={() => setIsQuoteOpen(true)}
          className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-3 rounded-full bg-black px-5 py-3 text-sm font-semibold text-white shadow-[0_20px_60px_rgba(0,0,0,0.28)] transition hover:-translate-y-0.5 hover:bg-neutral-800 sm:bottom-8 sm:right-8"
        >
          Ver selección
          <span className="rounded-full bg-white px-2 py-0.5 text-xs text-black">
            {quoteCount}
          </span>
        </button>
      )}

      <QuoteDrawer
        isOpen={isQuoteOpen}
        items={quoteItems}
        onClose={() => setIsQuoteOpen(false)}
        onCompleteAdvice={scrollAdviceFormIntoView}
        onRemove={removeFromQuote}
        onUpdateQuantity={updateQuantity}
      />

      <ProductTechnicalDrawer
        key={technicalProduct?.id ?? "closed-technical-product"}
        product={technicalProduct}
        quantity={
          technicalProduct
            ? quoteItems.find((item) => item.product.id === technicalProduct.id)?.quantity ?? 0
            : 0
        }
        onAdd={(product) => {
          addToQuote(product as Product, false);
        }}
        onDecrease={(product) => {
          const selectedItem = quoteItems.find((item) => item.product.id === product.id);
          updateQuantity(product.id, (selectedItem?.quantity ?? 1) - 1);
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
