# DIZON'S Pet Grooming - Next.js

This Next.js App Router and TypeScript application connects the client, administrator and Super Admin portals to the existing MySQL petshop database. See SYSTEM_AUDIT_REPORT.md for implemented repairs, validation results, migration details and remaining setup requirements.

## How to run this

1. Install the current Node.js LTS release from https://nodejs.org.
2. Open PowerShell in this folder.
3. Install dependencies:

   ```powershell
   npm install
   ```

4. Create your local environment file:

   ```powershell
   Copy-Item .env.example .env.local
   ```

   Configure the MySQL database used by XAMPP. Replace the username, password,
   port, and database name if your local setup is different:

   ```env
   DATABASE_URL="mysql://root:@127.0.0.1:3306/petshop_db"
   ```

   Check the connection and all tables needed by the Next.js features before
   starting the server:

   ```powershell
   npm run db:check
   ```

   If this fails, correct `.env.local` and restart `npm run dev`. Do not run
   destructive Prisma commands against an existing database.

   Generate `AUTH_SECRET` with:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

5. Start the development server:

   ```powershell
   npm run dev
   ```

6. Open http://localhost:3000.

## Open it on another device

Run:

```powershell
npm run dev -- --hostname 0.0.0.0
ipconfig
```

Find the server computer's IPv4 address. On another device connected to the same Wi-Fi, open `http://YOUR-IP:3000`. Allow Node.js through Windows Firewall on private networks if prompted. The server computer must remain powered on.

## Production check

```powershell
npm run build
npm run start -- --hostname 0.0.0.0
```

## Database and access

Prisma maps the existing MySQL tables in `prisma/schema.prisma`. Client and administrator logins query the database independently and create signed, HTTP-only role sessions. The proxy blocks client sessions from every `/admin/dashboard` route.

The database must contain a user whose `role` is `Admin` before the private administrator URL can authenticate. First create the owner's normal account, then promote it locally from this project folder:

```powershell
npm run make-admin -- owner@example.com
```

Replace the email with the owner's registered email. This command writes the `Admin` role directly to MySQL; there is intentionally no administrator registration or administrator-login link on the public website.

For Vercel, add `DATABASE_URL` and `AUTH_SECRET` under Project Settings > Environment Variables and enable them for Production. The MySQL server must accept secure connections from Vercel; `127.0.0.1` only works locally. Never commit real connection strings. Redeploy after changing environment variables.

The database contains application data, so do not run `prisma migrate reset`,
`prisma db push`, or a destructive migration. To compare the Prisma schema with the
existing database safely, inspect introspection output without changing the schema:

```powershell
npx prisma db pull --print
```

## Grooming attendance automation

Staff can now record **Checked In**, **In Progress**, or a verified **Cancelled -
No Show** from appointment management. Set the default 15-minute grace period in
Admin Business Settings. Confirmed in-store appointments without arrival records
are processed by `/api/cron/grooming-no-shows`; Pending and Home Service bookings
are excluded from automatic no-show cancellation.

Apply `npm.cmd run db:attendance` to the target MySQL database before deployment.
For local minute scheduling, run `scripts/setup-attendance-task.ps1` in PowerShell.
The server/MySQL must run and the Windows account must stay signed in; a browser
does not need to be open. Production requires a minute scheduler with the
`CRON_SECRET` bearer header; `vercel.attendance.json` is an opt-in cron configuration
for plans supporting that frequency. Historical appointments scheduled before
activation remain for staff review.

See [GROOMING_ATTENDANCE_REPORT.md](GROOMING_ATTENDANCE_REPORT.md) for the database
upgrade, locking/idempotency, capacity-safe recovery, configuration and tests.

## Customer–admin messaging details

Open **Messages** in either dashboard sidebar. Customers have one private support
conversation; Admin and SuperAdmin users share the support inbox, with customer
name/email search. History is stored in MySQL, with older-message pagination.
Messages refresh every five seconds while the page is visible; sidebar unread
counts refresh every ten seconds and immediately after local sends/read actions.
Reading a customer message clears its shared staff unread status. Message unread
status and notification read status are separate.

The additive tables `support_conversations` and `support_messages` are created by:

```powershell
npm.cmd run db:messaging
```

The local database already has these tables. Run the upgrade against the target
MySQL database before deployment. The general MySQL operations upgrade also
includes it. Do not deploy the historical PostgreSQL migrations to MySQL.
Messaging uses the existing `DATABASE_URL`, session `AUTH_SECRET`, and in-app
notification backend; it needs no SMTP or external realtime service. Polling works
with ordinary Next.js/Vercel requests and requires an accessible MySQL database.
Messages accept up to 2,000 characters, requests up to 16 KiB, and each sender can
send 20 new messages per minute. Retrying the same request does not create another
message or notification.

Enable `$env:MESSAGING_BROWSER_AUDIT='1'` before `npm.cmd run test:system` to
exercise two independent customer/admin browser sessions, notification navigation,
unread counts, persistence, safe text rendering, and responsive themes. Enable
`$env:PET_BROWSER_AUDIT='1'` to include existing pet form/management browser checks.
See [MESSAGING_SYSTEM_REPORT.md](MESSAGING_SYSTEM_REPORT.md) for the implementation
and final validation results.

## Audit validation commands

Notification dropdown checks are enabled with `$env:NOTIFICATION_BROWSER_AUDIT='1'`
before `npm.cmd run test:system`. They exercise both portals in Chrome at desktop,
tablet and mobile widths, with database assertions for individual and bulk read
actions. Fixtures exist only in the isolated audit database. An optional
`SYSTEM_TEST_FILTER` regular expression selects focused test names.

Use `npm.cmd run test:helpers` for boundary checks and `npm.cmd run test:system` for isolated MySQL/HTTP workflow tests. System tests create and retain a new `petshop_audit_*` database and never write test records into the shop database. Browser checks are opt-in with `BROWSER_AUDIT=1` (all browser checks) or `AUTH_BROWSER_AUDIT=1` (registration/login browser checks) and require Chrome launch authorization. `scripts/test-live-auth.mjs` is a separate explicit live-server diagnostic; it creates and retains one diagnostic account in the local shop database.

After schema upgrades, stop the existing development server and start it again. `npm.cmd run dev` and `npm.cmd run build` now regenerate Prisma before Next.js starts, without changing the database. If generation reports a locked engine file on Windows, stop other running Next.js servers for this project first. Development output uses `.next-dev`; production builds use `.next`. Use consistent `dizon` path casing on Windows. New PHP metadata timestamps use UTC; appointment DATE/TIME remain Manila wall-clock values. Actual email delivery requires SMTP configuration.
