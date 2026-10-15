import { cookies } from "next/headers";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { readSessionToken, sessionCookieName } from "@/lib/session";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await readSessionToken((await cookies()).get(sessionCookieName)?.value);
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { id } = await context.params;
  const petId = Number(id);
  if (!Number.isSafeInteger(petId) || petId < 1 || petId > 2147483647) return new Response("Not found", { status: 404 });
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { email: true } });
  const pet = await prisma.pet.findFirst({ where: { id: petId, ...(session.role === "User" ? { customer: { email: user?.email || "" } } : {}) }, select: { photoPath: true } });
  if (!pet?.photoPath) return new Response("Not found", { status: 404 });
  const match = pet.photoPath.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/i);
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  if (match) return new Response(Buffer.from(match[2], "base64"), { headers: { ...headers, "Content-Type": match[1] } });
  // Preserve PHP uploads without duplicating or exposing private files.
  const file = pet.photoPath.match(/^uploads\/([\w.-]+\.(?:jpe?g|png|webp|gif))$/i);
  if (!file) return new Response("Not found", { status: 404 });
  try {
    const bytes = await readFile(path.join(process.cwd(), "..", "public", "uploads", file[1]));
    const extension = file[1].split(".").pop()?.toLowerCase();
    return new Response(bytes, { headers: { ...headers, "Content-Type": `image/${extension === "jpg" ? "jpeg" : extension}` } });
  } catch { return new Response("Not found", { status: 404 }); }
}
