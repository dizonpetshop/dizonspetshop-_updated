# Simplified Add Pet profile form

Completed 14 October 2026 (Asia/Singapore).

The existing Client Dashboard Add Pet form was replaced in place with a client
component using the existing `createPet` server action. No separate page or
second registration flow was introduced.

The form contains Pet Name, Pet Type (Dog, Cat and the existing Other option),
an optional Pet Photo, and Add Pet. Breed, Age/Date of Birth and Gender are
absent from this form and its submitted data. Their nullable database columns,
historical values and Edit Pet fields remain intact. No migration was necessary.

Features include a premium upload control, JPG/PNG/WEBP validation with a
1.5 MB limit, drag-and-drop, preview, replace/remove, per-field errors, a disabled
button and spinner while saving, and a synchronous submission guard. Failures
retain the entered name/type/photo. Success shows an accessible inline message,
clears the form and refreshes My Pets. Saving derives ownership from the
authenticated customer; a submitted customer ID is not trusted. Pet creation
and its audit entry are saved within one transaction.

## Modified files

- [src/components/AddPetForm.tsx](src/components/AddPetForm.tsx): replacement for the existing Add Pet form.
- [src/app/client/dashboard/page.tsx](src/app/client/dashboard/page.tsx): mounts the form in the existing expandable panel.
- [src/app/client/actions.ts](src/app/client/actions.ts): core-field pet creation, transactional audit and inline results; legacy redirect submissions remain supported.
- [src/components/AdminIcon.tsx](src/components/AdminIcon.tsx): upload icon in the existing SVG library.
- [src/app/globals.css](src/app/globals.css): scoped form styling, light/dark themes, responsive layout, focus and loading feedback.
- [scripts/browser-pet-check.mjs](scripts/browser-pet-check.mjs): browser interaction and database verification.
- [scripts/test-system.mjs](scripts/test-system.mjs): updated simple-creation tests, unsafe-upload/ownership checks and optional pet browser audit.
- [.gitignore](.gitignore): ignores temporary pet upload test files.
- [ADD_PET_FORM_REPORT.md](ADD_PET_FORM_REPORT.md): this report.

## Verification

Production build and TypeScript validation passed. The final isolated system
suite passed **43 checks, zero failures**, using `petshop_audit_c39dbb7f9db9`.

Browser checks verified:

- Only the three requested fields; Dog/Cat/Other supported.
- Required-name errors, server-derived ownership and null removed fields.
- Desktop two-column inputs; vertical mobile inputs at 390 and 320 pixels,
  without horizontal overflow, in both themes.
- Optional-photo save; genuine JPEG preview, removal and drag-and-drop.
- Unsupported and oversized files rejected; backend invalid-upload checks pass.
- Two synchronous submissions save one pet; loading feedback and disabled button.
- A failed network request preserves name and preview without creating a pet.
- Successful saving clears the form and refreshes the displayed pet list.
- Existing pet metadata stays unchanged; new pets appear in grooming selection.

Existing edit, photo ownership, grooming booking, notification, account,
reservation and authentication workflows also passed the system suite. The
business database was not seeded with test pets or modified by these tests.

Artifacts: [SYSTEM_TEST_RESULTS.json](SYSTEM_TEST_RESULTS.json),
[ADD_PET_BROWSER_RESULTS.json](ADD_PET_BROWSER_RESULTS.json),
[desktop dark preview](ADD_PET_1280_DARK.png),
[mobile dark preview](ADD_PET_390_DARK.png),
[desktop light preview](ADD_PET_1280_LIGHT.png),
[mobile light preview](ADD_PET_390_LIGHT.png).

To repeat the browser checks after building, from `petshop-next`:

```powershell
$env:PET_BROWSER_AUDIT = '1'
npm.cmd run test:system
```

The suite creates and retains an isolated local audit database. Chrome launch
requires the environment's authorization. Test credentials remain in memory.
