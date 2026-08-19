# ECONOLUZ GT Catalog Hardening Implementation Plan

> Approved by the user on 2026-08-19. Execute with strict TDD, phase-by-phase verification, task review, and final verification.

**Goal:** Correct the catalog's data exposure, unstable references, taxonomy, navigation, persistence, lead capture, accessibility, performance, dependencies, and basic metadata without redesigning the site or turning it into ecommerce.

**Architecture:** Keep raw supplier data in a server-only module. Build an explicit, minimal `PublicProduct` DTO on the server and serialize only that DTO to a focused catalog client. Extract pure modules for catalog state, history validation, quote persistence, public messages, form validation, and calculator parsing so their behavior can be tested before React integration. Preserve all current public product content with a per-product baseline.

**Test stack:** `@playwright/test` as a development-only dependency, using the installed Microsoft Edge channel. Data and production-bundle validation may use deterministic Node scripts when a browser is not required. Do not download additional browsers.

## Global Constraints

- Preserve exactly 313 products and all 313 current ECONOLUZ references.
- Preserve every current public product name, description, image path, category/application assignment after the approved taxonomy correction, finish, series, and every technical specification value. Taxonomy corrections must not alter technical specifications.
- Never add or expose product prices, costs, discounts, economic availability, inventory, checkout, payments, orders, login, authentication, a new backend, or a new database.
- Budget ranges in the project form are allowed because they are project requirements, not product prices.
- Never expose `sku`, `brand`, `supplierCode`, `supplierBrand`, `productCode`, supplier names, or real supplier codes in public DTO properties, UI text, search indexes, WhatsApp messages, HTML, RSC payloads, or client chunks.
- Preserve internal source fields for future use, but keep them outside the client dependency graph.
- Do not move, copy, rename, or delete anything under `public/catalogos`; do not delete protected supplier logos or assets.
- Investigate neutral public image URLs without moving or duplicating physical files. Do not change image structure without user approval if a reliable Vercel-compatible mapping is not possible.
- Keep the public path category -> application/subcategory -> products. Series is optional and appears only on the product view.
- Keep advisory quotation and WhatsApp. A product line contains only public name, ECONOLUZ reference, and quantity.
- Keep selection in `sessionStorage`; do not persist sensitive form fields unnecessarily.
- Preserve current contact information and visual identity. Do not redesign the homepage.
- Keep `/api/leads`; all SQL remains parameterized. Do not add infrastructure.
- Do not publish, deploy, push, or open a pull request.
- No production code may be written before a failing test demonstrates the target behavior.
- Run the focused tests for every task, then the phase gate before starting the next phase. Report failures honestly.

## Baseline Contract

- Base commit: `929dfa16db960af18ed7a5d213918ad8e5d9cdd5`.
- Product count: `313`.
- Unique image paths: `326`; missing images: `0`.
- Public canonical baseline SHA-256: `34c8c64fb279deb2068bf48c96083d0b8bf6b37521b63918e57029a6280c1a03`.
- Internal canonical baseline SHA-256: `2aa7e0cbd73f91934b58d1efd4b24b2c6e5ef93e514b101945cdfe148c814be6`.
- Reference map SHA-256: `e5a0a7788e3a86be9c2e6936c242608dcd4884b94a7781c9d8b75af32e73bb8c`.
- Per-product hash-map digest: `3d238e8fc944bf4b697d90515e0a1753e0e69010de751b708d8054b72dbf466c`.
- The test fixture must store per-product reference and canonical content/specification hashes so an accidental edit identifies the affected product.

## Task 1: Protection tests and baseline fixture

**Phase:** Protection first.

**Files:** `package.json`, `package-lock.json`, `playwright.config.ts`, `tests/catalog-data-baseline.spec.ts`, `tests/helpers/catalog-baseline.ts`, `tests/fixtures/catalog-baseline.json`, supporting scripts only if required.

1. Install `@playwright/test` only as a development dependency. Do not install browser binaries.
2. Configure Playwright to use installed Microsoft Edge and a local Next server. Do not add production dependencies.
3. Create a deterministic loader/canonicalizer for the current product modules.
4. Materialize the already-captured baseline as a per-product fixture containing IDs/references and hashes, not duplicate public assets.
5. Add tests that initially demonstrate a mutated product fixture, missing product, duplicate ID/reference, missing image, invalid taxonomy, unreachable product, and altered specification are rejected.
6. Add a test that protects the exact 313 current references from array reordering.
7. Verify the baseline test passes against the untouched source and proves failure against controlled mutations.
8. Phase gate: run the focused baseline suite and `npm.cmd run lint`.

