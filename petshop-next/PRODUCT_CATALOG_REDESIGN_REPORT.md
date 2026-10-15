# Products catalog and reservation modal redesign

The existing client Products view now follows the supplied compact shop layout:
search/category toolbar, scrollable category tabs, four desktop cards per row,
large image areas, real stock labels, red sold-out overlays and round view buttons.
Cards use the existing navy/blue theme in dark mode and readable light styling.
Tablet/ordinary mobile layouts use two columns; very small phones use one column.

Click a product to open its native-dialog details view with original product image,
description, unit price and quantity. Proceeding checks the current authoritative
product stock/price through the existing server action, then shows a reservation
dialog with item summary, total, pickup schedule, contact/address fields and payment
choices. Both dialogs share the existing component; no duplicate product page or
independent cart/backend was introduced. Native modal focus trapping/return and
Escape closing are preserved; outside clicks close the dialog. Close/back controls
are disabled during submission. Sold-out products remain viewable but cannot be
reserved. Stock changes are revalidated by the existing transactional backend.

The reference's delivery and credit-card options are not currently supported by
this project's reservation backend. This implementation keeps actual **shop pickup**
and **Cash / GCash / Maya** choices. It does not process electronic payments; the
selected method is retained through the existing reservation reference flow.
Account ownership comes from the authenticated customer, not an editable owner
field. No fake ratings, sales counts or replacement product photographs were added.
Existing products, inventory, prices and reservation records were not changed by
this UI work. Test fixtures and test reservations live only in isolated audit DBs.

## Modified files

- `src/components/ProductCatalog.tsx`: compact cards, category tabs and two-stage
  modal, fresh stock verification and original image fallback.
- `src/components/ProductReserveForm.tsx`: initial quantity/summary synchronization,
  submission state, supported payment radio choices and confirmation label.
- `src/app/globals.css`: scoped card/modal/responsive/theme styles.
- `scripts/browser-check.mjs`: updated UI selectors, stock behavior, categories,
  modal/quantity/Escape/theme checks and real test reservation assertions.
- `scripts/test-system.mjs`: stock-label case-independent checks, optional
  `PRODUCT_BROWSER_AUDIT` flag and browser database assertions.
- This report and generated result/screenshot artifacts.

## Verification

Production build and project lint (`tsc --noEmit`) passed. The full isolated run
passed **46/46 checks**, including existing reservation totals, stock deduction,
repeat submission protection, concurrent cancellation/oversell protection, admin
inventory synchronization, authentication and attendance automation; retained DB
`petshop_audit_d9cd6dfe73be`.

Browser checks cover image loading, search, dropdown and category-tab filtering,
sold-out reservation blocking, desktop/tablet/mobile columns and overflow, details
modal, Escape closing, quantity transfer to checkout, reservation layouts in both
themes, and actual submission. The test reserved two Aozi units, verified the saved
quantity/authoritative total and stock decreasing from two to zero. No shop fixture
or production reservation was created.

Catalog widths checked: 1200, 992, 390 and 320px. Reservation widths: 1280, 768, 390
and 320px in light/dark modes. Artifacts include `PRODUCTS_*`,
`PRODUCT_DETAILS_AUDIT.png`, `PRODUCT_RESERVATION_*`, `BROWSER_TEST_RESULTS.json`
and `SYSTEM_TEST_RESULTS.json`. Enable `$env:PRODUCT_BROWSER_AUDIT='1'` before
`npm.cmd run test:system` to repeat the product browser checks without enabling
unrelated browser suites. No database migration or new configuration is required.

Final focused run after alignment and image-frame polish: **3/3 checks passed**, retained database
`petshop_audit_36bb8aa53616`. Catalog and reservation modal widths/themes and the
actual test reservation were verified again against the final production build.
