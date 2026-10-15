import { compare } from "bcryptjs";
import { prisma } from "./prisma";

// The legacy PHP code stores the time a lockout starts, not its end.
const lockoutMs = 15 * 60 * 1000;
export async function authenticateAccount(email: string, password: string, role: "User" | "Admin" | "SuperAdmin") {
  if (!email || !password || Buffer.byteLength(password, "utf8") > 72) return null;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.role !== role || user.accountStatus !== "Active") return null;
  if (user.lockoutTime && user.lockoutTime.getTime() + lockoutMs > Date.now()) return null;
  const encoded = user.password.startsWith("$2y$") ? "$2b$" + user.password.slice(4) : user.password;
  if (!await compare(password, encoded)) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`UPDATE users SET failed_attempts = COALESCE(failed_attempts, 0) + 1 WHERE id = ${user.id}`;
      const current = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      if ((current.failedAttempts || 0) >= 5) await tx.user.update({ where: { id: user.id }, data: { lockoutTime: new Date(), failedAttempts: 0 } });
    });
    return null;
  }
  await prisma.user.update({ where: { id: user.id }, data: { failedAttempts: 0, lockoutTime: null } });
  return user;
}
