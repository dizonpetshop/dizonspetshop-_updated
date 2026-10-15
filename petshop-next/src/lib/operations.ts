import { headers } from "next/headers";
import type { Prisma, PrismaClient } from "@prisma/client";

type Database = Prisma.TransactionClient | PrismaClient;
type Actor = { userId: number; name: string; role: string };

export function isPhilippinePhone(value: string) {
  return /^(?:\+63|0)9\d{9}$/.test(value.replace(/[\s()-]/g, ""));
}

export async function requestIp() {
  const store = await headers();
  return (store.get("x-forwarded-for")?.split(",")[0] || store.get("x-real-ip") || "").trim().slice(0, 64) || null;
}

export async function writeAudit(
  db: Database,
  actor: Actor,
  action: string,
  module: string,
  description: string,
  recordId?: string | number | bigint | null,
  ipAddress?: string | null,
) {
  await db.auditLog.create({
    data: {
      userId: actor.userId,
      userName: actor.name,
      role: actor.role,
      action,
      module,
      recordId: recordId == null ? null : String(recordId),
      description,
      ipAddress: ipAddress ?? null,
    },
  });
}

export async function writeAuditSafely(
  db: Database,
  actor: Actor,
  action: string,
  module: string,
  description: string,
  recordId?: string | number | bigint | null,
  ipAddress?: string | null,
) {
  try {
    await writeAudit(db, actor, action, module, description, recordId, ipAddress);
  } catch (error) {
    // Authentication must remain available if the optional audit store is
    // temporarily unavailable or has not been migrated yet.
    console.error("Unable to persist audit log entry.", error);
  }
}

export async function notifyAdministrators(
  db: Database,
  event: { eventKey: string; title: string; message: string; type: string; relatedType?: string; relatedId?: string | number | bigint; link: string },
) {
  const recipients = await db.user.findMany({
    where: { role: { in: ["Admin", "SuperAdmin"] }, accountStatus: "Active" },
    select: { id: true },
  });
  if (!recipients.length) return;
  await db.notification.createMany({
    data: recipients.map(({ id }) => ({
      recipientId: id,
      eventKey: event.eventKey,
      title: event.title,
      message: event.message,
      type: event.type,
      relatedType: event.relatedType || null,
      relatedId: event.relatedId == null ? null : String(event.relatedId),
      link: event.link,
    })),
    skipDuplicates: true,
  });
}

export async function notifyCustomer(
  db: Database,
  customerId: number,
  event: { eventKey: string; title: string; message: string; type: string; relatedType?: string; relatedId?: string | number | bigint; link: string },
) {
  const customer = await db.customer.findUnique({ where: { id: customerId }, select: { email: true } });
  if (!customer?.email) return;
  const user = await db.user.findFirst({ where: { email: customer.email, role: "User", accountStatus: "Active" }, select: { id: true } });
  if (!user) return;
  await db.notification.createMany({ data: [{ recipientId: user.id, eventKey: event.eventKey, title: event.title, message: event.message, type: event.type, relatedType: event.relatedType || null, relatedId: event.relatedId == null ? null : String(event.relatedId), link: event.link }], skipDuplicates: true });
}
