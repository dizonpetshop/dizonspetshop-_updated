import { Prisma, PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; prismaSchema?: string };
// Hot reload must not reuse a client generated before a schema change.
const schema = JSON.stringify(Prisma.dmmf.datamodel);

const databaseUrl = process.env.DATABASE_URL;
const cached = globalForPrisma.prismaSchema === schema ? globalForPrisma.prisma : undefined;
if (!cached && globalForPrisma.prisma) void globalForPrisma.prisma.$disconnect().catch(() => {});
export const prisma = cached ?? new PrismaClient(
  databaseUrl ? { datasources: { db: { url: databaseUrl } } } : undefined,
);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaSchema = schema;
}
