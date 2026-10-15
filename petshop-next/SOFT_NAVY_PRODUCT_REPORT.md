# Design 3: soft navy product image containers

Implemented in the existing Admin Products/Inventory and Client Products components. No database, image files, product IDs, product records, prices, quantities or reservation logic were changed.

## Modified files

- `src/components/ProductImage.tsx` (new): shared image renderer with lazy loading, async decoding, loading skeleton, alt text, existing category fallback on image failure, and a final accessible unavailable state if the fallback also fails. Cached images clear their loading state.
- `src/components/AdminProductCard.tsx`: shared original-image renderer inside the common square frame. Existing read-only product information, stock badges and price/quantity-only inventory modal remain intact.
- `src/components/ProductCatalog.tsx`: common image frame, full descriptions in product details plus a readable card excerpt, bottom-aligned Reserve Product buttons, derived stock badges and existing search/category controls. Zero-stock buttons stay labelled Reserve Product and are disabled. Existing details/reservation flow remains in use.
- `src/app/globals.css`: shared soft navy frame, readable card typography, equal-height rows, theme styling, focus/hover states and reduced-motion support. Removed the prior out-of-stock image dimming filter.
- `scripts/test-inventory-layout.mjs`: expanded browser layout checks for both dashboards, two themes and three viewport sizes.
- `scripts/test-system.mjs`: synchronization assertions now verify the actual low-stock threshold, shared frame and Reserve Product control.

## Image and grid styling

The frame has `aspect-ratio: 1/1`, width 100%, background `#263A56`, border `#365170`, radius 14px and padding 12px. A reserved internal badge strip keeps the status badge off the product packaging. Images are centered with `object-fit: contain`, a transparent CSS background, no filters, no cropping and no stretching. White areas baked into the original images remain unchanged. Skeletons do not change frame dimensions.

Both dashboard grids use four columns at 1200px and above, two at 768–1199px, and one below 768px. Rows and action buttons align across cards. Light mode uses light card surfaces; dark mode uses navy card surfaces. The shared image frame remains navy in both themes.

## Inventory and reservation behavior

The existing authoritative MySQL product table and stock-status helper are reused. In Stock, Low Stock and Out of Stock follow each product's configured threshold. Admin update restrictions, stock/price concurrency checks, reservation stock deductions, one-time cancellation restoration and historical reservation prices are unchanged. Client auto-refresh behavior is preserved. No Availability or Sort dropdown was added.

## Verification

- TypeScript/lint and production build passed.
- Seven helper checks passed, including per-product stock thresholds and half-kilo pricing.
- All 31 original product image endpoints returned byte-identical files from the pictures folder, and all 31 active products remained in the catalog.
- Headless Chrome fixture checks passed for both Admin and Client in light and dark themes, at actual viewport widths 500px, 784px and 1264px. Both grids showed 1/2/4 columns respectively; equal widths/heights, square image frames, 12px padding, original image loading, contain fitting, no dimming filters and no horizontal overflow were verified. Chrome applied a minimum window width to the requested 390px test.
- Results: `INVENTORY_UI_CHECK/DESIGN3_RESULTS.json`; live image verification: `CATALOG_IMPORT/VERIFICATION.json`.
- Final integration result: 47 passed, 0 failed. Audit database: `petshop_audit_8cfb5d3889d8`. Tests cover updates, injected protected fields, stale/concurrent edits, overselling prevention, cancellation restoration and preservation of reservation prices. Full results: `SYSTEM_TEST_RESULTS.json`.

Browser layout checks use fixtures with the application CSS and original image files. They do not claim a signed-in end-to-end modal/reservation interaction test. Missing-image fallback behavior is implemented and source-checked; forced failure was not separately automated in a browser. No known configuration changes are required.