import { expect, test, type Page } from "@playwright/test";

const rootHeading = (page: Page) =>
  page.getByRole("heading", { name: /tipo de producto buscas/i });
const searchInput = (page: Page) => page.getByLabel(/Buscar en cat/i);

const openArchitecturalApplications = async (page: Page) => {
  await page
    .getByRole("button", { name: /Iluminaci.n arquitect.nica/i })
    .click();
  await expect(page.getByRole("button", { name: /Downlights/i })).toBeVisible();
};

const openDownlights = async (page: Page) => {
  await openArchitecturalApplications(page);
  await page.getByRole("button", { name: /Downlights/i }).click();
  await expect(page.getByRole("heading", { name: "Downlights" })).toBeVisible();
};

const browserBack = async (page: Page) => {
  await page.evaluate(() => window.history.back());
};

const browserForward = async (page: Page) => {
  await page.evaluate(() => window.history.forward());
};

test.beforeEach(async ({ page }) => {
  await page.goto("/catalogo");
  await expect(rootHeading(page)).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            (window.history.state as Record<string, unknown>)
              ?.econoluzCatalog as Record<string, unknown> | undefined
          )?.version,
      ),
    )
    .toBe(1);
});

test("keeps guided traversal category to application to products and Volver uses two real history entries", async ({
  page,
}) => {
  const initialHistoryLength = await page.evaluate(() => window.history.length);

  await openDownlights(page);
  expect(await page.evaluate(() => window.history.length)).toBe(
    initialHistoryLength + 2,
  );

  await page.getByRole("button", { name: "Volver", exact: true }).click();
  await expect(page.getByRole("button", { name: /Downlights/i })).toBeVisible();

  await page.getByRole("button", { name: "Volver", exact: true }).click();
  await expect(rootHeading(page)).toBeVisible();
});

test("browser Back and Forward restore legal guided states and preserve Next history fields", async ({
  page,
}) => {
  await page.evaluate(() => {
    window.history.replaceState(
      {
        ...(window.history.state as Record<string, unknown>),
        __PRIVATE_NEXTJS_INTERNALS_TASK3_SENTINEL: {
          retained: true,
        },
      },
      "",
      window.location.href,
    );
  });

  await openDownlights(page);
  expect(
    await page.evaluate(
      () =>
        (window.history.state as Record<string, unknown>)
          .__PRIVATE_NEXTJS_INTERNALS_TASK3_SENTINEL,
    ),
  ).toEqual({ retained: true });

  await browserBack(page);
  await expect(page.getByRole("button", { name: /Downlights/i })).toBeVisible();
  await browserBack(page);
  await expect(rootHeading(page)).toBeVisible();
  await browserForward(page);
  await expect(page.getByRole("button", { name: /Downlights/i })).toBeVisible();
  await browserForward(page);
  await expect(page.getByRole("heading", { name: "Downlights" })).toBeVisible();
});

