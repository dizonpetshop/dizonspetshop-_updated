import { prisma } from "@/lib/prisma";

type InvoiceRow = {
  subtotal: { toString(): string };
  estimated_percent: number;
  discount_percent: number;
  discount_amount: { toString(): string };
  visit_number: number | null;
  applied_at: Date | null;
  status: string;
};

export default async function LoyaltyInvoice({ id }: { id: bigint }) {
  const rows = await prisma.$queryRaw<InvoiceRow[]>`
    SELECT pricing.*, appointment.status
    FROM appointment_loyalty_pricing pricing
    JOIN grooming_appointments appointment ON appointment.appointment_id=pricing.appointment_id
    WHERE pricing.appointment_id=${id}`;
  const row = rows[0];
  if (!row) return null;
  const money = (amount: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(amount);
  const subtotal = Number(row.subtotal.toString());
  const inactive = row.status === "Cancelled" || row.status === "Cancelled - No Show";
  return <div className="appointmentAttendance">
    <small>Service subtotal: {money(subtotal)}</small>
    {row.applied_at ? <>
      <small>Completed visit #{row.visit_number} · Loyalty discount: {row.discount_percent}% ({money(Number(row.discount_amount.toString()))})</small>
      <small>Final total: {money(subtotal - Number(row.discount_amount.toString()))}</small>
    </> : inactive ? <small>No loyalty stamp or discount applied.</small> :
      <small>Estimated loyalty discount: {row.estimated_percent}%. Final eligibility and amount are calculated on completion.</small>}
  </div>;
}
