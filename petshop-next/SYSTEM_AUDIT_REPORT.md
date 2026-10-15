# Dizon's Pet Grooming — system audit and repair

Audit date: 14 October 2026 (Asia/Singapore).

Follow-up customer login repair: see [AUTHENTICATION_FIX_REPORT.md](AUTHENTICATION_FIX_REPORT.md).
The running development server rejected successfully issued sessions because
its stale Prisma client lacked the revocation model. The repair preserves
revocation checks, adds startup generation and transactional registration with
profiles, and passes 41 regression cases including a real browser login flow.

The existing application was repaired in place. The Next.js and PHP applications
continue using the same local MySQL database, `petshop_db`. Existing accounts,
passwords, customer records, pets, reservations, product prices, and original
image files were preserved. No production deployment was performed.

## Module inventory and status

| Module | Implementation and verification |
| --- | --- |
| Client registration/login/logout | Database-backed registration, bcrypt passwords, role checks, timed lockout, session validation and logout revocation. HTTP workflows tested. |
| Administrator login | Active Admin accounts only. Existing administrator account retained with its existing password. HTTP login and authorization tested using isolated generated credentials. |
| Super Admin | First setup requires an existing active administrator's password. Setup is serialized, closes after first promotion, and account management remains restricted to Super Admin. |
| Account/profile | Existing contact editing retained; authenticated password-change interface added to client and admin profiles. Password changes invalidate other sessions. |
| Password recovery | Next.js reset codes are verified transactionally, with concurrent attempt limits and one-time consumption. PHP recovery no longer exposes codes after email failure. Actual email delivery is blocked by missing SMTP settings. |
| Client pets | Name, species, breed, age/DOB text, gender, photo upload, editing and safe archival. Ownership enforced. Appointment history retained. |
| Admin pets | Pet-management view added to the existing dashboard/sidebar with customer association, search/species filters and authorized editing. |
| Grooming | Original services/pricing restored. Package/size pricing and optional add-ons displayed. Available slots reflect groomer schedules and occupied slots. Server enforces ownership, dates, 90-day horizon, schedule availability and conflict checks. |
| Grooming administration | Guarded status transitions, confirmation/cancellation and recipient notifications. Existing scheduling and pricing controls retained. |
| Products/inventory | Existing catalog and images retained. Admin edits synchronize with client refresh. Stale stock edits are rejected instead of overwriting concurrent reservations. |
| Client product UI | Search and Category only; 4/2/1 columns; original images; green/red badges; consistent Reserve Product label; unavailable products disabled. Browser checks and screenshots produced. |
| Product reservations | Fresh product lookup, database pricing, quantity validation, serializable stock deduction, duplicate-submission protection and guarded stock restoration. Concurrent requests tested. |
| Reservation history | Customer ownership filters retained; refreshed statuses, cancellation notices and price/date rendering preserved. |
| Notifications | Client event producers added; existing menu/center connected and styled; unread counts, recipient isolation, mark-as-read and refresh supported. PHP publishes to the same notification table. |
| Loyalty/settings | Existing database-backed controls retained. The configured loyalty reward label is now used in the client dashboard. |
| Reports/audit | Manila date boundaries corrected independently of server timezone; TIME fields formatted as wall-clock times; arbitrary 100-record truncation removed from history/pagination; long reporting trends no longer silently stop at 24 months. |
| Reminder cron | Latest completed visit selected correctly, recent/upcoming visits excluded, separate reminder-delivery tracking and concurrent send claims added. Missing credentials produce a retryable failure. |
| Legacy PHP | Shared account/status checks, independent secure session namespace, CSRF-origin checks, pet ownership, canonical product statuses, safer recovery, authenticated photo controllers and UTC metadata writes. |
| Deployment | MySQL environment template and explicit upgrade/check scripts replace PostgreSQL-only deployment assumptions. Vercel build no longer changes the database automatically. |

## Root causes found

1. Grooming configuration tables were empty despite the original SQL containing
   the published price list and the original groomer setup.
2. Prisma TIME comparisons using Date objects missed occupied grooming slots.
   Explicit MySQL wall-clock comparisons and transaction locks fix that path.
3. Cancellation used read-then-write status changes, allowing two concurrent
   callers to restore the same stock. A conditional status transition now claims
   the update before stock restoration.
