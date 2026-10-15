import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { databaseConfigurationError, logDatabaseFailure } from "@/lib/database";
import { sendPasswordResetCode } from "@/lib/mail";
import { createPasswordResetToken, readPasswordResetToken } from "@/lib/password-reset";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !email.includes("@")) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  if (databaseConfigurationError()) return NextResponse.json({ error: "Password reset is temporarily unavailable." }, { status: 503 });

  try {
  const user = await prisma.user.findFirst({
    where: { email },
    select: { id: true, email: true, firstName: true, role: true, accountStatus: true, resetToken: true },
  });
  if (!user || user.role !== "User") {
    return NextResponse.json({ error: "That email does not match a client account in our database." }, { status: 404 });
  }
  if (user.accountStatus !== "Active") {
    return NextResponse.json({ error: "This client account is not active. Please contact the shop." }, { status: 403 });
  }

  const previous = readPasswordResetToken(user.resetToken);
  const secondsSinceLastCode = previous ? Math.floor((Date.now() - previous.issuedAt) / 1000) : 60;
  if (secondsSinceLastCode < 60) {
    return NextResponse.json({ error: `Please wait ${60 - secondsSinceLastCode} seconds before requesting another code.` }, { status: 429 });
  }

  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const token = createPasswordResetToken(user.id, user.email.toLowerCase(), code);
  const expires = new Date(Date.now() + 10 * 60 * 1000);
  await prisma.user.update({ where: { id: user.id }, data: { resetToken: token, resetExpires: expires } });

  try {
    await sendPasswordResetCode(user.email, user.firstName || "Client", code);
  } catch (error) {
    console.error("Unable to deliver password reset code", error);
    await prisma.user.updateMany({ where: { id: user.id, resetToken: token }, data: { resetToken: null, resetExpires: null } });
    return NextResponse.json({ error: "We could not send the verification email. Please try again shortly." }, { status: 503 });
  }

  return NextResponse.json({ ok: true, message: `A six-digit code was sent to ${maskEmail(user.email)}.` });
  } catch (error) {
    logDatabaseFailure("Password reset request", error);
    return NextResponse.json({ error: "Password reset is temporarily unavailable." }, { status: 503 });
  }
}

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(2, local.length - visible.length))}@${domain}`;
}