test("native Back normalizes every malformed history shape and Forward restores the valid non-root entry", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(rootHeading(page)).toBeVisible();

  const validMetadata = {
    version: 1,
    sessionId: "task-3-test",
    depth: 1,
  };
  const rootReturnTo = {
    view: "categories",
    category: null,
    application: null,
    search: "",
    page: 1,
  };
  const invalidStates: { name: string; state: unknown }[] = [
    { name: "missing envelope", state: { unrelated: true } },
    { name: "envelope null", state: { econoluzCatalog: null } },
    { name: "envelope array", state: { econoluzCatalog: [] } },
    { name: "envelope scalar", state: { econoluzCatalog: "invalid" } },
    {
      name: "wrong version",
      state: {
        econoluzCatalog: {
          ...validMetadata,
          version: 2,
          ...rootReturnTo,
        },
      },
    },
    {
      name: "empty session",
      state: {
        econoluzCatalog: {
          ...validMetadata,
          sessionId: "",
          ...rootReturnTo,
        },
      },
    },
    {
      name: "non-string session",
      state: {
        econoluzCatalog: {
          ...validMetadata,
          sessionId: 7,
          ...rootReturnTo,
        },
      },
    },
    {
      name: "overlong session",
      state: {
        econoluzCatalog: {
          ...validMetadata,
          sessionId: "s".repeat(129),
          ...rootReturnTo,
        },
      },
    },
    {
      name: "fractional depth",
      state: {
        econoluzCatalog: {
          ...validMetadata,
          depth: 1.5,
          ...rootReturnTo,
        },
      },
    },
    {
      name: "non-numeric depth",
      state: {
        econoluzCatalog: {
          ...validMetadata,
          depth: "1",
          ...rootReturnTo,
        },
      },
    },
    {
      name: "negative depth",
      state: {
        econoluzCatalog: {
          ...validMetadata,
          depth: -1,
          ...rootReturnTo,
        },
      },
    },
    {
      name: "excessive depth",
      state: {
        econoluzCatalog: {
          ...validMetadata,
          depth: 10_001,
          ...rootReturnTo,
        },
      },
    },
    {
      name: "prototype category",
      state: {
        econoluzCatalog: {
          ...validMetadata,
          view: "applications",
          category: "toString",
          application: null,
          search: "",
          page: 1,
        },
      },
    },
    {
      name: "unknown category",
      state: {
        econoluzCatalog: {
          ...validMetadata,
          view: "applications",
          category: "categoria_desconocida",
          application: null,
          search: "",
          page: 1,
        },
      },
    },
    {
      name: "cross-category application",
      state: {
        econoluzCatalog: {
          ...validMetadata,
          view: "products",
          category: "iluminacion_arquitectonica",
          application: "wallpacks",
          search: "",
          page: 1,
        },
      },
    },
    {
      name: "contradictory all-products category",
      state: {
        econoluzCatalog: {
          ...validMetadata,
          view: "all",
          category: "iluminacion_exterior",
          application: null,
          search: "",
          page: 1,
        },
      },
    },
    {
      name: "non-numeric page",
      state: {
        econoluzCatalog: {
          ...validMetadata,
          view: "all",
          category: null,
          application: null,
          search: "",
          page: "2",
        },
      },
    },
    {
      name: "out-of-range page",
      state: {
        econoluzCatalog: {
          ...validMetadata,
          view: "all",
          category: null,
          application: null,
          search: "",
          page: 999,
        },
      },
    },
    {
      name: "whitespace search",
      state: {
        econoluzCatalog: {
          ...validMetadata,
          view: "search",
          category: null,
          application: null,
          search: "   ",
          page: 1,
          returnTo: rootReturnTo,
        },
      },
    },
    {
      name: "non-string search",
      state: {
        econoluzCatalog: {
          ...validMetadata,
          view: "search",
          category: null,
          application: null,
          search: ["ECO"],
          page: 1,
          returnTo: rootReturnTo,
        },
      },
    },
    {
      name: "overlong search",
      state: {
        econoluzCatalog: {
          ...validMetadata,
          view: "search",
          category: null,
          application: null,
          search: "x".repeat(121),
          page: 1,
          returnTo: rootReturnTo,
        },
      },
    },
    {
      name: "search page out of range",
      state: {
        econoluzCatalog: {
          ...validMetadata,
          view: "search",
          category: null,
          application: null,
          search: "ECO",
          page: 999,
          returnTo: rootReturnTo,
        },
      },
    },
    {
      name: "nested search returnTo",
      state: {
        econoluzCatalog: {
          ...validMetadata,
          view: "search",
          category: null,
          application: null,
          search: "ECO",
          page: 1,
          returnTo: {
            view: "search",
            category: null,
            application: null,
            search: "ECO",
            page: 1,
            returnTo: rootReturnTo,
          },
        },
      },
    },
    {
      name: "null returnTo",
      state: {
        econoluzCatalog: {
          ...validMetadata,
          view: "search",
          category: null,
          application: null,
          search: "ECO",
          page: 1,
          returnTo: null,
        },
      },
    },
    {
      name: "invalid returnTo page",
      state: {
        econoluzCatalog: {
          ...validMetadata,
          view: "search",
          category: null,
          application: null,
          search: "ECO",
          page: 1,
          returnTo: {
            view: "all",
            category: null,
            application: null,
            search: "",
            page: 999,
          },
        },
      },
    },
  ];

  for (const [index, invalidState] of invalidStates.entries()) {
    await test.step(invalidState.name, async () => {
      await page.evaluate(
        ({ index: invalidIndex, state }) => {
          const nextState = {
            ...(window.history.state as Record<string, unknown>),
            ...(state as Record<string, unknown>),
          };

          delete nextState.econoluzCatalog;
          if (
            state &&
            typeof state === "object" &&
            "econoluzCatalog" in state
          ) {
            nextState.econoluzCatalog = (
              state as Record<string, unknown>
            ).econoluzCatalog;
          }

          window.history.pushState(
            nextState,
            "",
            `/catalogo?invalid=${invalidIndex}`,
          );
        },
        { index, state: invalidState.state },
      );

      await page
        .getByRole("button", { name: /Iluminaci.n arquitect.nica/i })
        .click();
      await expect(page.getByRole("button", { name: /Downlights/i })).toBeVisible();

      await browserBack(page);
      await expect(rootHeading(page)).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (
                (window.history.state as Record<string, unknown>)
                  .econoluzCatalog as Record<string, unknown>
              ).view,
          ),
        )
        .toBe("categories");

      await browserForward(page);
      await expect(page.getByRole("button", { name: /Downlights/i })).toBeVisible();
      await page.getByRole("button", { name: "Volver", exact: true }).click();
      await expect(rootHeading(page)).toBeVisible();
    });
  }
});

