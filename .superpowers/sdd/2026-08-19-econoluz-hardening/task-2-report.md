# Task 2 — Server-only product boundary, permanent references, taxonomy, specs, series, and image aliases

## Status

Implemented on the authorized `feat/sistema-de-diseno` checkout from starting
HEAD `0cba04b3009b42a18618778526d0f8e3297ae6a8`. No dependency, deploy, push,
PR, backend, database, ecommerce, contact-data, visual-identity, or
`public/catalogos` change was made.

The catalog route is now a Server Component that obtains 313 allowlisted
`PublicProduct` values through a `server-only` boundary and passes them to a
dedicated client component. Raw supplier data remains internal. References are
an explicit permanent ID-to-reference map; public IDs derive only from the
ECONOLUZ reference. The public taxonomy is reachable, the five plate
applications are restored, exterior decorative products are valid, series is an
optional product-view filter, all currently present public technical values are
projected/renderable, and all product image props use neutral aliases backed by
exact `afterFiles` rewrites.

## TDD evidence

### Preflight baseline

Command:

```powershell
npx.cmd playwright test tests/catalog-data-baseline.spec.ts
```

Output (exit 0):

```text
Running 11 tests using 1 worker
11 passed (3.4s)
```

### RED/GREEN 1 — permanent references

RED command:

```powershell
npx.cmd playwright test tests/catalog-public-boundary.spec.ts --grep "permanent"
```

RED output (exit 1):

```text
Running 2 tests using 1 worker
2 failed
Received: null
expect(permanentReferences).not.toBeNull()
```

This failed because the explicit permanent-reference module and its missing /
duplicate validation did not exist.

GREEN command:

```powershell
npx.cmd playwright test tests/catalog-public-boundary.spec.ts --grep "permanent"
npx.cmd playwright test tests/catalog-data-baseline.spec.ts
```

GREEN output (exit 0):

```text
2 passed (3.0s)
11 passed (3.3s)
```

The production map has exactly the 313 fixture pairs. Reversing the product
array still resolves each original reference by internal identity.

### RED/GREEN 2 — strict DTO and complete technical contract

RED command:

```powershell
npx.cmd playwright test tests/catalog-public-boundary.spec.ts --grep "strict public allowlist|approved technical"
```

RED output (exit 1):

```text
Running 2 tests using 1 worker
2 failed
Received: null
expect(publicProductModule).not.toBeNull()
```

GREEN command produced:

```text
Running 2 tests using 1 worker
2 passed (3.4s)
```

The allowlist test injects internal ID, price, cost, inventory, warranty, and a
future supplier sentinel and proves none crosses the DTO. It also proves a
different internal ID cannot change the public ID. The spec test compares every
projected value for all 313 products against the unchanged normalized internal
value and rejects `availability`.

Count correction: the source has **58 normalized keys total**, not the prose
claim of 59 in `public-specs-research.md`. The document's enumerated table and
code block agree with the source: the exact 57-key public allowlist plus the one
internal key `availability` equals the observed 58-key normalized union. There
is no unnamed 59th key and none was invented. Tests assert both exact sets and
the counts `57 public / 58 normalized`. `certification` and `certifications`
retain their separate stored values but share the display label
`Certificaciones`.

### RED/GREEN 3 — taxonomy and empty applications

RED command:

```powershell
npx.cmd playwright test tests/catalog-public-boundary.spec.ts --grep "corrected catalog taxonomy|declared source subcategory|no products"
```

RED output (exit 1):

```text
Running 3 tests using 1 worker
3 failed
Expected exterior applications to contain "decorativos".
apl-111 expected "atenuadores", received "placas_apagadores".
getPopulatedApplicationIds is not a function.
```

GREEN output (exit 0):

```text
Running 3 tests using 1 worker
3 passed (3.4s)
```

The public mapper restores Atenuadores, Datos/LAN, TV/coaxial, Timbres, and
Tapas ciegas from the preserved original family/subcategory label. A graph test
proves every projected product is reachable. The legacy normalized product
taxonomy stays otherwise unchanged and technical specs are untouched.

The old baseline expectation then failed once because it still expected the 13
known exterior/decorative reachability errors; after changing only that approved
debt expectation to `[]`, the same baseline hashes and all 11 protections pass.

