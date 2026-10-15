import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { databaseConfigurationError, logDatabaseFailure } from "@/lib/database";
import { isPhilippinePhone } from "@/lib/operations";
import { isStrongPassword } from "@/lib/password-reset";

export async function POST(request: Request) {
  const form = await request.formData();
  const firstName = String(form.get("firstName") ?? "").trim();
  const surname = String(form.get("surname") ?? "").trim();
  const middleInitial = String(form.get("middleInitial") ?? "").trim() || null;
  const phoneNumber = String(form.get("phone") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const confirmPassword = String(form.get("confirmPassword") ?? "");
  const customerName = [firstName, middleInitial, surname].filter(Boolean).join(" ");
  if (!firstName || firstName.length > 100 || !surname || surname.length > 100 || customerName.length > 150 || (middleInitial && middleInitial.length > 2) || phoneNumber.length > 20 || email.length > 150 || !isPhilippinePhone(phoneNumber) || !/^\S+@\S+\.\S+$/.test(email) || !isStrongPassword(password)) return NextResponse.redirect(new URL("/client/register?error=invalid",request.url),303);
  if (password !== confirmPassword) return NextResponse.redirect(new URL("/client/register?error=mismatch", request.url), 303);
  if (databaseConfigurationError()) return NextResponse.redirect(new URL("/client/register?error=database-config", request.url), 303);
  try {
    const existingUser = await prisma.user.findFirst({
      where: { email },
      select: { id: true },
    });
    if (existingUser) return NextResponse.redirect(new URL("/client/register?error=exists",request.url),303);
    const passwordHash = await hash(password, 12);
    await prisma.$transaction(async tx => {
      await tx.user.create({ data: { role: "User", accountStatus: "Active", firstName, surname, middleInitial, phoneNumber, email, password: passwordHash } });
      // Preserve a pre-existing shop profile for this email instead of duplicating its history.
      if (!await tx.customer.findFirst({ where: { email }, select: { id: true } })) {
        await tx.customer.create({ data: { customerName, phone: phoneNumber, email } });
      }
    });
    return NextResponse.redirect(new URL("/client/login?registered=1",request.url),303);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return NextResponse.redirect(new URL("/client/register?error=exists", request.url), 303);
    }
    logDatabaseFailure("Client registration", error);
    return NextResponse.redirect(new URL("/client/register?error=unavailable", request.url), 303);
  }
}
