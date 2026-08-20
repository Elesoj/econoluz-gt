"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicProduct } from "../data/publicProduct";
import { publishFloatingQuoteSelection } from "./floatingQuoteStore";
import {
  restoreQuoteSession,
  syncQuoteSessionStorage,
} from "./quotePersistence";
import {
  getQuoteSelectionTotal,
  reduceQuoteSelection,
  type QuoteItem,
  type QuoteSelectionAction,
} from "./quoteSelection";

type QuoteHydrationPhase = "pending" | "restored" | "failed";

type SessionStorageAccess =
  | { status: "ok"; storage: Storage }
  | { status: "failed" };

const getSessionStorage = (): SessionStorageAccess => {
  try {
    return { status: "ok", storage: window.sessionStorage };
  } catch {
    return { status: "failed" };
  }
};

export default function useQuoteSelection(products: readonly PublicProduct[]) {
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [isQuoteSessionReady, setIsQuoteSessionReady] = useState(false);
  const itemsRef = useRef<QuoteItem[]>([]);
  const hydrationPhaseRef = useRef<QuoteHydrationPhase>("pending");
  const storageRef = useRef<Storage | null>(null);
  const pendingActionsRef = useRef<QuoteSelectionAction[]>([]);
  const animationFrameRef = useRef<number | null>(null);

  const hydrateQuoteSession = useCallback(
    (updateReactState: boolean) => {
      if (hydrationPhaseRef.current !== "pending") {
        return;
      }

      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      const pendingActions = pendingActionsRef.current;
      pendingActionsRef.current = [];
      const storageAccess = getSessionStorage();
      let nextItems = itemsRef.current;

      if (storageAccess.status === "ok") {
        const restored = restoreQuoteSession(storageAccess.storage, products);

        if (restored.status === "ok") {
          storageRef.current = storageAccess.storage;
          hydrationPhaseRef.current = "restored";
          nextItems = pendingActions.reduce(
            (currentItems, action) =>
              reduceQuoteSelection(currentItems, action),
            restored.items,
          );
        } else {
          hydrationPhaseRef.current = "failed";
          nextItems = pendingActions.reduce(
            (currentItems, action) =>
              reduceQuoteSelection(currentItems, action),
            nextItems,
          );
        }
      } else {
        hydrationPhaseRef.current = "failed";
        nextItems = pendingActions.reduce(
          (currentItems, action) => reduceQuoteSelection(currentItems, action),
          nextItems,
        );
      }

      itemsRef.current = nextItems;

      if (updateReactState) {
        setItems(nextItems);
        setIsQuoteSessionReady(true);
      }

      if (hydrationPhaseRef.current === "restored" && storageRef.current) {
        syncQuoteSessionStorage(storageRef.current, nextItems);
        publishFloatingQuoteSelection(nextItems);
      } else if (pendingActions.length > 0) {
        publishFloatingQuoteSelection(nextItems);
      }
    },
    [products],
  );

  useEffect(() => {
    if (hydrationPhaseRef.current === "pending") {
      animationFrameRef.current = window.requestAnimationFrame(() => {
        animationFrameRef.current = null;
        hydrateQuoteSession(true);
      });
    }

    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      if (pendingActionsRef.current.length > 0) {
        hydrateQuoteSession(false);
      }
    };
  }, [hydrateQuoteSession]);

  const dispatch = useCallback((action: QuoteSelectionAction) => {
    if (hydrationPhaseRef.current === "pending") {
      pendingActionsRef.current.push(action);
      hydrateQuoteSession(true);
      return;
    }

    const nextItems = reduceQuoteSelection(itemsRef.current, action);

    if (nextItems === itemsRef.current) {
      return;
    }

    itemsRef.current = nextItems;
    setItems(nextItems);

    if (hydrationPhaseRef.current === "restored" && storageRef.current) {
      syncQuoteSessionStorage(storageRef.current, nextItems);
    }
    publishFloatingQuoteSelection(nextItems);
  }, [hydrateQuoteSession]);

  const add = useCallback(
    (product: PublicProduct) => dispatch({ type: "add", product }),
    [dispatch],
  );
  const decrease = useCallback(
    (econoluzReference: string) =>
      dispatch({ type: "decrease", econoluzReference }),
    [dispatch],
  );
  const remove = useCallback(
    (econoluzReference: string) =>
      dispatch({ type: "remove", econoluzReference }),
    [dispatch],
  );
  const setQuantity = useCallback(
    (econoluzReference: string, quantity: number) =>
      dispatch({ type: "set", econoluzReference, quantity }),
    [dispatch],
  );

  return {
    items,
    isQuoteSessionReady,
    quoteCount: getQuoteSelectionTotal(items) ?? 0,
    add,
    decrease,
    remove,
    setQuantity,
  };
}
