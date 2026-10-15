"use server";

import { hash } from "bcryptjs";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { readSessionToken, sessionCookieName } from "@/lib/session";
import { isPhilippinePhone, requestIp, writeAudit } from "@/lib/operations";
import { isStrongPassword } from "@/lib/password-reset";

const roles = ["User", "Admin", "SuperAdmin"] as const;
const statuses = ["Active", "Suspended"] as const;

function value(form: FormData, key: string) { return String(form.get(key) ?? "").trim(); }

function accountDestination(form: FormData, values: Record<string, string>) {
  const superAdminPage = value(form, "returnTo") === "/superadmin/dashboard";
  const query = new URLSearchParams(superAdminPage ? {} : { view: "admins" });
  for (const [key, item] of Object.entries(values)) query.set(key, item);
  return `${superAdminPage ? "/superadmin/dashboard" : "/admin/dashboard"}?${query.toString()}`;
}

async function requireSuperAdmin() {
  const session = await readSessionToken((await cookies()).get(sessionCookieName)?.value);
  if (session?.role !== "SuperAdmin") throw new Error("Super administrator access required.");
  const account = await prisma.user.findFirst({ where: { id: session.userId, role: "SuperAdmin", accountStatus: "Active" }, select: { id: true } });
  if (!account) throw new Error("Super administrator access required.");
  return account;
}

export async function createManagedAccount(form: FormData) {
  const superAdmin = await requireSuperAdmin();
  const firstName = value(form, "firstName");
  const surname = value(form, "surname");
  const email = value(form, "email").toLowerCase();
  const phoneNumber = value(form, "phone") || null;
  const password = String(form.get("password") || "");
  const confirmPassword = String(form.get("confirmPassword") || "");
  const role = value(form, "role");
  if (!firstName || firstName.length > 100 || !surname || surname.length > 100 || email.length > 150 || !/^\S+@\S+\.\S+$/.test(email) || (phoneNumber && !isPhilippinePhone(phoneNumber)) || !isStrongPassword(password) || password !== confirmPassword || !roles.includes(role as (typeof roles)[number])) {
    redirect(accountDestination(form, { error: "invalid-account" }));
  }
  const existing = await prisma.user.findFirst({ where: { email }, select: { id: true } });
  if (existing) redirect(accountDestination(form, { error: "email-exists" }));
  const account = await prisma.user.create({ data: { firstName, surname, email, phoneNumber, password: await hash(password, 12), role, accountStatus: "Active" } });
  await writeAudit(prisma, { userId: superAdmin.id, name: "Super Administrator", role: "SuperAdmin" }, "CREATE", "Admin Account", `Created ${role} account for ${email}.`, account.id, await requestIp());
  revalidatePath("/admin/dashboard");
  revalidatePath("/superadmin/dashboard");
  redirect(accountDestination(form, { notice: "Account created successfully." }));
}

export async function updateManagedAccount(form: FormData) {
  const superAdmin = await requireSuperAdmin();
  const id = Number(value(form, "id"));
  const role = value(form, "role");
  const accountStatus = value(form, "status");
  if (!Number.isSafeInteger(id) || id < 1 || id === superAdmin.id || !roles.includes(role as (typeof roles)[number]) || !statuses.includes(accountStatus as (typeof statuses)[number])) {
    redirect(accountDestination(form, { error: "invalid-update" }));
  }
  const updated = await prisma.user.updateMany({ where: { id, NOT: { id: superAdmin.id } }, data: { role, accountStatus } });
  if (updated.count !== 1) redirect(accountDestination(form, { error: "invalid-update" }));
  await writeAudit(prisma, { userId: superAdmin.id, name: "Super Administrator", role: "SuperAdmin" }, "UPDATE", "Admin Account", `Changed account ${id} to ${role} / ${accountStatus}.`, id, await requestIp());
  revalidatePath("/admin/dashboard");
  revalidatePath("/superadmin/dashboard");
  redirect(accountDestination(form, { notice: "Account access updated." }));
}
