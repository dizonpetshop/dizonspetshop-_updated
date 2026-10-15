# Responsive Product Reservation Studio

The existing product reservation flow now uses one responsive Studio: an editable cart beside checkout on desktop, stacked panels on tablet, and five sequential steps on mobile. It uses the original account, cart storage, products, inventory, reservation tables, checkout action, cancellation action, notifications, and PDF receipt.

## Files and shared components

- `src/components/ReservationStudio.tsx` — shared desktop/mobile dialog, selected-product cart, saved profile, inline profile editing, pickup controls, payment cards, final review, error/retry/loading states, confirmation, receipt link.
- `src/components/ReservationCart.tsx` — existing account-specific persistent cart hook and shared quantity component; re-exports the Studio as the default component, so ProductCatalog keeps its existing integration.
- `src/components/ReservedProductItems.tsx` — shared rendering of stored quantities, unit prices, and item subtotals in client history and admin reservations.
- `src/app/globals.css` — scoped Studio surfaces, responsive columns, mobile timeline, control states, skeletons, and touch sizing. Existing navy/blue and light/dark tokens remain authoritative.
- `src/lib/cart-rules.ts` — shared pickup policy, generated time options, configured operating days/hours, interval checks, future-date/hold-window validation, existing cart input validation.
- `src/lib/product-pickup-policy.ts` — reads optional pickup configuration from the existing settings table; preserves prior behavior when absent and rejects malformed configuration.
- `src/app/client/actions.ts` — quote now includes pickup policy; confirmation validates that policy inside the existing stock transaction. Existing inline profile save is reused.
- `src/app/client/dashboard/page.tsx` and `src/app/admin/dashboard/page.tsx` — stored item price breakdown added to existing reservation views.
- `scripts/browser-cart-check.mjs` — real Chrome checks for selections, persistence, profile editing, timeline validation/navigation, responsive state retention, checkout, PDF access, and stock effects.
- `scripts/test-cart.mjs` — configured pickup-day/hour validation added to existing transaction/concurrency tests.
- `scripts/browser-session.mjs` — random debug port prevents collisions with previous browser runs.

## Desktop, tablet, and mobile

The desktop content uses approximately 57% cart / 43% checkout, with a minimum checkout width of 350px. A container query stacks the panels when the dialog is too narrow. The dialog escapes the dashboard sidebar without changing other dashboard layouts.

At 600px viewport width and below the same form becomes a vertical five-step flow:

1. Select products and quantities.
2. Review or update saved customer details.
3. Choose pickup date and time.
4. Choose GCash, Maya, or Cash.
5. Review products, customer, schedule, payment preference, and total; confirm.

Back/Continue preserve state. Progression checks each required step. Enter on an earlier mobile step advances validation instead of creating a reservation. Resizing changes presentation without resetting the form. Step changes focus the dialog heading, and inactive mobile sections are removed from the visual/accessibility flow with CSS display rules.

## Profile and cart behavior

Customer details come from the authenticated account. Checkout starts read-only; Edit Profile stays inside the Studio. Saving uses the existing authenticated profile action and reloads the authoritative quote without clearing cart selections or pickup fields. Edit/display fieldsets use distinct keys to prevent React from carrying a name/phone display value into a different editor field.

Repeated additions merge quantities. Quantities remain positive integers and are limited by current catalog stock. Selection, Select All, removal, selected-only totals, account-specific localStorage persistence, and unselected-item retention reuse the original hook. Cart changes request fresh prices/profile details but never reserve inventory.

## Database, pricing, API, and inventory

No schema migration or new cart/reservation database was introduced. No source products, prices, images, stock quantities, or historical reservations were rewritten by this implementation. The existing quote and checkout Server Actions remain the API boundary. The existing customer-owned PDF receipt endpoint is preserved.

The backend still locks the customer and then selected product IDs in ascending order, validates all products/prices/profile/schedule/payment, computes totals with Prisma Decimal, conditionally deducts stock, creates one reservation and all item rows, and commits notifications/audit records in the same transaction. Any failure rolls back the entire reservation. A customer-scoped request key and fingerprint prevent duplicate commits and conflicting retries. Network uncertainty keeps the same request token and locks edits until retry resolves the outcome.

Cancellation uses the existing compare-and-set transition and restores committed item stock once. Histories and Admin Orders read the same reservation header/items. Stored unit prices remain unchanged after catalog price edits. Choosing a payment preference does not record collected payment or complete an order.

## Pickup configuration and tax audit

The source database had no shop opening-hours, closed-days, or VAT-rate configuration. The prior cart policy was 9 AM–7 PM, every day, half-hour choices, a 30-day maximum, and Asia/Manila. Those existing defaults remain in effect; this implementation does not claim they are independently verified physical shop hours.

An optional `system_settings` key `product_pickup_policy` can now hold the shop's confirmed schedule as JSON, for example:

```json
{"opens":9,"closes":19,"intervalMinutes":30,"maxDays":30,"days":[0,1,2,3,4,5,6]}
```

Days use Sunday=0 through Saturday=6. Hours are whole-hour boundaries; interval supports 15, 30, or 60 minutes; maximum hold window is 1–30 days. Timezone remains Asia/Manila. No setting is inserted automatically. Invalid settings fail safely rather than silently substituting another schedule. A closed date produces an informative error and is rejected by the server.

The existing reservation price calculation has no configured VAT or additional fees. It remains the sum of authoritative item prices, with zero added charges. No arbitrary 12% charge or inferred VAT component was introduced. This does not label the business VAT-exempt or determine whether existing catalog prices already contain tax. Actual tax treatment and physical operating hours require business confirmation before changing those rules.

## Verification

Completed on October 15, 2026:

- Production build, including TypeScript: passed.
- Helper suite: 9 passed.
- System suite: 63 passed, 0 failed, including the Chrome cart/checkout audit. Audit DB: `petshop_audit_216f7a05a209`.
- Responsive browser measurements: 18 layout/theme combinations, no horizontal overflow.
- Browser-confirmed inline profile update, all five steps, invalid-step blocking, Back/Continue state preservation, resizing without reset, selected-only checkout, unselected retention, exact stock effects, and a real owner-only PDF download.
- Desktop and mobile screenshots inspected: `CART_1280_dark.png` and `CHECKOUT_390_dark.png`.

The first sandbox browser attempt stalled; a permitted Chrome run exposed a tablet checkbox overflow, which was fixed. A later browser assertion incorrectly found the hidden My Account fields; the test was scoped to the Studio. The final full run above completed successfully. The unrelated review UI browser audit was not rerun; review API/authorization regression tests in the system suite passed. Node emitted the existing module-type warning, which did not fail the tests.

Production build, helper tests, transaction/integration tests, and Chrome checks are run against this implementation. System tests create a separate disposable audit database and retain it for inspection; they do not mutate shop records. See `SYSTEM_TEST_RESULTS.json` and `CART_BROWSER_RESULTS.json` for the latest completed run and generated responsive screenshots.

The browser suite covers widths 1440, 1280, 800, 390, and 320 in light and dark mode, then final review at desktop/tablet/mobile widths; checks no horizontal overflow, combined desktop presentation, five-step validation and backtracking, inline profile updates, resize preservation, real stock commit, unselected retention, and customer-only PDF generation. Backend tests cover atomic rollback, stale prices, same/different customer concurrency, request idempotency, profile/payment/date validation, cancellation, notifications, and history visibility.

Only tests actually completed successfully are reported in the final chat response. Live collection of GCash/Maya payments is outside the reservation preference flow; no gateway was added.
