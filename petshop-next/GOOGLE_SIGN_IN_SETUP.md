# Enable Continue with Google

The customer login button and OAuth routes are installed. Google login needs your own Google Cloud **Web application** OAuth credentials. Existing email/password login continues to work without them.

## 1. Create a Google OAuth client

1. Open [Google Cloud Console](https://console.cloud.google.com/) and select or create a project for Dizon's Pet Grooming.
2. Open **Google Auth Platform**. Complete the app branding/contact information and choose the appropriate audience. For personal Gmail customers, use an External audience. While the app is in Testing, add the Google accounts you will use under test users.
3. Create a client with application type **Web application**.
4. Set the authorized JavaScript origin to `http://localhost:3000`.
5. Add this exact **Authorized redirect URI**:

   `http://localhost:3000/api/auth/google/callback`

6. Copy the Client ID and Client Secret into the local environment file below. Do not paste the secret into chat, source code, screenshots, or Git.

Google's official [OpenID Connect setup instructions](https://developers.google.com/identity/openid-connect/openid-connect#settingup) explain client creation, consent and exact redirect URI matching.

## 2. Fill in `.env.local`

The three entries have been added to `petshop-next/.env.local` without replacing existing settings:

```dotenv
GOOGLE_CLIENT_ID="YOUR_CLIENT_ID.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="YOUR_CLIENT_SECRET"
GOOGLE_REDIRECT_URI="http://localhost:3000/api/auth/google/callback"
```

Keep the existing `AUTH_SECRET` and `DATABASE_URL` settings. The Google secret is server-only; do not prefix it with `NEXT_PUBLIC_`.

Open the app using `http://localhost:3000` consistently. `localhost`, `127.0.0.1`, a LAN IP, different ports, and the old XAMPP PHP URL are different origins. If you use another origin, update both the Google Cloud redirect registration and `GOOGLE_REDIRECT_URI` to match exactly. Remote deployments require HTTPS.

## 3. Restart and try it

From the `petshop-next` directory, restart your existing Next.js dev server after changing environment variables, using the project's usual `npm.cmd run dev` workflow. Avoid starting a second server on the same port. For production, use the normal build/restart workflow.

Open `/client/login`, click **Continue with Google**, choose an account and grant the requested basic profile/email consent. The app returns to the Customer Portal. A first-time Google customer gets a real customer account/profile; they can add a phone/address in My Account. No Google passwords or access/refresh tokens are stored.

The additive identity table is already installed locally. On another database run `npm.cmd run db:google` (or the existing `db:upgrade`) before enabling login.

## Account behavior and safeguards

- Authorization-code flow uses signed short-lived state cookies, nonce and PKCE S256. ID tokens are verified against Google's signing keys, issuer, audience, expiry and verified email; client secrets stay on the server.
- Returning Google accounts are identified by stable Google `sub`, not by a mutable email address.
- A verified Google-owned Gmail or Workspace identity can reuse a matching active customer login without changing its password or history. Admin/SuperAdmin and suspended accounts cannot use the customer Google route.
- For arbitrary third-party email addresses, Google may not be authoritative despite `email_verified`. An existing shop account/profile with such an email is not automatically linked; the customer is asked to use their existing email/password. See [Google's guidance on authoritative email ownership](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).
- New Google-only accounts receive an unguessable random password hash, not a shared/default password. The existing email password-reset flow can be used to set a password later.
- Missing configuration shows a friendly message and leaves password login available.

## Troubleshooting

- **Google sign-in is not available yet**: fill in all three settings and restart the server.
- **redirect_uri_mismatch**: copy the exact URI above into the Google Web client and environment setting; check host, port, path, scheme and trailing slash.
- **Access blocked / test user**: add your account as a test user while the Google app is in Testing, and check the OAuth audience settings.
- **Sign-in cancelled or could not be completed**: retry from the login page; ensure the server can reach Google's HTTPS token/signing-key endpoints and the database identity table exists.

## Implementation and verification

Created `GoogleSignInButton.tsx`, `src/lib/google-auth.ts`, `/api/auth/google`, `/api/auth/google/callback`, `scripts/ensure-google-auth.mjs` and OAuth tests. Updated customer login, styles, Prisma schema, environment examples, upgrade script and npm commands. The migration creates only `google_identities`, with unique Google subject/user mapping and a restricted foreign key to existing users.

Live Google consent/code exchange cannot be tested until you create the client credentials. Automated checks use generated test signing keys and an isolated database, never a fabricated Google session in the live app.
Verification completed: TypeScript, Prisma schema validation and production build passed; 9 helper tests and 59 isolated system/browser tests passed. Checks cover Google state/PKCE redirect, signed token claims, callback rejection/cancellation, account mapping, preservation of existing passwords/history, role/status restrictions, unsafe third-party email-link prevention and existing app regressions. A live request without configured Google credentials returns the friendly login configuration message. Real Google consent/code exchange remains untested until credentials are supplied.
