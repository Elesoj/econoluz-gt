import type { PublicProduct } from "../data/publicProduct";
import {
  getQuoteSelectionTotal,
  type QuoteItem,
} from "./quoteSelection";

export const QUOTE_SESSION_STORAGE_KEY = "econoluz_catalog_quote";

type QuoteStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type QuoteStorageSyncResult =
  | "unchanged"
  | "written"
  | "removed"
  | "failed";

export type QuoteSessionRestoreResult =
  | { status: "ok"; items: QuoteItem[] }
  | { status: "failed" };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isValidStoredQuantity = (quantity: unknown): quantity is number =>
  typeof quantity === "number" &&
  Number.isFinite(quantity) &&
  Number.isSafeInteger(quantity) &&
  quantity >= 1;

export const parseStoredQuoteSession = (
  serialized: string | null,
  products: readonly PublicProduct[],
): QuoteItem[] => {
  if (serialized === null) {
    return [];
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch {
    return [];
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.items)) {
    return [];
  }

  const productsByReference = new Map(
    products.map((product) => [product.econoluzReference, product]),
  );
  const itemIndexByReference = new Map<string, number>();
  const items: QuoteItem[] = [];
  let total = 0;

  for (const storedItem of parsed.items) {
    if (!isRecord(storedItem)) {
      continue;
    }

    const { econoluzReference, quantity } = storedItem;
    if (
      typeof econoluzReference !== "string" ||
      econoluzReference.length === 0 ||
      !isValidStoredQuantity(quantity)
    ) {
      continue;
    }

    const product = productsByReference.get(econoluzReference);
    if (!product || quantity > Number.MAX_SAFE_INTEGER - total) {
      continue;
    }

    const existingIndex = itemIndexByReference.get(econoluzReference);
    if (existingIndex === undefined) {
      itemIndexByReference.set(econoluzReference, items.length);
      items.push({ product, quantity });
    } else {
      const existingItem = items[existingIndex];
      items[existingIndex] = {
        ...existingItem,
        quantity: existingItem.quantity + quantity,
      };
    }

    total += quantity;
  }

  return items;
};

export const restoreQuoteSession = (
  storage: QuoteStorage,
  products: readonly PublicProduct[],
): QuoteSessionRestoreResult => {
  try {
    return {
      status: "ok",
      items: parseStoredQuoteSession(
        storage.getItem(QUOTE_SESSION_STORAGE_KEY),
        products,
      ),
    };
  } catch {
    return { status: "failed" };
  }
};

type SerializedQuoteSessionResult =
  | { status: "ok"; value: string | null }
  | { status: "failed" };

const serializeQuoteSession = (
  items: readonly QuoteItem[],
): SerializedQuoteSessionResult => {
  if (getQuoteSelectionTotal(items) === null) {
    return { status: "failed" };
  }

  if (items.length === 0) {
    return { status: "ok", value: null };
  }

  try {
    return {
      status: "ok",
      value: JSON.stringify({
        items: items.map((item) => ({
          econoluzReference: item.product.econoluzReference,
          quantity: item.quantity,
        })),
      }),
    };
  } catch {
    return { status: "failed" };
  }
};

export const syncQuoteSessionStorage = (
  storage: QuoteStorage,
  items: readonly QuoteItem[],
): QuoteStorageSyncResult => {
  const serialized = serializeQuoteSession(items);

  if (serialized.status === "failed") {
    return "failed";
  }

  const desiredValue = serialized.value;
  let storedValue: string | null;

  try {
    storedValue = storage.getItem(QUOTE_SESSION_STORAGE_KEY);
  } catch {
    return "failed";
  }

  if (storedValue === desiredValue) {
    return "unchanged";
  }

  try {
    if (desiredValue === null) {
      storage.removeItem(QUOTE_SESSION_STORAGE_KEY);
      return "removed";
    }

    storage.setItem(QUOTE_SESSION_STORAGE_KEY, desiredValue);
    return "written";
  } catch {
    return "failed";
  }
};