## Task 2: Server-only product boundary, permanent references, and taxonomy

**Phase:** Security and navigation foundations.

**Files:** product data modules, public product types/mapper/validator, `app/catalogo/page.tsx`, a dedicated catalog client, taxonomy modules, focused tests.

1. RED: add tests proving current client output exposes forbidden fields/codes, references depend on array order, exterior decorative products are unreachable, and five empty applications are rendered.
2. Define `InternalProduct` and a shared minimal `PublicProduct` with no price-like or supplier properties.
3. Move or wrap raw data behind `server-only`; no client module may import it.
4. Replace index-derived references with an explicit stable mapping that exactly matches the 313 baseline references. Reject missing or duplicate mappings.
5. Use a public-safe product ID derived only from the public ECONOLUZ reference; retain original IDs only internally.
6. Preserve all public names, descriptions, images, finishes, series, and technical specification values.
7. Correct taxonomy: make `decorativos` valid for exterior, and map Atenuadores, Datos/LAN, TV/coaxial, Timbres, and Tapas ciegas to their declared public applications.
8. Filter out empty applications defensively and validate every product is reachable.
9. Add an optional series filter using the existing `FilterChip`, only in the product view.
10. Investigate a Vercel-compatible neutral rewrite for image URLs while physical files remain untouched. If reliability cannot be demonstrated locally and from Next/Vercel behavior, leave paths unchanged and record the limitation; do not restructure assets.
11. Build production and scan HTML/RSC/client chunks. Forbidden fields/codes must not occur except supplier words that are unavoidably part of unchanged physical image paths; report path-only occurrences distinctly.
12. Phase gate: data tests, relevant browser tests, lint, and production build.

## Task 3: Catalog state machine, history, hashes, reset, search, and pagination

**Phase:** Security and navigation.

**Files:** catalog state/history/filter hooks/modules, catalog client, navbar/footer touchpoints, Playwright tests.

1. RED: cover category -> application -> products, back from products, back from applications, browser back/forward, fast clicks, reset from navbar/footer, `#asesoria-proyecto`, search/clear, and pagination scroll.
2. Define a validated state machine with only legal category/application combinations and bounded page/search values.
3. Use `pushState` for internal forward transitions and deliberate reset/history semantics documented in tests. Preserve Next history internals safely.
4. Make popstate restore validated catalog state. Reject malformed or cross-category history state.
5. Cancel transition timeouts and animation frames on replacement/unmount; never leave transition state stuck.
6. Respect `prefers-reduced-motion` and scroll product pagination to the catalog product region.
7. Make same-page navbar and footer catalog links reset consistently.
8. Preserve `#asesoria-proyecto` behavior.
9. Phase gate: all catalog navigation browser tests, lint, and build.

## Task 4: Quote persistence and one public message builder

**Phase:** Persistence, quotation, and WhatsApp.

**Files:** quote storage module/hook, public message module, quote UI integrations, FloatingWhatsApp, focused tests.

1. RED: cover valid restoration, invalid JSON, structurally invalid JSON, invalid/negative/non-finite/oversized quantities, duplicates, removed products, storage exceptions, and unchanged writes.
2. Restore only by stable ECONOLUZ reference, consolidate duplicates, bound quantities, reject unknown products, and guard every storage operation.
3. Write only when the canonical stored value changed; do not write sensitive form data to localStorage.
4. Synchronize FloatingWhatsApp only on meaningful quote changes without render/write storms.
5. Create one public product-line builder: public name + ECONOLUZ reference + quantity. Use it everywhere.
6. Prove WhatsApp, quote drawer, search, and public payloads contain no price or forbidden internal field.
7. Correct the drawer text to disclose temporary session storage accurately.
8. Phase gate: focused persistence/message tests plus affected browser tests, lint, and build.

## Task 5: Lead form, WhatsApp handoff, and `/api/leads`

**Phase:** Persistence, quotation, and WhatsApp.