4. Client notifications had UI/API code but no corresponding event producers,
   dashboard panel, or styles. Events and the interface are now connected.
5. JWT role claims alone did not immediately reflect suspension, password
   changes, or logout. Account validation, credential fingerprints, unique
   session identifiers and revoked-session records now enforce those changes.
6. Legacy password recovery exposed the verification code if email failed.
   That account-takeover bypass was removed; codes are hashed, limited and
   consumed transactionally.
7. PHP used local-time metadata writes while Next.js treats DATETIME values as
   UTC. This put PHP notifications in the future and extended effective holds
   by eight hours. New PHP writes and metadata formatting now use UTC. Grooming
   DATE/TIME fields remain local wall-clock values.
8. PHP pet age/gender inputs were discarded, posted customer IDs were trusted,
   and opening pet registration without a query-string ID produced ID zero.
   The fields now persist and the customer is derived from the authenticated
   account.
9. Uploaded PHP photos were public paths. Customer-photo markup now uses an
   authenticated controller; the uploads directory denies direct Apache access.
10. PostgreSQL migration files/configuration conflicted with the active MySQL
    schema. Historical PostgreSQL migrations were retained but are not invoked
    by the repaired deployment path.
11. PHP contained a hardcoded SMTP credential and disabled certificate checks.
    Credentials now come from environment variables and normal TLS validation
    is restored. Revoke the old credential at the mail provider.
12. Windows mixed path casing and shared development/production build output
    caused module/build problems. Use the consistent lowercase `dizon` path;
    development output is now `.next-dev`, production output `.next`.

## Database changes and restored data

The repeatable, additive upgrade is `scripts/ensure-mysql-operations.mjs`.
Changes applied locally:

- `pets.is_active`: defaults to 1, preserving visibility of existing pets.
- `pets.age_dob` and `pets.gender`: nullable fields; existing unknown values were
  not invented.
- `pets.photo_path`: widened to LONGTEXT for validated database-backed images;
  existing filesystem paths remain supported.
- `grooming_appointments.reminder_email_sent_at`: separate from initial
  confirmation-email tracking.
- `appointment_addons`: created only if absent, with identifier types matched
  to the existing parent tables.
- `revoked_sessions`: stores hashed session identifiers and expiry timestamps.

`scripts/restore-grooming.mjs` restored only verified original data: 5 styles,
25 style/size prices, 5 add-ons, and the 2 groomers and initial schedules present
in `database/migrations/20260915_grooming_reservations.sql`. A repeat run added
no duplicates and preserved existing values/schedules.

The 14 original products remain intact. All original public product images were
compared with `pictures` and matched byte for byte. Current physical inventory
is not documented, so quantities remain zero until confirmed in Admin Inventory.
Previously discarded age/gender entries cannot be reconstructed automatically.

No database reset/drop, deletion of business records, or guessed stock refill
was performed. Tests write only to new `petshop_audit_*` databases. Those test
databases are retained for inspection; generated credentials are random and
never used for the real shop's administrator account.

## APIs, UI and security

The existing auth, notifications, report, product-image and cron endpoints were
retained and repaired. `/api/pets/[id]/image` and PHP `public/photo.php` provide
authorized private-photo access. New account and grooming-availability actions
use the existing Next.js server-action architecture.

Server checks enforce current account role/status, ownership, supported image
formats/size/signatures, positive identifiers, calendar dates, clock times and
inventory availability. Cross-site mutation requests are rejected. Notification
recipients are scoped to the authenticated account and event keys prevent
duplicates. PHP sessions use a separate cookie name, strict mode, HttpOnly and
SameSite settings. API image caching now revalidates after administrative changes.

Client products preserve the required viewport breakpoints, bottom-aligned
buttons and original images. Notification menus/center have matching responsive
styles. Search, category controls, stock badges, quantity totals and the existing
reservation form remain connected to authoritative data. Pet dashboard queries
fetch photo presence rather than entire base64 image payloads.

## Modified files

Paths below are relative to the repository root.

Configuration and schema:

```
petshop-next/.env.example
petshop-next/.env.local                    (local cron secret only; not committed)
petshop-next/.gitignore
petshop-next/package.json
petshop-next/next.config.ts
petshop-next/vercel.json
petshop-next/README.md
petshop-next/prisma/schema.prisma
```

