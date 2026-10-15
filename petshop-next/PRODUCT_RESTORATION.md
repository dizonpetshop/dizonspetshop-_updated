# Product restoration

The local Next.js connection uses `127.0.0.1/petshop_db`, the same database
configured in `public/db.php`. The `products` table was empty. All required
tables and columns passed `npm run db:check`. The dashboard also previously
swallowed catalog query errors and presented them as an empty inventory.

The original `schema` contains 14 food entries with names, descriptions,
categories, prices, and image filenames. All 14 original images are already
in `public/products`, matching the legacy `pictures` directory. No extra
image copies or new product data were created.

Run from `petshop-next`:

```
node --env-file=.env.local scripts/restore-products.mjs
node --env-file=.env.local scripts/restore-products.mjs --apply
```

The first command previews changes. The second restores missing entries in a
transaction. Existing records matched by name or restoration SKU are preserved,
including their stock, prices, images, and activation status. Restoration does
not run on application requests. Run only one restoration process at a time.

Current physical stock is not available in the original catalog. The later SQL
migration assigns a blanket quantity of 24; that is not verified physical stock.
Restored records therefore start at zero. Confirm quantities in Admin Inventory
before enabling reservations. Other images cannot establish additional products
without verified names, prices, and relationships. Later generic/sample catalog
entries were not seeded by this restoration.

The client displays active records, including out-of-stock items, and uses the
existing reservation server action with its stock checks. Catalog failures show
a retry state; only a successful empty query shows the empty-catalog state.
Responsive columns use viewport breakpoints: one below 768px, two from 768px,
and four from 1200px. Search, category, stock, and price controls operate together.

Validation passed: database feature checks, TypeScript, a second restoration run
with no duplicates, and byte comparisons of all 14 original/public images.
Production build passed from `C:\xampp\htdocs\dizon\Dizon_Petshop-main\petshop-next`.
Use that consistent directory casing on Windows: mixing `Dizon` and `dizon`
caused duplicate Next.js module loading and a `workStore` prerender invariant.
An authenticated browser session was not used for visual verification.
