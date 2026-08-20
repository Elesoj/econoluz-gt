"use client";

import {
  type FormEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import ProductCard from "../components/ProductCard";
import ProductTechnicalDrawer from "../components/ProductTechnicalDrawer";
import QuoteDrawer from "../components/QuoteDrawer";
import SectionHeader from "../components/SectionHeader";
import SiteFooter from "../components/SiteFooter";
import SiteNavbar from "../components/SiteNavbar";
import FilterChip from "../components/ui/FilterChip";
import {
  getApplicationLabel,
  getPopulatedApplicationIds,
  getProductTypeLabel,
  getSeriesLabel,
  productTypeList,
} from "../data/catalogTaxonomy";
import type { PublicProduct } from "../data/publicProduct";
import {
  CATALOG_PAGE_SIZE,
  type CatalogLocation,
  filterCatalogProducts,
} from "./catalogState";
import { buildPublicProductLine } from "./publicQuoteMessage";
import useCatalogNavigation from "./useCatalogNavigation";
import useQuoteSelection from "./useQuoteSelection";
import {
  contact,
  mainNavItems,
  quoteBudgetRanges,
  quoteLightingTypes,
  quoteProjectTypes,
} from "../data/siteData";

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

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Orden de tabulación de los campos obligatorios, para saber a cuál llevar el
// foco cuando la validación falla.
const requiredQuoteFields = ["fullName", "phone", "email"] as const;

type RequiredQuoteField = (typeof requiredQuoteFields)[number];

const quoteFieldLabels: Record<RequiredQuoteField, string> = {
  fullName: "Nombre completo",
  phone: "Teléfono",
  email: "Email",
};

// Los navegadores in-app de Facebook e Instagram suelen ignorar target="_blank"
// y, con él, el salto a la app de WhatsApp. Ahí conviene navegar en la misma
// pestaña, que sí consigue abrirla. Detectar por user agent es imperfecto, pero
// no hay otra señal disponible; y como el lead ya se guardó antes del salto,
// equivocarse solo cuesta la pestaña del formulario, no la solicitud.
const isMetaInAppBrowser = () =>
  typeof navigator !== "undefined" &&
  /FBAN|FBAV|FB_IAB|Instagram/i.test(navigator.userAgent);

// El user agent no cambia durante la vida de la página, así que no hay nada a
// lo que suscribirse. Se lee con useSyncExternalStore para que el servidor
// renderice siempre `false` y el cliente corrija tras hidratar, sin desajuste.
const subscribeToUserAgent = () => () => {};

// Envía el lead sin bloquear la navegación del enlace a WhatsApp.
//
// Nunca se espera esta promesa antes de dejar que el enlace navegue: hacerlo
// consumiría la activación de usuario y el navegador bloquearía el salto.
// `keepalive` mantiene viva la petición aunque la página se descargue.
// Cuando la navegación ocurre en la misma pestaña, `sendBeacon` da una garantía
// de entrega mejor, a costa de no poder leer la respuesta.
const postLead = (
  payload: Record<string, unknown>,
  navigatesAwayFromPage: boolean,
): Promise<{ ok: boolean; confirmed: boolean }> => {
  const body = JSON.stringify(payload);

  if (navigatesAwayFromPage && typeof navigator.sendBeacon === "function") {
    const queued = navigator.sendBeacon(
      "/api/leads",
      new Blob([body], { type: "application/json" }),
    );

    if (queued) {
      return Promise.resolve({ ok: true, confirmed: false });
    }
  }

  return fetch("/api/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  })
    .then((response) => ({ ok: response.ok, confirmed: true }))
    .catch(() => ({ ok: false, confirmed: true }));
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
  window.localStorage.removeItem("econoluz_led_results");
};

type CatalogClientProps = {
  products: PublicProduct[];
};

export default function CatalogClient({ products }: CatalogClientProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [selectedSeries, setSelectedSeries] = useState("Todos");
  const [isQuoteOpen, setIsQuoteOpen] = useState(false);
  const [technicalProduct, setTechnicalProduct] = useState<PublicProduct | null>(null);
  const [formState, setFormState] = useState<QuoteFormState>(buildInitialFormState);
  const [formErrors, setFormErrors] = useState<QuoteFormErrors>({});
  const [ledResultsSummary] = useState(getStoredLedResultsSummary);
  const [submitStatus, setSubmitStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const {
    items: quoteItems,
    quoteCount,
    add: addQuoteProduct,
    decrease: decreaseQuoteProduct,
    remove: removeQuoteProduct,
    setQuantity: setQuoteQuantity,
  } = useQuoteSelection(products);
  const opensInSameTab = useSyncExternalStore(
    subscribeToUserAgent,
    isMetaInAppBrowser,
    () => false,
  );
  const requiredFieldRefs = useRef<
    Record<RequiredQuoteField, HTMLInputElement | null>
  >({ fullName: null, phone: null, email: null });
  const catalogStageRef = useRef<HTMLDivElement>(null);
  const syncSearchDraftToLocation = useCallback((location: CatalogLocation) => {
    if (searchInputRef.current) {
      searchInputRef.current.value =
        location.view === "search" ? location.search : "";
    }
  }, []);
  const resetTransientCatalogFilters = useCallback(() => {
    setSelectedSeries("Todos");
  }, []);
  const {
    location: catalogLocation,
    isTransitioning: isCatalogTransitioning,
    clearSearch,
    goBack: navigateBackInCatalog,
    goToPage,
    goToRoot,
    selectApplication,
    selectCategory,
    showAllProducts: navigateToAllProducts,
    submitSearch,
  } = useCatalogNavigation({
    products,
    catalogStageRef,
    onLocationCommitted: syncSearchDraftToLocation,
    onResetTransient: resetTransientCatalogFilters,
  });
  const searchQuery =
    catalogLocation.view === "search" ? catalogLocation.search : "";
  const selectedCategory = catalogLocation.category ?? "Todos";
  const selectedApplication = catalogLocation.application ?? "Todos";
  const showAllProducts = catalogLocation.view === "all";
  const currentPage = catalogLocation.page;

  const matchingProductsBeforeSeries = useMemo(() => {
    return filterCatalogProducts(products, catalogLocation);
  }, [catalogLocation, products]);

  const seriesCounts = useMemo(
    () =>
      matchingProductsBeforeSeries.reduce((counts, product) => {
        counts.set(product.series, (counts.get(product.series) ?? 0) + 1);
        return counts;
      }, new Map<string, number>()),
    [matchingProductsBeforeSeries],
  );
  const seriesOptions = [...seriesCounts.keys()].sort((left, right) =>
    getSeriesLabel(left).localeCompare(getSeriesLabel(right), "es"),
  );
  const filteredProducts =
    selectedSeries === "Todos"
      ? matchingProductsBeforeSeries
      : matchingProductsBeforeSeries.filter(
          (product) => product.series === selectedSeries,
        );

  const totalPages = Math.max(
    1,
    Math.ceil(filteredProducts.length / CATALOG_PAGE_SIZE),
  );
  const activePage = Math.min(currentPage, totalPages);
  const visibleProducts = filteredProducts.slice(
    (activePage - 1) * CATALOG_PAGE_SIZE,
    activePage * CATALOG_PAGE_SIZE,
  );

  const selectedApplications =
    selectedCategory === "Todos"
      ? []
      : getPopulatedApplicationIds(selectedCategory, products);
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
  }, [products, selectedCategory]);
  const activeFilters = [
    ["Buscar", searchQuery.trim()],
    ["Vista", showAllProducts ? "Todos los productos" : ""],
    ["Tipo", selectedCategory === "Todos" ? selectedCategory : getProductTypeLabel(selectedCategory)],
    ["Aplicación", selectedApplication === "Todos" ? selectedApplication : getApplicationLabel(selectedApplication)],
    ["Serie", selectedSeries === "Todos" ? selectedSeries : getSeriesLabel(selectedSeries)],
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

  const handleSearchSubmit = () => {
    submitSearch(searchInputRef.current?.value ?? "");
  };

  const goToProductPage = (page: number, scroll = true) => {
    const nextPage = Math.min(Math.max(page, 1), totalPages);

    if (nextPage === activePage) {
      return;
    }

    goToPage(nextPage, scroll);
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

  const whatsappMessage = useMemo(() => {
    const selectedProducts = quoteItems.map(buildPublicProductLine);
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
  // Vía alternativa cuando WhatsApp no es una opción: el mismo mensaje, ya
  // redactado, en el cliente de correo del usuario.
  const mailtoHref = `mailto:${contact.email}?subject=${encodeURIComponent(
    "Solicitud de asesoría ECONOLUZ GT",
  )}&body=${encodeURIComponent(whatsappMessage)}`;

  const invalidFieldLabels = requiredQuoteFields
    .filter((field) => formErrors[field])
    .map((field) => quoteFieldLabels[field]);
  const validationAnnouncement =
    invalidFieldLabels.length > 0
      ? `No se pudo enviar. Revisa ${invalidFieldLabels.length === 1 ? "el campo" : "los campos"}: ${invalidFieldLabels.join(", ")}.`
      : "";

  useEffect(() => {
    window.addEventListener("beforeunload", clearTemporaryQuoteData);

    return () => {
      window.removeEventListener("beforeunload", clearTemporaryQuoteData);
    };
  }, []);

  const addToQuote = (product: PublicProduct, openQuote = true) => {
    addQuoteProduct(product);

    if (openQuote) {
      setIsQuoteOpen(true);
    }
  };

  const removeFromQuote = (econoluzReference: string) => {
    removeQuoteProduct(econoluzReference);
  };

  const updateQuantity = (econoluzReference: string, quantity: number) => {
    setQuoteQuantity(econoluzReference, quantity);
  };

  const updateFormField = (field: keyof QuoteFormState, value: string) => {
    setFormState((currentForm) => ({ ...currentForm, [field]: value }));
    setFormErrors((currentErrors) => ({ ...currentErrors, [field]: undefined }));
    // Al retocar los datos tras un envío, el formulario vuelve a estar activo
    // para poder mandar la versión corregida.
    setSubmitStatus((currentStatus) =>
      currentStatus === "saved" || currentStatus === "error" ? "idle" : currentStatus,
    );
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

    return nextErrors;
  };

  const focusFirstInvalidField = (errors: QuoteFormErrors) => {
    const firstInvalid = requiredQuoteFields.find((field) => errors[field]);
    const input = firstInvalid ? requiredFieldRefs.current[firstInvalid] : null;

    if (!input) {
      return;
    }

    // Se centra a mano porque el scroll automático del foco deja el campo
    // debajo de la barra de navegación fija.
    input.focus({ preventScroll: true });
    input.scrollIntoView({ block: "center" });
  };

  // Manda el lead al servidor sin esperar la respuesta, para no interponerse
  // entre el clic del usuario y la navegación a WhatsApp.
  const deliverLead = (navigatesAwayFromPage: boolean) => {
    setSubmitStatus("saving");

    postLead(
      {
        fullName: formState.fullName,
        phone: formState.phone,
        email: formState.email,
        projectType: formState.projectType,
        estimatedArea: formState.estimatedArea,
        budgetRange: formState.budgetRange,
        lightingType: formState.lightingType,
        message: formState.message,
        ledSummary: ledResultsSummary,
        products: quoteItems.map(buildPublicProductLine),
        source: opensInSameTab ? "in-app" : "navegador",
        website: "",
      },
      navigatesAwayFromPage,
    ).then((result) => {
      setSubmitStatus(result.ok ? "saved" : "error");
    });
  };

  // Se dispara desde el enlace de WhatsApp. Todo lo que hay aquí es síncrono a
  // propósito: en cuanto esta función devuelve, el navegador sigue con la
  // navegación del enlace. Ni un solo `await` antes de ese punto, porque eso
  // consumiría la activación de usuario y el salto quedaría bloqueado.
  const handleQuoteSubmit = (event: MouseEvent<HTMLAnchorElement>) => {
    const errors = validateQuoteForm();

    if (Object.keys(errors).length > 0) {
      event.preventDefault();
      focusFirstInvalidField(errors);
      return;
    }

    deliverLead(opensInSameTab);
  };

  // Pulsar Enter dentro de un campo sigue enviando el formulario. Ese camino no
  // puede usar el enlace, así que navega en la misma pestaña: una navegación
  // normal nunca la bloquea el navegador, a diferencia de un popup.
  const handleQuoteFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const errors = validateQuoteForm();

    if (Object.keys(errors).length > 0) {
      focusFirstInvalidField(errors);
      return;
    }

    deliverLead(true);
    window.location.href = whatsappHref;
  };

  return (
    <main className="min-h-screen bg-white text-black">
      <SiteNavbar
        items={mainNavItems}
        ctaHref="/#contacto"
        ctaLabel="Contacto"
        mobileCtaLabel="Solicitar asesoría"
      />

      <section className="bg-proyectos px-5 pb-16 pt-32 text-white sm:px-8 sm:pb-20 lg:pb-24 lg:pt-40">
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
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-tienda">
                Buscar en catálogo
              </span>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  key={searchQuery}
                  ref={searchInputRef}
                  defaultValue={searchQuery}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      event.currentTarget.blur();
                      handleSearchSubmit();
                    }
                  }}
                  placeholder="Busca por nombre, referencia, serie, color o especificación"
                  className="w-full border border-neutral-200 bg-white px-4 py-4 text-base font-semibold text-black outline-none transition placeholder:text-neutral-400 focus:border-proyectos"
                />
                {catalogLocation.view === "search" && (
                  <button
                    type="button"
                    onClick={clearSearch}
                    className="shrink-0 rounded-full border border-neutral-200 px-5 py-3 text-sm font-semibold text-neutral-700 transition hover:border-proyectos hover:text-proyectos"
                  >
                    Limpiar búsqueda
                  </button>
                )}
              </div>
            </label>

          </div>
        </div>
      </section>

      <section className="px-5 pb-20 pt-6 sm:px-8 sm:pb-24 lg:pb-32">
        <div
          id="catalog-product-region"
          ref={catalogStageRef}
          className="mx-auto scroll-mt-28 max-w-7xl"
        >
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
                  onClick={navigateToAllProducts}
                  className="inline-flex rounded-full bg-proyectos px-6 py-3 text-sm font-semibold text-white transition duration-300 hover:-translate-y-0.5 hover:bg-proyectos-fuerte disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Mostrar todos los productos
                </button>
              </div>
              <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {productTypeList.map((type) => (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => selectCategory(type.id)}
                    className="group min-h-44 overflow-hidden border border-neutral-200 bg-white p-5 text-left transition duration-300 hover:-translate-y-1 hover:border-proyectos hover:shadow-[0_18px_44px_rgba(0,0,0,0.10)] active:scale-[0.99]"
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
                    <span className="mt-6 block h-px w-10 bg-proyectos transition duration-300 group-hover:w-20" />
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
                            goToRoot();
                            return;
                          }

                          if (index === 1) {
                            selectCategory(selectedCategory);
                            return;
                          }
                        }}
                        className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500 transition hover:text-proyectos"
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
                  className="rounded-full border border-proyectos px-5 py-3 text-sm font-semibold text-proyectos transition hover:bg-proyectos hover:text-white"
                >
                  Volver
                </button>
                <button
                  type="button"
                  onClick={goToRoot}
                  className="rounded-full border border-neutral-200 px-5 py-3 text-sm font-semibold text-neutral-700 transition hover:border-proyectos hover:text-proyectos"
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
                      selectApplication(selectedCategory, application)
                    }
                    className="flex min-h-28 items-end justify-between gap-4 border border-neutral-200 bg-white p-5 text-left transition hover:border-proyectos active:scale-[0.99]"
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
                              goToRoot();
                              return;
                            }

                            if (showAllProducts) {
                              return;
                            }

                            if (index === 1) {
                              selectCategory(selectedCategory);
                              return;
                            }
                          }}
                          className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500 transition hover:text-proyectos"
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
                      className="rounded-full border border-proyectos px-5 py-3 text-sm font-semibold text-proyectos transition hover:bg-proyectos hover:text-white"
                    >
                      Volver
                    </button>
                    <button
                      type="button"
                      onClick={goToRoot}
                      className="rounded-full border border-neutral-200 px-5 py-3 text-sm font-semibold text-neutral-700 transition hover:border-proyectos hover:text-proyectos"
                    >
                      Inicio del catálogo
                    </button>
                  </div>
                )}
              </div>

              {seriesOptions.length > 0 && (
                <section className="mb-8 border-y border-neutral-200 py-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-tienda">
                    Filtrar por serie
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <FilterChip
                      label="Todas"
                      count={matchingProductsBeforeSeries.length}
                      isActive={selectedSeries === "Todos"}
                      onToggle={() => {
                        if (activePage !== 1) {
                          goToProductPage(1, false);
                        }
                        setSelectedSeries("Todos");
                      }}
                    />
                    {seriesOptions.map((series) => (
                      <FilterChip
                        key={series}
                        label={getSeriesLabel(series)}
                        count={seriesCounts.get(series)}
                        isActive={selectedSeries === series}
                        onToggle={() => {
                          if (activePage !== 1) {
                            goToProductPage(1, false);
                          }
                          setSelectedSeries((current) =>
                            current === series ? "Todos" : series,
                          );
                        }}
                      />
                    ))}
                  </div>
                </section>
              )}

              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
                {visibleProducts.map((product) => {
                  const selectedItem = quoteItems.find(
                    (item) =>
                      item.product.econoluzReference ===
                      product.econoluzReference,
                  );

                  return (
                    <ProductCard
                      key={product.id}
                      product={product}
                      quantity={selectedItem?.quantity}
                      onAdd={() => addToQuote(product, false)}
                      onDecrease={() =>
                        decreaseQuoteProduct(product.econoluzReference)
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
                onClick={() =>
                  catalogLocation.view === "search" ? clearSearch() : goToRoot()
                }
                className="mt-4 rounded-full border border-proyectos px-5 py-3 text-sm font-semibold transition hover:bg-proyectos hover:text-white"
              >
                Limpiar filtros
              </button>
            </div>
          )}

          {shouldShowProducts && filteredProducts.length > CATALOG_PAGE_SIZE && (
            <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => goToProductPage(activePage - 1)}
                disabled={activePage === 1}
                className="rounded-full border border-neutral-200 px-5 py-3 text-sm font-semibold text-neutral-700 transition hover:border-proyectos hover:text-proyectos disabled:cursor-not-allowed disabled:opacity-40"
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
                      ? "border-proyectos bg-proyectos text-white"
                      : "border-neutral-200 text-neutral-700 hover:border-proyectos hover:text-proyectos"
                  }`}
                >
                  {page}
                </button>
              ))}
              <button
                type="button"
                onClick={() => goToProductPage(activePage + 1)}
                disabled={activePage === totalPages}
                className="rounded-full border border-neutral-200 px-5 py-3 text-sm font-semibold text-neutral-700 transition hover:border-proyectos hover:text-proyectos disabled:cursor-not-allowed disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="bg-proyectos px-5 py-20 text-white sm:px-8 lg:py-28">
        <div id="asesoria-proyecto" className="-mt-20 scroll-mt-20 pt-20" />
        <div className="mx-auto grid max-w-7xl items-start gap-10 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/52">
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
                <p className="text-sm uppercase tracking-[0.2em] text-white/52">
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
                        <p className="mt-1 text-sm text-white/52">
                          Ref. {item.product.econoluzReference} / {item.quantity} unidad{item.quantity > 1 ? "es" : ""}
                        </p>
                      </div>
                      <p className="shrink-0 font-semibold">Por cotizar</p>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-5 flex items-center justify-between border-t border-white/12 pt-4">
                <p className="text-sm uppercase tracking-[0.18em] text-white/52">
                  Modalidad
                </p>
                <p className="text-2xl font-semibold">Cotización por asesoría</p>
              </div>
            </div>

            {!ledResultsSummary && (
              <div className="mt-5 border border-white/12 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/52">
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
            onSubmit={handleQuoteFormSubmit}
            noValidate
            className="self-start border border-white/12 bg-white p-5 text-black shadow-[0_24px_80px_rgba(0,0,0,0.28)] sm:p-8"
          >
            {ledResultsSummary && (
              <div className="mb-6 border border-neutral-200 bg-neutral-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-tienda">
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
                  ref={(element) => {
                    requiredFieldRefs.current.fullName = element;
                  }}
                  value={formState.fullName}
                  onChange={(event) => updateFormField("fullName", event.target.value)}
                  aria-invalid={Boolean(formErrors.fullName)}
                  aria-describedby={formErrors.fullName ? "quote-full-name-error" : undefined}
                  className={`border px-4 py-3 outline-none transition focus:border-proyectos ${
                    formErrors.fullName ? "border-error bg-neutral-50" : "border-neutral-200"
                  }`}
                  placeholder="Nombre y apellido"
                />
                {formErrors.fullName && (
                  <span id="quote-full-name-error" className="text-xs font-semibold text-error">
                    {formErrors.fullName}
                  </span>
                )}
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold">Teléfono</span>
                <input
                  required
                  type="tel"
                  ref={(element) => {
                    requiredFieldRefs.current.phone = element;
                  }}
                  value={formState.phone}
                  onChange={(event) => updateFormField("phone", event.target.value)}
                  aria-invalid={Boolean(formErrors.phone)}
                  aria-describedby={formErrors.phone ? "quote-phone-error" : undefined}
                  className={`border px-4 py-3 outline-none transition focus:border-proyectos ${
                    formErrors.phone ? "border-error bg-neutral-50" : "border-neutral-200"
                  }`}
                  placeholder="+502 0000 0000"
                />
                {formErrors.phone && (
                  <span id="quote-phone-error" className="text-xs font-semibold text-error">
                    {formErrors.phone}
                  </span>
                )}
              </label>

              <label className="grid gap-2 sm:col-span-2">
                <span className="text-sm font-semibold">Email</span>
                <input
                  required
                  type="email"
                  ref={(element) => {
                    requiredFieldRefs.current.email = element;
                  }}
                  value={formState.email}
                  onChange={(event) => updateFormField("email", event.target.value)}
                  aria-invalid={Boolean(formErrors.email)}
                  aria-describedby={formErrors.email ? "quote-email-error" : undefined}
                  className={`border px-4 py-3 outline-none transition focus:border-proyectos ${
                    formErrors.email ? "border-error bg-neutral-50" : "border-neutral-200"
                  }`}
                  placeholder="correo@empresa.com"
                />
                {formErrors.email && (
                  <span id="quote-email-error" className="text-xs font-semibold text-error">
                    {formErrors.email}
                  </span>
                )}
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold">Tipo de proyecto</span>
                <select
                  value={formState.projectType}
                  onChange={(event) => updateFormField("projectType", event.target.value)}
                  className={`border bg-white px-4 py-3 outline-none transition focus:border-proyectos ${
                    formErrors.projectType ? "border-error bg-neutral-50" : "border-neutral-200"
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
                  className="border border-neutral-200 px-4 py-3 outline-none transition focus:border-proyectos"
                  placeholder="Ej. 120"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold">Rango de presupuesto</span>
                <select
                  required
                  value={formState.budgetRange}
                  onChange={(event) => updateFormField("budgetRange", event.target.value)}
                  className="border border-neutral-200 bg-white px-4 py-3 outline-none transition focus:border-proyectos"
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
                  className="border border-neutral-200 bg-white px-4 py-3 outline-none transition focus:border-proyectos"
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
                  className="min-h-32 resize-none border border-neutral-200 px-4 py-3 outline-none transition focus:border-proyectos"
                  placeholder="Cuéntanos sobre ambientes, acabados, fechas o necesidades técnicas."
                />
              </label>
            </div>

            {/* Trampa para bots. Invisible y fuera del orden de tabulación:
                una persona nunca lo rellena, los formularios automáticos sí. */}
            <div aria-hidden="true" className="hidden">
              <label>
                No rellenar
                <input
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value=""
                  onChange={() => {}}
                />
              </label>
            </div>

            <p aria-live="assertive" className="sr-only">
              {validationAnnouncement}
            </p>

            {submitStatus === "saved" ? (
              <div
                role="status"
                className="mt-7 grid gap-3 border border-neutral-200 bg-neutral-50 p-5"
              >
                <p className="text-base font-semibold">Recibimos tu solicitud.</p>
                <p className="text-sm leading-6 text-neutral-600">
                  Queda guardada con tus datos y las luminarias seleccionadas. Un asesor
                  te contacta en horario de oficina: {contact.hours.toLowerCase()}.
                </p>
                <p className="mt-1 text-sm font-semibold">¿No se abrió WhatsApp?</p>
                <div className="grid gap-2 text-sm leading-6">
                  <a
                    href={whatsappHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-black underline underline-offset-4"
                  >
                    Reintentar por WhatsApp
                  </a>
                  <a
                    href={contact.phoneHref}
                    className="text-neutral-600 underline underline-offset-4 hover:text-proyectos"
                  >
                    {contact.phoneLabel}
                  </a>
                  <a
                    href={mailtoHref}
                    className="text-neutral-600 underline underline-offset-4 hover:text-proyectos"
                  >
                    {contact.email}
                  </a>
                </div>
              </div>
            ) : (
              <div className="mt-7 grid gap-4">
                {validationAnnouncement && (
                  <p className="border border-error px-4 py-3 text-sm font-semibold text-error">
                    Revisa los campos marcados antes de enviar.
                  </p>
                )}

                {submitStatus === "error" && (
                  <div role="alert" className="grid gap-2 border border-error p-4">
                    <p className="text-sm font-semibold text-error">
                      No pudimos guardar tu solicitud.
                    </p>
                    <p className="text-sm leading-6 text-neutral-600">
                      Tus datos siguen escritos aquí. Puedes reintentar con el botón, o
                      escribirnos a{" "}
                      <a
                        href={mailtoHref}
                        className="font-semibold text-black underline underline-offset-4"
                      >
                        {contact.email}
                      </a>{" "}
                      y llegamos igual.
                    </p>
                  </div>
                )}

                <a
                  href={whatsappHref}
                  target={opensInSameTab ? undefined : "_blank"}
                  rel="noopener noreferrer"
                  onClick={handleQuoteSubmit}
                  aria-busy={submitStatus === "saving"}
                  className="flex w-full items-center justify-center rounded-full bg-tienda px-7 py-4 text-sm font-semibold text-white transition duration-300 hover:-translate-y-0.5 hover:bg-tienda-fuerte"
                >
                  {submitStatus === "saving"
                    ? "Enviando…"
                    : "Enviar información por WhatsApp"}
                </a>

                <p className="text-xs leading-5 text-neutral-500">
                  Guardamos tu solicitud antes de abrir WhatsApp, así que llega al equipo
                  aunque el mensaje no se llegue a enviar.
                </p>
              </div>
            )}
          </form>
        </div>
      </section>

      {quoteCount > 0 && (
        <button
          type="button"
          onClick={() => setIsQuoteOpen(true)}
          className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-3 rounded-full bg-tienda px-5 py-3 text-sm font-semibold text-white shadow-[0_20px_60px_rgba(0,0,0,0.28)] transition hover:-translate-y-0.5 hover:bg-tienda-fuerte sm:bottom-8 sm:right-8"
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
            ? quoteItems.find(
                (item) =>
                  item.product.econoluzReference ===
                  technicalProduct.econoluzReference,
              )?.quantity ?? 0
            : 0
        }
        onAdd={(product) => {
          addToQuote(product, false);
        }}
        onDecrease={(product) => {
          decreaseQuoteProduct(product.econoluzReference);
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
