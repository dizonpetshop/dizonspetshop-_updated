export function productImageSrc(
  image: string | null,
  productName: string,
  category: string,
  productId?: number,
) {
  if (productId) return productImageUrl(productId);
  const value = image?.trim();
  if (value && /^data:image\/(?:jpeg|png|webp);base64,/i.test(value)) return value;
  if (value && (/^https?:\/\//i.test(value) || value.startsWith("/"))) return value;
  if (value) {
    const filename = value.replaceAll("\\", "/").split("/").pop();
    if (filename) return `/products/${encodeURIComponent(filename)}`;
  }

  if (productName.toLowerCase().includes("shampoo")) return "/products/pet-shampoos.png";
  if (category.toLowerCase().startsWith("cat")) return "/products/cat-care-essentials.png";
  return "/products/dog-care-essentials.png";
}

export function productImageUrl(productId: number) {
  return `/api/products/${productId}/image`;
}
