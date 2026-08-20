import type { PublicProduct } from "../data/publicProduct";

export type QuoteItem = {
  product: PublicProduct;
  quantity: number;
};

export type QuoteSelectionAction =
  | { type: "add"; product: PublicProduct }
  | { type: "decrease"; econoluzReference: string }
  | { type: "remove"; econoluzReference: string }
  | { type: "set"; econoluzReference: string; quantity: number };

const isValidQuantity = (quantity: number) =>
  Number.isSafeInteger(quantity) && quantity >= 1;

const canIncreaseSafeTotal = (total: number, increment: number) =>
  Number.isSafeInteger(total) &&
  total >= 0 &&
  isValidQuantity(increment) &&
  increment <= Number.MAX_SAFE_INTEGER - total;

export const getQuoteSelectionTotal = (items: readonly QuoteItem[]) => {
  const references = new Set<string>();
  let total = 0;

  for (const item of items) {
    const reference = item?.product?.econoluzReference;

    if (
      typeof reference !== "string" ||
      reference.length === 0 ||
      references.has(reference) ||
      !canIncreaseSafeTotal(total, item.quantity)
    ) {
      return null;
    }

    references.add(reference);
    total += item.quantity;
  }

  return total;
};

export const reduceQuoteSelection = (
  items: QuoteItem[],
  action: QuoteSelectionAction,
): QuoteItem[] => {
  const total = getQuoteSelectionTotal(items);

  if (total === null) {
    return items;
  }

  if (action.type === "add") {
    if (!canIncreaseSafeTotal(total, 1)) {
      return items;
    }

    const itemIndex = items.findIndex(
      (item) =>
        item.product.econoluzReference === action.product.econoluzReference,
    );

    if (itemIndex < 0) {
      return [...items, { product: action.product, quantity: 1 }];
    }

    const currentItem = items[itemIndex];
    if (!isValidQuantity(currentItem.quantity + 1)) {
      return items;
    }

    return items.map((item, index) =>
      index === itemIndex ? { ...item, quantity: item.quantity + 1 } : item,
    );
  }

  const itemIndex = items.findIndex(
    (item) => item.product.econoluzReference === action.econoluzReference,
  );

  if (itemIndex < 0) {
    return items;
  }

  if (action.type === "remove") {
    return items.filter((_, index) => index !== itemIndex);
  }

  const currentItem = items[itemIndex];

  if (action.type === "decrease") {
    if (currentItem.quantity === 1) {
      return items.filter((_, index) => index !== itemIndex);
    }

    return items.map((item, index) =>
      index === itemIndex ? { ...item, quantity: item.quantity - 1 } : item,
    );
  }

  if (action.quantity === 0) {
    return items.filter((_, index) => index !== itemIndex);
  }

  if (!isValidQuantity(action.quantity)) {
    return items;
  }

  const otherItemsTotal = total - currentItem.quantity;
  if (!canIncreaseSafeTotal(otherItemsTotal, action.quantity)) {
    return items;
  }

  if (action.quantity === currentItem.quantity) {
    return items;
  }

  return items.map((item, index) =>
    index === itemIndex ? { ...item, quantity: action.quantity } : item,
  );
};
