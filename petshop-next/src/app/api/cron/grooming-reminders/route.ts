import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendGroomingReminder } from "@/lib/mail";
import { businessDate } from "@/lib/business-time";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dueBefore = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const completed = await prisma.groomingAppointment.findMany({ where: { status: "Completed", pet: { isActive: 1 } }, include: { customer: true, pet: true }, orderBy: [{ appointmentDate: "desc" }, { appointmentTime: "desc" }] });
  const byPet = new Map<number, (typeof completed)[number]>();
  for (const visit of completed) if (!byPet.has(visit.petId)) byPet.set(visit.petId, visit);
  const latestByPet = [...byPet.values()].filter((visit) => visit.appointmentDate <= dueBefore);
  let sent = 0;
  let failed = 0;
  for (const appointment of latestByPet.filter((item) => !item.reminderEmailSentAt && item.customer.email).slice(0, 25)) {
    const alreadyBooked = await prisma.groomingAppointment.count({ where: { petId: appointment.petId, status: { in: ["Pending", "Confirmed", "Checked In", "In Progress"] }, appointmentDate: { gte: new Date(`${businessDate()}T00:00:00Z`) } } });
    if (alreadyBooked) continue;
    const claimedAt = new Date();
    const claim = await prisma.groomingAppointment.updateMany({ where: { appointmentId: appointment.appointmentId, reminderEmailSentAt: null }, data: { reminderEmailSentAt: claimedAt } });
    if (claim.count !== 1) continue;
    try {
      await sendGroomingReminder(appointment.customer.email!, { name: appointment.customer.customerName, pet: appointment.pet.petName, lastVisit: appointment.appointmentDate.toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" }) });
      sent++;
    } catch (error) {
      console.error(`Grooming reminder failed for appointment ${appointment.appointmentId}`, error);
      await prisma.groomingAppointment.updateMany({ where: { appointmentId: appointment.appointmentId, reminderEmailSentAt: claimedAt }, data: { reminderEmailSentAt: null } });
      failed++;
    }
  }
  return NextResponse.json({ checked: latestByPet.length, sent, failed });
}