test("reload restores a valid non-root catalog entry", async ({ page }) => {
  await openDownlights(page);
  await page.reload();

  await expect(page.getByRole("heading", { name: "Downlights" })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            (window.history.state as Record<string, unknown>)
              .econoluzCatalog as Record<string, unknown>
          ).view,
      ),
    )
    .toBe("products");
});

test("Volver at internal depth zero replaces with the validated logical parent", async ({
  page,
}) => {
  const historyLength = await page.evaluate(() => window.history.length);
  await page.evaluate(() => {
    window.history.replaceState(
      {
        ...(window.history.state as Record<string, unknown>),
        econoluzCatalog: {
          version: 1,
          sessionId: "depth-zero-test",
          depth: 0,
          view: "products",
          category: "iluminacion_arquitectonica",
          application: "downlights",
          search: "",
          page: 1,
        },
      },
      "",
      window.location.href,
    );
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Downlights" })).toBeVisible();

  await page.getByRole("button", { name: "Volver", exact: true }).click();
  await expect(page.getByRole("button", { name: /Downlights/i })).toBeVisible();
  expect(await page.evaluate(() => window.history.length)).toBe(historyLength);
  expect(
    await page.evaluate(
      () =>
        (
          (window.history.state as Record<string, unknown>)
            .econoluzCatalog as Record<string, unknown>
        ).depth,
    ),
  ).toBe(0);
});

test("a popstate during animation cancels stale work and never leaves catalog controls locked", async ({
  page,
}) => {
  await page.clock.install();
  const category = page.getByRole("button", {
    name: /Iluminaci.n arquitect.nica/i,
  });

  await category.click();
  await browserBack(page);
  await expect(rootHeading(page)).toBeVisible();
  await page.clock.fastForward(181);
  await expect(rootHeading(page)).toBeVisible();
  await expect(category).toBeEnabled();
});

test("rapid category and navbar reset clicks keep only the newest legal state", async ({
  page,
}) => {
  await page.clock.install();
  const initialHistoryLength = await page.evaluate(() => window.history.length);

  await page.evaluate(() => {
    const category = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Iluminación arquitectónica"),
    );
    const catalogLink = document.querySelector<HTMLAnchorElement>(
      'nav a[href="/catalogo"]',
    );

    category?.click();
    catalogLink?.click();
  });

  await page.clock.fastForward(181);
  await expect(rootHeading(page)).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            (window.history.state as Record<string, unknown>)
              .econoluzCatalog as Record<string, unknown>
          ).view,
      ),
    )
    .toBe("categories");
  expect(await page.evaluate(() => window.history.length)).toBe(
    initialHistoryLength + 2,
  );

  await browserBack(page);
  await expect(page.getByRole("button", { name: /Downlights/i })).toBeVisible();
});

