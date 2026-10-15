# Customer reviews and ratings

Implemented October 15, 2026 in the existing Next.js/MySQL application.

## Routes and navigation

- `/reviews`: public reviews, rating overview, distribution, rating filter, and pagination (24 reviews per page).
- `/reviews?view=mine`: authenticated customer submissions, status, eligible appointments, editing and removal. The customer sidebar links here, reusing the public Reviews page.
- `/admin/reviews`: administrator/super administrator review management using the existing admin shell and sidebar.
- `/api/reviews`: GET public/mine/admin views; authenticated, same-origin POST create/edit/remove/moderate operations.
- Public Reviews navigation follows Contact, highlights the active page, and preserves the theme and account controls. Home anchors route back to the homepage from Reviews.

## Files created

- `src/lib/reviews.ts`: database queries, public statistics, ownership and eligibility validation, transaction-safe mutations and audit records.
- `src/app/api/reviews/route.ts`: authenticated HTTP interface, authorization, bounded JSON requests, error responses and no-store response headers.
- `src/components/ReviewsPanel.tsx`: shared public/customer/admin interface, forms, dialogs, filters and native keyboard-accessible radio stars.
- `src/app/reviews/page.tsx`: public/customer entry point.
- `src/app/admin/reviews/page.tsx`: authenticated admin entry point.
- `scripts/ensure-reviews.mjs`: additive, idempotent schema migration.
- `scripts/test-reviews.mjs`: isolated integration tests.
- `scripts/browser-reviews-check.mjs`: real Chrome browser submission and responsive layout checks.
- `REVIEWS_IMPLEMENTATION.md`: this report.

## Files modified

- `prisma/schema.prisma`: GroomingReview model and User/Customer/GroomingAppointment relationships.
- `src/components/PublicHeader.tsx`: Reviews route, active state and working homepage anchors across pages.
- `src/components/ClientDashboardShell.tsx`: customer Reviews link.
- `src/components/AdminSidebar.tsx`: admin Reviews link.
- `src/app/globals.css`: responsive themed review surfaces, overview, cards, filters, dialogs and accessible focus states.
- `package.json`: `db:reviews` command.
- `scripts/ensure-mysql-operations.mjs`: includes reviews in the existing upgrade workflow.
- `scripts/test-system.mjs`: includes review tests and optional browser audit.

Generated verification artifacts: `SYSTEM_TEST_RESULTS.json`, `SYSTEM_TEST_SERVER.log`, `REVIEWS_BROWSER_RESULTS.json`, and `REVIEWS_{1280,390}_{light,dark}.png`. Browser screenshots contain explicitly labeled test fixtures from an isolated audit database, not live customer reviews.

## Database migration

Applied `npm.cmd run db:reviews` to the current database and reran it successfully to verify idempotency. Creates only `grooming_reviews`; existing shop accounts, products, pets, appointments and reservations are preserved. No reviews are seeded.

The table has foreign keys to author, customer, appointment and moderator; a unique appointment ID; checked rating (1–5) and moderation status; publication/owner indexes; timestamps; moderation details; and a version counter. The migration detects existing parent ID types, including unsigned MySQL IDs. Parameterized SQL supports the current running Prisma client without requiring replacement of its Windows query-engine DLL. The Prisma schema also describes the new model for normal future generation.

## Customer workflow

1. A visitor opens Reviews. A guest is directed to existing customer login to write a review.
2. An authenticated customer selects one of their completed grooming appointments, showing its reference, pet and service.
3. They choose 1–5 stars, optionally enter a title (100-character maximum), and write a message (1–2,000 trimmed characters).
4. Server validates account, ownership, completion, rating, lengths and appointment uniqueness. Successful submissions receive a notice and appear in My Reviews as Pending.
5. Customer edits return the review to Pending and remove it from public results until approved again.
6. Customer removal hides the review from public results. Its historical row is retained for audit purposes and the appointment cannot receive a replacement review. Removed reviews cannot be edited or republished.

## Moderation and publication policy