### RED/GREEN 4 — public UI, series, and complete drawer

RED command:

```powershell
npx.cmd playwright test tests/catalog-public-ui.spec.ts
```

RED output (exit 1):

```text
Running 3 tests using 1 worker
3 failed
Expected 0 empty application cards, received 5.
"Filtrar por serie" not found.
"Factor de potencia" not found.
```

After the server/client split, taxonomy use, FilterChip series filter, and
registry-driven drawer, these three assertions passed. That run also exposed a
browser `ReferenceError: products is not defined` in quote restoration. The
root cause was a module-level helper that still assumed the removed client data
import. A new focused RED test captured it:

```text
Running 1 test using 1 worker
1 failed
Received page errors: ["products is not defined"]
```

The helper now accepts the public catalog prop, while restoration remains keyed
by `econoluzReference`. GREEN output:

```text
Running 4 tests using 1 worker
4 passed (11.1s)
```

### RED/GREEN 5 — neutral images and exact rewrites

RED data command:

```powershell
npx.cmd playwright test tests/catalog-public-boundary.spec.ts --grep "neutral deterministic|exact validated rewrites|only exact afterFiles"
```

RED output (exit 1):

```text
Running 3 tests using 1 worker
3 failed
Expected /media/catalogo/ECO-ELE-0001/1.webp, received the physical supplier path.
Image-routing module was null.
nextConfig.rewrites was undefined.
```

RED runtime command:

```powershell
npx.cmd playwright test tests/catalog-public-ui.spec.ts --grep "neutral image aliases"
```

RED output (exit 1):

```text
Expected alias response 200, received 404.
```

GREEN output (exit 0):

```text
3 passed (3.6s)
1 passed (3.4s)
```

There are 327 unique exact aliases (313 main/gallery sets; 326 unique physical
files because one physical file is deliberately shared). Every destination
exists, no source contains wildcard/parameter syntax, direct and optimized
requests return an image without `Location`, and an unknown alias returns 404.

### RED/GREEN 6 — production boundary scan

The first production build succeeded, then the new scan failed as intended:

```text
Running 1 test using 1 worker
1 failed
.next\static\chunks\0mdzalolw_0qs.js:
  artlite, construlita, highlum, productcode
```

Root causes were supplier-brand constants in the shared client taxonomy module
and an obsolete `productCode` search exclusion. Brands moved to an internal
module and public search now indexes only the already allowlisted spec values.
After a fresh build:

```text
Running 1 test using 1 worker
1 passed (2.9s)
```

## Phase verification

Complete Task 2 suite on the exact pre-commit tree:

```powershell
npx.cmd playwright test
```

Output (exit 0):

```text
Running 27 tests using 1 worker
27 passed (11.0s)
```

Focused data/taxonomy/spec/series/image/browser command:

```powershell
npx.cmd playwright test tests/catalog-public-boundary.spec.ts tests/catalog-public-ui.spec.ts
```

Output (exit 0):

```text
Running 15 tests using 1 worker
15 passed (11.0s)
```

Existing baseline command:

```powershell
npx.cmd playwright test tests/catalog-data-baseline.spec.ts
```

Output (exit 0):

```text
Running 11 tests using 1 worker
11 passed (3.2s)
```

Final lint/build/production-scan command:

```powershell
npm.cmd run lint
npm.cmd run build
npx.cmd playwright test tests/catalog-production-boundary.spec.ts
```

Output (exit 0):

```text
> eslint

✓ Compiled successfully in 1845ms
✓ Finished TypeScript in 2.8s
✓ Generating static pages (8/8) in 529ms

Route (app): /catalogo ○ Static

Running 1 test using 1 worker
1 passed (2.6s)
```

Lint produced no warnings or errors.

## Bundle/RSC/HTML and routing-manifest classification

Fresh build scan results:

```text
clientChunkPhysicalMatches   : 0
clientChunkForbiddenMatches  : 0
catalog HTML/RSC matches     : 0
routes-manifest physical     : 327
_buildManifest physical      : 327
```

Scanned forbidden vocabulary includes `supplierCode`, `supplierBrand`,
`productCode`, `availability`, `warranty`, quoted `sku`, `APL-001`, all three
supplier names, and physical `/catalogos/<supplier>/` paths.

