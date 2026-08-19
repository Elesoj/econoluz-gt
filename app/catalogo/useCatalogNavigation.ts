"use client";

import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { PublicProduct } from "../data/publicProduct";
import {
  type CatalogHistoryEntry,
  type CatalogLocation,
  createAllProductsLocation,
  createApplicationsLocation,
  createCatalogHistoryEntry,
  createCategoriesLocation,
  createProductsLocation,
  createSearchLocation,
  getCatalogParentLocation,
  locationWithPage,
  mergeCatalogHistoryState,
  validateCatalogHistoryEntry,
} from "./catalogState";

type ScrollTarget = "catalog" | "top" | false;

type TransitionOptions = {
  animate?: boolean;
  history?: "push" | "replace";
  resetTransient?: boolean;
  scroll?: ScrollTarget;
  scrollBehavior?: ScrollBehavior;
};

type UseCatalogNavigationOptions = {
  products: readonly PublicProduct[];
  catalogStageRef: RefObject<HTMLDivElement | null>;
  onLocationCommitted: (location: CatalogLocation) => void;
  onResetTransient: () => void;
};

const getCatalogUrl = () =>
  `${window.location.pathname}${window.location.search}`;

const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const createSessionId = () =>
  typeof window.crypto.randomUUID === "function"
    ? window.crypto.randomUUID()
    : `catalog-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export default function useCatalogNavigation({
  products,
  catalogStageRef,
  onLocationCommitted,
  onResetTransient,
}: UseCatalogNavigationOptions) {
  const [location, setLocation] = useState<CatalogLocation>(
    createCategoriesLocation,
  );
  const [isTransitioning, setIsTransitioning] = useState(false);
  const entryRef = useRef<CatalogHistoryEntry | null>(null);
  const transitionTimeoutRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const onLocationCommittedRef = useRef(onLocationCommitted);
  const onResetTransientRef = useRef(onResetTransient);

  useEffect(() => {
    onLocationCommittedRef.current = onLocationCommitted;
    onResetTransientRef.current = onResetTransient;
  }, [onLocationCommitted, onResetTransient]);

  const cancelScheduledWork = useCallback(() => {
    if (transitionTimeoutRef.current !== null) {
      window.clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }

    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  const scheduleScroll = useCallback(
    (
      target: ScrollTarget,
      requestedBehavior: ScrollBehavior = "smooth",
    ) => {
      if (target === false) {
        return;
      }

      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }

      // `html` usa `scroll-smooth`; el valor DOM `auto` hereda ese estilo.
      // Para paginación, restauración y movimiento reducido necesitamos un
      // salto realmente inmediato, que el navegador expone como `instant`.
      const behavior =
        prefersReducedMotion() || requestedBehavior === "auto"
          ? ("instant" as ScrollBehavior)
          : requestedBehavior;

      animationFrameRef.current = window.requestAnimationFrame(() => {
        animationFrameRef.current = null;

        if (target === "top") {
          window.scrollTo({ top: 0, behavior });
          return;
        }

        catalogStageRef.current?.scrollIntoView({ behavior, block: "start" });
      });
    },
    [catalogStageRef],
  );

  const replaceEntry = useCallback((entry: CatalogHistoryEntry, url: string) => {
    window.history.replaceState(
      mergeCatalogHistoryState(window.history.state, entry),
      "",
      url,
    );
  }, []);

  const applyLocation = useCallback(
    (
      nextLocation: CatalogLocation,
      resetTransient: boolean,
      scroll: ScrollTarget,
      scrollBehavior: ScrollBehavior,
    ) => {
      setLocation(nextLocation);
      setIsTransitioning(false);

      if (resetTransient) {
        onResetTransientRef.current();
      }

      scheduleScroll(scroll, scrollBehavior);
    },
    [scheduleScroll],
  );

  const transitionTo = useCallback(
    (nextLocation: CatalogLocation, options: TransitionOptions = {}) => {
      cancelScheduledWork();

      const currentEntry =
        entryRef.current ??
        createCatalogHistoryEntry(
          createCategoriesLocation(),
          createSessionId(),
          0,
        );
      const historyMethod = options.history ?? "push";
      const nextEntry = createCatalogHistoryEntry(
        nextLocation,
        currentEntry.sessionId,
        historyMethod === "push" ? currentEntry.depth + 1 : currentEntry.depth,
      );
      const nextHistoryState = mergeCatalogHistoryState(
        window.history.state,
        nextEntry,
      );

      window.history[historyMethod === "push" ? "pushState" : "replaceState"](
        nextHistoryState,
        "",
        getCatalogUrl(),
      );
      entryRef.current = nextEntry;
      onLocationCommittedRef.current(nextEntry);

      const resetTransient = options.resetTransient ?? true;
      const scroll = options.scroll ?? "catalog";
      const scrollBehavior = options.scrollBehavior ?? "smooth";
      const shouldAnimate = options.animate !== false && !prefersReducedMotion();

      if (!shouldAnimate) {
        applyLocation(
          nextLocation,
          resetTransient,
          scroll,
          scrollBehavior,
        );
        return;
      }

      setIsTransitioning(true);
      transitionTimeoutRef.current = window.setTimeout(() => {
        transitionTimeoutRef.current = null;
        applyLocation(
          nextLocation,
          resetTransient,
          scroll,
          scrollBehavior,
        );
      }, 180);
    },
    [applyLocation, cancelScheduledWork],
  );

  const goBack = useCallback(() => {
    cancelScheduledWork();
    setIsTransitioning(false);

    const currentEntry = entryRef.current;

    if (currentEntry && currentEntry.depth > 0) {
      window.history.back();
      return;
    }

    const fallbackLocation = getCatalogParentLocation(location);
    const fallbackEntry = createCatalogHistoryEntry(
      fallbackLocation,
      currentEntry?.sessionId ?? createSessionId(),
      0,
    );

    entryRef.current = fallbackEntry;
    onLocationCommittedRef.current(fallbackEntry);
    replaceEntry(fallbackEntry, getCatalogUrl());
    applyLocation(fallbackLocation, true, "catalog", "smooth");
  }, [applyLocation, cancelScheduledWork, location, replaceEntry]);

  const goToRoot = useCallback(
    () => transitionTo(createCategoriesLocation()),
    [transitionTo],
  );

  const selectCategory = useCallback(
    (category: string) => transitionTo(createApplicationsLocation(category)),
    [transitionTo],
  );

  const selectApplication = useCallback(
    (category: string, application: string) =>
      transitionTo(createProductsLocation(category, application)),
    [transitionTo],
  );

  const showAllProducts = useCallback(
    () => transitionTo(createAllProductsLocation()),
    [transitionTo],
  );

  const submitSearch = useCallback(
    (search: string) => {
      const normalizedSearch = search.trim();

      if (!normalizedSearch) {
        return;
      }

      transitionTo(
        createSearchLocation(
          normalizedSearch,
          entryRef.current ?? location,
        ),
      );
    },
    [location, transitionTo],
  );

  const clearSearch = useCallback(() => {
    const currentLocation = entryRef.current ?? location;

    if (currentLocation.view !== "search") {
      return;
    }

    transitionTo(currentLocation.returnTo, { animate: false });
  }, [location, transitionTo]);

  const goToPage = useCallback(
    (page: number, scroll = true) =>
      transitionTo(locationWithPage(location, page), {
        animate: false,
        resetTransient: false,
        scroll: scroll ? "catalog" : false,
        scrollBehavior: "auto",
      }),
    [location, transitionTo],
  );

  const resetCatalog = useCallback(() => {
    const isAlreadyRoot =
      entryRef.current?.view === "categories" &&
      window.location.hash.length === 0;

    if (isAlreadyRoot) {
      const rootLocation = createCategoriesLocation();

      cancelScheduledWork();
      onLocationCommittedRef.current(rootLocation);
      applyLocation(rootLocation, true, "top", "smooth");
      return;
    }

    transitionTo(createCategoriesLocation(), {
      animate: false,
      scroll: "top",
    });
  }, [applyLocation, cancelScheduledWork, transitionTo]);

  useEffect(() => {
    const hasAdviceHash = window.location.hash === "#asesoria-proyecto";
    const restoredEntry = hasAdviceHash
      ? null
      : validateCatalogHistoryEntry(window.history.state, products);
    const initialEntry =
      restoredEntry ??
      createCatalogHistoryEntry(
        createCategoriesLocation(),
        createSessionId(),
        0,
      );

    entryRef.current = initialEntry;
    replaceEntry(initialEntry, window.location.href);
    let initializationPending = true;

    // El estado inicial del servidor siempre es la raíz. Aplicar una entrada
    // restaurada después de registrar los listeners evita tanto un desajuste de
    // hidratación como una actualización síncrona dentro del efecto.
    window.queueMicrotask(() => {
      if (!initializationPending) {
        return;
      }

      initializationPending = false;
      setLocation(initialEntry);
      onResetTransientRef.current();
    });

    if (!hasAdviceHash && restoredEntry && restoredEntry.view !== "categories") {
      scheduleScroll("catalog", "auto");
    }

    const handleAdviceHash = () => {
      if (window.location.hash !== "#asesoria-proyecto") {
        return;
      }

      cancelScheduledWork();
      initializationPending = false;
      setIsTransitioning(false);

      const hashEntry =
        validateCatalogHistoryEntry(window.history.state, products) ??
        entryRef.current ??
        createCatalogHistoryEntry(
          createCategoriesLocation(),
          createSessionId(),
          0,
        );

      entryRef.current = hashEntry;
      onLocationCommittedRef.current(hashEntry);
      replaceEntry(hashEntry, window.location.href);
      setLocation(hashEntry);
      animationFrameRef.current = window.requestAnimationFrame(() => {
        animationFrameRef.current = null;
        document.getElementById("asesoria-proyecto")?.scrollIntoView({
          behavior: "instant" as ScrollBehavior,
          block: "start",
        });
      });
    };

    const handlePopState = (event: PopStateEvent) => {
      if (window.location.pathname !== "/catalogo") {
        return;
      }

      cancelScheduledWork();
      initializationPending = false;
      setIsTransitioning(false);

      const restored = validateCatalogHistoryEntry(event.state, products);

      if (!restored) {
        const normalizedEntry = createCatalogHistoryEntry(
          createCategoriesLocation(),
          entryRef.current?.sessionId ?? createSessionId(),
          0,
        );

        entryRef.current = normalizedEntry;
        onLocationCommittedRef.current(normalizedEntry);
        replaceEntry(normalizedEntry, window.location.href);
        applyLocation(normalizedEntry, true, "catalog", "auto");
        return;
      }

      entryRef.current = restored;
      onLocationCommittedRef.current(restored);
      applyLocation(restored, true, "catalog", "smooth");
    };

    window.addEventListener("popstate", handlePopState);
    window.addEventListener("hashchange", handleAdviceHash);
    handleAdviceHash();

    return () => {
      initializationPending = false;
      cancelScheduledWork();
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("hashchange", handleAdviceHash);
    };
  }, [
    applyLocation,
    cancelScheduledWork,
    products,
    replaceEntry,
    scheduleScroll,
  ]);

  useEffect(() => {
    const handleCatalogReset = () => resetCatalog();

    window.addEventListener("econoluz-catalog-reset", handleCatalogReset);

    return () => {
      window.removeEventListener("econoluz-catalog-reset", handleCatalogReset);
    };
  }, [resetCatalog]);

  return {
    location,
    isTransitioning,
    goBack,
    goToPage,
    goToRoot,
    selectApplication,
    selectCategory,
    showAllProducts,
    submitSearch,
    clearSearch,
  };
}
