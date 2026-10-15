import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logDatabaseFailure } from "@/lib/database";
import { requestIp, writeAudit } from "@/lib/operations";
import { readSessionToken, revokeSessionToken, sessionCookieName } from "@/lib/session";

export async function POST(request: Request) {
  const cookieHeader = request.headers.get("cookie") || "";
  const token = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${sessionCookieName}=`))?.slice(sessionCookieName.length + 1);
  const session = await readSessionToken(token);
  try { await revokeSessionToken(token); }
  catch (error) {
    logDatabaseFailure("Logout", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 503 });
  }
  if (session) {
    try { await writeAudit(prisma, { userId: session.userId, name: session.name, role: session.role === "User" ? "Customer" : session.role }, "LOGOUT", "Authentication", "User signed out.", session.userId, await requestIp()); } catch (error) { console.error("Could not write logout audit entry", error); }
  }
  const form = await request.formData();
  const destination = String(form.get("destination") ?? "");
  const path = destination === "admin" ? "/admin/login?loggedOut=1" : destination === "superadmin" ? "/superadmin/login?loggedOut=1" : "/";
  const response = NextResponse.redirect(new URL(path, request.url), 303);
  response.cookies.set(sessionCookieName, "", { expires: new Date(0), httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/" });
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}