Every new or edited review follows the same pending queue regardless of rating. Honest negative experiences are explicitly welcome. Content rules cover spam, unrelated content, harassment, hate speech, threats and private information.

Admin management supports search by first name, title, message or appointment reference; rating/status filters; dates; associated appointment, pet and service; pending/approved/rejected/hidden/removed counts; and public rating statistics. Admins can approve, reject or hide a review, providing a required reason. They cannot edit customer ratings or text, or publish customer-removed reviews. Each moderation action records actor, old/new status, reason, retained rating and timestamp in the existing audit log, atomically with the change.

Only Approved reviews whose associated appointment is still Completed and has the recorded customer are included in public cards, average, total, distribution and verified count. Pending, Rejected, Hidden, Removed and subsequently ineligible records are excluded consistently. Rating filters change the displayed cards; the overview continues to show the complete eligible public dataset.

## Security

- Existing signed session authentication, account status and session revocation checks.
- Server-derived customer identity and appointment ownership; no trusted client customer IDs.
- Role checks on both admin page and data/mutation endpoints.
- Database uniqueness and per-actor transactional locking prevent double submissions.
- Row locking and version checks protect edits/moderation against stale concurrent changes.
- Durable rate limit: at most 10 successful review changes per actor per minute, serialized against the user row and counted from audit history.
- Same-origin mutation enforcement and JSON content-type checks; request body limited to 16 KiB.
- Parameterized database queries; reviews rendered as escaped React text, including literal HTML.
- Public DTOs expose first name (or Customer), rating, review text, date, ID and verified badge only. Emails, phone numbers, addresses, account/customer IDs, appointment references and moderation details are excluded from public responses.
- Database errors return generic availability messages; details stay in server logs.

## UI

Uses existing theme variables and navy/royal-blue identity. Rounded cards, initials avatars, dates, verified badges, large average and distribution, public/mine tabs, admin filters, pagination and clear empty/loading/error states. Desktop/tablet/mobile grids use 3/2/1 columns. Native modal dialogs and radio inputs support keyboard operation, labels, Escape, visible focus and announced status/errors.

## Verification executed

- `npm.cmd run lint`: passed (TypeScript noEmit).
- `node --env-file=.env.local node_modules/prisma/build/index.js validate`: passed.
- `node node_modules/next/dist/bin/next build`: passed, including all three new routes.
- `npm.cmd run test:helpers`: 7 passed.
- `REVIEWS_BROWSER_AUDIT=1 npm.cmd run test:system`: 55 passed, zero failures. Latest isolated audit database: `petshop_audit_ff9cb169c6de`, retained for inspection.
- Review coverage includes unauthenticated/unauthorized requests, completed appointment/ownership checks, invalid rating and lengths, CSRF, concurrent duplicates, pending exclusion, one-star approval, moderation audit, hidden/rejected exclusion, privacy, filtering, stale updates, owner editing/removal, weighted averages, changed appointment eligibility and persistent rate limiting.
- Real Chrome verified customer form submission, radio-star ArrowRight keyboard selection, literal HTML rendered safely, success notice and Pending status. Checked both themes at 1280/800/390/320 px: 3/2/1/1 columns with no horizontal overflow.
- Existing accounts, login, appointments, reservations, inventory, notifications, messaging, loyalty, reporting and legacy PHP regression tests passed.

## Remaining configuration

None for this local installation: the schema is installed and existing authentication is reused. On another deployment, run `npm.cmd run db:reviews` (or `db:upgrade`) against that deployment's database before serving the new code; use the normal build/restart workflow. Staff must moderate the pending queue for reviews to become public. No genuine customer reviews have been fabricated or added to the live shop database.

## Subsequent UI updates

The public `/reviews` page now displays customer feedback cards only. Customer submission and management are inside `/client/dashboard?view=reviews`, using the existing portal navigation and header. `/reviews?view=mine` redirects to this portal view. The optional title input, customer rating overview, customer tabs/filter and large customer empty-state panel were removed at the user's request. Admin moderation retains its controls. Existing review titles in stored records are preserved.

