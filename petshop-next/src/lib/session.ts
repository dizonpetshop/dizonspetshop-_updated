import { SignJWT, jwtVerify } from "jose";
import { createHmac, createHash, randomUUID } from "node:crypto";
import { prisma } from "./prisma";

export const sessionCookieName = "petshop_session";

function sessionSecret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw new Error("AUTH_SECRET must contain at least 32 characters.");
  return new TextEncoder().encode(value);
}

export type SessionPayload = { userId: number; role: "SuperAdmin" | "Admin" | "User"; name: string };

export async function createSessionToken(payload: SessionPayload) {
  const user = await prisma.user.findUnique({ where: { id: payload.userId }, select: { password: true, role: true, accountStatus: true } });
  if (!user || user.role !== payload.role || user.accountStatus !== "Active") throw new Error("Account is unavailable.");
  const credentialVersion = createHmac("sha256", sessionSecret()).update(user.password).digest("hex");
  return new SignJWT({ ...payload, credentialVersion }).setProtectedHeader({ alg: "HS256" }).setJti(randomUUID()).setIssuedAt().setExpirationTime("8h").sign(sessionSecret());
}

export async function readSessionToken(token?: string): Promise<SessionPayload | null> {
  if (!token) return null;
  let stage = "signature";
  try {
    const { payload } = await jwtVerify(token, sessionSecret(), { algorithms: ["HS256"] });
    if (typeof payload.jti !== "string" || !payload.jti) return null;
    stage = "revocation";
    // Use the authoritative table even if a running dev process loaded an older generated client.
    const sessionId = createHash("sha256").update(payload.jti).digest("hex");
    const revoked = await prisma.$queryRaw<{ session_id: string }[]>`SELECT session_id FROM revoked_sessions WHERE session_id = ${sessionId} LIMIT 1`;
    if (revoked.length) return null;
    if (!Number.isSafeInteger(payload.userId) || Number(payload.userId) < 1 || typeof payload.name !== "string" || !["SuperAdmin", "Admin", "User"].includes(String(payload.role))) return null;
    stage = "account";
    const user = await prisma.user.findUnique({ where: { id: Number(payload.userId) }, select: { password: true, role: true, accountStatus: true } });
    if (!user || user.role !== payload.role || user.accountStatus !== "Active") return null;
    if (payload.credentialVersion !== createHmac("sha256", sessionSecret()).update(user.password).digest("hex")) return null;
    return payload as unknown as SessionPayload;
  } catch (error) {
    const failure = error && typeof error === "object" ? error as { name?: string; code?: string } : {};
    if (!failure.code?.startsWith("ERR_J")) console.error("Session validation failed: " + JSON.stringify({ stage, name: failure.name, code: failure.code }));
    return null;
  }
}

export async function revokeSessionToken(token?: string) {
  if (!token) return;
  let payload;
  try { payload = (await jwtVerify(token, sessionSecret(), { algorithms: ["HS256"] })).payload; }
  catch { return; }
  if (typeof payload.jti !== "string" || typeof payload.exp !== "number") return;
  const sessionId = createHash("sha256").update(payload.jti).digest("hex");
  const expiresAt = new Date(payload.exp * 1000);
  await prisma.$executeRaw`INSERT INTO revoked_sessions (session_id, expires_at) VALUES (${sessionId}, ${expiresAt}) ON DUPLICATE KEY UPDATE session_id = VALUES(session_id)`;
}
