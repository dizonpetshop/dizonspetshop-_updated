# Notification UI redesign

Completed 14 October 2026 (Asia/Singapore).

The admin and customer dashboards now share the same premium blue-and-white
notification dropdown. The existing database and authenticated API routes are
retained; no schema migration or production notification seeding was required.

## Delivered behavior

- Rounded blue bell using the existing SVG icon library, a red unread badge
  only when needed, hover transitions and visible keyboard focus.
- A 400px white dropdown with navy text, rounded corners and soft shadows;
  corresponding dark-mode colors throughout.
- Header, authoritative unread count, Mark all as read, All/Unread tabs,
  relevant event icons, descriptions, timestamps and View all notifications.
- Unread rows use light blue and an indicator dot; read rows use a neutral
  background. Empty and loading states are distinct from errors.
- Bell toggle, outside-pointer and focus dismissal, Escape with focus restored
  to the bell, ArrowDown opening, arrow/Home/End navigation between tabs, and
  native Tab navigation.
- Individual clicks update read state before navigating to the API-provided
  dashboard link. Bulk read updates are scoped to the authenticated recipient.
  Mutation buttons are disabled while requests run. Failed updates retain an
  error and do not claim success or change database state.
- Counts refresh after successful mutations, on window focus, on notification
  update events and through 20-second polling. Stale load responses cannot
  overwrite a newer read action.
- The dropdown is rendered into the document body and positioned relative to
  the bell. It remains within the viewport, resizes with the screen, avoids
  sticky-header clipping and keeps its long list scrollable above a fixed footer.
- Unread tabs request unread records from the server, so older unread updates
  are not hidden behind a preview full of newer read records.

## Modified source files

| File | Change |
| --- | --- |
| [src/components/NotificationMenu.tsx](src/components/NotificationMenu.tsx) | New shared bell, dropdown, interactions, polling and read actions. |
| [src/components/ClientNotificationMenu.tsx](src/components/ClientNotificationMenu.tsx) | Compatibility export using the shared dropdown. |
| [src/components/ClientNotificationCenter.tsx](src/components/ClientNotificationCenter.tsx) | Refreshes when notification read changes occur. |
| [src/components/AdminShell.tsx](src/components/AdminShell.tsx) | Replaces the previous admin dropdown with the shared component; retains profile, theme and logout controls. |
| [src/app/globals.css](src/app/globals.css) | Blue-and-white styling, dark mode, responsive sizing, focus and reduced-motion rules. |
| [src/app/api/admin/notifications/route.ts](src/app/api/admin/notifications/route.ts) | All/Unread lists, read flags, bulk read, authoritative counts and safe internal links. |
| [src/app/api/client/notifications/route.ts](src/app/api/client/notifications/route.ts) | Unread filtering, authoritative bulk-read counts, bounded IDs and safe links. |
| [scripts/browser-notification-check.mjs](scripts/browser-notification-check.mjs) | New Chrome interaction, layout, theme and database verification. |
| [scripts/test-system.mjs](scripts/test-system.mjs) | Admin API isolation tests, both notification browser flows and optional focused filtering. |
| [README.md](README.md) | Documents notification browser test flags. |
| [NOTIFICATION_UI_REPORT.md](NOTIFICATION_UI_REPORT.md) | This implementation and verification report. |

## Verification

Final production build and `npm.cmd run lint` passed. The final isolated suite
passed **44 tests, zero failures**, using `petshop_audit_3782476c6f9f`.

Both customer and admin browser tests passed at 1280, 768, 390 and 320 pixels:
dropdown viewport boundaries, 400px desktop width, long-list scrolling,
read/unread styling, tabs and arrow keys, Escape and focus restoration, outside
dismissal, theme switching, individual read and relevant navigation, bulk read
database checks, badge removal, empty state and View all navigation. A simulated
failed POST verifies the UI error and confirms the database row stays unread.

API checks verify that users cannot mark other recipients' records, admin bulk
read leaves customer notifications unread, All includes read records, Unread
excludes them, and invalid IDs are rejected. The unchanged authentication,
appointment, product reservation, pet, profile and notification ownership
workflows also pass the regression suite, including a real browser login flow.

Results and visual previews:

- [SYSTEM_TEST_RESULTS.json](SYSTEM_TEST_RESULTS.json)
- [NOTIFICATION_CLIENT_TEST_RESULTS.json](NOTIFICATION_CLIENT_TEST_RESULTS.json)
- [NOTIFICATION_ADMIN_TEST_RESULTS.json](NOTIFICATION_ADMIN_TEST_RESULTS.json)
- [Client desktop](NOTIFICATIONS_CLIENT_1280.png), [client mobile](NOTIFICATIONS_CLIENT_390.png), [client dark](NOTIFICATIONS_CLIENT_DARK.png)
- [Admin desktop](NOTIFICATIONS_ADMIN_1280.png), [admin mobile](NOTIFICATIONS_ADMIN_390.png), [admin dark](NOTIFICATIONS_ADMIN_DARK.png)

Business users, notification records, reservations, pets and appointments were
not reset or deleted. All new notification fixtures exist only in retained
isolated audit databases. No external notifications or deployment were sent.

Refresh the running dashboard to see the redesign. To repeat verification after
building, from `petshop-next`:

```powershell
$env:NOTIFICATION_BROWSER_AUDIT = '1'
$env:AUTH_BROWSER_AUDIT = '1'
npm.cmd run test:system
```

Chrome launch requires the environment's browser authorization. Browser checks
use fresh temporary profiles and do not access the user's normal Chrome profile.
