# Premium admin inventory cards

Implemented in the existing Next.js Admin Products and Inventory views. Both views use the same components and MySQL product records. No new database, records, schema migration, or permanent sample products were introduced. Product creation remains available separately.

## Files created or modified

- `src/components/AdminProductCard.tsx`: read-only product cards and a native Edit Inventory dialog; only price and available quantity inputs; controlled draft values survive errors; Cancel discards drafts; loading state prevents repeat clicks; focus returns to the initiating button.
- `src/app/admin/dashboard/page.tsx`: shared Products/Inventory grid, actual inventory summary counts, existing search/category filters and pagination, distinct query-error/empty/search-result states; 12 cards per page.
- `src/app/admin/dashboard/loading.tsx`: loading skeletons.
- `src/app/admin/actions.ts`: inventory update whitelist, validation, optimistic concurrency, transaction, notifications/audit and revalidation.
- `src/lib/stock-status.ts`: shared threshold-based status calculation.
- `src/components/ProductCatalog.tsx` and `src/app/client/dashboard/page.tsx`: client status badges use the same threshold; unavailable Reserve Product action remains disabled with the Reserve Product label.
- `src/app/globals.css`: navy/blue cards, equal-height grid, modal, badges, focus states, responsive and reduced-motion styling.
- `../public/admin.php`: legacy inventory writes also restrict updates to price and quantity; protected controls read-only and stale stock/price checks added.
- `scripts/test-system.mjs`, `scripts/test-helpers.mjs`, `scripts/test-inventory-layout.mjs`: integrity, status boundaries and browser layout checks.

## Inventory and API behavior

The existing `products.stock_quantity` is available unreserved stock. A reservation atomically deducts available units. Cancellation restores the units only once. Setting available quantity does not cancel or rewrite reservations. Existing reservation item unit prices and totals remain unchanged when the product selling price changes.

The inventory action requires an authenticated administrator and accepts only price and quantity for database updates. Extra name/category/image/SKU/group/visibility/threshold properties cannot change those protected values. Prices must be non-negative with at most two decimal places; quantities must be non-negative integers within the existing database integer range.

The editor captures stock and price when opened. Backend updates compare both captured values with the current database row, then conditionally update in a transaction. Stale or competing saves fail instead of overwriting inventory changes. Existing stock deduction, stock restoration, notification, audit and authorization behavior is preserved.

Status is derived from each product's configured reorder level:

- Zero available: Out of Stock.
- Positive quantity at or below reorder level: Low Stock.
- Quantity above reorder level: In Stock.

Original product images are loaded through the existing image resolver/endpoint. Inventory edits cannot upload or overwrite images. Fallback imagery is used only if the image cannot load. No stock overlay obscures admin product images; status is shown as a badge.

Both dashboards query the same product table. Successful updates revalidate Admin and Client dashboards; the current admin card receives refreshed server data. Existing client refresh behavior and fresh reservation availability checks remain in place. Client reservations cannot exceed available stock or reserve a zero-stock product.

## Validation

- Production build and TypeScript passed.
- System integration suite: 47 checks passed in an isolated audit database, including admin/client inventory synchronization, injected protected fields, invalid price/quantity, stale price/stock, concurrent absolute edits, historical reservation item prices, overselling prevention and cancellation restoration.
- Helper suite: 6 checks passed, including zero/threshold status boundaries and differing per-product thresholds.
- PHP syntax validation passed for the legacy admin file.
- Actual headless Chrome layout fixture used the application CSS beside a simulated 220px sidebar. Actual CSS viewport widths were 500px, 784px and 1264px: one, two and four columns respectively, equal card widths/heights and no horizontal overflow. Results: `INVENTORY_UI_CHECK/RESULTS.json`. Chrome enforced a minimum width on the requested 390px window.

Browser layout checks use a database-free fixture, not a signed-in end-to-end session. Interactive modal cancellation, focus restoration, loading and save failure presentation have been implemented and source-checked, but were not separately exercised through an automated signed-in browser. Server-side saves and rendered editor contents are covered by integration tests. Legacy PHP product updates were syntax-checked; the new policy-specific mutation tests exercise Next.js actions.

No new configuration is required. The existing dev server was preserved. Refresh an already-open admin page to load the current editor.