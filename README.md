# ECONOLUZ GT

Premium black/white lighting catalog website for ECONOLUZ GT. The project presents architectural, technical, exterior, residential, and accessory lighting references for quotation-based sales in Guatemala.

The site is not an ecommerce store. Products do not expose prices, checkout, payment, inventory, authentication, or backend order processing. Catalog selections are collected into a temporary quote context and sent through WhatsApp for asesoría técnica.

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
- Search and filters by brand, type, series, application, finish, and specs
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
  data/
    products.ts             Real catalog product data and filters
    projects.ts             Project gallery image data
    siteData.ts             Navigation, contact, homepage, quote, FAQ, and brand data
  lib/
    formatters.ts           Number and currency formatters for non-catalog tools
  politica-devoluciones/    Return/refund policy route
  globals.css               Global Tailwind styles
  layout.tsx                App metadata and root layout
  page.tsx                  Homepage
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
- The catalog is static data today. Adding products requires updating `app/data/products.ts` and placing matching images/PDFs in `public/catalogos/`.
- Do not add prices, ecommerce checkout, payment flows, backend inventory, authentication, or admin-only features without changing the product strategy.

## Current Status

- Homepage, guided catalog, product drawer, quote flow, WhatsApp flow, and LED calculator are implemented.
- ARTLITE products and many CONSTRULITA product families are represented with real catalog images/specs.
- Catalog rendering uses an initial page size with a "Cargar más" flow so the UI does not render every matching product at once.
- Product model is quotation-first and price-free.
- More CONSTRULITA PDFs/products can be added gradually once image paths and product data are verified.
