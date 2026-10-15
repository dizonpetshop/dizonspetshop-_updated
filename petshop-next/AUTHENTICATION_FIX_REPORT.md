# Customer registration and login repair

Date: 14 October 2026.

## Actual cause and reproduction

The application uses Next.js 16, Prisma with MySQL (`petshop_db`), bcryptjs,
and signed HS256 sessions. It does not use NextAuth/Auth.js or Supabase.
The legacy PHP portal also uses the same local MySQL `users` table.

The newest customer account was present, Active, assigned User, and had a
complete 60-character bcrypt hash in a VARCHAR(255) column. Registration and
login used the same database and compatible hashing. There was no lockout.

An actual test against the running development server reproduced:

1. Registration returned 303 to `/client/login?registered=1`; bcrypt verification
   against the saved row passed.
2. Login returned 303 to `/client/dashboard` and issued `petshop_session`.
3. Sending that cookie to the dashboard returned 307 to `/client/login`.
4. Safe diagnostic logging identified a TypeError at the revocation lookup:
   the running Prisma client did not expose `revokedSession`.

The running process had stale generated Prisma metadata. `readSessionToken`
caught the exception and returned null, disguising an infrastructure error as
a logged-out session. The redirect did not supply an error message. Password
verification had already succeeded.

## Repairs

- Session revocation reads and writes now use parameterized SQL against the
  existing `revoked_sessions` table. JWT signature, expiry, credential-version,
  account-status and role checks are retained. No revocation check is bypassed.
- Prisma's development cache is keyed to generated schema metadata. `predev`
  and `prebuild` regenerate the client before Next.js starts. These commands
  do not migrate, reset or change the database.
- Session infrastructure failures log only the stage, error name and code;
  tokens, passwords and authentication secrets are not logged.
- A rejected customer session redirects with a visible session message.
  Login catches session-creation failures and displays a generic server error.
  Logout catches revocation failures and returns a generic error instead of
  claiming a successful secure logout.
- Next.js registration creates the User/Active account and customer profile
  within one transaction, preserving any existing profile for that email.
  It validates field lengths, normalized email, password strength and password
  confirmation, and reports success only after commit.
- PHP verified registration explicitly assigns User/Active and creates or
  reuses the customer profile within its existing transaction. Its existing
  OTP verification requirement remains in place. The existing Next.js
  registration policy remains unchanged; no OTP bypass was introduced.
- bcrypt `$2b$` and legacy PHP `$2y$` compatibility remains supported. Password
  limits use UTF-8 byte length consistently with bcrypt. Existing hashes are
  neither reset nor rehashed during login.
- Customer login displays “Invalid email or password.” without disclosing
  whether an account exists. Successful login displays “Login successful.
  Welcome back!” on the Client Dashboard. Duplicate registration and failed
  registration display clear messages. PHP credential failures also use the
  same generic wording.

## Validation

- Running server after the repair: dashboard, account and pets pages returned
  200 with the issued cookie; logout succeeded; replay of the logged-out cookie
  was rejected.
- Real Chrome form flow: registration success, login success, HttpOnly/Lax
  cookie, account navigation, refresh, logout and protected dashboard checks
  all passed. No authentication cookie was injected into this browser test.
- 41 regression cases passed, zero failed, using isolated database
  `petshop_audit_8f6c48b96df6`. Results: `SYSTEM_TEST_RESULTS.json` and
  `AUTH_BROWSER_TEST_RESULTS.json`. Coverage includes duplicate registration,
  password-confirmation failure without partial records, PHP hash compatibility,
  generic errors, roles, suspension, lockouts, password changes, one-time resets,
  session revocation, and existing pet/appointment/reservation workflows.
- Production compilation and TypeScript validation passed. Four helper tests,
  all 18 database model checks, and syntax checks for changed PHP files passed.

Existing business accounts (IDs 1–4), passwords, profiles, pets, appointments,
reservations and notifications were not deleted or reset. Four diagnostic
accounts (IDs 5–8, names Authentication Check and `@audit.invalid` addresses)
were created to reproduce the running-server failure and retained. The final
comprehensive suite wrote only into its isolated test database. Temporary local
diagnostic credentials were removed; passwords are stored only as hashes in
the database. No deployment was performed.

## Use and repeat checks

Refresh `http://localhost:3000/client/login` and sign in with the registered
customer email and original password. The running development server has
already passed the repaired flow through hot reload.

For a subsequent start, stop the existing server with Ctrl+C, then run
`npm.cmd run dev` from `petshop-next`. Prisma generation now runs automatically.
If Windows reports a locked Prisma engine file, stop other Next.js processes
for this project before starting. Avoid changing schema metadata in a running
process without regenerating and restarting it.

To repeat isolated browser checks in PowerShell:

```powershell
$env:AUTH_BROWSER_AUDIT = '1'
npm.cmd run test:system
```

Build first if application code changed. Chrome launch authorization is needed
for browser tests. `scripts/test-live-auth.mjs` is an explicit diagnostic for the
live local server; each run creates and retains a diagnostic customer account.