**Files:** form state/validation modules, catalog form UI, `/api/leads`, focused unit/API/browser tests.

1. RED: cover required full name/phone/valid email only; optional project/budget/lighting fields; Guatemalan phone formats; first-invalid focus; allowed select values; invalid types/lengths; anomalous payloads; duplicate submission; endpoint failure without data loss.
2. Align HTML attributes, client validation, server validation, errors, and `aria-invalid`.
3. Use a controlled honeypot that can actually detect bot input.
4. Replace beacon-as-success and anchor submission with an explicit two-step flow: await confirmed lead storage, then provide a user-activated WhatsApp action.
5. Prevent duplicate submissions while processing. Preserve entered data on failure and show WhatsApp, telephone, and email alternatives.
6. Keep `/api/leads`, parameterized SQL, and current database. Reject rather than silently truncate over-limit fields.
7. Apply reasonable infrastructure-free abuse controls such as content-type/body-size/origin checks and honeypot. Document that reliable distributed rate limiting requires external/platform or persistent support and is not added.
8. Ensure database and WhatsApp contain the calculator summary once, not twice.
9. Phase gate: form/API/browser tests, lint, and build.

## Task 6: Drawers, calculator, statistics, and project slider

**Phase:** Performance and accessibility.

**Files:** quote/technical drawers, shared dialog behavior if useful, calculator state module/page, AnimatedStat, ProjectSlider, focused tests.

1. RED: cover dialog roles/names, `aria-modal`, Escape, background scroll lock, initial focus, focus trap, focus restoration, quantity labels, mutual exclusivity, and reduced motion.
2. Implement accessible dialog behavior without redesigning either drawer and without removing technical rows.
3. Validate calculator numbers against empty, negative, non-finite, and out-of-range values while preserving valid formulas and formatting.
4. Version/timestamp stored calculator results, handle storage exceptions, and warn before reusing stale results.
5. Render nonnumeric AnimatedStat values such as `LED` and `GT` literally; disable animation for reduced motion.
6. Remove raw `window.Image` preloading that duplicates `next/image` requests. Keep correct existing `sizes`.
7. Phase gate: focused component/browser tests, reduced-motion run, lint, and build.

## Task 7: Controlled Next.js security update

**Phase:** Dependency security, separate from application changes.

**Files:** `package.json`, `package-lock.json` only unless Next 16.3.1 requires a documented compatibility adjustment.

1. Record pre-update audit evidence.
2. Update Next.js from 16.2.6 to the stable fixed 16.3.1 release without `--force` and without an unnecessary major update.
3. Review lockfile changes for Next, PostCSS, Sharp, and Nanoid.
4. Run focused tests, full Playwright suite, lint, build, and `npm.cmd audit --omit=dev`.
5. Keep this task as its own Git commit.

## Task 8: Secondary route metadata

**Phase:** Secondary work after primary defects pass.

**Files:** server route metadata/layout files and tests.

1. RED: verify metadataBase, canonical metadata, catalog-specific metadata, an existing appropriate Open Graph image, `twitter:card=summary_large_image`, and preservation of “lámparas LED Guatemala”.
2. Keep metadata in server components and do not redesign pages.
3. Do not invent WordPress redirects; document this as pending.
4. Phase gate: metadata check, lint, and build.

## Task 9: Final verification and audit report

1. Run the complete Playwright suite using Edge on desktop and mobile viewport projects.
2. Run catalog invariant validation: 313 products/references, no duplicates, images exist, valid/reachable taxonomy, no empty visible applications.
3. Compare every per-product content and technical-specification hash against the baseline, accounting only for the approved taxonomy correction outside specification hashes.
4. Run `npm.cmd run lint`.
5. Run `npm.cmd run build`.
6. Run `npm.cmd audit --omit=dev`.
7. Scan production HTML/RSC/client chunks for forbidden internal properties, real codes, supplier fields, and product price-like fields. Classify unchanged physical image-path occurrences separately.
8. Check WhatsApp strings and lead payloads for forbidden/internal/price data.
9. Review `git status`, `git diff`, commits, and changed assets; prove no image was moved/copied/deleted and all changes belong to this task.
10. Request a final whole-branch code review and address Critical/Important findings.
11. Deliver the requested 16-part Spanish report with exact command outputs, test counts, risks, limitations, and all recorded rulings.
