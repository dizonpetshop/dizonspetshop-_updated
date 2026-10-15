# Multi-product reservation cart and checkout

Implemented in the existing customer Products panel. The flow is Browse → Quantity → Add to Reservation Cart → Select items → Reserve Selected Products → Saved profile + pickup + payment preference → Confirm & Reserve Products.

## Files created

- `src/components/ReservationCart.tsx`: customer-specific persisted cart hook, quantity controls, cart dialog, selected-item checkout and confirmation.
- `src/lib/cart-rules.ts`: shared cart-input validation, pickup scheduling validation and existing-reference payment preference parsing.
- `scripts/ensure-reservation-checkout.mjs`: additive idempotency metadata migration.
- `scripts/test-cart.mjs`: integration coverage for multi-item orders, concurrency, retries, profile validation, rollback and cancellation.
- `scripts/browser-session.mjs`: headless Chrome/CDP test helper.
- `scripts/browser-cart-check.mjs`: real customer cart/checkout UI and persistence checks.
- `RESERVATION_CART_IMPLEMENTATION.md`: this report.

## Files modified

- `src/components/ProductCatalog.tsx`: per-card quantities and Add to Reservation Cart action, cart counter/header, original images/search/categories retained. The existing single-product details/reservation flow remains available.
- `src/app/client/actions.ts`: authenticated `getReservationCartQuote` and `checkoutReservationCart` server actions, reusing the existing customer/authentication, notification, audit and reservation architecture.
- `src/app/client/dashboard/page.tsx`: authenticated user ID for cart scoping and payment preference in existing reservation history.
- `src/app/admin/dashboard/page.tsx`: payment preference alongside existing pickup, all item names/quantities, saved contact details and status controls.
- `src/app/globals.css`: navy/blue cart, quantity controls, responsive item lists, checkout and payment cards.
- `prisma/schema.prisma`: checkout metadata relations; existing reservation/item/product models preserved.
- `scripts/ensure-mysql-operations.mjs`, `package.json`: includes migration via `db:checkout` and existing `db:upgrade`.
- `scripts/test-system.mjs`, `scripts/test-helpers.mjs`: cart integration/browser checks and validation tests; existing catalog action expectation updated for the new button text.

## Database changes

Applied `npm.cmd run db:checkout`. This creates only `product_reservation_checkout`, keyed by the existing reservation ID and linked to the existing customer. It records payment preference, a request token, and request fingerprint, with a unique `(customer_id, request_key)` constraint. The migration detects the existing MySQL parent key types and is idempotent.

Reservations still use the original `product_reservations` and `product_reservation_items` tables: one reservation with multiple child items. No duplicate products, disconnected order tables, cart database, replacement reservation system, or modifications to existing shop data/images were introduced. Normal stock deductions happen only for actual customer confirmations.

## Cart storage

Temporary state uses local storage under `dizons-reservation-cart-v1:<authenticated user ID>`. Only product IDs, integer quantities and selection flags are persisted. Prices, profile data and stock are never trusted from browser storage. Refresh/navigation retain the cart, while a different customer's UI loads a different key. Malformed stored entries are rejected. If browser storage is unavailable, the in-memory cart remains usable for that visit.

Repeated additions combine into one row per product and enforce available stock. Adding to cart does not reserve inventory or create an order. Removed/archived/out-of-stock products are flagged and excluded from checkout. Cart quantity corrections, removal, select-all and individual selection determine the checkout subset. Successfully reserved quantities are consumed from the cart; all unselected items remain.

## Customer profile and pickup

Preparing checkout authenticates the customer and fetches current product records and the saved customer profile. Customer name, phone and address are read-only. Missing/invalid contact number or missing address blocks confirmation and provides an Edit Profile action. Returning to Products and preparing checkout again refreshes saved details. The server ignores supplied name/contact/address overrides and re-reads the profile at confirmation.

The existing address requirement is preserved, but the UI explicitly describes it as customer contact information: pickup remains at the shop, not delivery.

Existing scheduling rules are preserved: Philippine time (Asia/Manila), future pickup between 9:00 AM and 7:00 PM, within 30 days. The UI offers half-hour pickup options; confirmation uses the existing inclusive operating-hour window and exact 30-day rule. No unsupported operating-day closures or artificial slot availability were invented. Existing reservation expiry continues to use the selected pickup deadline.

