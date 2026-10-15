import { authenticateAccount } from "@/lib/authentication";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { databaseConfigurationError, logDatabaseFailure } from "@/lib/database";
import { createSessionToken, sessionCookieName } from "@/lib/session";

export async function POST(request: Request) {
  if (databaseConfigurationError()) return NextResponse.redirect(new URL("/superadmin/setup?error=database-config", request.url), 303);
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  let admin;
  try {
    const existing = await prisma.user.count({ where: { role: "SuperAdmin" } });
    if (existing) return NextResponse.redirect(new URL("/superadmin/login?error=setup-closed", request.url), 303);
    admin = await authenticateAccount(email, password, "Admin");
  } catch (error) {
    logDatabaseFailure("Super Admin setup", error);
    return NextResponse.redirect(new URL("/superadmin/setup?error=unavailable", request.url), 303);
  }
  if (!admin) return NextResponse.redirect(new URL("/superadmin/setup?error=invalid", request.url), 303);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE role IN ('Admin', 'SuperAdmin') ORDER BY id FOR UPDATE`;
      if (await tx.user.count({ where: { role: "SuperAdmin" } })) throw new Error("Super administrator setup is already complete.");
      const result = await tx.user.updateMany({ where: { id: admin.id, role: "Admin", accountStatus: "Active", password: admin.password }, data: { role: "SuperAdmin" } });
      if (result.count !== 1) throw new Error("Administrator account changed. Please sign in again.");
    });
  } catch (error) {
    logDatabaseFailure("Super Admin setup", error);
    return NextResponse.redirect(new URL("/superadmin/setup?error=unavailable", request.url), 303);
  }
  const name = [admin.firstName, admin.surname].filter(Boolean).join(" ") || "Super Administrator";
  const response = NextResponse.redirect(new URL("/superadmin/dashboard", request.url), 303);
  response.cookies.set(sessionCookieName, await createSessionToken({ userId: admin.id, role: "SuperAdmin", name }), { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 8, path: "/" });
  return response;
}
