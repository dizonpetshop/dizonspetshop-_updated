import { authenticateAccount } from "@/lib/authentication";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { databaseConfigurationError, logDatabaseFailure } from "@/lib/database";
import { createSessionToken, sessionCookieName } from "@/lib/session";
import { requestIp, writeAuditSafely } from "@/lib/operations";

export async function POST(request: Request) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const configError = databaseConfigurationError();
  if (configError) {
    console.error(`Admin login unavailable: ${configError}`);
    return NextResponse.redirect(new URL("/admin/login?error=database-config", request.url), 303);
  }

  try {
    const user = await authenticateAccount(email, password, "Admin");
    if (!user) return NextResponse.redirect(new URL("/admin/login?error=invalid", request.url), 303);

    const name = [user.firstName, user.surname].filter(Boolean).join(" ") || "Administrator";
    const token = await createSessionToken({ userId: user.id, role: "Admin", name });
    await writeAuditSafely(prisma, { userId: user.id, name, role: "Admin" }, "LOGIN", "Authentication", "Administrator signed in successfully.", user.id, await requestIp());
    const response = NextResponse.redirect(new URL("/admin/dashboard", request.url), 303);
    response.cookies.set(sessionCookieName, token, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 8, path: "/" });
    return response;
  } catch (error) {
    logDatabaseFailure("Admin login", error);
    return NextResponse.redirect(new URL("/admin/login?error=unavailable", request.url), 303);
  }
}