## Product reservation reviews

Reviews now support both completed grooming appointments and completed product reservations. The customer form uses one selection list, labeling grooming options with the pet/service and product options with reserved product names. Ownership, completion and one review per target are enforced on the server. Pending, Approved, Ready for Pickup and Cancelled product reservations are ineligible; a completed pickup is required.

The existing `grooming_reviews` table is reused. Its appointment foreign key is now nullable, and `product_reservation_id` is a nullable, unique foreign key. A database CHECK requires exactly one target per review. The upgrade is idempotent and preserves all existing reviews. The Prisma model includes both optional relations.

Product feedback supports the same editing, removal, pending moderation, auditing and privacy rules. Public eligibility and aggregate statistics cover approved reviews for either completed target. Product review badges read Verified Product Reservation; grooming badges retain Verified Grooming. Product names and reservation references are visible to the owner/admin, and public DTOs omit reservation identifiers. Admin search includes both kinds of reservation reference.

The review form now requires a review type before selecting its completed transaction: Store Grooming, Home Service, or Products. Eligible grooming choices use the stored appointment booking type to separate salon and home service records. Changing type clears the selected transaction; Submit stays disabled until a matching completed transaction is selected. Existing ownership and duplicate protections remain authoritative on the server.
The completed-transaction dropdown was subsequently removed at the user's request. Choosing Store Grooming, Home Service, or Products now automatically uses the most recent eligible completed transaction of that type; existing server ownership, completion and duplicate checks remain enforced.

## Automatic approval

New reviews and customer edits now run local deterministic content screening on their title/message before saving. A passing review is Approved immediately; a flagged review is Pending for administrator assessment, never automatically rejected or deleted. Star rating is not an input to screening, and a real one-star complaint is covered by the integration tests. Screening covers recognizable contact/payment/address information, links/promotional and repeated spam, embedded markup, selected unrelated campaign content, targeted insults, explicit threats and hate-speech patterns in English/Filipino. These are heuristic checks, not comprehensive semantic/AI moderation: unusual wording can be missed and innocent text can be flagged. Admin review/hide/reject controls remain available for corrections.

Automatic reasons, timestamps and audit descriptions are stored atomically with submissions and edits; automatic decisions have no human moderator ID. No new credentials, external API or schema changes are required. `npm.cmd run reviews:screen-pending` applies the same screening to currently Pending eligible reviews, with locking, per-review audit history and idempotent updates; Approved/Rejected/Hidden/Removed records and ratings/content are preserved. No scheduled job is required for future submissions because screening runs directly in the server mutation.

Verification: TypeScript and production build passed; 8 helper tests and 57 isolated system/browser tests passed. Coverage includes English/Filipino criticism, flagged private information, automatic approval of one-star product feedback, re-screening edits, unchanged admin decisions, idempotent pending processing and the existing customer portal review flows.

## Immediate publication without bookings (latest policy)

This supersedes the earlier transaction eligibility and automatic screening policies. A signed-in customer now enters only a star rating and review message, then submits; the review is saved and public immediately. No appointment, home service or product reservation is required, and transaction completion is not checked for publication. New reviews and customer edits are always Approved without a pre-publication admin/content queue. Administrative hide/reject controls remain available after publication.

The existing table is preserved. Its check constraint now permits no transaction reference while still disallowing two simultaneous references. Existing foreign keys and optional linked-transaction uniqueness remain. The API continues to reject another customer's supplied transaction IDs, and existing referenced transactions no longer need Completed status. General reviews are labeled internally as general and never treated as verified grooming/purchases. Public lists and totals include all Approved reviews, independent of transaction state.

The form no longer has hidden transaction selection or eligibility-based disabling. Login, required 1�5 rating, trimmed message length, escaped text rendering, owner-only editing/removal, version checks, audits and per-user rate limits remain. The pending-review utility now publishes existing Pending reviews without content/completion gating, preserving already Hidden/Rejected/Removed records. No new genuine customer content is generated.
