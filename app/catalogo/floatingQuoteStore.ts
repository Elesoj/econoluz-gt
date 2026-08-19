import { contact } from "../data/siteData";
import { buildPublicProductLine } from "./publicQuoteMessage";
import type { QuoteItem } from "./quoteSelection";

export const DEFAULT_FLOATING_QUOTE_SNAPSHOT = contact.whatsappDefaultMessage;

let snapshot = DEFAULT_FLOATING_QUOTE_SNAPSHOT;
const listeners = new Set<() => void>();

const buildFloatingQuoteSnapshot = (items: readonly QuoteItem[]) =>
  items.length === 0
    ? DEFAULT_FLOATING_QUOTE_SNAPSHOT
    : `${DEFAULT_FLOATING_QUOTE_SNAPSHOT}\nProductos: ${items
        .map(buildPublicProductLine)
        .join(", ")}`;

export const getFloatingQuoteSnapshot = () => snapshot;

export const getFloatingQuoteServerSnapshot = () =>
  DEFAULT_FLOATING_QUOTE_SNAPSHOT;

export const subscribeToFloatingQuote = (listener: () => void) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};

export const publishFloatingQuoteSelection = (items: readonly QuoteItem[]) => {
  const nextSnapshot = buildFloatingQuoteSnapshot(items);

  if (nextSnapshot === snapshot) {
    return false;
  }

  snapshot = nextSnapshot;
  listeners.forEach((listener) => listener());
  return true;
};
