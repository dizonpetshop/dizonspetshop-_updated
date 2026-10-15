import { prisma } from "@/lib/prisma";
import { productImageSrc } from "@/lib/product-image";
import { access } from "node:fs/promises";
import path from "node:path";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const productId = Number(id);
  if (!Number.isSafeInteger(productId) || productId < 1 || productId > 2147483647) return new Response("Not found", { status: 404 });
  const product = await prisma.product.findUnique({ where: { productId }, select: { image: true, productName: true, category: true } });
  const match = product?.image?.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/i);
  const cache = "public, max-age=0, must-revalidate";
  if (match) return new Response(Buffer.from(match[2], "base64"), { headers: { "Content-Type": match[1], "Cache-Control": cache, "X-Content-Type-Options": "nosniff" } });
  if (!product) return new Response("Not found", { status: 404 });
  let image = product.image?.trim() || null;
  // PHP paths such as ../pictures/name.jpg and /pictures/name.jpg refer
  // to the same original assets already present in Next's public/products.
  if (image && !/^https?:\/\//i.test(image)) {
    const filename = image.replaceAll("\\", "/").split("/").pop();
    try {
      if (!filename || filename === "." || filename === ".." || /[/\\]/.test(decodeURIComponent(filename))) throw new Error("Invalid image filename");
      await access(path.join(process.cwd(), "public", "products", decodeURIComponent(filename)));
      image = `/products/${encodeURIComponent(decodeURIComponent(filename))}`;
    } catch {
      image = null;
    }
  }
  const fallback = productImageSrc(image, product.productName, product.category);
  return new Response(null, { status: 307, headers: { Location: new URL(fallback, _request.url).toString(), "Cache-Control": cache } });
}