for (const resetArea of ["nav", "footer"] as const) {
  test(`a repeated ${resetArea} reset reconciles pending root history with the rendered product view`, async ({
    page,
  }) => {
    await openDownlights(page);
    await searchInput(page).fill("borrador antes del reset repetido");
    await page.clock.install();
    const initialHistoryLength = await page.evaluate(() => window.history.length);

    await page.evaluate((area) => {
      const rootButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent?.trim() === "Inicio del catálogo",
      );
      const resetLink = document.querySelector<HTMLAnchorElement>(
        `${area} a[href="/catalogo"]`,
      );

      rootButton?.click();
      resetLink?.click();
    }, resetArea);
    await page.clock.fastForward(181);

    await expect(rootHeading(page)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Iluminaci.n arquitect.nica/i }),
    ).toBeEnabled();
    await expect(searchInput(page)).toHaveValue("");
    expect(
      await page.evaluate(
        () =>
          (
            (window.history.state as Record<string, unknown>)
              .econoluzCatalog as Record<string, unknown>
          ).view,
      ),
    ).toBe("categories");
    expect(await page.evaluate(() => window.history.length)).toBe(
      initialHistoryLength + 1,
    );
  });
}

test("navbar and footer Catalogo links share a predictable root reset with reversible history", async ({
  page,
}) => {
  await openDownlights(page);
  await page.locator("nav").getByRole("link", { name: "Catálogo" }).click();
  await expect(rootHeading(page)).toBeVisible();

  await browserBack(page);
  await expect(page.getByRole("heading", { name: "Downlights" })).toBeVisible();
  await browserForward(page);
  await expect(rootHeading(page)).toBeVisible();

  await openDownlights(page);
  await page.locator("footer").getByRole("link", { name: "Catálogo" }).click();
  await expect(rootHeading(page)).toBeVisible();
});

test("guided navigation and navbar/footer reset discard unsubmitted search drafts", async ({
  page,
}) => {
  await searchInput(page).fill("borrador en raíz antes de navbar");
  await page.locator("nav").getByRole("link", { name: "Catálogo" }).click();
  await expect(searchInput(page)).toHaveValue("");

  await searchInput(page).fill("borrador en raíz antes de footer");
  await page.locator("footer").getByRole("link", { name: "Catálogo" }).click();
  await expect(searchInput(page)).toHaveValue("");

  await searchInput(page).fill("borrador sin enviar");
  await openArchitecturalApplications(page);
  await expect(searchInput(page)).toHaveValue("");

  await searchInput(page).fill("otro borrador");
  await page.getByRole("button", { name: /Downlights/i }).click();
  await expect(page.getByRole("heading", { name: "Downlights" })).toBeVisible();
  await expect(searchInput(page)).toHaveValue("");

  await searchInput(page).fill("borrador antes de navbar");
  await page.locator("nav").getByRole("link", { name: "Catálogo" }).click();
  await expect(rootHeading(page)).toBeVisible();
  await expect(searchInput(page)).toHaveValue("");

  await openArchitecturalApplications(page);
  await searchInput(page).fill("borrador antes de footer");
  await page.locator("footer").getByRole("link", { name: "Catálogo" }).click();
  await expect(rootHeading(page)).toBeVisible();
  await expect(searchInput(page)).toHaveValue("");
});

test("initial history normalization does not erase a search draft entered before passive effects", async ({
  page,
}) => {
  await page.goto("/catalogo", { waitUntil: "commit" });
  await page.evaluate(
    (draft) =>
      new Promise<void>((resolve) => {
        const seedDraft = () => {
          const input = document.querySelector<HTMLInputElement>(
            'input[placeholder^="Busca por nombre"]',
          );

          if (!input) {
            return false;
          }

          input.value = draft;
          observer.disconnect();
          resolve();
          return true;
        };
        const observer = new MutationObserver(seedDraft);

        observer.observe(document, { childList: true, subtree: true });
        seedDraft();
      }),
    "ECO-IND-0048",
  );
  await page.waitForLoadState("load");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            (window.history.state as Record<string, unknown>)
              ?.econoluzCatalog as Record<string, unknown> | undefined
          )?.version,
      ),
    )
    .toBe(1);

  await expect(searchInput(page)).toHaveValue("ECO-IND-0048");
  await searchInput(page).press("Enter");
  await expect(page.getByText("Ref. ECO-IND-0048", { exact: true })).toBeVisible();
});

