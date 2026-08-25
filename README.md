# ECONOLUZ GT

Premium black/white lighting catalog website for ECONOLUZ GT. The project presents architectural, technical, exterior, residential, and accessory lighting references for quotation-based sales in Guatemala.

Today the site is quotation-only: catalog selections are collected into a temporary quote context and sent through WhatsApp for asesoría técnica. No prices, checkout, payment, or customer accounts are exposed yet.

**That is the current state, not the target.** The owner decided the catalog will become a B2C store while keeping the quotation flow for projects, on the same products. The work in progress is the admin panel that lets the owner manage products himself; the 313 products already live in Postgres. See `CLAUDE.md` §2 and §11 for the decision and the roadmap, and `docs/CONTINUAR-PANEL.md` for the step-by-step plan.

> This README is in English because it was written that way; the rest of the project documentation and all code comments are in Spanish, per `CLAUDE.md` §5.

## Technologies

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- Next Image optimization
- Local browser storage for temporary quote and LED calculator context
- Vercel deployment

## Main Features

- Responsive premium homepage with ECONOLUZ project imagery
- Guided catalog UX by product type and application
- Compact product grid prepared for larger catalogs
- Search and filters by product type, application, finish, and specs. **Not by brand or series:** those identify the supplier and never reach the public catalog
- Technical product drawer/modal
- Quotation/add-to-quote flow without prices
- WhatsApp message generation from selected products and project form data
- LED savings calculator with handoff into the quote form
- Project gallery and supplier/brand presentation
- Shared data files for products, projects, navigation, contact, and homepage content

## Folder Structure

```text
app/
  calculadora-led/          LED savings calculator route
  catalogo/                 Guided catalog and quotation route
  components/               Shared UI components
  api/leads/route.ts        Saves advisory requests to Postgres
  data/
    products.ts             The 313 products as written code. NO LONGER the source of
                            truth: the database is. Kept as the fallback when Neon is
                            unreachable, and as the fixture the baseline tests protect
    productRow.ts           Product <-> database row translation, and column lists
    catalog.server.ts       Reads the catalog from Postgres, tag-cached, with fallback
    publicProduct.ts        The boundary: decides what reaches the browser
    catalogTaxonomy.ts      Public taxonomy of product types and applications
    catalogBrands.internal.ts   Supplier brands, server-only
    catalogSeries.internal.ts   Supplier series, server-only
    projects.ts             Project gallery image data
    siteData.ts             Navigation, contact, homepage, quote, FAQ, supplier logos
  lib/
    formatters.ts           Number and currency formatters for non-catalog tools
  politica-devoluciones/    Return/refund policy route
  globals.css               Global Tailwind styles
  layout.tsx                App metadata and root layout
  page.tsx                  Homepage
db/                         SQL migrations, applied in order by `npm run db:migrar`
scripts/                    Migration, import, verification and audit scripts
docs/CONTINUAR-PANEL.md     Handoff plan for the remaining admin-panel work
tests/                      Playwright: catalog, quote flow, and data boundaries
public/
  catalogos/                Product PDFs and catalog product images
  proyectos/                Structured project images
  proveedores/              Supplier/brand logos
```

## Local Setup

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

Run quality checks:

```bash
npm run lint
npm run build
```

## Deployment Notes

- The public deployment is managed on Vercel.
- Product and project images must live under `public/` and be referenced with root-relative paths, for example `/catalogos/construlita/downlight/alfa.png`.
- Keep catalog image folders structured by brand and family to avoid broken legacy paths such as `/bmw1.jpeg`.
- **The catalog is no longer static data.** Products live in the `products` table in Postgres (Neon) and `/catalogo` reads them from there. Editing `app/data/products.ts` changes only the fallback and environments without `DATABASE_URL`.
- `DATABASE_URL` is required. It is set in Vercel and, for local work, in `.env.local` (see `.env.example`).
- Run `npm run db:migrar` to apply pending SQL migrations from `db/`.

## Current Status

- Homepage, guided catalog, product drawer, quote flow, WhatsApp flow, and LED calculator are implemented.
- The 313 products were migrated to Postgres and verified field by field against the frozen catalog baseline.
- Advisory requests are saved to the database, verified against the deployed site.
- Catalog rendering uses an initial page size with a "Cargar más" flow so the UI does not render every matching product at once.
- The product model is still quotation-first and price-free in the UI. Price and stock columns already exist in the database so they can be loaded from the admin panel before the store is built.
- **In progress:** the admin panel — login, product CRUD, photo upload to Vercel Blob, and the project gallery. Plan in `docs/CONTINUAR-PANEL.md`.
- Known debt, including supplier names still present in image paths and descriptions, is listed in `CLAUDE.md` §7.
