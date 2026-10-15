export const HALF_KILO_PORTION = {
  value: "half-kilo",
  label: "1/2 kilo",
} as const;
type ProductPortion = typeof HALF_KILO_PORTION & { price: number };

const halfKiloProducts = new Set([
  "aozi adult cat food",
  "aozi adult dog food",
  "beef teriyaki",
  "cuties catz",
  "holistic",
  "special dog",
  "toeicat",
  "toeidog",
  "top breed adult",
  "zoi cat",
  "zoi dog",
]);

export function getProductPortion(productName: string, price: number): ProductPortion | null {
  return halfKiloProducts.has(productName.trim().toLowerCase().replace(/\s+/g, " "))
    ? { ...HALF_KILO_PORTION, price }
    : null;
}

export function getReservedPortion(productName: string, price: number) {
  return getProductPortion(productName, price)?.label ?? null;
}
