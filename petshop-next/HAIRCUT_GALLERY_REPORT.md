# Interactive Grooming Haircut Gallery

Implemented in the existing Next.js Client Dashboard Grooming section. The former
pricing cards are replaced by interactive selectors and a large image/pricing
preview. No duplicate page, database migration or pricing writes were introduced.

## Data and booking

`grooming_styles` and `style_size_pricing` remain authoritative. The server passes
the existing names, IDs, sizes and Decimal price strings to the gallery. Display
uses Philippine peso formatting. The read-only source audit found all 25 prices
match the supplied reference; see `HAIRCUT_PRICING_AUDIT.json`.

The gallery is for browsing. The existing booking form retains its independent
style and size selection, authoritative price calculation, available-slot checks,
duplicate request guard and server validation. Clicking selectors never submits a
booking or changes the booking form. Appointment history and admin workflows are
preserved. Additional database styles remain visible rather than being hidden.
Missing prices display “Not configured,” never an invented amount.

## Original assets

All five original assets were found, visually inspected and copied unchanged from
the root `hairstyles` folder into Next.js `public/hairstyles` for deployment:

| Database haircut name | Original asset |
| --- | --- |
| Shaved / Kalbo | `kalbo.jpg` |
| Summer Cut | `summer.jpg` |
| Bear Cut | `bear.jpg` |
| Puppy Cut | `puppy.jpg` |
| Asian Fusion | `asian fusion.jpg` |

No required images are missing. No images were downloaded or generated. Static
Next.js Image imports preserve dimensions, optimize responsive delivery and supply
blur placeholders. Main previews and thumbnails use centered `cover` for
edge-to-edge images without side gaps. Main frames use a compact 5:4 ratio and
top-centered positioning to show the pet's head and upper body, matching the
latest reference. The lower part of portrait photos is intentionally cropped.
Missing/failed images show a neutral scissors placeholder.
Descriptions were omitted because the authoritative style model has no description.

## Interface

Selectors use semantic buttons with pressed state, keyboard focus and a selected
indicator. React state immediately updates the selected title, image and complete
five-size table without navigation or reload. Table headers and caption remain
accessible. Light and dark themes use existing tokens and reduced-motion support.

The reference layout places compact haircut selectors above a two-column workspace:
photo and complete pricing in the left card, existing appointment form in the right
card. Below 901px the workspace stacks; below 768px selectors scroll horizontally
with a visible scrollbar. Booking fields use two columns when space permits and
one column on small phones. Page width remains contained. No reference-only fees,
size weights, discounts or booking rules were added.

## Files

- `src/components/HaircutGallery.tsx`: new supporting gallery component.
- `src/app/client/dashboard/page.tsx`: replace the existing pricing-card section.
- `src/app/globals.css`: scoped gallery styling and responsive rules.
- `public/hairstyles/`: five unchanged original image copies.
- `scripts/check-haircut-prices.mjs`: read-only source/reference pricing audit.
- `scripts/browser-haircut-check.mjs`: selection/image/pricing/accessibility checks.
- `scripts/test-system.mjs`: optional gallery browser integration.
- This report and generated audit/result/screenshot artifacts.

## Verification

Production build and project lint (`tsc --noEmit`) completed successfully.
Enable `$env:HAIRCUT_BROWSER_AUDIT='1'` before `npm.cmd run test:system` to run
gallery browser verification alongside the isolated database workflow suite.
Tests copy pricing fixtures only into a new audit database, compare all displayed
prices, and verify pricing records remain unchanged after browsing.

Browser coverage checks all five selections in both themes at 1280, 1199, 768, 767,
390 and 320px; real image loading, semantic selected state, keyboard activation,
fallback rendering, no reload, unchanged booking selection, layout and overflow.
Evidence is saved in `HAIRCUT_BROWSER_RESULTS.json` and `HAIRCUT_*` screenshots.
System workflow results are saved in `SYSTEM_TEST_RESULTS.json`.

No additional configuration is required. Production hosting was not deployed.

Final verification (15 October 2026): all 45 isolated system checks passed,
including the gallery browser test and existing appointment creation, authoritative
totals/add-ons, cancellation/history, concurrent slot protection, groomer schedule
validation and admin confirmation workflows. The retained audit database is
`petshop_audit_2a6aa11ccc98`. Both themes passed all six screen widths, keyboard
activation and forced missing-image fallback. All five deployed image copies have
identical SHA-256 hashes to the originals. No unresolved configuration requirements
or missing haircut assets were found.
