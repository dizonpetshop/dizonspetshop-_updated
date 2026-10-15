import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readSessionToken, sessionCookieName } from "@/lib/session";

export default async function SuperAdminEntryPage() {
  const cookieStore = await cookies();
  const session = await readSessionToken(cookieStore.get(sessionCookieName)?.value);

  redirect(session?.role === "SuperAdmin" ? "/superadmin/dashboard" : "/superadmin/login");
}
