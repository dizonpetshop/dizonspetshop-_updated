# Grooming attendance and automatic no-show cancellation

Implemented in the existing Next.js / Prisma / MySQL appointment system.
Appointment DATE/TIME fields represent Asia/Manila wall-clock time; server-side
conversion uses the existing UTC+08:00 business-time helper. Customer browser
clocks never decide eligibility. The shop timezone remains Asia/Manila, as before.

## Workflow and safety

1. Customer books Pending; it reserves capacity but is not attendance-required.
2. Admin confirms the appointment.
3. Staff select **Checked In** when the customer arrives, then **In Progress** when
   service starts. These statuses still occupy groomer/pet capacity.
4. Confirmed in-store (`Salon`) appointments with no recorded arrival or service
   start become eligible once the scheduled start plus grace has elapsed.
5. The authenticated background endpoint sets **Cancelled – No Show**, preserves
   the appointment, records cancellation details, releases capacity through the
   existing active-status conflict rules, writes an audit entry and creates real
   customer/admin in-app notifications in the same transaction.

Home Service is excluded from automatic cancellation. Staff must verify absence
and submit **Cancelled - No Show** with a reason after grace. Home-service arrival
can be recorded as Checked In by the admin after the groomer verifies arrival at
the address; it does not mean the customer visited the shop.

Pending, checked-in, in-progress, completed, cancelled, future and rescheduled-to-
future appointments are excluded. Each candidate's current schedule, service type,
status and attendance are reread under locks. A repeat job has no duplicate effects.
The locking order is groomer → pet → appointment → attendance, consistent with
booking capacity locks. Locking conflict reads prevent recovery from using a stale
snapshot of newly occupied capacity. Concurrent arrival/job requests serialize:
the first committed state wins, and a conflicting staff request displays an error
instead of silently overwriting a cancellation.

## Additive database upgrade

`npm.cmd run db:attendance` is idempotent and was applied locally. The general
MySQL operations upgrade includes it. Existing appointment rows and prices are not
rewritten. The appointment status enum is extended without removing prior values.

New `grooming_attendance` table stores one optional record per appointment:
checked-in timestamp, started timestamp, cancellation reason/kind and cancellation
timestamp. Its foreign key uses the actual parent BIGINT type. Timestamps are UTC;
the UI formats them in Asia/Manila. Prisma schema models mirror this table; runtime
uses parameterized SQL so a running development process can use the upgrade
without requiring immediate regeneration of its previously generated client.

Two existing-system settings are added without overwriting prior configuration:

- `grooming_no_show_grace_minutes`: defaults to **15**, configurable from Admin
  Business Settings within 1–120 minutes; changes are audited.
- `grooming_attendance_enabled_after`: deployment activation timestamp. Old
  appointments scheduled before attendance tracking was introduced remain for
  staff review rather than being retroactively classified without reliable check-in
  records. Already-booked future appointments after activation are covered.

No appointments, user accounts, profiles, pet records, reservation history, prices
or add-ons were deleted or reset. Tests use a separate retained audit database.

## Admin and client UI

Appointment management and schedules offer Checked In, In Progress and No Show
states, status filters, staff guidance, recorded times and reasons. Client Grooming
and Reservations show colored statuses and cancellation details. Visible attendance
pages refresh every 30 seconds and on focus; job processing is independent of this
refresh and continues with no browser open.

Incorrect no-shows can be recovered by an authorized admin selecting **Checked In**
and entering a recovery reason. Groomer and pet capacity are validated again.
Recovery preserves original audit/notification history and timestamps. Ordinary
Cancelled or Completed appointments cannot be restored through this action.
There is no new rescheduling workflow; staff must resolve conflicting capacity
through existing operations before recovery.

## Scheduler configuration

Endpoint: `GET /api/cron/grooming-no-shows`, protected by
`Authorization: Bearer <CRON_SECRET>`. The existing local secret is preserved.
The job processes up to 100 candidates per invocation; remaining candidates are
handled by subsequent runs. Failures return 503 and may safely be retried.

