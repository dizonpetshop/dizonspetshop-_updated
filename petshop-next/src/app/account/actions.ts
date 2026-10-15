"use server";
import { compare, hash } from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { createSessionToken, readSessionToken, sessionCookieName } from "@/lib/session";
import { isStrongPassword } from "@/lib/password-reset";
import { requestIp, writeAudit } from "@/lib/operations";

export async function changePassword(form: FormData) {
  const store = await cookies();
  const session = await readSessionToken(store.get(sessionCookieName)?.value);
  if (!session) return { error: "Please sign in again." };
  const currentPassword = String(form.get("currentPassword") || "");
  const password = String(form.get("password") || "");
  if (!isStrongPassword(password) || password.length > 72) return { error: "Use 8–72 characters including uppercase, lowercase, a number, and a symbol." };
  if (password !== form.get("confirmPassword")) return { error: "The new passwords do not match." };
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  const encoded = user?.password.startsWith("$2y$") ? "$2b$" + user.password.slice(4) : user?.password;
  if (!user || !encoded || !await compare(currentPassword, encoded)) return { error: "Your current password is incorrect." };
  const ip = await requestIp();
  await prisma.$transaction(async (tx) => {
    const result = await tx.user.updateMany({ where: { id: user.id, password: user.password }, data: { password: await hash(password, 12), resetToken: null, resetExpires: null, failedAttempts: 0, lockoutTime: null } });
    if (result.count !== 1) throw new Error("Account changed. Please sign in again.");
    await writeAudit(tx, { userId: user.id, name: session.name, role: session.role }, "UPDATE", "Authentication", "Changed account password and invalidated previous sessions.", user.id, ip);
  });
  store.set(sessionCookieName, await createSessionToken(session), { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", maxAge: 8 * 60 * 60, path: "/" });
  return { message: "Password changed. Other signed-in sessions are now invalid." };
}