test("modified and non-primary catalog links preserve native navbar/footer behavior", async ({
  page,
}) => {
  await openDownlights(page);

  for (const click of [
    { area: "nav", ctrlKey: true },
    { area: "nav", metaKey: true },
    { area: "footer", shiftKey: true },
    { area: "footer", button: 1 },
  ] as const) {
    const observation = await page.evaluate((clickOptions) => {
      const link = document.querySelector<HTMLAnchorElement>(
        `${clickOptions.area} a[href="/catalogo"]`,
      );

      if (!link) {
        throw new Error(`Missing ${clickOptions.area} catalog link`);
      }

      return new Promise<{ defaultPreventedByApp: boolean; view: unknown }>(
        (resolve) => {
          window.addEventListener(
            "click",
            (event) => {
              const defaultPreventedByApp = event.defaultPrevented;
              event.preventDefault();
              resolve({
                defaultPreventedByApp,
                view: (
                  (window.history.state as Record<string, unknown>)
                    .econoluzCatalog as Record<string, unknown>
                ).view,
              });
            },
            { once: true },
          );

          link.dispatchEvent(
            new MouseEvent("click", {
              bubbles: true,
              cancelable: true,
              button: clickOptions.button ?? 0,
              ctrlKey: clickOptions.ctrlKey ?? false,
              metaKey: clickOptions.metaKey ?? false,
              shiftKey: clickOptions.shiftKey ?? false,
            }),
          );
        },
      );
    }, click);

    expect(observation).toEqual({
      defaultPreventedByApp: false,
      view: "products",
    });
  }
});

test("the old asesoria-proyecto link still offers a way to the advisory page", async ({
  page,
}) => {
  // El formulario vivía aquí bajo ese ancla y ahora tiene página propia. El
  // enlace antiguo ya no lleva a un formulario, pero el catálogo enseña el
  // acceso, así que nadie se queda sin saber por dónde pedir cotización.
  await page.goto("/catalogo#asesoria-proyecto");

  await expect(rootHeading(page)).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Pedir cotizaci.n con asesor/i }),
  ).toBeVisible();
});

test("search is a pushed global result state and clear returns to its deliberate prior stage", async ({
  page,
}) => {
  await openArchitecturalApplications(page);
  await searchInput(page).fill("ECO-IND-0048");
  await searchInput(page).press("Enter");

  await expect(
    page.getByRole("heading", { name: /Resultados de b/i }),
  ).toBeVisible();
  await expect(
    page.getByText("Ref. ECO-IND-0048", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: /Limpiar b/i }).click();
  await expect(page.getByRole("button", { name: /Downlights/i })).toBeVisible();
  await expect(searchInput(page)).toHaveValue("");

  await browserBack(page);
  await expect(
    page.getByRole("heading", { name: /Resultados de b/i }),
  ).toBeVisible();
  await expect(searchInput(page)).toHaveValue("ECO-IND-0048");
  await searchInput(page).fill("borrador posterior a la búsqueda");
  await browserForward(page);
  await expect(page.getByRole("button", { name: /Downlights/i })).toBeVisible();
  await expect(searchInput(page)).toHaveValue("");
  await browserBack(page);
  await expect(
    page.getByRole("heading", { name: /Resultados de b/i }),
  ).toBeVisible();
  await expect(searchInput(page)).toHaveValue("ECO-IND-0048");
});

test("search submitted during category animation returns to the committed application stage", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: /Iluminaci.n arquitect.nica/i })
    .click();
  await searchInput(page).fill("ECO-IND-0048");
  await searchInput(page).press("Enter");
  await expect(
    page.getByRole("heading", { name: /Resultados de b/i }),
  ).toBeVisible();

  await page.getByRole("button", { name: /Limpiar b/i }).click();
  await expect(page.getByRole("button", { name: /Downlights/i })).toBeVisible();
});

