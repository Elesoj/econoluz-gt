# ECONOLUZ GT

Premium architectural lighting website for ECONOLUZ GT, built to present LED lighting solutions, project references, a curated product catalog, a quotation flow, and an LED savings calculator for clients in Guatemala.

The visual direction is minimalist, architectural, black and white, and product-focused. The site is designed to guide visitors through a clear flow: discover the brand, estimate LED savings, explore products and projects, then request a quote.

## Tech Stack

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- Next Image optimization
- Local browser storage for temporary quote and calculator context

## Features

- Premium responsive homepage
- Curated lighting catalog with category filters
- Quote drawer with quantity controls and estimated totals
- Dynamic WhatsApp message generation from quote context
- LED savings calculator with local result handoff into the quote form
- Project gallery slider using existing ECONOLUZ imagery
- Reusable layout and interface components
- Shared data files for navigation, contact details, products, projects, and homepage content
- Return and refund policy page

## Routes

- `/` - Homepage with brand overview, calculator teaser, collections, projects, FAQs, and quote CTA
- `/catalogo` - Product catalog and project quote form
- `/calculadora-led` - LED savings calculator
- `/politica-devoluciones` - Returns and refunds policy

## Project Structure

```text
app/
  calculadora-led/
  catalogo/
  components/
  data/
    products.ts
    projects.ts
    siteData.ts
  lib/
    formatters.ts
  politica-devoluciones/
  globals.css
  layout.tsx
  page.tsx
public/
```

## Setup

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

Create a production build:

```bash
npm run build
```

Run linting:

```bash
npm run lint
```

## Screenshots

Add final screenshots here before launch:

- Homepage desktop
- Homepage mobile
- Catalog and quote drawer
- LED calculator
- Project gallery

## Future Roadmap

- Connect quote submissions to email, CRM, Google Sheets, or a backend API
- Add product detail pages for richer specifications
- Add structured SEO metadata per route
- Add analytics for catalog filters, quote starts, and calculator usage
- Add admin-editable content through a CMS or lightweight data source
- Add accessibility regression checks and visual QA snapshots before release
