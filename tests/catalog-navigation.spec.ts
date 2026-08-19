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

test("malformed, unknown, contradictory, cross-category, and invalid-page history states normalize to root", async ({
  page,
}) => {
  const invalidStates = [
    {
      version: 1,
      sessionId: "task-3-test",
      depth: 1,
      view: "products",
      category: "iluminacion_arquitectonica",
      application: "wallpacks",
      search: "",
      page: 1,
    },
    {
      version: 1,
      sessionId: "task-3-test",
      depth: 1,
      view: "applications",
      category: "categoria_desconocida",
      application: null,
      search: "",
      page: 1,
    },
    {
      version: 1,
      sessionId: "task-3-test",
      depth: 1,
      view: "all",
      category: "iluminacion_exterior",
      application: null,
      search: "",
      page: 1,
    },
    {
      version: 1,
      sessionId: "task-3-test",
      depth: 1,
      view: "all",
      category: null,
      application: null,
      search: "",
      page: "2",
    },
  ];

  for (const invalidState of invalidStates) {
    await page.evaluate((catalogState) => {
      const nextState = {
        ...(window.history.state as Record<string, unknown>),
        econoluzCatalog: catalogState,
      };
      window.history.pushState(nextState, "", window.location.href);
      window.dispatchEvent(new PopStateEvent("popstate", { state: nextState }));
    }, invalidState);

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
  }
});

test("a popstate during animation cancels stale work and never leaves catalog controls locked", async ({
  page,
}) => {
  const category = page.getByRole("button", {
    name: /Iluminaci.n arquitect.nica/i,
  });

  await category.click();
  await browserBack(page);
  await expect(rootHeading(page)).toBeVisible();
  await page.waitForTimeout(260);
  await expect(rootHeading(page)).toBeVisible();
  await expect(category).toBeEnabled();
});

test("rapid category and navbar reset clicks keep only the newest legal state", async ({
  page,
}) => {
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

  await page.waitForTimeout(260);
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

test("preserves and scrolls the asesoria-proyecto hash entry", async ({ page }) => {
  await page.goto("/catalogo#asesoria-proyecto");

  await expect(page).toHaveURL(/\/catalogo#asesoria-proyecto$/);
  await expect(
    page.getByRole("heading", { name: /Define tu proyecto de iluminaci/i }),
  ).toBeInViewport();
  await expect(rootHeading(page)).toBeVisible();
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
  await browserForward(page);
  await expect(page.getByRole("button", { name: /Downlights/i })).toBeVisible();
});

test("pagination pushes history and scrolls to the catalog product region instead of page top", async ({
  page,
}) => {
  await page.evaluate(() => {
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    const calls: unknown[] = [];

    (window as typeof window & { __task3PaginationScrollCalls?: unknown[] })
      .__task3PaginationScrollCalls = calls;
    Element.prototype.scrollIntoView = function scrollIntoView(
      options?: boolean | ScrollIntoViewOptions,
    ) {
      calls.push(options);
      return originalScrollIntoView.call(this, options);
    };
  });
  const initialHistoryLength = await page.evaluate(() => window.history.length);
  await page.getByRole("button", { name: "Mostrar todos los productos" }).click();
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
            __task3PaginationScrollCalls?: unknown[];
          }).__task3PaginationScrollCalls?.length ?? 0,
      ),
    )
    .toBeGreaterThan(0);

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

test("reduced motion applies catalog transitions immediately and avoids smooth scrolling", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(rootHeading(page)).toBeVisible();
  await page.evaluate(() => {
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    const scrollBehaviors: (ScrollBehavior | undefined)[] = [];

    (window as typeof window & { __task3ScrollBehaviors?: (ScrollBehavior | undefined)[] })
      .__task3ScrollBehaviors = scrollBehaviors;
    Element.prototype.scrollIntoView = function scrollIntoView(
      options?: boolean | ScrollIntoViewOptions,
    ) {
      scrollBehaviors.push(
        typeof options === "object" ? options.behavior : undefined,
      );
      return originalScrollIntoView.call(this, options);
    };
  });

  await page
    .getByRole("button", { name: /Iluminaci.n arquitect.nica/i })
    .click();
  await expect(page.getByRole("button", { name: /Downlights/i })).toBeVisible({
    timeout: 120,
  });
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & {
          __task3ScrollBehaviors?: (ScrollBehavior | undefined)[];
        }).__task3ScrollBehaviors,
    ),
  ).not.toContain("smooth");
});

test("search and clear reset pagination and transient series without leaking series outside products", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Mostrar todos los productos" }).click();
  const aplSeries = page.getByRole("button", { name: /^APL\s+41$/ });
  await aplSeries.click();
  await page.getByRole("button", { name: "2", exact: true }).click();
  await expect(page.getByText(/gina 2 de 2/i)).toBeVisible();

  await searchInput(page).fill("ECO-IND-0048");
  await searchInput(page).press("Enter");
  await expect(page.getByText(/gina 1 de 1/i)).toBeVisible();
  await expect(page.getByText("Serie: APL", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: /Limpiar b/i }).click();
  await expect(page.getByRole("heading", { name: "Todos los productos" })).toBeVisible();
  await expect(page.getByText(/gina 1 de 8/i)).toBeVisible();
  await expect(aplSeries).toHaveAttribute("aria-pressed", "false");
});
