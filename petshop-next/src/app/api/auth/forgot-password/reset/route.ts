import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { databaseConfigurationError, logDatabaseFailure } from "@/lib/database";
import { isStrongPassword, passwordResetCodeMatches, readPasswordResetToken, withFailedAttempt } from "@/lib/password-reset";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { email?: unknown; code?: unknown; password?: unknown; confirmPassword?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const confirmPassword = typeof body?.confirmPassword === "string" ? body.confirmPassword : "";

  if (!/^\d{6}$/.test(code)) return NextResponse.json({ error: "Enter the six-digit verification code." }, { status: 400 });
  if (password !== confirmPassword) return NextResponse.json({ error: "The new passwords do not match." }, { status: 400 });
  if (!isStrongPassword(password)) return NextResponse.json({ error: "Use at least 8 characters with uppercase, lowercase, a number, and a special character." }, { status: 400 });
  if (databaseConfigurationError()) return NextResponse.json({ error: "Password reset is temporarily unavailable." }, { status: 503 });

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE email = ${email} FOR UPDATE`;
      const user = await tx.user.findUnique({ where: { email }, select: { id: true, email: true, role: true, accountStatus: true, resetToken: true, resetExpires: true } });
      const parsed = readPasswordResetToken(user?.resetToken);
      if (!user || user.role !== "User" || user.accountStatus !== "Active" || !parsed || !user.resetToken || !user.resetExpires || user.resetExpires.getTime() <= Date.now()) {
        if (user?.resetToken) await tx.user.update({ where: { id: user.id }, data: { resetToken: null, resetExpires: null } });
        return { error: "That verification code is invalid or has expired. Request a new code.", status: 400 };
      }
      if (!passwordResetCodeMatches(user.id, user.email.toLowerCase(), code, parsed.hash)) {
        const attempts = parsed.attempts + 1;
        const nextToken = attempts >= 5 ? null : withFailedAttempt(user.resetToken, attempts);
        await tx.user.update({ where: { id: user.id }, data: { resetToken: nextToken, resetExpires: nextToken ? user.resetExpires : null } });
        return { error: attempts >= 5 ? "Too many incorrect attempts. Request a new code." : "That verification code is incorrect.", status: 400 };
      }
      await tx.user.update({ where: { id: user.id }, data: { password: await hash(password, 12), resetToken: null, resetExpires: null, failedAttempts: 0, lockoutTime: null } });
      return { status: 200 };
    }, { timeout: 10000 });
    return result.error ? NextResponse.json({ error: result.error }, { status: result.status }) : NextResponse.json({ ok: true });
  } catch (error) {
    logDatabaseFailure("Password reset confirmation", error);
    return NextResponse.json({ error: "Password reset is temporarily unavailable." }, { status: 503 });
  }
}
