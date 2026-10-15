import { prisma } from "./prisma";
type Row = { id: number; customerId: number; petName: string; species: string | null; breed: string | null; ageDob: string | null; gender: string | null; isActive: number; hasPhoto: number | bigint; customerName: string; customerEmail: string | null };

// Return photo presence, not multi-megabyte base64 images, to dashboard queries.
export async function petSummaries(customerId?: number) {
  const rows = customerId === undefined
    ? await prisma.$queryRaw<Row[]>`SELECT p.id, p.customer_id AS customerId, p.pet_name AS petName, p.species, p.breed, p.age_dob AS ageDob, p.gender, p.is_active AS isActive, CASE WHEN p.photo_path IS NULL OR p.photo_path='' THEN 0 ELSE 1 END AS hasPhoto, c.customer_name AS customerName, c.email AS customerEmail FROM pets p JOIN customers c ON c.id=p.customer_id ORDER BY p.created_at DESC`
    : await prisma.$queryRaw<Row[]>`SELECT p.id, p.customer_id AS customerId, p.pet_name AS petName, p.species, p.breed, p.age_dob AS ageDob, p.gender, p.is_active AS isActive, CASE WHEN p.photo_path IS NULL OR p.photo_path='' THEN 0 ELSE 1 END AS hasPhoto, c.customer_name AS customerName, c.email AS customerEmail FROM pets p JOIN customers c ON c.id=p.customer_id WHERE p.customer_id=${customerId} AND p.is_active=1 ORDER BY p.created_at DESC`;
  return rows.map((row) => ({ ...row, hasPhoto: Boolean(row.hasPhoto), photoPath: Boolean(row.hasPhoto), customer: { customerName: row.customerName, email: row.customerEmail } }));
}
