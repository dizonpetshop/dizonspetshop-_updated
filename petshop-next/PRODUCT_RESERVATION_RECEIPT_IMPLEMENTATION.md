# Product reservation confirmations

The existing product reservation PDF endpoint now produces a branded, itemized A4 confirmation. A secure HTML view adds browser printing. Both use the same authenticated server-side receipt data builder and the original reservation header/items. No second reservation or payment system was created.

## Files created or modified

- `src/lib/reservation-receipt-data.ts`: customer/admin authorization; authoritative item prices and totals; snapshot loading/reconciliation; real product pickup policy; shop details; shared receipt totals.
- `src/lib/reservation-receipt-pdf.ts`: original logo, white/navy A4 document, item table, repeated table headers, row-aware pagination, reference/page-number footers, 10–11pt body text, totals and policy notes.
- `src/lib/reservation-tax.ts`: Decimal calculations for inclusive, exclusive, exempt, zero-rated, unconfigured, and mixed product treatments; explicit free-item validation.
- `src/app/api/reservations/[id]/receipt/route.ts`: existing PDF endpoint, now shared data/PDF builder, customer or admin access, private no-store responses, reference-based filename.
- `src/app/reservations/[id]/receipt/page.tsx`: secure printable white receipt using the same data and summary.
- `src/components/ReceiptControls.tsx`: Download PDF and Print Receipt outside printed content.
- `src/components/ReservationReceiptLinks.tsx`: shared view/print/download links for history and admin.
- `src/components/ReservationStudio.tsx`: success View/Print link; quote total protection and added-VAT preview.
- `src/components/ProductReserveForm.tsx`: single-product checkout loads authoritative quantity-specific totals, including configured tax, before enabling confirmation.
- `src/app/client/actions.ts`: quotes and both single/multi-product confirmations calculate tax from settings, validate prices, and save snapshots in the same reservation transaction. Optional expected-total checks reject stale quotes; existing scripted callers retain compatibility.
- `src/app/client/dashboard/page.tsx`, `src/app/admin/dashboard/page.tsx`: receipt links in existing product reservations.
- `src/app/globals.css`: white receipt styling, responsive layout, A4 print CSS, repeated print table headers, row break protection, screen-only controls.
- `next.config.ts`: original logo included in PDF endpoint file tracing.
- `scripts/ensure-reservation-receipts.mjs`, `scripts/ensure-mysql-operations.mjs`, `package.json`: additive snapshot migration, upgrade integration, `npm run db:receipts`.
- `scripts/test-receipts.mjs`, `scripts/test-system.mjs`, `scripts/test-helpers.mjs`, `scripts/browser-cart-check.mjs`: tax, historical integrity, access, multipage PDF and real Chrome print checks.

## Layout and document contents

The header uses `public/assets/dizons-logo.jpg`, the actual shop logo, and identifies the document as PRODUCT RESERVATION CONFIRMATION. It includes the reference, generation timestamp, reservation creation timestamp, status, customer name/contact/address, Product Pickup type, payment preference, pickup date/time/location, product pickup grace, and applicable pickup deadline. All dates use Asia/Manila.

The product table includes item number, product name, quantity, stored unit price, and line total. Monetary columns align right. Summary rows show only applicable tax categories and preserve the stored reservation total. Long PDFs repeat table headers on continuation pages, keep ordinary product rows together, and show page numbers/reference on every page. Browser printing hides the action bar and repeats the table header; A4 print generation was checked in Chrome.

Filename: `Dizons_Product_Reservation_[Reference].pdf`.

## Real business details

The optional existing `system_settings` keys `business_name`, `business_address`, `business_phone`, and `business_email` override the established public ContactFooter details. Without those settings the receipt uses the same published shop details already in this project: 037 E. Pascual St., Tangos South, Navotas, Philippines 1489; 0945 260 8113; dizonspetgrooming@gmail.com. No TIN, VAT registration number, accreditation, permit, receipt serial, or payment transaction ID was invented.

## Tax configuration and immutable snapshots

The source audit found no configured tax policy. No 12% tax was enabled automatically, and no historical receipt was reclassified as VAT-exempt. Future reservations default to the existing sum of stored item prices when tax treatment is unconfigured.

Authorized business configuration can use `system_settings.product_reservation_tax_policy` as JSON:

```json
{
  "treatment": "inclusive",
  "rate": "0.12",
  "products": {"123": "exempt", "456": "exclusive"},
  "freeProductIds": []
}
```

