import { productTypes, type ProductTypeId } from "../data/catalogTaxonomy";
import type { PublicProduct } from "../data/publicProduct";

export const CATALOG_HISTORY_VERSION = 1;
export const CATALOG_PAGE_SIZE = 40;
export const MAX_CATALOG_SEARCH_LENGTH = 120;

type CategoriesLocation = {
  view: "categories";
  category: null;
  application: null;
  search: "";
  page: 1;
};

type ApplicationsLocation = {
  view: "applications";
  category: string;
  application: null;
  search: "";
  page: 1;
};

type ProductsLocation = {
  view: "products";
  category: string;
  application: string;
  search: "";
  page: number;
};

type AllProductsLocation = {
  view: "all";
  category: null;
  application: null;
  search: "";
  page: number;
};

export type CatalogReturnLocation =
  | CategoriesLocation
  | ApplicationsLocation
  | ProductsLocation
  | AllProductsLocation;

type SearchLocation = {
  view: "search";
  category: null;
  application: null;
  search: string;
  page: number;
  returnTo: CatalogReturnLocation;
};

export type CatalogLocation = CatalogReturnLocation | SearchLocation;

export type CatalogHistoryEntry = CatalogLocation & {
  version: typeof CATALOG_HISTORY_VERSION;
  sessionId: string;
  depth: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

const isValidCategory = (category: unknown): category is ProductTypeId =>
  typeof category === "string" &&
  Object.prototype.hasOwnProperty.call(productTypes, category);

const isLegalApplication = (
  category: string,
  application: unknown,
  products: readonly PublicProduct[],
): application is string => {
  if (typeof application !== "string") {
    return false;
  }

  const productType = productTypes[category as ProductTypeId];

  return Boolean(
    productType?.applications.some((candidate) => candidate === application) &&
      products.some(
        (product) =>
          product.productType === category && product.application === application,
      ),
  );
};

const getPublicTechnicalSpecValues = (product: PublicProduct) =>
  product.technicalSpecs ? Object.values(product.technicalSpecs).flat() : [];

export const buildCatalogSearchText = (product: PublicProduct) =>
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
    .toLocaleLowerCase("es");

export const filterCatalogProducts = (
  products: readonly PublicProduct[],
  location: CatalogLocation,
) => {
  if (location.view === "categories" || location.view === "applications") {
    return [];
  }

  if (location.view === "all") {
    return [...products];
  }

  if (location.view === "products") {
    return products.filter(
      (product) =>
        product.productType === location.category &&
        product.application === location.application,
    );
  }

  const normalizedSearch = location.search.toLocaleLowerCase("es");

  return products.filter((product) =>
    buildCatalogSearchText(product).includes(normalizedSearch),
  );
};

const getTotalPages = (
  products: readonly PublicProduct[],
  location: CatalogLocation,
) =>
  Math.max(
    1,
    Math.ceil(filterCatalogProducts(products, location).length / CATALOG_PAGE_SIZE),
  );

const hasNoReturnLocation = (value: Record<string, unknown>) =>
  value.returnTo === undefined;

const validateReturnLocation = (
  value: unknown,
  products: readonly PublicProduct[],
): CatalogReturnLocation | null => {
  if (!isRecord(value) || !hasNoReturnLocation(value)) {
    return null;
  }

  if (
    value.view === "categories" &&
    value.category === null &&
    value.application === null &&
    value.search === "" &&
    value.page === 1
  ) {
    return createCategoriesLocation();
  }

  if (
    value.view === "applications" &&
    isValidCategory(value.category) &&
    value.application === null &&
    value.search === "" &&
    value.page === 1
  ) {
    return createApplicationsLocation(value.category);
  }

  if (
    value.view === "products" &&
    isValidCategory(value.category) &&
    isLegalApplication(value.category, value.application, products) &&
    value.search === "" &&
    isPositiveInteger(value.page)
  ) {
    const location = createProductsLocation(
      value.category,
      value.application,
      value.page,
    );

    return value.page <= getTotalPages(products, location) ? location : null;
  }

  if (
    value.view === "all" &&
    value.category === null &&
    value.application === null &&
    value.search === "" &&
    isPositiveInteger(value.page)
  ) {
    const location = createAllProductsLocation(value.page);

    return value.page <= getTotalPages(products, location) ? location : null;
  }

  return null;
};

export const createCategoriesLocation = (): CategoriesLocation => ({
  view: "categories",
  category: null,
  application: null,
  search: "",
  page: 1,
});

export const createApplicationsLocation = (
  category: string,
): ApplicationsLocation => ({
  view: "applications",
  category,
  application: null,
  search: "",
  page: 1,
});

export const createProductsLocation = (
  category: string,
  application: string,
  page = 1,
): ProductsLocation => ({
  view: "products",
  category,
  application,
  search: "",
  page,
});

export const createAllProductsLocation = (page = 1): AllProductsLocation => ({
  view: "all",
  category: null,
  application: null,
  search: "",
  page,
});

export const getSearchReturnLocation = (
  location: CatalogLocation,
): CatalogReturnLocation => {
  const returnLocation = location.view === "search" ? location.returnTo : location;

  return { ...returnLocation, page: 1 } as CatalogReturnLocation;
};

export const createSearchLocation = (
  search: string,
  currentLocation: CatalogLocation,
  page = 1,
): SearchLocation => ({
  view: "search",
  category: null,
  application: null,
  search: search.trim().slice(0, MAX_CATALOG_SEARCH_LENGTH),
  page,
  returnTo: getSearchReturnLocation(currentLocation),
});

export const locationWithPage = (
  location: CatalogLocation,
  page: number,
): CatalogLocation => ({ ...location, page }) as CatalogLocation;

export const getCatalogParentLocation = (
  location: CatalogLocation,
): CatalogReturnLocation => {
  if (location.view === "products") {
    return createApplicationsLocation(location.category);
  }

  if (location.view === "applications") {
    return createCategoriesLocation();
  }

  if (location.view === "search") {
    return location.returnTo;
  }

  return createCategoriesLocation();
};

export const createCatalogHistoryEntry = (
  location: CatalogLocation,
  sessionId: string,
  depth: number,
): CatalogHistoryEntry => ({
  version: CATALOG_HISTORY_VERSION,
  sessionId,
  depth,
  ...location,
});

export const mergeCatalogHistoryState = (
  currentHistoryState: unknown,
  entry: CatalogHistoryEntry,
) => ({
  ...(isRecord(currentHistoryState) ? currentHistoryState : {}),
  econoluzCatalog: entry,
});

export const validateCatalogHistoryEntry = (
  historyState: unknown,
  products: readonly PublicProduct[],
): CatalogHistoryEntry | null => {
  if (!isRecord(historyState) || !isRecord(historyState.econoluzCatalog)) {
    return null;
  }

  const candidate = historyState.econoluzCatalog;

  if (
    candidate.version !== CATALOG_HISTORY_VERSION ||
    typeof candidate.sessionId !== "string" ||
    candidate.sessionId.length === 0 ||
    candidate.sessionId.length > 128 ||
    typeof candidate.depth !== "number" ||
    !Number.isInteger(candidate.depth) ||
    candidate.depth < 0 ||
    candidate.depth > 10_000
  ) {
    return null;
  }

  if (candidate.view === "search") {
    if (
      candidate.category !== null ||
      candidate.application !== null ||
      typeof candidate.search !== "string" ||
      candidate.search.length === 0 ||
      candidate.search.length > MAX_CATALOG_SEARCH_LENGTH ||
      candidate.search !== candidate.search.trim() ||
      !isPositiveInteger(candidate.page)
    ) {
      return null;
    }

    const returnTo = validateReturnLocation(candidate.returnTo, products);

    if (!returnTo) {
      return null;
    }

    const location: SearchLocation = {
      view: "search",
      category: null,
      application: null,
      search: candidate.search,
      page: candidate.page,
      returnTo,
    };

    if (candidate.page > getTotalPages(products, location)) {
      return null;
    }

    return createCatalogHistoryEntry(
      location,
      candidate.sessionId,
      candidate.depth,
    );
  }

  const location = validateReturnLocation(candidate, products);

  return location
    ? createCatalogHistoryEntry(location, candidate.sessionId, candidate.depth)
    : null;
};
