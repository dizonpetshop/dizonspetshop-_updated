# Grooming appointment receipts

Submitting a grooming appointment now redirects to its receipt after the booking transaction commits. Repeated submissions open the same receipt. Customers can print or download a real A4 PDF immediately, or reopen it from appointment history. Admin Grooming Appointments has the same receipt links.

## Shared implementation

- `src/lib/grooming-receipt.ts`: authenticated appointment receipt loader, immutable booking snapshot, grooming-specific tax policy, historical fallback, loyalty/VAT summary, salon grace and home-service instructions.
- `src/app/appointments/[id]/receipt/page.tsx`: owner/admin printable receipt view.
- `src/app/api/appointments/[id]/receipt/route.ts`: owner/admin PDF download with appointment reference in the filename.
- `src/components/GroomingReceiptLinks.tsx`: history/admin links.
- `src/components/ReservationReceiptDocument.tsx`: shared white receipt document used for both product and grooming confirmations.
- `src/components/ReceiptControls.tsx`, `src/lib/reservation-receipt-pdf.ts`, `src/lib/reservation-receipt-data.ts`: existing print controls, A4 PDF generation, authorization and business details reused with appointment-specific labels and totals.
- `src/app/client/actions.ts`: computes configured tax, stores the receipt snapshot in the original booking transaction, redirects successful/retried bookings to the receipt.
- `src/app/client/dashboard/page.tsx`, `src/app/admin/dashboard/page.tsx`: links alongside existing attendance/loyalty details.
- `scripts/ensure-reservation-receipts.mjs`: additive `grooming_appointment_receipt_snapshot` table. Applied with `npm run db:receipts`; no historical appointments, prices or product inventory rewritten.
- `next.config.ts`: original logo traced into the grooming PDF endpoint.
- `scripts/test-grooming-receipts.mjs`, `scripts/test-system.mjs`: real booking, VAT, PDF, privacy, historical and browser printing checks.

The receipt includes the shop logo/contact details, appointment reference/status/creation date, saved customer contact/address, service type, pet name/species/breed/sex/age or birth date/size, package, groomer, special instructions, appointment date/time in Asia/Manila, service location, stored base and add-on prices, VAT details, loyalty estimates or actual applied discounts, total, and payment disclaimer.

Home service uses the recorded service address and does not receive a fabricated salon arrival grace. Store grooming uses the existing `grooming_no_show_grace_minutes` policy and describes automatic no-show cancellation only for confirmed salon appointments without arrival. Product pickup grace is not reused.

## VAT and price preservation

No grooming VAT policy existed in the source settings, so no 12% VAT was silently enabled. With no configured policy, the receipt explicitly shows a zero VAT amount marked not configured/not recorded, and a note asking the shop to confirm its applicable treatment. This is not a declaration that the business is exempt or paid.

An authorized operator can configure `system_settings.grooming_tax_policy` after confirming the real business treatment. Example format, only when applicable:

```json
{"treatment":"inclusive","rate":"0.12","products":{},"freeProductIds":[]}
```

Supported treatments reuse the existing Decimal calculator: inclusive, exclusive, exempt, zero-rated, and unconfigured. In this grooming policy, line ID `0` denotes the base package and positive line IDs are add-on IDs, allowing overrides in `products`. The example is not automatically inserted. The existing product tax policy is separate.

New bookings snapshot base/add-on prices, tax treatment/rate, customer details, pet details, package, and groomer within the booking transaction. Catalog or tax-setting changes do not rewrite old receipts. Existing appointment rows and price fields remain authoritative. Historical bookings without a snapshot show their stored service balance/add-on prices and a clear historical-data note; current catalog prices are never substituted.

Applied loyalty discounts use the recorded loyalty pricing. The receipt derives the discounted VAT using the saved tax policy and shows any rounding/stored-total adjustment explicitly while preserving the actual appointment total. Estimated future loyalty eligibility is labeled as an estimate and not deducted early. Payment collection is not independently tracked by this booking flow, so the receipt never marks the appointment Paid or acts as proof of payment.

## Verification

Completed: production build/TypeScript passed; 73 system/browser tests passed with 0 failures. Isolated audit database: `petshop_audit_7f0bf82affb3`. Artifacts: `GROOMING_RECEIPT_AUDIT.pdf`, `GROOMING_PRINT_AUDIT.pdf`, and inspected `GROOMING_RECEIPT_320.png`.

The system test covers successful submission and redirect, retry deduplication, inclusive VAT (168 gross = 150 VATable + 18 VAT), exclusive VAT (168 + 20.16 = 188.16), add-ons, owner/admin access, other-customer denial, real PDF generation, price/pet snapshot preservation, home service, completed loyalty pricing, historical fallback, and Chrome print-to-PDF at desktop and mobile sizes. Product receipt and existing booking/stock/loyalty regression checks also run through the shared suite.

Real paper printer output and the business's actual tax registration/treatment require business verification. No real payment processing was added. Final executed results are recorded in `SYSTEM_TEST_RESULTS.json` and the final chat response.