Local Windows setup:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-attendance-task.ps1
```

This registers **DizonPetshopGroomingNoShows** every minute using the existing Node
executable and `.env.local`. No password/secret is placed in task arguments.
The account must remain signed into Windows, the computer must remain awake, and
MySQL plus the Next.js server must be running. No browser needs to be open.
`ATTENDANCE_APP_URL` optionally changes the default `http://localhost:3000`.
If the server is down, the next scheduled invocation retries. Delayed/missed runs
do not cancel early; they process eligible appointments when service resumes.
The first trigger starts one minute after installation.

Production/Vercel: apply the upgrade against the authoritative target MySQL DB,
configure `CRON_SECRET`, and invoke the endpoint every minute using an external
scheduler or a supported Vercel plan. `vercel.attendance.json` supplies an opt-in
one-minute cron configuration while retaining the reminder schedule. The existing
default `vercel.json` remains unchanged. Vercel Hobby only permits daily cron jobs,
so its built-in schedule cannot meet timely 15-minute attendance processing.
See [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).
No plan purchase, remote scheduler connection or deployment was performed.

Nominal cancellation delay is grace plus up to one scheduler interval and request
processing time; outages, execution limits or batches can increase it. Notifications
use the existing in-app system; no SMTP dependency or unrequested external messages
are introduced.

## Modified files

- `scripts/ensure-attendance.mjs`, `ensure-mysql-operations.mjs`, `package.json`:
  upgrade and command.
- `prisma/schema.prisma`: attendance model/relation.
- `src/lib/grooming-attendance.ts`, `reservation-transitions.ts`,
  `grooming-conflicts.ts`: safe attendance, transitions and capacity.
- `src/app/api/cron/grooming-no-shows/route.ts`: protected processing endpoint.
- `src/app/admin/actions.ts`, `admin/dashboard/page.tsx`: admin workflow/settings.
- `src/app/client/actions.ts`, `client/dashboard/page.tsx`: occupied slots/status UI.
- `src/app/api/cron/grooming-reminders/route.ts`: recognize checked-in/in-progress
  appointments as active rather than issuing inappropriate reminders.
- `src/components/AppointmentStatus.tsx`, `AppointmentAttendance.tsx`,
  `AppointmentRefresh.tsx`, `src/app/globals.css`: themed attendance presentation.
- `scripts/run-attendance-job.mjs`, `setup-attendance-task.ps1`,
  `ensure-cron-secret.mjs`, `vercel.attendance.json`: scheduler support.
- `scripts/test-system.mjs`: isolated integration scenarios.
- `scripts/test-helpers.mjs`, `.env.example`: midnight/timezone boundary checks and
  optional scheduler URL documentation.
- This report and `README.md`: operation/deployment documentation.
- Legacy `public/book_grooming.php`, `public/grooming.php`, `public/admin.php`:
  shared-database capacity/active-count compatibility for Checked In/In Progress;
  PHP booking conflict reads now lock current capacity. Attendance management is
  performed in the Next.js admin dashboard.

## Verification

The production build and Prisma schema validation passed. Integration checks cover
unauthorized cron access, on-time arrival, arrival during grace, expired confirmed
appointments, no early cancellation, pending/completed/home-service exclusions,
rescheduled and pre-activation appointments, concurrent arrival/job execution,
repeat job notification/audit deduplication, timestamps, manual verified home-service
absence, authorized recovery, occupied-slot recovery rejection, settings and both
dashboard views. Existing booking, stock, authentication and notification regressions
are also included. Final test count and scheduler installation result follow below.

Final verification, 15 October 2026:

- **45/45 isolated system checks passed**, database
  `petshop_audit_90e8fbe275ef` retained. No shop fixtures were inserted.
- **4/4 helper checks passed**, including midnight appointment/grace conversion
  across UTC, America/Los_Angeles and Asia/Singapore host timezone settings.
- Production build, project lint/TypeScript, Prisma validation and PHP syntax
  checks for all three compatibility files passed.
- The Windows task was installed and its actual scheduled run returned
  **LastTaskResult = 0**; the next run was scheduled one minute later.
- The live local runner authenticated successfully and returned
  `checked: 0, cancelled: 0, graceMinutes: 15, timezone: Asia/Manila`.
  Existing local appointment records were not retroactively cancelled.

The only operational requirements remaining are keeping the local server/MySQL
running and Windows signed in, or configuring a production minute scheduler when
deploying remotely. Staff must record check-in promptly; the system cannot observe
physical attendance without that staff record. No email/SMS provider configuration
is needed for the implemented in-app notifications.
