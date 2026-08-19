"use client";

import { useCallback, useEffect, useState } from "react";
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

const getSessionStorage = () => {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

export default function useQuoteSelection(products: readonly PublicProduct[]) {
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [isQuoteSessionReady, setIsQuoteSessionReady] = useState(false);

  useEffect(() => {
    const animationFrame = window.requestAnimationFrame(() => {
      const storage = getSessionStorage();

      setItems(storage ? restoreQuoteSession(storage, products) : []);
      setIsQuoteSessionReady(true);
    });

    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [products]);

  useEffect(() => {
    if (!isQuoteSessionReady) {
      return;
    }

    const storage = getSessionStorage();
    if (storage) {
      syncQuoteSessionStorage(storage, items);
    }
    publishFloatingQuoteSelection(items);
  }, [isQuoteSessionReady, items]);

  const dispatch = useCallback((action: QuoteSelectionAction) => {
    setItems((currentItems) => reduceQuoteSelection(currentItems, action));
  }, []);

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
    quoteCount: getQuoteSelectionTotal(items),
    add,
    decrease,
    remove,
    setQuantity,
  };
}
