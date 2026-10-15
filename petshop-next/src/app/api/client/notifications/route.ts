import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { databaseConfigurationError, logDatabaseFailure } from "@/lib/database";
import { readSessionToken, sessionCookieName } from "@/lib/session";

async function requireClient() {
  const session = await readSessionToken((await cookies()).get(sessionCookieName)?.value);
  if (session?.role !== "User") return null;
  if (databaseConfigurationError()) throw new Error("Database configuration is unavailable");
  return prisma.user.findFirst({
    where: { id: session.userId, role: "User", accountStatus: "Active" },
    select: { id: true },
  });
}

const noStore = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };
const safeLink = (link: string) => /^\/client\/dashboard(?:[?#]|$)/.test(link) ? link : "/client/dashboard?view=notifications";

export async function GET(request: Request) {
  let client;
  try {
    client = await requireClient();
  } catch (error) {
    logDatabaseFailure("Client notifications authorization", error);
    return Response.json({ error: "Notifications are temporarily unavailable." }, { status: 503, headers: noStore });
  }
  if (!client) return Response.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
  const url = new URL(request.url);
  const requestedTake = Number.parseInt(url.searchParams.get("take") || "6", 10);
  const take = Math.min(100, Math.max(1, Number.isFinite(requestedTake) ? requestedTake : 6));
  try {
    const [count, notifications] = await Promise.all([
      prisma.notification.count({ where: { recipientId: client.id, isRead: false } }),
      prisma.notification.findMany({
        where: { recipientId: client.id, ...(url.searchParams.get("unread") === "1" ? { isRead: false } : {}) },
        orderBy: { createdAt: "desc" },
        select: { notificationId: true, title: true, message: true, type: true, link: true, isRead: true, createdAt: true },
        take,
      }),
    ]);
    return Response.json({
      count,
      notifications: notifications.map((item) => ({
        id: item.notificationId.toString(),
        title: item.title,
        message: item.message,
        type: item.type,
        link: safeLink(item.link),
        isRead: item.isRead,
        createdAt: item.createdAt.toISOString(),
      })),
    }, { headers: noStore });
  } catch (error) {
    logDatabaseFailure("Client notifications", error);
    return Response.json({ error: "Notifications are temporarily unavailable." }, { status: 503, headers: noStore });
  }
}

export async function POST(request: Request) {
  let client;
  try {
    client = await requireClient();
  } catch (error) {
    logDatabaseFailure("Client notifications authorization", error);
    return Response.json({ error: "Notifications are temporarily unavailable." }, { status: 503, headers: noStore });
  }
  if (!client) return Response.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
  const body = await request.json().catch(() => null) as { id?: unknown; all?: unknown } | null;
  try {
    if (body?.all === true) {
      await prisma.notification.updateMany({
        where: { recipientId: client.id, isRead: false },
        data: { isRead: true, readAt: new Date() },
      });
      const count = await prisma.notification.count({ where: { recipientId: client.id, isRead: false } });
      return Response.json({ count }, { headers: noStore });
    }
    if (typeof body?.id !== "string" || !/^\d{1,19}$/.test(body.id) || BigInt(body.id) > BigInt("9223372036854775807")) {
      return Response.json({ error: "Invalid notification." }, { status: 400, headers: noStore });
    }
    const notification = await prisma.notification.findFirst({
      where: { notificationId: BigInt(body.id), recipientId: client.id },
      select: { notificationId: true, link: true },
    });
    if (!notification) return Response.json({ error: "Notification not found." }, { status: 404, headers: noStore });
    await prisma.notification.updateMany({
      where: { notificationId: notification.notificationId, recipientId: client.id },
      data: { isRead: true, readAt: new Date() },
    });
    const count = await prisma.notification.count({ where: { recipientId: client.id, isRead: false } });
    return Response.json({ count, link: safeLink(notification.link) }, { headers: noStore });
  } catch (error) {
    logDatabaseFailure("Client notification update", error);
    return Response.json({ error: "The notification could not be updated." }, { status: 503, headers: noStore });
  }
}