Next.js application/library files:

```
petshop-next/src/proxy.ts
petshop-next/src/lib/authentication.ts
petshop-next/src/lib/session.ts
petshop-next/src/lib/operations.ts
petshop-next/src/lib/business-time.ts
petshop-next/src/lib/reporting.ts
petshop-next/src/lib/password-reset.ts
petshop-next/src/lib/image-upload.ts
petshop-next/src/lib/pet-summaries.ts
petshop-next/src/lib/reservation-transitions.ts
petshop-next/src/lib/grooming-conflicts.ts
petshop-next/src/lib/dashboard-views.ts
petshop-next/src/lib/mail.ts
petshop-next/src/app/layout.tsx
petshop-next/src/app/page.tsx
petshop-next/src/app/how-to-run/page.tsx
petshop-next/src/app/globals.css
petshop-next/src/app/account/actions.ts
petshop-next/src/app/client/actions.ts
petshop-next/src/app/client/dashboard/page.tsx
petshop-next/src/app/client/register/page.tsx
petshop-next/src/app/admin/actions.ts
petshop-next/src/app/admin/dashboard/page.tsx
petshop-next/src/app/superadmin/actions.ts
petshop-next/src/app/api/auth/register/route.ts
petshop-next/src/app/api/auth/client-login/route.ts
petshop-next/src/app/api/auth/admin-login/route.ts
petshop-next/src/app/api/auth/superadmin-login/route.ts
petshop-next/src/app/api/auth/superadmin-setup/route.ts
petshop-next/src/app/api/auth/logout/route.ts
petshop-next/src/app/api/auth/forgot-password/reset/route.ts
petshop-next/src/app/api/admin/reports/pdf/route.ts
petshop-next/src/app/api/products/[id]/image/route.ts
petshop-next/src/app/api/pets/[id]/image/route.ts
petshop-next/src/app/api/cron/grooming-reminders/route.ts
petshop-next/src/components/ClientDashboardShell.tsx
petshop-next/src/components/ClientNotificationCenter.tsx
petshop-next/src/components/ChangePasswordForm.tsx
petshop-next/src/components/GroomingBookingForm.tsx
petshop-next/src/components/ProductReservation.tsx
petshop-next/src/components/ProductReserveForm.tsx
petshop-next/src/components/AdminSidebar.tsx
petshop-next/src/components/AdminProductCard.tsx
```

PHP changes (shared session bootstrap also replaces direct session_start calls):

```
auth/session.php
auth/config.php
auth/login.php
auth/logout.php
auth/dashboard.php
auth/superadmin_login.php
auth/register.php
auth/forgot_password.php
public/request_security.php
public/db.php
public/admin.php
public/admin_register.php
public/superadmin.php
public/superadmin_register.php
public/dashboard.php
public/grooming.php
public/home_services.php
public/profile.php
public/edit_profile.php
public/register_customer.php
public/register_pet.php
public/save_customer.php
public/save_pet.php
public/products.php
public/save_appointment.php
public/reserve_product.php
public/my_product_reservations.php
public/my_appointments.php
public/book_grooming.php
public/photo.php
public/uploads/.htaccess
```

Operational/validation files:

```
petshop-next/scripts/check-database.mjs
petshop-next/scripts/ensure-mysql-operations.mjs
petshop-next/scripts/deploy-migrations.mjs
petshop-next/scripts/restore-grooming.mjs
petshop-next/scripts/test-system.mjs
petshop-next/scripts/test-helpers.mjs
petshop-next/scripts/browser-check.mjs
petshop-next/scripts/restart-local-dev.ps1
petshop-next/SYSTEM_AUDIT_REPORT.md
```

Generated Prisma files and test artifacts are separate from application source.
The restart script was prepared but its execution was rejected; it did not stop
the running development server.

## Executed validation and remaining limits

Machine-readable workflow results: `SYSTEM_TEST_RESULTS.json`.
Browser results: `BROWSER_TEST_RESULTS.json`.

Final executed results:

