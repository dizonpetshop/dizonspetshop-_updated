import { PrismaClient } from "@prisma/client";
import { readFile, access } from "node:fs/promises";

// Only the original catalog, before the later inventory/sample migrations.
const schema = (await readFile(new URL("../../schema", import.meta.url), "utf8")).split("TRUNCATE TABLE products;")[1]?.split("USE petshop_db;")[0];
if (!schema) throw new Error("Original catalog was not found.");
const catalog = [...schema.matchAll(/\('([^']+)', '([^']+)', '([^']+)', ([\d.]+), '([^']+)'\)/g)].map((match) => ({
  category: match[1], productName: match[2], description: match[3], price: match[4], image: match[5],
}));
if (catalog.length !== 14) throw new Error("Original catalog changed; review before restoring.");
for (const product of catalog) await access(new URL(`../public/products/${product.image}`, import.meta.url));
const prisma = new PrismaClient();
try {
  const apply = process.argv.includes("--apply");
  await prisma.$transaction(async (tx) => {
    for (const [index, product] of catalog.entries()) {
      const sku = `ORIGINAL-${String(index + 1).padStart(4, "0")}`;
      const existing = await tx.product.findFirst({ where: { OR: [{ sku }, { productName: product.productName }] } });
      if (existing) { console.log(`Preserved: ${product.productName}`); continue; }
      console.log(`${apply ? "Restoring" : "Would restore"}: ${product.productName}; stock unverified (0)`);
      if (apply) await tx.product.create({ data: { ...product, sku, productGroup: "Food", stockQuantity: 0, isActive: 1 } });
    }
  });
  console.log(apply ? "Restoration complete. Confirm physical stock in Admin Inventory before reservations." : "Dry run complete. Pass --apply to restore verified entries.");
} finally { await prisma.$disconnect(); }
