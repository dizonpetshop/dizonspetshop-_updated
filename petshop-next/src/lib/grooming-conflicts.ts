import type { Prisma, PrismaClient } from "@prisma/client";

// Explicit MySQL wall-clock comparison: binding Date objects to TIME filters
// may compare against a full DATETIME and miss occupied slots.
export async function hasGroomingConflict(db: Prisma.TransactionClient | PrismaClient, groomerId: number, petId: number, date: string, time: string) {
  const seconds = Number(time.slice(0, 2)) * 3600 + Number(time.slice(3)) * 60;
  const rows = await db.$queryRaw<{ appointment_id: bigint }[]>`
    SELECT appointment_id FROM grooming_appointments
    WHERE appointment_date = CAST(${date} AS DATE)
      AND (groomer_id = ${groomerId} OR pet_id = ${petId})
      AND status IN ('Pending', 'Confirmed','Checked In','In Progress')
      AND ABS(TIME_TO_SEC(appointment_time) - ${seconds}) < 3600
    LIMIT 1 FOR UPDATE`;
  return rows.length > 0;
}
