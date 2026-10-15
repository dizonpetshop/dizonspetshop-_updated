import { PrismaClient } from "@prisma/client";

const urlValue = process.env.DATABASE_URL;
let url;
try {
  url = new URL(urlValue);
} catch {
  console.error("DATABASE_URL is missing or invalid. Set a MySQL URL in petshop-next/.env.local.");
  process.exit(1);
}

if (url.protocol !== "mysql:") {
  console.error(`DATABASE_URL uses ${url.protocol.replace(":", "")}, but this app's Prisma schema uses MySQL.`);
  console.error("Use a MySQL DATABASE_URL that points to the Petshop database.");
  process.exit(1);
}

if (!url.hostname || !url.pathname || url.pathname === "/") {
  console.error("DATABASE_URL is incomplete. Check the host and database name in petshop-next/.env.local.");
  process.exit(1);
}

const prisma = new PrismaClient();
const models = [
  "user", "revokedSession", "customer", "pet", "product", "groomingStyle", "styleSizePricing",
  "groomingAddon", "appointmentAddon", "groomer", "groomerAvailability", "groomingAppointment",
  "productReservation", "productReservationItem", "notification", "auditLog",
  "loyaltyTransaction", "systemSetting",
];

try {
  await prisma.$connect();
  for (const model of models) {
    await prisma[model].findFirst();
    console.log(`OK ${model}`);
  }
  await prisma.$queryRaw`SELECT conversation_id FROM support_conversations LIMIT 1`;
  await prisma.$queryRaw`SELECT message_id FROM support_messages LIMIT 1`;
  console.log("OK support_conversations"); console.log("OK support_messages");
  console.log("Database connection and all feature tables/columns are available.");
} catch (error) {
  const code = error && typeof error === "object" && "code" in error ? error.code : "connection/schema error";
  console.error(`Database check failed (${code}). Check credentials, network access, and the applied MySQL schema.`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
