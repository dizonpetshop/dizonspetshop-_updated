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
  if (databaseConfigurationError()) return NextResponse.redirect(new URL("/client/login?error=database-config", request.url), 303);
  try {
    const user = await authenticateAccount(email, password, "User");
    if (!user) return NextResponse.redirect(new URL("/client/login?error=invalid", request.url), 303);

    const name = [user.firstName, user.surname].filter(Boolean).join(" ") || "Client";
    const token = await createSessionToken({ userId: user.id, role: "User", name });
    await writeAuditSafely(prisma, { userId: user.id, name, role: "Customer" }, "LOGIN", "Authentication", "Customer signed in successfully.", user.id, await requestIp());
    const response = NextResponse.redirect(new URL("/client/dashboard?notice=" + encodeURIComponent("Login successful. Welcome back!"), request.url), 303);
    response.cookies.set(sessionCookieName, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 8, path: "/" });
    return response;
  } catch (error) {
    logDatabaseFailure("Client login", error);
    return NextResponse.redirect(new URL("/client/login?error=unavailable", request.url), 303);
  }
}
