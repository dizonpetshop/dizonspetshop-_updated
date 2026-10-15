# Customer–admin messaging implementation

Verified 15 October 2026. Implemented in the existing Next.js/MySQL application;
existing authentication, accounts, pets, appointments, reservations and notification
records are preserved. No demonstration conversations were added to the shop database.

## Behavior

- Customer Messages appears between My Account and Notifications. Both dashboards
  use consistent SVG sidebar icons and real unread badges.
- Each customer has one private shop-support conversation. Admin/SuperAdmin users
  share an inbox, searchable by customer name/email. Conversation lists paginate
  in groups of 50; history loads 100 messages at a time, with earlier-message loading.
- Enter sends; Shift+Enter inserts a newline. Empty messages are disabled, failures
  retain drafts, and retry keys prevent duplicate messages/notifications.
- Visible conversations poll every five seconds; sidebar badges poll every ten
  seconds. Local sends and read actions update counts immediately. This is polling,
  not a persistent WebSocket connection, so remote delivery depends on the interval
  and network availability.
- Only incoming messages contribute to unread counts. Reading a customer message
  clears the shared staff inbox count; reading a reply clears that customer's count.
  Read acknowledgements stop at the latest fetched message, preserving later arrivals.
  Message read state and notification read state are independently maintained.
- Customer sends create existing-system in-app notifications for active staff;
  staff replies notify only the conversation owner. Links open the correct portal
  and conversation. Notification dropdown read actions remain intact.
- Desktop uses two panes. Mobile starts with the conversation list and provides a
  back action from chat. Both themes use the existing blue/navy design tokens.

## Database upgrade and deployment

The idempotent MySQL script creates two additive tables:

| Table | Stored data and constraints |
| --- | --- |
| `support_conversations` | Unique customer user, optional customer profile, creation/update times; foreign keys to existing accounts/profiles |
| `support_messages` | Conversation, authenticated sender/role, content, retry key, timestamp and read timestamp; unique sender/retry key and history/read/rate indexes |

Local tables were created and the upgrade was rerun successfully. Existing rows are
not deleted or rewritten. Table ID foreign keys match the actual MySQL parent ID
types. Message creation, conversation update and notifications commit together.

Run `npm.cmd run db:messaging` against the target MySQL database before deploying.
`ensure-mysql-operations.mjs` includes this upgrade. Historical PostgreSQL migrations
are not the deployment path for this MySQL installation. Prisma schema models mirror
the new tables; messaging uses parameterized Prisma SQL, including with a running
development process whose generated client predates the new models.

No new environment variables or external services are required. Keep the existing
`DATABASE_URL` and `AUTH_SECRET`. Vercel needs an externally reachable MySQL server;
localhost database addresses work only on this local computer. Chat notifications
are in-app and do not depend on SMTP.

## Security

Existing signed sessions validate each request. Portal roles and customer ownership
are checked server-side; sender identity comes from the session. Queries are
parameterized, cross-site mutations are rejected, and responses are private/no-store.
Messages render as text. Length is limited to 2,000 characters, request bodies to
16 KiB, and new sends to 20 per sender/minute with serialized database checks.
No message edit/delete endpoint is exposed. Errors do not expose database details.

## Modified files

- `src/app/api/messages/route.ts`: authorized list/history/start/send/read API.
- `src/components/MessagesPanel.tsx`: shared customer/admin messaging interface.
- `src/components/MessageBadge.tsx`: scoped message/notification sidebar counts.
- `src/components/AdminIcon.tsx`, `AdminSidebar.tsx`, `ClientDashboardShell.tsx`:
  consistent SVG navigation, Messages links and badges.
- `src/components/NotificationMenu.tsx`: message notification icon.
- `src/lib/dashboard-views.ts`: client Messages view and ordering.
- `src/app/client/dashboard/page.tsx`, `src/app/admin/dashboard/page.tsx`:
  existing-dashboard chat integration and conversation links.
- `src/app/globals.css`: scoped chat, badges, responsive and theme styles.
- `prisma/schema.prisma`: support conversation/message models and relations.
- `scripts/ensure-messaging.mjs`, `scripts/ensure-mysql-operations.mjs`:
  additive MySQL upgrade.
- `scripts/check-database.mjs`, `package.json`: database checks/upgrade command.
- `scripts/test-system.mjs`, `scripts/browser-messaging-check.mjs`: isolated API
  and browser coverage.
- `README.md`, this report: setup and behavior documentation.

## Verification

- Production Next.js build and TypeScript: passed.
- Project lint command (`tsc --noEmit`): passed. Prisma schema validation: passed.
- Database checks: all 20 checks passed, including both new tables.
- Final isolated system suite: **47/47 passed**, database
  `petshop_audit_dae4365e84e8` retained for inspection. Shop data received no test fixtures.
- Messaging API checks cover two-way persistence, concurrent conversation creation,
  retry deduplication, notifications, bounded read acknowledgements, owner/role
  isolation, spoofed sender rejection, name search, invalid/oversized bodies,
  cross-site rejection, 20-success/2-rate-limited concurrent sends and history pagination.
- Two independent browser sessions verify sends/replies through actual polling,
  unread/read updates, notification navigation, name search, Enter/Shift+Enter,
  literal HTML rendering, reload/logout/login persistence, sidebar icon order and
  navigation. Both portals/themes passed at 320, 390, 768 and 1280 pixels.
- Existing pet form/management browser checks and authentication, grooming,
  reservation, inventory, notification, authorization and logout regression checks passed.

Evidence: `SYSTEM_TEST_RESULTS.json`, `MESSAGING_BROWSER_RESULTS.json`, and
`MESSAGES_CLIENT_*` / `MESSAGES_ADMIN_*` screenshots. Browser fixtures exist only
in the isolated audit database. Production/Vercel deployment was not performed.
