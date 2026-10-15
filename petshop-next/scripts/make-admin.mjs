import { PrismaClient } from "@prisma/client";

const email = String(process.argv[2] ?? "").trim().toLowerCase();
if (!email || !email.includes("@")) {
  console.error("Usage: npm run make-admin -- owner@example.com");
  process.exit(1);
}

const prisma = new PrismaClient();
try {
  const result = await prisma.user.updateMany({
    where: { email },
    data: { role: "Admin", accountStatus: "Active" },
  });
  if (result.count !== 1) {
    console.error("No account with that email was found. Register the owner account first.");
    process.exitCode = 1;
  } else {
    console.log(`Administrator access enabled for ${email}.`);
  }
} finally {
  await prisma.$disconnect();
}
