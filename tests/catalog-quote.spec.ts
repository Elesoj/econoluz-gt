import { expect, test, type Page } from "@playwright/test";

const QUOTE_KEY = "econoluz_catalog_quote";
const LEGACY_CONTEXT_KEY = "econoluz_quote_context";
const LEGACY_EVENT = "econoluz-quote-updated";
const FIRST_REFERENCE = "ECO-IND-0048";

type QuoteProduct = {
  id: string;
  publicName: string;
  econoluzReference: string;
};

type QuoteItem = {
  product: QuoteProduct;
  quantity: number;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type StorageSyncResult = "unchanged" | "written" | "removed" | "failed";

type QuotePersistenceModule = {
  QUOTE_SESSION_STORAGE_KEY: string;
  parseStoredQuoteSession: (
    serialized: string | null,
    products: readonly QuoteProduct[],
  ) => QuoteItem[];
  restoreQuoteSession: (
    storage: StorageLike,
    products: readonly QuoteProduct[],
  ) => QuoteItem[];
  serializeQuoteSession: (items: readonly QuoteItem[]) => string | null;
  syncQuoteSessionStorage: (
    storage: StorageLike,
    items: readonly QuoteItem[],
  ) => StorageSyncResult;
};

type QuoteSelectionAction =
  | { type: "add"; product: QuoteProduct }
  | { type: "decrease"; econoluzReference: string }
  | { type: "remove"; econoluzReference: string }
  | { type: "set"; econoluzReference: string; quantity: number };

type QuoteSelectionModule = {
  getQuoteSelectionTotal: (items: readonly QuoteItem[]) => number;
  reduceQuoteSelection: (
    items: readonly QuoteItem[],
    action: QuoteSelectionAction,
  ) => QuoteItem[];
};

type PublicQuoteMessageModule = {
  buildPublicProductLine: (input: {
    product: QuoteProduct;
    quantity: number;
  }) => string;
};

type FloatingQuoteStoreModule = {
  DEFAULT_FLOATING_QUOTE_SNAPSHOT: string;
  getFloatingQuoteServerSnapshot: () => string;
  getFloatingQuoteSnapshot: () => string;
  publishFloatingQuoteSelection: (items: readonly QuoteItem[]) => boolean;
  subscribeToFloatingQuote: (listener: () => void) => () => void;
};

const loadCatalogModule = async <Module>(name: string): Promise<Module | null> => {
  try {
    const modulePath = `../app/catalogo/${name}.ts`;
    return (await import(modulePath)) as Module;
  } catch {
    return null;
  }
};

const testProducts: readonly QuoteProduct[] = [
  {
    id: "eco-test-a",
    publicName: "Luminaria pública A",
    econoluzReference: "ECO-TEST-A",
  },
  {
    id: "eco-test-b",
    publicName: "Luminaria pública B",
    econoluzReference: "ECO-TEST-B",
  },
  {
    id: "eco-test-c",
    publicName: "Luminaria pública C",
    econoluzReference: "ECO-TEST-C",
  },
];

const storedQuote = (
  items: unknown,
  extra: Record<string, unknown> = {},
) => JSON.stringify({ ...extra, items });

const createStorage = (
  initial: string | null,
  throws: Partial<Record<"get" | "set" | "remove", boolean>> = {},
) => {
  let value = initial;
  const operations = { get: 0, set: 0, remove: 0 };
  const storage: StorageLike = {
    getItem(key) {
      expect(key).toBe(QUOTE_KEY);
      operations.get += 1;
      if (throws.get) {
        throw new DOMException("get blocked", "SecurityError");
      }
      return value;
    },
    setItem(key, nextValue) {
      expect(key).toBe(QUOTE_KEY);
      operations.set += 1;
      if (throws.set) {
        throw new DOMException("set blocked", "QuotaExceededError");
      }
      value = nextValue;
    },
    removeItem(key) {
      expect(key).toBe(QUOTE_KEY);
      operations.remove += 1;
      if (throws.remove) {
        throw new DOMException("remove blocked", "SecurityError");
      }
      value = null;
    },
  };

  return { storage, operations, getValue: () => value };
};

const seedSessionQuote = async (page: Page, raw: string) => {
  await page.addInitScript(
    ({ key, value }) => window.sessionStorage.setItem(key, value),
    { key: QUOTE_KEY, value: raw },
  );
};

const openProduct = async (page: Page, reference = FIRST_REFERENCE) => {
  await page.goto("/catalogo");
  const search = page.getByLabel(/Buscar en cat/i);
  await search.fill(reference);
  await search.press("Enter");
  const card = page.locator("article").filter({ hasText: `Ref. ${reference}` });
  await expect(card).toBeVisible();
  return card;
};

const readWhatsAppMessage = (href: string) =>
  new URL(href).searchParams.get("text") ?? "";

test.describe("quote persistence parser", () => {
  test("rejects malformed roots and structures instead of trusting a JSON cast", async () => {
    const persistence = await loadCatalogModule<QuotePersistenceModule>(
      "quotePersistence",
    );

    expect(persistence).not.toBeNull();

    for (const raw of [
      "{",
      "null",
      "true",
      "7",
      '"items"',
      "[]",
      "{}",
      '{"items":null}',
      '{"items":{}}',
    ]) {
      expect(persistence?.parseStoredQuoteSession(raw, testProducts)).toEqual([]);
    }
  });

  test("accepts only finite positive safe integer quantities and exact known references", async () => {
    const persistence = await loadCatalogModule<QuotePersistenceModule>(
      "quotePersistence",
    );
    expect(persistence).not.toBeNull();

    const raw = `{"items":[
      {"econoluzReference":"ECO-TEST-A","quantity":2},
      {"econoluzReference":"ECO-TEST-A","quantity":0},
      {"econoluzReference":"ECO-TEST-A","quantity":-1},
      {"econoluzReference":"ECO-TEST-A","quantity":"3"},
      {"econoluzReference":"ECO-TEST-A","quantity":null},
      {"econoluzReference":"ECO-TEST-A","quantity":1.5},
      {"econoluzReference":"ECO-TEST-A","quantity":1e999},
      {"econoluzReference":"ECO-TEST-A","quantity":9007199254740992},
      {"econoluzReference":"ECO-UNKNOWN","quantity":9},
      {"econoluzReference":" ECO-TEST-B ","quantity":4},
      null,
      "entry"
    ]}`;

    expect(persistence?.parseStoredQuoteSession(raw, testProducts)).toEqual([
      { product: testProducts[0], quantity: 2 },
    ]);
  });

  test("consolidates duplicates in first-seen order and keeps later increments that still fit", async () => {
    const persistence = await loadCatalogModule<QuotePersistenceModule>(
      "quotePersistence",
    );
    expect(persistence).not.toBeNull();

    const raw = storedQuote([
      {
        econoluzReference: "ECO-TEST-B",
        quantity: Number.MAX_SAFE_INTEGER - 2,
      },
      { econoluzReference: "ECO-TEST-B", quantity: 3 },
      { econoluzReference: "ECO-TEST-B", quantity: 2 },
      { econoluzReference: "ECO-TEST-A", quantity: 1 },
    ]);

    expect(persistence?.parseStoredQuoteSession(raw, testProducts)).toEqual([
      { product: testProducts[1], quantity: Number.MAX_SAFE_INTEGER },
    ]);
  });

  test("never lets the total across distinct products overflow", async () => {
    const persistence = await loadCatalogModule<QuotePersistenceModule>(
      "quotePersistence",
    );
    expect(persistence).not.toBeNull();

    const raw = storedQuote([
      {
        econoluzReference: "ECO-TEST-A",
        quantity: Number.MAX_SAFE_INTEGER - 1,
      },
      { econoluzReference: "ECO-TEST-B", quantity: 2 },
      { econoluzReference: "ECO-TEST-C", quantity: 1 },
    ]);

    expect(persistence?.parseStoredQuoteSession(raw, testProducts)).toEqual([
      { product: testProducts[0], quantity: Number.MAX_SAFE_INTEGER - 1 },
      { product: testProducts[2], quantity: 1 },
    ]);
  });

  test("serializes the exact legacy-compatible canonical shape without a version or extra fields", async () => {
    const persistence = await loadCatalogModule<QuotePersistenceModule>(
      "quotePersistence",
    );
    expect(persistence).not.toBeNull();

    expect(
      persistence?.serializeQuoteSession([
        { product: testProducts[1], quantity: 4 },
        { product: testProducts[0], quantity: 2 },
      ]),
    ).toBe(
      '{"items":[{"econoluzReference":"ECO-TEST-B","quantity":4},{"econoluzReference":"ECO-TEST-A","quantity":2}]}',
    );
    expect(persistence?.serializeQuoteSession([])).toBeNull();
    expect(persistence?.QUOTE_SESSION_STORAGE_KEY).toBe(QUOTE_KEY);
  });
});

test.describe("guarded canonical storage synchronization", () => {
  test("performs zero mutations for an exact existing canonical value", async () => {
    const persistence = await loadCatalogModule<QuotePersistenceModule>(
      "quotePersistence",
    );
    expect(persistence).not.toBeNull();
    const canonical = storedQuote([
      { econoluzReference: "ECO-TEST-A", quantity: 2 },
    ]);
    const fake = createStorage(canonical);

    expect(
      persistence?.syncQuoteSessionStorage(fake.storage, [
        { product: testProducts[0], quantity: 2 },
      ]),
    ).toBe("unchanged");
    expect(fake.operations).toEqual({ get: 1, set: 0, remove: 0 });
    expect(fake.getValue()).toBe(canonical);
  });

  test("sanitizes extra properties and whitespace exactly once", async () => {
    const persistence = await loadCatalogModule<QuotePersistenceModule>(
      "quotePersistence",
    );
    expect(persistence).not.toBeNull();
    const fake = createStorage(
      '{ "version": 99, "items": [ { "econoluzReference": "ECO-TEST-A", "quantity": 2, "name": "do not persist" } ] }',
    );
    const items = persistence?.restoreQuoteSession(fake.storage, testProducts) ?? [];

    expect(items).toEqual([{ product: testProducts[0], quantity: 2 }]);
    expect(persistence?.syncQuoteSessionStorage(fake.storage, items)).toBe("written");
    expect(persistence?.syncQuoteSessionStorage(fake.storage, items)).toBe("unchanged");
    expect(fake.getValue()).toBe(
      '{"items":[{"econoluzReference":"ECO-TEST-A","quantity":2}]}',
    );
    expect(fake.operations).toEqual({ get: 3, set: 1, remove: 0 });
  });

  test("removes invalid data once and leaves an absent empty selection unchanged", async () => {
    const persistence = await loadCatalogModule<QuotePersistenceModule>(
      "quotePersistence",
    );
    expect(persistence).not.toBeNull();
    const fake = createStorage('{"items":{}}');
    const items = persistence?.restoreQuoteSession(fake.storage, testProducts) ?? [];

    expect(items).toEqual([]);
    expect(persistence?.syncQuoteSessionStorage(fake.storage, items)).toBe("removed");
    expect(persistence?.syncQuoteSessionStorage(fake.storage, items)).toBe("unchanged");
    expect(fake.operations).toEqual({ get: 3, set: 0, remove: 1 });
  });

  test("guards getItem, setItem, and removeItem exceptions", async () => {
    const persistence = await loadCatalogModule<QuotePersistenceModule>(
      "quotePersistence",
    );
    expect(persistence).not.toBeNull();
    const getFailure = createStorage(null, { get: true });
    const setFailure = createStorage(null, { set: true });
    const removeFailure = createStorage("invalid", { remove: true });

    expect(persistence?.restoreQuoteSession(getFailure.storage, testProducts)).toEqual([]);
    expect(
      persistence?.syncQuoteSessionStorage(getFailure.storage, [
        { product: testProducts[0], quantity: 1 },
      ]),
    ).toBe("failed");
    expect(
      persistence?.syncQuoteSessionStorage(setFailure.storage, [
        { product: testProducts[0], quantity: 1 },
      ]),
    ).toBe("failed");
    expect(persistence?.syncQuoteSessionStorage(removeFailure.storage, [])).toBe(
      "failed",
    );
  });
});

test.describe("selection invariants", () => {
  test("add, decrease, remove, and set preserve one entry and a safe total", async () => {
    const selection = await loadCatalogModule<QuoteSelectionModule>(
      "quoteSelection",
    );
    expect(selection).not.toBeNull();

    let items: QuoteItem[] = [];
    items = selection?.reduceQuoteSelection(items, {
      type: "add",
      product: testProducts[0],
    }) ?? [];
    items = selection?.reduceQuoteSelection(items, {
      type: "add",
      product: testProducts[0],
    }) ?? [];
    expect(items).toEqual([{ product: testProducts[0], quantity: 2 }]);

    items = selection?.reduceQuoteSelection(items, {
      type: "decrease",
      econoluzReference: "ECO-TEST-A",
    }) ?? [];
    expect(items).toEqual([{ product: testProducts[0], quantity: 1 }]);

    items = selection?.reduceQuoteSelection(items, {
      type: "set",
      econoluzReference: "ECO-TEST-A",
      quantity: 0,
    }) ?? [];
    expect(items).toEqual([]);
    expect(selection?.getQuoteSelectionTotal(items)).toBe(0);
  });

  test("treats invalid updates and unsafe aggregate changes as no-ops", async () => {
    const selection = await loadCatalogModule<QuoteSelectionModule>(
      "quoteSelection",
    );
    expect(selection).not.toBeNull();
    const atLimit: QuoteItem[] = [
      { product: testProducts[0], quantity: Number.MAX_SAFE_INTEGER },
    ];

    for (const action of [
      { type: "add", product: testProducts[0] },
      {
        type: "set",
        econoluzReference: "ECO-TEST-A",
        quantity: -1,
      },
      {
        type: "set",
        econoluzReference: "ECO-TEST-A",
        quantity: 1.5,
      },
      {
        type: "set",
        econoluzReference: "ECO-TEST-A",
        quantity: Number.MAX_SAFE_INTEGER + 1,
      },
    ] as QuoteSelectionAction[]) {
      expect(selection?.reduceQuoteSelection(atLimit, action)).toBe(atLimit);
    }

    const twoProducts: QuoteItem[] = [
      { product: testProducts[0], quantity: Number.MAX_SAFE_INTEGER - 1 },
      { product: testProducts[1], quantity: 1 },
    ];
    expect(
      selection?.reduceQuoteSelection(twoProducts, {
        type: "set",
        econoluzReference: "ECO-TEST-B",
        quantity: 2,
      }),
    ).toBe(twoProducts);
    expect(
      selection?.reduceQuoteSelection(twoProducts, {
        type: "add",
        product: testProducts[2],
      }),
    ).toBe(twoProducts);
  });
});

test.describe("one public line builder and memory-only floating store", () => {
  test("builds a product line from only public name, ECONOLUZ reference, and quantity", async () => {
    const messages = await loadCatalogModule<PublicQuoteMessageModule>(
      "publicQuoteMessage",
    );
    expect(messages).not.toBeNull();
    const productWithSentinels = {
      ...testProducts[0],
      supplierCode: "PRIVATE-SUPPLIER-CODE",
      supplierBrand: "PRIVATE-SUPPLIER-BRAND",
      productCode: "PRIVATE-PRODUCT-CODE",
      price: "PRIVATE-PRICE",
      cost: "PRIVATE-COST",
      technicalSpecs: { power: "PRIVATE-SPEC" },
    };

    const line = messages?.buildPublicProductLine({
      product: productWithSentinels,
      quantity: 3,
    });

    expect(line).toBe(
      "Luminaria pública A - Ref. ECO-TEST-A - Cantidad: 3",
    );
    expect(line).not.toMatch(/PRIVATE-/);
  });

  test("publishes only meaningful selection changes and keeps a constant server snapshot", async () => {
    const store = await loadCatalogModule<FloatingQuoteStoreModule>(
      "floatingQuoteStore",
    );
    expect(store).not.toBeNull();
    if (!store) {
      return;
    }

    store.publishFloatingQuoteSelection([]);
    const notifications: string[] = [];
    const unsubscribe = store.subscribeToFloatingQuote(() => {
      notifications.push(store.getFloatingQuoteSnapshot());
    });

    const initialServerSnapshot = store.getFloatingQuoteServerSnapshot();
    expect(store.getFloatingQuoteSnapshot()).toBe(
      store.DEFAULT_FLOATING_QUOTE_SNAPSHOT,
    );
    expect(
      store.publishFloatingQuoteSelection([
        { product: testProducts[0], quantity: 1 },
      ]),
    ).toBe(true);
    expect(
      store.publishFloatingQuoteSelection([
        { product: testProducts[0], quantity: 1 },
      ]),
    ).toBe(false);
    expect(
      store.publishFloatingQuoteSelection([
        { product: testProducts[0], quantity: 2 },
      ]),
    ).toBe(true);
    expect(store.getFloatingQuoteServerSnapshot()).toBe(initialServerSnapshot);
    expect(notifications).toHaveLength(2);

    expect(store.publishFloatingQuoteSelection([])).toBe(true);
    expect(store.getFloatingQuoteSnapshot()).toBe(initialServerSnapshot);
    expect(notifications).toHaveLength(3);
    unsubscribe();
  });
});

test.describe("browser quote integration", () => {
  test("rejects JSON null without a page error and removes it once", async ({ page }) => {
    await seedSessionQuote(page, "null");
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto("/catalogo");
    await expect(page.getByRole("heading", { name: /tipo de producto buscas/i })).toBeVisible();
    await expect
      .poll(() => page.evaluate((key) => sessionStorage.getItem(key), QUOTE_KEY))
      .toBeNull();
    expect(pageErrors).toEqual([]);
  });

  test("rejects an object-valued items property without a page error", async ({ page }) => {
    await seedSessionQuote(page, '{"items":{}}');
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto("/catalogo");
    await expect(page.getByRole("heading", { name: /tipo de producto buscas/i })).toBeVisible();
    await expect
      .poll(() => page.evaluate((key) => sessionStorage.getItem(key), QUOTE_KEY))
      .toBeNull();
    expect(pageErrors).toEqual([]);
  });

  test("restores, consolidates, sanitizes, and retains the canonical selection on reload", async ({
    page,
  }) => {
    await seedSessionQuote(
      page,
      '{ "extra": true, "items": [ { "econoluzReference": "ECO-IND-0048", "quantity": 2 }, { "econoluzReference": "ECO-IND-0048", "quantity": 3 }, { "econoluzReference": "ECO-REMOVED", "quantity": 8 } ] }',
    );
    await page.goto("/catalogo");

    await expect(page.getByRole("button", { name: /Ver selecci/i })).toContainText("5");
    const canonical =
      '{"items":[{"econoluzReference":"ECO-IND-0048","quantity":5}]}';
    await expect
      .poll(() => page.evaluate((key) => sessionStorage.getItem(key), QUOTE_KEY))
      .toBe(canonical);

    await page.reload();
    await expect(page.getByRole("button", { name: /Ver selecci/i })).toContainText("5");
    expect(await page.evaluate((key) => sessionStorage.getItem(key), QUOTE_KEY)).toBe(
      canonical,
    );
  });

  test("keeps session selection in its BrowserContext only", async ({ browser }) => {
    const firstContext = await browser.newContext();
    const firstPage = await firstContext.newPage();
    await firstPage.goto("/catalogo");
    const firstCard = await openProduct(firstPage);
    await firstCard.getByRole("button", { name: "Agregar", exact: true }).click();
    await expect(firstPage.getByRole("button", { name: /Ver selecci/i })).toContainText("1");
    await expect
      .poll(() => firstPage.evaluate((key) => sessionStorage.getItem(key), QUOTE_KEY))
      .not.toBeNull();

    const secondContext = await browser.newContext();
    const secondPage = await secondContext.newPage();
    await secondPage.goto("/catalogo");
    await expect(secondPage.getByRole("button", { name: /Ver selecci/i })).toHaveCount(0);

    await firstContext.close();
    await secondContext.close();
  });

  test("guards a sessionStorage getItem failure and keeps the catalog usable", async ({ page }) => {
    await page.addInitScript((key) => {
      const originalGetItem = Storage.prototype.getItem;
      Storage.prototype.getItem = function getItem(storageKey: string) {
        if (this === window.sessionStorage && storageKey === key) {
          throw new DOMException("blocked", "SecurityError");
        }
        return originalGetItem.call(this, storageKey);
      };
    }, QUOTE_KEY);
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    const card = await openProduct(page);
    await card.getByRole("button", { name: "Agregar", exact: true }).click();
    await expect(page.getByRole("button", { name: /Ver selecci/i })).toContainText("1");
    expect(pageErrors).toEqual([]);
  });

  test("guards the window.sessionStorage getter itself and keeps in-memory controls usable", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "sessionStorage", {
        configurable: true,
        get() {
          throw new DOMException("storage getter blocked", "SecurityError");
        },
      });
    });
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    const card = await openProduct(page);
    await card.getByRole("button", { name: "Agregar", exact: true }).click();
    await expect(page.getByRole("button", { name: /Ver selecci/i })).toContainText("1");
    expect(pageErrors).toEqual([]);
  });

  for (const failedOperation of ["set", "remove"] as const) {
    test(`guards a sessionStorage ${failedOperation}Item failure without losing in-memory controls`, async ({
      page,
    }) => {
      if (failedOperation === "remove") {
        await seedSessionQuote(
          page,
          storedQuote([{ econoluzReference: FIRST_REFERENCE, quantity: 1 }]),
        );
      }
      await page.addInitScript(
        ({ key, operation }) => {
          const method = operation === "set" ? "setItem" : "removeItem";
          const original = Storage.prototype[method];
          Object.defineProperty(Storage.prototype, method, {
            configurable: true,
            value(this: Storage, storageKey: string, value?: string) {
              if (this === window.sessionStorage && storageKey === key) {
                throw new DOMException("blocked", "SecurityError");
              }
              if (method === "setItem") {
                return (original as Storage["setItem"]).call(
                  this,
                  storageKey,
                  value ?? "",
                );
              }
              return (original as Storage["removeItem"]).call(this, storageKey);
            },
          });
        },
        { key: QUOTE_KEY, operation: failedOperation },
      );
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));

      if (failedOperation === "set") {
        const card = await openProduct(page);
        await card.getByRole("button", { name: "Agregar", exact: true }).click();
        await expect(page.getByRole("button", { name: /Ver selecci/i })).toContainText("1");
      } else {
        await page.goto("/catalogo");
        await expect(page.getByRole("button", { name: /Ver selecci/i })).toContainText("1");
        await page.getByRole("button", { name: /Ver selecci/i }).click();
        await page.locator("aside").getByRole("button", { name: "Quitar", exact: true }).click();
        await expect(page.getByRole("button", { name: /Ver selecci/i })).toHaveCount(0);
      }

      expect(pageErrors).toEqual([]);
    });
  }

  test("does not write a legacy context or emit its event while form fields change", async ({
    page,
  }) => {
    await page.addInitScript(
      ({ contextKey, eventName }) => {
        const counters = { get: 0, set: 0, remove: 0, events: 0 };
        const originalGetItem = Storage.prototype.getItem;
        const originalSetItem = Storage.prototype.setItem;
        const originalRemoveItem = Storage.prototype.removeItem;
        Storage.prototype.getItem = function getItem(key: string) {
          if (this === window.localStorage && key === contextKey) {
            counters.get += 1;
          }
          return originalGetItem.call(this, key);
        };
        Storage.prototype.setItem = function setItem(key: string, value: string) {
          if (this === window.localStorage && key === contextKey) {
            counters.set += 1;
          }
          return originalSetItem.call(this, key, value);
        };
        Storage.prototype.removeItem = function removeItem(key: string) {
          if (this === window.localStorage && key === contextKey) {
            counters.remove += 1;
          }
          return originalRemoveItem.call(this, key);
        };
        window.addEventListener(eventName, () => {
          counters.events += 1;
        });
        (
          window as typeof window & {
            __task4LegacyCounters?: typeof counters;
          }
        ).__task4LegacyCounters = counters;
      },
      { contextKey: LEGACY_CONTEXT_KEY, eventName: LEGACY_EVENT },
    );
    await page.goto("/catalogo");
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              window as typeof window & {
                __task4LegacyCounters?: { get: number };
              }
            ).__task4LegacyCounters?.get,
        ),
      )
      .toBe(1);
    await page.evaluate(() => {
      const counters = (
        window as typeof window & {
          __task4LegacyCounters?: {
            get: number;
            set: number;
            remove: number;
            events: number;
          };
        }
      ).__task4LegacyCounters;
      if (counters) {
        counters.get = 0;
        counters.set = 0;
        counters.remove = 0;
        counters.events = 0;
      }
    });

    await page.getByLabel("Nombre completo").fill("Persona de prueba");
    await page.getByLabel(/Tel.fono/i).fill("5555 5555");
    await page.getByLabel("Email").fill("persona@example.com");
    await page.getByLabel("Mensaje adicional").fill("Texto que no debe persistirse");
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );

    expect(
      await page.evaluate(
        () =>
          (
            window as typeof window & {
              __task4LegacyCounters?: {
                get: number;
                set: number;
                remove: number;
                events: number;
              };
            }
          ).__task4LegacyCounters,
      ),
    ).toEqual({ get: 0, set: 0, remove: 0, events: 0 });
    expect(
      await page.evaluate((key) => localStorage.getItem(key), LEGACY_CONTEXT_KEY),
    ).toBeNull();
  });

  for (const route of ["/", "/catalogo"] as const) {
    test(`cleans legacy PII once when FloatingWhatsApp mounts directly at ${route}`, async ({
      page,
    }) => {
      await page.addInitScript((key) => {
        window.localStorage.setItem(
          key,
          JSON.stringify({ clientName: "PII LEGACY", products: ["dato antiguo"] }),
        );
        const originalRemoveItem = Storage.prototype.removeItem;
        let removes = 0;
        Storage.prototype.removeItem = function removeItem(storageKey: string) {
          if (this === window.localStorage && storageKey === key) {
            removes += 1;
          }
          return originalRemoveItem.call(this, storageKey);
        };
        (
          window as typeof window & { __task4LegacyRemoves?: () => number }
        ).__task4LegacyRemoves = () => removes;
      }, LEGACY_CONTEXT_KEY);

      await page.goto(route);
      await expect
        .poll(() => page.evaluate((key) => localStorage.getItem(key), LEGACY_CONTEXT_KEY))
        .toBeNull();
      expect(
        await page.evaluate(
          () =>
            (
              window as typeof window & { __task4LegacyRemoves?: () => number }
            ).__task4LegacyRemoves?.(),
        ),
      ).toBe(1);
    });
  }

  test("updates FloatingWhatsApp only for meaningful selection changes", async ({ page }) => {
    const card = await openProduct(page);
    const floating = page.getByRole("link", { name: "Contactar por WhatsApp" });
    const defaultHref = await floating.getAttribute("href");

    await card.getByRole("button", { name: "Agregar", exact: true }).click();
    await expect(floating).not.toHaveAttribute("href", defaultHref ?? "");
    const oneItemHref = await floating.getAttribute("href");
    expect(readWhatsAppMessage(oneItemHref ?? "")).toContain(
      "Luminaria alto montaje - Ref. ECO-IND-0048 - Cantidad: 1",
    );

    await page.getByLabel("Nombre completo").fill("No cambia el flotante");
    await page.getByLabel("Mensaje adicional").fill("Tampoco cambia el flotante");
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    expect(await floating.getAttribute("href")).toBe(oneItemHref);

    await card.getByRole("button", { name: /Agregar una unidad/i }).click();
    await expect(floating).not.toHaveAttribute("href", oneItemHref ?? "");
    const twoItemHref = await floating.getAttribute("href");
    expect(readWhatsAppMessage(twoItemHref ?? "")).toContain("Cantidad: 2");

    await card.getByRole("button", { name: /Quitar una unidad/i }).click();
    await card.getByRole("button", { name: /Quitar una unidad/i }).click();
    await expect(floating).toHaveAttribute("href", defaultHref ?? "");
  });

  test("never publishes the default snapshot before restoring after soft navigation", async ({
    page,
  }) => {
    const card = await openProduct(page);
    const floating = page.getByRole("link", { name: "Contactar por WhatsApp" });
    const defaultHref = await floating.getAttribute("href");
    await card.getByRole("button", { name: "Agregar", exact: true }).click();
    const selectedHref = await floating.getAttribute("href");
    await expect
      .poll(() => page.evaluate((key) => sessionStorage.getItem(key), QUOTE_KEY))
      .not.toBeNull();

    await page.getByRole("link", { name: "ECONOLUZ GT inicio" }).click();
    await expect(page).toHaveURL(/\/#inicio$/);
    expect(await floating.getAttribute("href")).toBe(selectedHref);
    await page.evaluate(() => {
      const hrefs: string[] = [];
      const link = document.querySelector<HTMLAnchorElement>(
        'a[aria-label="Contactar por WhatsApp"]',
      );
      if (link) {
        hrefs.push(link.href);
        new MutationObserver(() => hrefs.push(link.href)).observe(link, {
          attributes: true,
          attributeFilter: ["href"],
        });
      }
      (
        window as typeof window & { __task4FloatingHrefs?: string[] }
      ).__task4FloatingHrefs = hrefs;
    });

    await page.locator("nav").getByRole("link", { name: "Catálogo" }).click();
    await expect(page.getByRole("button", { name: /Ver selecci/i })).toContainText("1");
    const observedHrefs = await page.evaluate(
      () =>
        (window as typeof window & { __task4FloatingHrefs?: string[] })
          .__task4FloatingHrefs ?? [],
    );
    expect(observedHrefs).not.toContain(defaultHref);
    expect(await floating.getAttribute("href")).toBe(selectedHref);
  });

  test("rebuilds the floating selection after a hard catalog reload", async ({ page }) => {
    await seedSessionQuote(
      page,
      storedQuote([{ econoluzReference: FIRST_REFERENCE, quantity: 2 }]),
    );
    await page.goto("/catalogo");
    const floating = page.getByRole("link", { name: "Contactar por WhatsApp" });
    await expect
      .poll(async () => readWhatsAppMessage((await floating.getAttribute("href")) ?? ""))
      .toContain("Luminaria alto montaje - Ref. ECO-IND-0048 - Cantidad: 2");

    await page.reload();
    await expect
      .poll(async () => readWhatsAppMessage((await floating.getAttribute("href")) ?? ""))
      .toContain("Luminaria alto montaje - Ref. ECO-IND-0048 - Cantidad: 2");
  });

  test("uses the same safe public line in WhatsApp, the floating link, and the lead payload", async ({
    page,
  }) => {
    await page.route("**/api/leads", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' }),
    );
    const card = await openProduct(page);
    const publicName = (await card.getByRole("heading").textContent())?.trim() ?? "";
    await card.getByRole("button", { name: "Agregar", exact: true }).click();
    await page.getByLabel("Nombre completo").fill("Persona de prueba");
    await page.getByLabel(/Tel.fono/i).fill("5555 5555");
    await page.getByLabel("Email").fill("persona@example.com");
    const exactLine = `${publicName} - Ref. ${FIRST_REFERENCE} - Cantidad: 1`;
    const floatingMessage = readWhatsAppMessage(
      (await page
        .getByRole("link", { name: "Contactar por WhatsApp" })
        .getAttribute("href")) ?? "",
    );
    const submitLink = page.getByRole("link", {
      name: "Enviar información por WhatsApp",
    });
    const mainMessage = readWhatsAppMessage((await submitLink.getAttribute("href")) ?? "");

    await page.evaluate(() => {
      document.addEventListener(
        "click",
        (event) => {
          const target = event.target as HTMLElement | null;
          if (target?.closest("a")?.textContent?.includes("Enviar información")) {
            event.preventDefault();
          }
        },
        { capture: true, once: true },
      );
    });
    const requestPromise = page.waitForRequest(
      (request) =>
        request.url().endsWith("/api/leads") && request.method() === "POST",
    );
    await submitLink.click();
    const leadRequest = await requestPromise;
    const payload = leadRequest.postDataJSON() as { products?: unknown };

    expect(floatingMessage).toContain(exactLine);
    expect(mainMessage).toContain(exactLine);
    expect(payload.products).toEqual([exactLine]);
    for (const publicOutput of [
      floatingMessage,
      mainMessage,
      JSON.stringify(payload.products),
    ]) {
      expect(publicOutput).not.toMatch(
        /supplierCode|supplierBrand|productCode|\bsku\b|precio|coste|discount|inventory|stock/i,
      );
    }
  });

  test("discloses temporary tab storage and no payment in the quote drawer", async ({ page }) => {
    const card = await openProduct(page);
    await card.getByRole("button", { name: "Agregar", exact: true }).click();
    await page.getByRole("button", { name: /Ver selecci/i }).click();

    await expect(
      page.getByText(
        "La selección se guarda temporalmente en esta pestaña durante la sesión. No se procesa ningún pago.",
        { exact: true },
      ),
    ).toBeVisible();
  });

  test("preserves the existing LED-results beforeunload lifecycle", async ({ page }) => {
    const ledValue = JSON.stringify({ summary: "Resumen LED vigente" });
    await page.goto("/catalogo");
    await expect(page.getByRole("heading", { name: /tipo de producto buscas/i })).toBeVisible();
    await page.evaluate(
      ({ key, value }) => localStorage.setItem(key, value),
      { key: "econoluz_led_results", value: ledValue },
    );
    expect(
      await page.evaluate(() => localStorage.getItem("econoluz_led_results")),
    ).toBe(ledValue);

    await page.reload();
    expect(
      await page.evaluate(() => localStorage.getItem("econoluz_led_results")),
    ).toBeNull();
  });
});
