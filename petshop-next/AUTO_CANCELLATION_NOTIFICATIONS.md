# Automatic cancellation notifications

Grooming no-show cancellations already notified the client and administrators transactionally. Their notification now also includes the reservation reference alongside pet, service, schedule and reason. Existing attendance rules and grace period are preserved.

Product auto-expiry is now enabled with the customer-approved rule: uncollected Pending, Approved and Ready for Pickup reservations cancel at the selected pickup deadline, without an additional grace period. Completed and Cancelled records are excluded. Reservations whose deadline was already overdue before activation are preserved.

The existing protected grooming scheduler endpoint also processes product expiry. Each product reservation is locked and checked again before the existing status transition cancels it and restores stock. Cancellation, stock restoration, client/admin notifications and audit entry commit together. Concurrent or repeated runs cannot restore the stock or notify twice. Reservation totals and historical item prices remain unchanged.

The client receives an in-app notification with reservation reference, products, pickup deadline, cancellation reason and a link to Reservations. Existing bell/unread and Notifications refresh behavior displays it. Email and SMS were not added.

## Files

- `src/lib/product-reservation-expiry.ts`: expiry processing and notifications.
- `src/lib/grooming-attendance.ts`: grooming notification reference.
- `src/app/api/cron/grooming-no-shows/route.ts`: combined protected job.
- `scripts/ensure-product-expiry.mjs`: idempotent activation settings; installed locally with `npm.cmd run db:product-expiry`.
- `scripts/ensure-mysql-operations.mjs`, `package.json`: upgrade/command integration.
- `scripts/setup-attendance-task.ps1`: scheduler description and Windows path ownership check.
- `scripts/test-system.mjs`: product expiry integration coverage.

## Verification

Production build and TypeScript passed. Final integration run: 48 checks passed, zero failures. It verifies expired active statuses, future/completed/cancelled/preactivation exclusions, one notification per client, reference/reason content, reservation links, one audit event, concurrent runs, stock restoration exactly once, and competition with staff completion. Grooming auto-cancellation notification checks also passed. Test fixtures were confined to an isolated audit database.

The existing Windows task `DizonPetshopGroomingNoShows` was verified as belonging to this project, Ready, with last result 0 and a recurring one-minute trigger. Direct execution of `scripts/run-attendance-job.mjs` succeeded and returned `productReservations.enabled: true` and `graceMinutes: 0`, alongside the existing grooming results. No source reservations needed cancellation during that manual verification.

The scheduler requires this Windows user to remain signed in, MySQL running, and the Next.js server available at its configured local URL. Notifications appear after the scheduler processes a missed deadline, normally within the next one-minute run, followed by the existing notification feed refresh. No destructive migration or product data reset was used.