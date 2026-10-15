# Grooming loyalty policy

The poster policy replaces the former ten-stamp redemption cycle. One stamp is earned per newly completed grooming appointment. Pending, cancelled and no-show appointments do not earn stamps.

| Completed visit | Benefit on that appointment |
| --- | --- |
| 1 | Free loyalty membership and first stamp; regular service price |
| 5 | 50% off service subtotal |
| 6 | Regular service price |
| 10 | 50% off service subtotal |
| 11 onward | Lifetime VIP: 10% off all services |

Discounts include grooming package and service addons; product reservations do not receive this service discount. There is no ten-stamp cap or redemption reset. Once earned, VIP remains permanent, including after an audited staff correction of the completed visit count. The old redemption action rejects reset requests. Store promotion stacking requires defined campaign rules; no extra promotion rates are invented.

## Pricing and completion

Bookings save the undiscounted service subtotal and show an estimated discount. Actual completion order determines the milestone, so concurrent bookings cannot both claim the same fifth or tenth visit. Staff completion locks the customer and programme row, increments the count, applies the discount, saves the invoice breakdown, updates the appointment total and records the ledger and notification in one transaction. Repeated completion requests award only once. Currency totals are rounded to two decimal places before calculating the discount amount. Client and administrator appointment cards show the breakdown.

The account card displays real progress toward the eleventh-visit VIP milestone, earned stars, the two 50% milestones and clickable explanations. Clients cannot award stamps by clicking stars. Authorized staff corrections require a reason and audit entry. Settings now describe the fixed policy instead of offering the obsolete ten-stamp reward label.

## Database and compatibility

`npm.cmd run db:loyalty` installs the idempotent migration; `db:upgrade` includes it. The migration has already been applied to the local shop database.

- `customer_loyalty_program` stores completed visits and permanent VIP status.
- `appointment_loyalty_pricing` stores subtotal, estimated rate and final discount.
- Existing customer counters, loyalty ledger and notifications remain compatible.
- Next.js and legacy PHP booking/completion paths use the new policy.

The initial count is the greater of the existing stamp balance and completed appointment history, avoiding double counting those two representations. Existing programme records are preserved on subsequent migration runs. Prior redeemed paper-card visits absent from both records require an audited staff correction. Historical completed invoices are preserved. Older unfinished appointments get their subtotal snapshot from the stored total when completed. No new environment variables or scheduler configuration are required.

## Validation

The isolated integration suite covers visits 1–12, fifth/tenth discounts, sixth regular pricing, eleventh lifetime VIP, rounding, repeated/concurrent completion, unauthorized completion, cancellation, staff corrections and rejection of the old reset. Test records stay in an isolated audit database; no test visits are completed in the shop database.

The recorded run passed 46/46 system checks and 5/5 helper checks. Production build, TypeScript, Prisma schema validation and legacy PHP syntax checks passed.