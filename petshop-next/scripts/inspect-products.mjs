import { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const prisma = new PrismaClient();
try {
  const url = new URL(process.env.DATABASE_URL);
  console.log({ host: url.hostname, database: url.pathname.slice(1) });
  console.table(await prisma.product.findMany({ select: { productId: true, productName: true, category: true, price: true, stockQuantity: true, isActive: true }, orderBy: { productId: "asc" } }));
  console.table(await prisma.$queryRaw`SELECT product_id, LEFT(image, 100) AS image_path FROM products`);
  const products = await prisma.product.findMany({ where: { sku: { startsWith: "ORIGINAL-" } } });
  assert.equal(products.length, 14, "All 14 original entries must be restored");
  for (const product of products) {
    const original = await readFile(new URL(`../../pictures/${product.image}`, import.meta.url));
    const served = await readFile(new URL(`../public/products/${product.image}`, import.meta.url));
    assert.ok(original.equals(served), `Original image differs: ${product.productName}`);
  }
  console.log("Verified 14 restored products and byte-identical original public images.");
} finally { await prisma.$disconnect(); }
