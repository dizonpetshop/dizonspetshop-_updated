import { NextRequest, NextResponse } from "next/server";
import { readSessionToken, sessionCookieName } from "@/lib/session";

export async function proxy(request: NextRequest) {
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin");
    if (request.headers.get("sec-fetch-site") === "cross-site" || (origin && origin !== request.nextUrl.origin)) {
      return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
    }
    if (/^\/api\/auth\/(?:register|(?:client|admin|superadmin)-login|superadmin-setup|logout)$/.test(request.nextUrl.pathname) && !/^(?:application\/x-www-form-urlencoded|multipart\/form-data)/i.test(request.headers.get("content-type") || "")) {
      return NextResponse.json({ error: "Submit a valid form." }, { status: 400 });
    }
  }
  const path = request.nextUrl.pathname;
  const session = await readSessionToken(request.cookies.get(sessionCookieName)?.value);

  if (path.startsWith("/admin/dashboard") && session?.role !== "Admin" && session?.role !== "SuperAdmin") {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }
  if (path.startsWith("/superadmin/dashboard") && session?.role !== "SuperAdmin") {
    return NextResponse.redirect(new URL("/superadmin/login", request.url));
  }
  if (path.startsWith("/client/dashboard") && session?.role !== "User") {
    return NextResponse.redirect(new URL(request.cookies.has(sessionCookieName) ? "/client/login?error=session" : "/client/login", request.url));
  }
  if (path === "/admin/login" && session?.role === "Admin") {
    return NextResponse.redirect(new URL("/admin/dashboard", request.url));
  }
  if (path === "/admin/login" && session?.role === "SuperAdmin") {
    return NextResponse.redirect(new URL("/admin/dashboard", request.url));
  }
  if (path === "/superadmin/setup" && session?.role === "SuperAdmin") {
    return NextResponse.redirect(new URL("/superadmin/dashboard", request.url));
  }
  const response = NextResponse.next();
  if (path.startsWith("/admin/dashboard") || path.startsWith("/superadmin/dashboard") || path.startsWith("/client/dashboard")) {
    response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  }
  return response;
}

export const config = { matcher: ["/admin/:path*", "/superadmin/:path*", "/client/dashboard/:path*", "/api/:path*"] };