test("a stale clear control cannot override a newer committed root transition", async ({
  page,
}) => {
  await openArchitecturalApplications(page);
  await searchInput(page).fill("ECO-IND-0048");
  await searchInput(page).press("Enter");
  await expect(
    page.getByRole("heading", { name: /Resultados de b/i }),
  ).toBeVisible();
  await page.clock.install();
  const initialHistoryLength = await page.evaluate(() => window.history.length);

  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll("button")];
    const rootButton = buttons.find(
      (button) => button.textContent?.trim() === "Inicio del catálogo",
    );
    const clearButton = buttons.find((button) =>
      button.textContent?.includes("Limpiar búsqueda"),
    );

    rootButton?.click();
    clearButton?.click();
  });
  await page.clock.fastForward(181);

  await expect(rootHeading(page)).toBeVisible();
  expect(await page.evaluate(() => window.history.length)).toBe(
    initialHistoryLength + 1,
  );
});

test("pagination pushes history and scrolls to the catalog product region instead of page top", async ({
  page,
}) => {
  await page.evaluate(() => {
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    const calls: {
      options: boolean | ScrollIntoViewOptions | undefined;
      targetId: string;
    }[] = [];

    (
      window as typeof window & {
        __task3PaginationScrollCalls?: typeof calls;
      }
    ).__task3PaginationScrollCalls = calls;
    Element.prototype.scrollIntoView = function scrollIntoView(
      options?: boolean | ScrollIntoViewOptions,
    ) {
      calls.push({ options, targetId: this.id });
      return originalScrollIntoView.call(this, options);
    };
  });
  const initialHistoryLength = await page.evaluate(() => window.history.length);
  await page.getByRole("button", { name: "Mostrar todos los productos" }).click();
  await expect(page.getByRole("heading", { name: "Todos los productos" })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & {
              __task3PaginationScrollCalls?: unknown[];
            }
          ).__task3PaginationScrollCalls?.length ?? 0,
      ),
    )
    .toBeGreaterThan(0);
  const regionTopBeforePagination = await page.evaluate(() => {
    const calls = (
      window as typeof window & {
        __task3PaginationScrollCalls?: unknown[];
      }
    ).__task3PaginationScrollCalls;

    if (calls) {
      calls.length = 0;
    }
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });

    return document
      .getElementById("catalog-product-region")
      ?.getBoundingClientRect().top;
  });
  expect(regionTopBeforePagination).toBeGreaterThan(300);

  await page.getByRole("button", { name: "2", exact: true }).click();

  await expect(page.getByText(/gina 2 de/i)).toBeVisible();
  expect(await page.evaluate(() => window.history.length)).toBe(
    initialHistoryLength + 2,
  );
  expect(
    await page.evaluate(
      () =>
        (
          (window.history.state as Record<string, unknown>)
            .econoluzCatalog as Record<string, unknown>
        ).page,
    ),
  ).toBe(2);

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & {
            __task3PaginationScrollCalls?: {
              options: boolean | ScrollIntoViewOptions | undefined;
              targetId: string;
            }[];
          }).__task3PaginationScrollCalls?.length ?? 0,
      ),
    )
    .toBe(1);
  expect(
    await page.evaluate(
      () =>
        (
          window as typeof window & {
            __task3PaginationScrollCalls?: {
              options: boolean | ScrollIntoViewOptions | undefined;
              targetId: string;
            }[];
          }
        ).__task3PaginationScrollCalls,
    ),
  ).toEqual([
    {
      options: { behavior: "instant", block: "start" },
      targetId: "catalog-product-region",
    },
  ]);

  await expect
    .poll(() =>
      page
        .locator("#catalog-product-region")
        .evaluate((stage) => stage.getBoundingClientRect().top),
    )
    .toBeGreaterThanOrEqual(70);
  const scrollPosition = await page
    .locator("#catalog-product-region")
    .evaluate((stage) => ({
      top: stage.getBoundingClientRect().top,
      pageY: window.scrollY,
    }));
  expect(scrollPosition.top).toBeGreaterThanOrEqual(70);
  expect(scrollPosition.top).toBeLessThan(180);
  expect(scrollPosition.pageY).toBeGreaterThan(300);

  await browserBack(page);
  await expect(page.getByText(/gina 1 de/i)).toBeVisible();
  await browserForward(page);
  await expect(page.getByText(/gina 2 de/i)).toBeVisible();
});