## Prices and payment

Each selected line has the latest unit price, quantity and subtotal, including existing half-kilo portion labels. Cart and checkout show product count, quantity, subtotal and final total. No existing VAT/tax calculation or additional-charge configuration was found in the reservation code; no taxes, fees or discounts were invented. Prices are unchanged. Final totals use Prisma Decimal arithmetic and authoritative database prices.

GCash, Maya and Cash are mutually exclusive preferences. The original payment-coded reference convention is retained, with an explicit metadata copy. Older references without a recorded preference display Not recorded instead of a guessed payment. No payment gateway is added and reservations are not marked paid. Payment is collected separately at the shop.

## Transaction and retry safety

1. Authenticate the customer; validate distinct product IDs, integer quantities and request token.
2. Serialize confirmations for the account; look up the customer-scoped idempotency token.
3. Return the original reservation for an identical retry. Reject changed payloads reusing a committed token, directing the customer to check Reservations.
4. Re-read saved profile, validate pickup/payment, and lock every product in ascending product-ID order.
5. Check every product's activity, quantity and current price against the prepared checkout. Price or stock conflicts identify the affected item and abort the entire transaction.
6. Calculate the total with Decimal, conditionally decrement all selected stocks, create one reservation and all item rows, and save retry metadata.
7. Write existing client/admin notifications, applicable low-stock notifications and audit history inside the same transaction.
8. Refresh customer/admin/home data and remove only successful quantities from the temporary cart.

The request fingerprint covers sorted items, quoted prices, pickup and payment. A retry returns the original committed record before revalidating changed inventory; it does not deduct stock again. Failed/conflicting confirmations roll back reservation rows, stock, notifications and metadata together.

Existing cancellation and automatic expiry transitions already iterate every reservation item and guard the status update before restoring stock. They are reused unchanged, preserving exactly-once restoration and old single-product history.

## UI

Original product images remain unfiltered and contained in the existing image system. Desktop cart/checkout has items on the left and a sticky summary on the right; tablet/mobile stack the sections. The native dialog supports focus containment, Escape and accessible close controls. Controls are labeled; selection checkboxes, step-one quantity inputs, read-only profile fields, payment radios, loading/error/success states and the cart counter are functional. Both light and dark modes use existing theme variables. Small-screen product cards use one full-width column.

## Verification

Executed TypeScript (`npm.cmd run lint`), Prisma schema validation, production build, helper tests and isolated system/browser tests. Test writes and browser fixtures are confined to brand-new audit databases; no fabricated inventory or reservations were inserted into the shop database.

New integration checks cover authoritative multi-item totals/profile/payment, one reservation/multiple items, concurrent cancellation restoring every quantity once, insufficient/inactive stock rollback, changed-price rejection, duplicate lines and decimal rejection, duplicate/conflicting request tokens, pickup/payment/profile validation, unauthorized callers, and competing customers reserving the last unit.

Real Chrome checks cover adding distinct/repeated products without duplicate rows; quantity adjustment/removal; select-all/individual selection; persisted selection after refresh; separation between customer accounts; no stock/order commitment before confirmation; missing profile blocking; actual saved read-only profile values; selected-only checkout; all three payment choices; stock deductions and unselected items remaining after confirmation. Cart and checkout are checked in light/dark themes at 1280, 800, 390 and 320 px. Screenshots and metrics are saved as `CART_*.png`, `CHECKOUT_*.png`, `CART_BROWSER_RESULTS.json`, and the existing system result/log artifacts.

## Configuration

No credentials or new external services are needed. The local metadata migration is applied. On another deployment, run `npm.cmd run db:checkout` (or `db:upgrade`) before the normal application build/restart. Browser storage must be available for persistence across visits; all financial/stock validation remains on the server regardless of browser state. Existing pickup-expiry scheduling and payment collection rules remain in place.

Final executed results: production build, TypeScript and Prisma validation passed; 9 helper tests and 63 system/browser tests passed with zero failures. Audit database `petshop_audit_89cd7a6e266a` is retained for inspection. The browser report contains 16 light/dark cart and checkout layout checks across 1280/800/390/320 px, all without horizontal overflow. The metadata migration was rerun successfully to confirm idempotency. No remaining configuration is required locally.
