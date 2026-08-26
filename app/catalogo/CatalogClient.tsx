"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ProductCard from "../components/ProductCard";
import ProductTechnicalDrawer from "../components/ProductTechnicalDrawer";
import QuoteDrawer from "../components/QuoteDrawer";
import SectionHeader from "../components/SectionHeader";
import SiteFooter from "../components/SiteFooter";
import SiteNavbar from "../components/SiteNavbar";
import {
  getApplicationLabel,
  getPopulatedApplicationIds,
  getProductTypeLabel,
  productTypeList,
} from "../data/catalogTaxonomy";
import type { PublicProduct } from "../data/publicProduct";
import {
  CATALOG_PAGE_SIZE,
  type CatalogLocation,
  filterCatalogProducts,
} from "./catalogState";
import useCatalogNavigation from "./useCatalogNavigation";
import useQuoteSelection from "./useQuoteSelection";
import { mainNavItems } from "../data/siteData";









// El user agent no cambia durante la vida de la página, así que no hay nada a
// lo que suscribirse. Se lee con useSyncExternalStore para que el servidor
// renderice siempre `false` y el cliente corrija tras hidratar, sin desajuste.




const clearTemporaryQuoteData = () => {
  window.localStorage.removeItem("econoluz_led_results");
};

type CatalogClientProps = {
  products: PublicProduct[];
};

export default function CatalogClient({ products }: CatalogClientProps) {
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isQuoteOpen, setIsQuoteOpen] = useState(false);
  const [technicalProduct, setTechnicalProduct] = useState<PublicProduct | null>(null);


  const {
    items: quoteItems,
    quoteCount,
    add: addQuoteProduct,
    decrease: decreaseQuoteProduct,
    remove: removeQuoteProduct,
    setQuantity: setQuoteQuantity,
  } = useQuoteSelection(products);
  const catalogStageRef = useRef<HTMLDivElement>(null);
  const syncSearchDraftToLocation = useCallback((location: CatalogLocation) => {
    if (searchInputRef.current) {
      searchInputRef.current.value =
        location.view === "search" ? location.search : "";
    }
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
  });
  const searchQuery =
    catalogLocation.view === "search" ? catalogLocation.search : "";
  const selectedCategory = catalogLocation.category ?? "Todos";
  const selectedApplication = catalogLocation.application ?? "Todos";
  const showAllProducts = catalogLocation.view === "all";
  const currentPage = catalogLocation.page;

  const filteredProducts = useMemo(
    () => filterCatalogProducts(products, catalogLocation),
    [catalogLocation, products],
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

  // Antes bajaba hasta el formulario, que estaba en esta misma página. Ahora
  // la asesoría tiene página propia y hay que ir a ella.
  const goToAdvicePage = useCallback(() => {
    setIsQuoteOpen(false);
    router.push("/asesoria");
  }, [router]);




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





  // Se dispara desde el enlace de WhatsApp. Todo lo que hay aquí es síncrono a
  // propósito: en cuanto esta función devuelve, el navegador sigue con la
  // navegación del enlace. Ni un solo `await` antes de ese punto, porque eso
  // consumiría la activación de usuario y el salto quedaría bloqueado.

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
                  placeholder="Busca por nombre, referencia, color o especificación"
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

      {/* La asesoría ya no vive aquí: el catálogo es para mirar productos, y
          quien tiene un proyecto grande pasa a su propia página. La selección
          de luminarias se guarda en el navegador, así que llega con él. */}
      <section className="bg-proyectos px-5 py-16 text-white sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/52">
              Proyectos
            </p>
            <h2 className="mt-4 max-w-2xl text-3xl font-semibold leading-tight sm:text-4xl">
              ¿Necesitas cotizar un proyecto completo?
            </h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-white/62">
              Para volúmenes, varias áreas o especificación técnica, el equipo prepara una
              cotización con asesoría. Las luminarias que hayas seleccionado te acompañan.
            </p>
          </div>
          <Link
            href="/asesoria"
            className="inline-flex shrink-0 items-center justify-center rounded-full bg-tienda px-7 py-4 text-sm font-semibold text-white transition duration-300 hover:-translate-y-0.5 hover:bg-tienda-fuerte"
          >
            Pedir cotización con asesoría
          </Link>
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
        onCompleteAdvice={goToAdvicePage}
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