test("reduced motion applies transitions immediately and scrolls instantly to the catalog region", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(rootHeading(page)).toBeVisible();
  await page.evaluate(() => {
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    const scrollCalls: {
      behavior: ScrollBehavior | undefined;
      block: ScrollLogicalPosition | undefined;
      targetId: string;
    }[] = [];

    (
      window as typeof window & {
        __task3ReducedMotionScrollCalls?: typeof scrollCalls;
      }
    ).__task3ReducedMotionScrollCalls = scrollCalls;
    Element.prototype.scrollIntoView = function scrollIntoView(
      options?: boolean | ScrollIntoViewOptions,
    ) {
      scrollCalls.push({
        behavior: typeof options === "object" ? options.behavior : undefined,
        block: typeof options === "object" ? options.block : undefined,
        targetId: this.id,
      });
      return originalScrollIntoView.call(this, options);
    };
  });

  await page
    .getByRole("button", { name: /Iluminaci.n arquitect.nica/i })
    .click();
  await expect(page.getByRole("button", { name: /Downlights/i })).toBeVisible({
    timeout: 120,
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & {
              __task3ReducedMotionScrollCalls?: unknown[];
            }
          ).__task3ReducedMotionScrollCalls?.length ?? 0,
      ),
    )
    .toBe(1);
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & {
          __task3ReducedMotionScrollCalls?: {
            behavior: ScrollBehavior | undefined;
            block: ScrollLogicalPosition | undefined;
            targetId: string;
          }[];
        }).__task3ReducedMotionScrollCalls,
    ),
  ).toEqual([
    {
      behavior: "instant",
      block: "start",
      targetId: "catalog-product-region",
    },
  ]);
});

test("search and clear reset pagination", async ({ page }) => {
  await page.getByRole("button", { name: "Mostrar todos los productos" }).click();
  await page.getByRole("button", { name: "2", exact: true }).click();
  await expect(page.getByText(/gina 2 de 8/i)).toBeVisible();

  await searchInput(page).fill("ECO-IND-0048");
  await searchInput(page).press("Enter");
  await expect(page.getByText(/gina 1 de 1/i)).toBeVisible();

  await page.getByRole("button", { name: /Limpiar b/i }).click();
  await expect(page.getByRole("heading", { name: "Todos los productos" })).toBeVisible();
  await expect(page.getByText(/gina 1 de 8/i)).toBeVisible();
});

test("a second category tap during the exit transition is live and wins", async ({
  page,
}) => {
  const initialHistoryLength = await page.evaluate(() => window.history.length);

  // Durante los 180 ms de la transición de salida, los botones de la vista
  // anterior siguen en pantalla con aspecto normal: misma opacidad y mismo
  // cursor. Si además están inertes, el usuario toca una categoría, no ve
  // reacción, toca otra y aterriza en la primera.
  const secondTap = await page.evaluate(async () => {
    const findButton = (pattern: string) =>
      [...document.querySelectorAll("button")].find((button) =>
        new RegExp(pattern, "i").test(button.innerText),
      );

    findButton("iluminaci.n arquitect.nica")?.click();
    await new Promise((resolve) => {
      setTimeout(resolve, 80);
    });

    const second = findButton("iluminaci.n exterior");

    if (!second) {
      return { stillOnScreen: false, disabled: null as boolean | null };
    }

    const disabled = second.disabled;
    second.click();

    return { stillOnScreen: true, disabled };
  });

  expect(secondTap.stillOnScreen).toBe(true);
  expect(secondTap.disabled).toBe(false);

  // Gana el último toque: el usuario aterriza donde pulsó al final.
  await expect(
    page.getByRole("heading", { name: /Iluminaci.n exterior/i }),
  ).toBeVisible();

  // Cada toque deja su propia entrada, igual que un reset de navbar durante una
  // transición pendiente. Es la semántica que ya fija
  // "rapid category and navbar reset clicks keep only the newest legal state":
  // el destino descartado sigue siendo un paso real del historial.
  expect(await page.evaluate(() => window.history.length)).toBe(
    initialHistoryLength + 2,
  );
});