| Check | Result |
| --- | --- |
| HTTP workflow/browser cases | 38 passed, 0 failed |
| Date/time/image/reset helper cases | 4 passed |
| PHP authentication helper cases | 9 passed |
| PHP syntax | 37 files checked, 0 syntax errors |
| Production build and TypeScript | Passed |
| Live database feature-model checks | 18 passed |
| Original product-image comparisons | 14 byte-identical images |

The final workflow database was `petshop_audit_78d572ac8ac5`. Its generated
accounts and stock fixtures are separate from `petshop_db`.

Executed checks include production compilation/TypeScript, database model
queries, PHP syntax checks, PHP auth-helper tests, timezone/date/image/reset
helper tests, realistic HTTP form/API workflows, concurrent bookings,
reservations/cancellations/reset attempts, authorization, photo ownership,
inventory updates, password change/reset, logout replay and account management.
Headless Chrome checks the actual 1200/992/390px layouts, overflow, images, search,
category filtering, badges, disabled buttons and opening a reservation form.

Screenshots `PRODUCTS_DESKTOP_AUDIT.png`, `PRODUCTS_TABLET_AUDIT.png` and
`PRODUCTS_MOBILE_AUDIT.png` use isolated stock fixtures, not the shop's inventory.

Initial test failures exposed the TIME-query bug and a PHP helper variable
collision; both were corrected and retested. A browser-harness DOM-serialization
error was also fixed. Final pass/fail counts are recorded in the JSON artifact.

Still requiring attention:

1. **Manual restart:** the automatic development-server restart was not approved.
   Stop the existing server in its terminal and restart it from
   `C:\xampp\htdocs\dizon\Dizon_Petshop-main\petshop-next`. Sign in again so the
   new session format is used. Existing passwords are unchanged.
2. **Email delivery:** configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and
   EMAIL_FROM in Next.js's environment. Configure the PHP host's corresponding
   SMTP settings if the legacy portal remains in use. Actual email delivery has
   not been tested. Revoke the formerly hardcoded SMTP credential.
3. **Physical inventory:** confirm quantities before enabling product pickup
   reservations. Zero-stock products correctly remain visible and disabled.
4. **Hosting verification:** Vercel/project credentials were not available and no
   deployment was authorized. Verify remote MySQL connectivity, HTTPS, secrets,
   cron permissions and uploads behavior on the actual hosting environment.
5. **Policy compatibility:** legacy product reservations keep their existing
   24-hour hold; Next.js retains pickup-date scheduling. Neither policy was
   silently changed or auto-expired during the audit.
6. **Historical timestamps:** existing DATETIME values were not shifted based on
   guessed provenance. Historical data imported from a local-time writer may
   need a separate reviewed migration. New writes now follow the UTC convention.
7. **Browser coverage:** product interactions/responsiveness were tested in
   Chrome. Other workflows were exercised through actual HTTP forms/actions;
   every possible browser, keyboard interaction, external service and failure
   scenario has not been exhaustively verified.

## Running and deployment

From `petshop-next` after stopping the old development server:

```powershell
node node_modules/prisma/build/index.js generate
npm.cmd run db:check
npm.cmd run dev
```

Review/apply additive changes explicitly on another MySQL environment:

```powershell
node --env-file=.env.local scripts/deploy-migrations.mjs --dry-run
node --env-file=.env.local scripts/deploy-migrations.mjs --apply
```

Historical Prisma migrations target PostgreSQL; the active application uses
MySQL. The repaired deployment script never silently baselines or replays those
migrations against MySQL. Production build is `npm.cmd run build`; Vercel's root
directory should be `petshop-next`. Its build covers the Next.js application;
legacy PHP remains hosted separately with the same authoritative database.

Set a real MySQL DATABASE_URL and a random AUTH_SECRET of at least 32 characters
in the deployment environment. Use dedicated database credentials and HTTPS for
production. A local CRON_SECRET was generated without exposing it in chat; set
the corresponding secret in the deployment environment. DB-backed pet uploads
work without serverless disk writes; old PHP uploads need accessible PHP storage
or a separately reviewed storage migration. Ensure Apache honors the uploads
directory's access-control file.

Repeat tests locally with `npm.cmd run test:helpers` and `npm.cmd run test:system`.
The tests require local MySQL schema-creation access and retain isolated audit
databases for review. Browser checks additionally require Chrome and launch
authorization. No test administrator has a hardcoded password.