This is an example format, not an assertion that the business is registered for VAT. Only an authorized operator should set confirmed business tax rules. No policy or free-product list is inserted automatically. Treatments: `inclusive`, `exclusive`, `exempt`, `zero-rated`, `unconfigured`. Product-specific entries override the default; the configured rate is shared. Invalid configuration fails safely. This task does not add a tax-settings admin editor or determine the shop's legal tax status.

Inclusive VAT is extracted once from the line gross; exclusive VAT is added once; exempt and zero-rated items add no VAT. Prisma Decimal is used throughout, with line-level rounding to two decimal places. The backend recalculates the authoritative total inside the stock transaction; UI previews do not set prices. Legitimate configured fees were not present, so none were fabricated.

An additive `product_reservation_receipt_snapshot` table stores the item/tax calculation for each new reservation. Snapshot creation is in the same transaction as item creation and stock deduction. Current tax settings never rewrite a saved snapshot. Existing reservations are not backfilled with today's settings: they retain their prices and totals and show a note when historical tax treatment was not recorded.

If a snapshot differs from the item records, the receipt renders the actual stored item prices, flags the inconsistency, and preserves the original reservation total. Discrepancy audit notes are available in the existing audit workflow and the admin receipt view. Catalog price changes do not change past receipt prices.

## Zero-price audit and unresolved data

The source audit found 10 active catalog products priced at zero, including Abalone Beef Cat Treats, and 3 historical reservation items priced at zero across 3 reservations. There were 0 differences between existing reservation header totals and sums of stored item prices at audit time.

There was no recorded legitimate-free-item confirmation for those historical zero prices. Their original values were preserved; three reconciliation notes were added to the existing audit log for authorized review. This does not assert that the products are free or substitute today's catalog price into history.

New reservations reject zero authoritative prices unless that product ID is explicitly configured in `freeProductIds`; negative/nonfinite prices are rejected. The 10 source product prices were not changed. An authorized operator must confirm their intended prices or legitimate free status. Historical zero-price notes remain unresolved until that review occurs.

## Pickup grace and expiration

The receipt reads the existing product-specific `product_reservation_expiry_grace_minutes` and activation cutoff `product_reservation_expiry_enabled_after`, exactly as the existing product expiration processor does. It never uses grooming grace. The source product pickup grace is 0 minutes. Existing expiration activation/cancellation behavior was preserved.

For an eligible reservation with valid settings, the deadline is stored pickup time plus configured product grace, in Philippine time. Reservations outside the activation cutoff do not receive a fabricated enforced deadline. If no valid product grace is recorded, the receipt says it is not configured. Automatic cancellation is mentioned only when the actual existing policy applies. Policy details are current at generation time because the existing scheduler itself enforces the current product settings; no new independent deadline engine was introduced.

## Payment and access

GCash/Maya/Cash remain preferences. The existing product reservation schema has no independently reliable collected-payment status, so no reservation is marked Paid or assigned an invented payment reference. The receipt says payment is collected separately and is not proof of payment. Reservation status remains distinct from payment.

Customers can view/download only their own reservations. Admin and Super Admin accounts can view/download reservations through the same builder. Authentication checks account status and existing sessions. Changing the URL ID cannot expose another customer's receipt. The success screen, client history, and Admin Orders all link to the same authoritative receipt routes.

## Verification

Final completed run on October 15, 2026: production build passed; TypeScript/lint passed; 10 helper tests passed; 67 system/browser tests passed with 0 failures. Final isolated audit database: `petshop_audit_2609a3e1ffc6`. Browser print artifact: `RECEIPT_PRINT_AUDIT.pdf`; inspected mobile screenshot: `RECEIPT_320.png`. The browser audit also verified receipt responsiveness, original logo loading, and that print controls are hidden in print media.

The additive migration was applied and rerun successfully without changing historical reservations, catalog prices, stock, or images. Source changes were limited to the new empty metadata table and the three explicit audit notes; test writes use separate audit databases.

Coverage includes inclusive/exclusive/exempt/zero-rated/mixed Decimal calculations, no double VAT, free-item validation, committed tax snapshots, snapshot tampering/reconciliation, catalog/config changes after confirmation, a 100-item multipage PDF, reference-based filenames, original logo loading, product grace plus deadline, customer isolation, admin access, Chrome A4 print-to-PDF, hidden print controls, receipt layouts at 1280/390/320px, and the existing cart/stock/cancellation regression suite. Test results and final counts are recorded in the final chat response and `SYSTEM_TEST_RESULTS.json`.

Actual paper printer output, the legal suitability of tax settings, and the intended prices/free status of the 10 zero-price products require business-side verification. No real payment gateway was added or tested.