`routes-manifest.json` and `_buildManifest.js` are classified separately as
Next routing/build manifests: Next 16 materializes the exact internal rewrite
table in both. They necessarily contain the 327 physical destinations. No
module chunk, catalog HTML, RSC file, or segment payload contains them. The
original physical URLs remain directly public because the files remain in
`public`; aliases are canonical UI URLs, not access control.

## Baseline hashes

Captured hashes remain:

```text
publicCanonicalSha256  34c8c64fb279deb2068bf48c96083d0b8bf6b37521b63918e57029a6280c1a03
internalCanonicalSha256 2aa7e0cbd73f91934b58d1efd4b24b2c6e5ef93e514b101945cdfe148c814be6
referenceMapSha256     e5a0a7788e3a86be9c2e6936c242608dcd4884b94a7781c9d8b75af32e73bb8c
productHashMapSha256   3d238e8fc944bf4b697d90515e0a1753e0e69010de751b708d8054b72dbf466c
```

Verification hashes remain:

```text
publicCanonicalSha256  69bf6aa565cdbf74268fd1e179a0adc070b867ed13df5675a720bae995093eca
internalCanonicalSha256 2dd3df91d58b4e00cbbfdd4a932a835263eb8052aa9db9c68243c6faea601d64
referenceMapSha256     57307a880fe854730ee43816b3f8f45153b3732e51a28e9aa6b332e7a8a3dcd9
productHashMapSha256   38e5c3779f41924dbf0f70ad0bfa64ed79e7b25543718bdf39cacd9c8c76617d
```

## Files changed

- `app/catalogo/page.tsx` — Server Component wrapper.
- `app/catalogo/CatalogClient.tsx` — existing interactivity plus public props,
  populated applications, and optional series filter.
- `app/components/ProductCard.tsx` — public DTO type.
- `app/components/ProductTechnicalDrawer.tsx` — public DTO and one complete
  ordered spec registry.
- `app/data/catalog.server.ts` — `server-only` raw-to-public boundary.
- `app/data/catalogBrands.internal.ts` — supplier taxonomy kept out of clients.
- `app/data/catalogImageRouting.ts` — deterministic aliases and rewrite validation.
- `app/data/catalogTaxonomy.ts` — exterior decorative reachability and defensive
  populated-application helper.
- `app/data/productReferences.ts` — explicit 313-reference permanent map.
- `app/data/products.ts` — mapping mechanics only; no raw facts changed.
- `app/data/publicProduct.ts` — explicit allowlisted type, mapper, and spec registry.
- `next.config.ts` — exact validated `afterFiles` rewrites.
- `playwright.config.ts` — focused Task 2 suites.
- `tests/catalog-data-baseline.spec.ts` — approved taxonomy debt now expects zero.
- `tests/catalog-public-boundary.spec.ts`, `tests/catalog-public-ui.spec.ts`, and
  `tests/catalog-production-boundary.spec.ts` — focused TDD and build leakage coverage.
- This report.

## Self-review

- `git diff --check` exits 0. Git reports only the repository's existing LF/CRLF
  conversion notices, not whitespace errors.
- `git diff --name-only -- public/catalogos` is empty.
- The raw `products.ts` diff contains only internal import relocation, removal of
  index-based reference construction, permanent lookup/validation, and the
  `InternalProduct` alias. The baseline proves exact names, descriptions,
  physical paths, finishes, series, technical values, internal normalized
  representation, and references remain unchanged.
- Public construction is field-by-field. It never spreads an internal product.
- Quote persistence/restoration is still keyed by `econoluzReference`.
- No client module imports `products.ts` or `catalog.server.ts`; only the Server
  Component imports the guarded boundary.
- During the first map-file patch, the patch tool resolved a relative path into
  the parent project directory. It was detected immediately, removed with
  `apply_patch`, recreated at the authorized absolute path, and verified absent
  outside `frontend` before continuing.

## Remaining limitation / concern

Neutral aliases do not make physical files private. Also, Next 16 publishes its
rewrite table in `_buildManifest.js`; the physical destinations are therefore
visible in routing metadata even though they are absent from catalog UI payloads
and executable client chunks. This is explicitly classified rather than hidden.
Removing that routing-manifest visibility would require a different asset
storage/serving architecture, outside this task and contrary to keeping the
existing files unmoved.
