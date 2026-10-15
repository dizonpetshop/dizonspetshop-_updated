import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { databaseConfigurationError, logDatabaseFailure } from "@/lib/database";
import { readSessionToken, sessionCookieName } from "@/lib/session";

const noStore = { "Cache-Control": "private, no-store, max-age=0" };
const safeLink = (link: string) => /^\/admin\/dashboard(?:[?#]|$)/.test(link) ? link : "/admin/dashboard?view=notifications";

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const session = await readSessionToken(cookieStore.get(sessionCookieName)?.value);
  if (session?.role !== "Admin" && session?.role !== "SuperAdmin") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (databaseConfigurationError()) return Response.json({ error: "Notifications are temporarily unavailable." }, { status: 503 });

  try {
  const url = new URL(request.url);
  const requestedTake = Number.parseInt(url.searchParams.get("take") || "30", 10);
  const take = Math.min(100, Math.max(1, Number.isFinite(requestedTake) ? requestedTake : 30));
  const [count, notifications] = await Promise.all([
    prisma.notification.count({ where: { recipientId: session.userId, isRead: false } }),
    prisma.notification.findMany({
      where: { recipientId: session.userId, ...(url.searchParams.get("unread") === "1" ? { isRead: false } : {}) },
      orderBy: { createdAt: "desc" },
      select: { notificationId: true, title: true, message: true, type: true, link: true, isRead: true, createdAt: true },
      take,
    }),
  ]);
  return Response.json({
    count,
    notifications: notifications.map((notification) => ({
      id: notification.notificationId.toString(),
      title: notification.title,
      message: notification.message,
      type: notification.type,
      link: safeLink(notification.link),
      isRead: notification.isRead,
      createdAt: notification.createdAt.toISOString(),
    })),
  }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    logDatabaseFailure("Admin notifications", error);
    return Response.json({ error: "Notifications are temporarily unavailable." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const session = await readSessionToken(cookieStore.get(sessionCookieName)?.value);
  if (session?.role !== "Admin" && session?.role !== "SuperAdmin") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (databaseConfigurationError()) return Response.json({ error: "Notifications are temporarily unavailable." }, { status: 503 });

  try {
  const body = await request.json().catch(() => null) as { id?: unknown; all?: unknown } | null;
  if (body?.all === true) {
    await prisma.notification.updateMany({ where: { recipientId: session.userId, isRead: false }, data: { isRead: true, readAt: new Date() } });
    const count = await prisma.notification.count({ where: { recipientId: session.userId, isRead: false } });
    return Response.json({ count }, { headers: noStore });
  }
  if (typeof body?.id !== "string" || !/^\d{1,19}$/.test(body.id) || BigInt(body.id) > BigInt("9223372036854775807")) {
    return Response.json({ error: "Invalid notification" }, { status: 400 });
  }

  const notification = await prisma.notification.findFirst({
    where: { notificationId: BigInt(body.id), recipientId: session.userId },
    select: { notificationId: true, link: true },
  });
  if (!notification) return Response.json({ error: "Notification not found" }, { status: 404 });

  await prisma.notification.updateMany({
    where: { notificationId: notification.notificationId, recipientId: session.userId },
    data: { isRead: true, readAt: new Date() },
  });
  const count = await prisma.notification.count({ where: { recipientId: session.userId, isRead: false } });
  return Response.json({ count, link: safeLink(notification.link) }, { headers: noStore });
  } catch (error) {
    logDatabaseFailure("Admin notification update", error);
    return Response.json({ error: "Notifications are temporarily unavailable." }, { status: 503 });
  }
}
