import { businessDate, wallClockTime } from "@/lib/business-time";
import path from "node:path";
import type { NextRequest } from "next/server";
import { createPdfReport } from "@/lib/pdf-report";
import { prisma } from "@/lib/prisma";
import { readSessionToken, sessionCookieName } from "@/lib/session";
import { ReportFilterError, reportAppointmentWhere, reportFilterLabel, reportReservationWhere, resolveReportPeriod } from "@/lib/reporting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reportDate = (value: Date) => new Intl.DateTimeFormat("en-PH", { month: "short", day: "2-digit", year: "numeric", timeZone: "Asia/Manila" }).format(value);
const reportDateTime = (value: Date) => new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }).format(value);
const reportTime = (value: Date) => new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(value);
const currency = (value: unknown) => `PHP ${Number(value).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const todayKey = (value: Date) => new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Manila" }).format(value);

export async function GET(request: NextRequest) {
  try {
    const session = await readSessionToken(request.cookies.get(sessionCookieName)?.value);
    if (session?.role !== "Admin" && session?.role !== "SuperAdmin") return Response.json({ error: "You are not authorized to export reports." }, { status: 401 });
    const admin = await prisma.user.findFirst({ where: { id: session.userId, role: { in: ["Admin", "SuperAdmin"] }, accountStatus: "Active" }, select: { id: true } });
    if (!admin) return Response.json({ error: "Your administrator account is not active." }, { status: 403 });

    const params = request.nextUrl.searchParams;
    const period = resolveReportPeriod({ range: params.get("range"), from: params.get("from"), to: params.get("to") }, new Date(), true);
    const [reservations, appointments, products] = await Promise.all([
      prisma.productReservation.findMany({
        where: reportReservationWhere(period),
        include: { customer: true, items: { include: { product: { select: { productName: true } } } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.groomingAppointment.findMany({
        where: reportAppointmentWhere(period),
        include: { customer: true, pet: true, style: true, groomer: true },
        orderBy: [{ appointmentDate: "desc" }, { appointmentTime: "desc" }],
      }),
      prisma.product.findMany({ orderBy: [{ category: "asc" }, { productName: "asc" }] }),
    ]);

    const productPerformance = new Map<string, { reserved: number; completed: number }>();
    for (const reservation of reservations.filter((item) => item.status !== "Cancelled")) {
      for (const item of reservation.items) {
        const stats = productPerformance.get(item.product.productName) || { reserved: 0, completed: 0 };
        stats.reserved += item.quantity;
        if (reservation.status === "Completed") stats.completed += item.quantity;
        productPerformance.set(item.product.productName, stats);
      }
    }
    const appointmentGroups = (select: (item: (typeof appointments)[number]) => string) => {
      const counts = new Map<string, number>();
      for (const item of appointments) { const label = select(item); counts.set(label, (counts.get(label) || 0) + 1); }
      return [...counts].sort((a, b) => b[1] - a[1]);
    };
    const completedSales = reservations.filter((item) => item.status === "Completed").reduce((sum, item) => sum + Number(item.totalAmount), 0);
    const completedServices = appointments.filter((item) => item.status === "Completed").reduce((sum, item) => sum + Number(item.totalPrice), 0);
    const totalUnits = products.reduce((sum, item) => sum + item.stockQuantity, 0);
    const trendSpanDays = Math.max(1, Math.ceil((period.end.getTime() - period.start.getTime()) / 86400000));
    const monthlyTrend = trendSpanDays > 45;
    const trendKey = (value: Date) => monthlyTrend ? todayKey(value).slice(0, 7) : todayKey(value);
    const trendLabel = (value: Date) => new Intl.DateTimeFormat("en-PH", monthlyTrend ? { month: "short", year: "2-digit", timeZone: "Asia/Manila" } : { month: "short", day: "numeric", timeZone: "Asia/Manila" }).format(value);
    const trendBuckets = new Map<string, { label: string; reservations: number; appointments: number }>();
    const trendCursor = new Date(period.start);
    const trendLimit = monthlyTrend ? Math.ceil(trendSpanDays / 28) + 2 : 45;
    for (let index = 0; trendCursor <= period.end && index < trendLimit; index++) {
      const key = trendKey(trendCursor);
      if (!trendBuckets.has(key)) trendBuckets.set(key, { label: trendLabel(trendCursor), reservations: 0, appointments: 0 });
      if (monthlyTrend) trendCursor.setUTCMonth(trendCursor.getUTCMonth() + 1, 1); else trendCursor.setUTCDate(trendCursor.getUTCDate() + 1);
    }
    for (const item of reservations) { const bucket = trendBuckets.get(trendKey(item.createdAt)); if (bucket) bucket.reservations++; }
    for (const item of appointments) { const bucket = trendBuckets.get(trendKey(item.appointmentDate)); if (bucket) bucket.appointments++; }
    const generatedAt = new Date();
    const detailRecords = reservations.length + appointments.length + products.length;
    const pdf = await createPdfReport({
      title: "Business Reports & Analytics",
      generatedAt,
      logoPath: path.join(process.cwd(), "public", "assets", "dizons-logo-transparent.png"),
      filters: [reportFilterLabel(period), "Inventory: current stock snapshot"],
      totals: [
        ["Total records", detailRecords.toLocaleString("en-PH")],
        ["Completed sales", currency(completedSales)],
        ["Product reservations", reservations.length.toLocaleString("en-PH")],
        ["Grooming appointments", appointments.length.toLocaleString("en-PH")],
        ["Inventory units", totalUnits.toLocaleString("en-PH")],
      ],
      tables: [
        {
          title: "Reservation Activity Trend",
          columns: [{ label: "Period", width: 390 }, { label: "Product reservations", width: 190, align: "right" }, { label: "Grooming appointments", width: 190, align: "right" }],
          rows: [...trendBuckets.values()].map((item) => [item.label, String(item.reservations), String(item.appointments)]),
        },
        {
          title: "Product Performance Summary",
          columns: [{ label: "Product", width: 420 }, { label: "Reserved units", width: 175, align: "right" }, { label: "Completed units", width: 175, align: "right" }],
          rows: [...productPerformance].sort((a, b) => b[1].reserved - a[1].reserved).map(([name, stats]) => [name, String(stats.reserved), String(stats.completed)]),
        },
        {
          title: "Appointment Status Summary",
          columns: [{ label: "Status", width: 590 }, { label: "Appointments", width: 180, align: "right" }],
          rows: ["Pending", "Confirmed", "Completed", "Cancelled"].map((status) => [status, String(appointments.filter((item) => item.status === status).length)]),
        },
        {
          title: "Service Type Summary",
          columns: [{ label: "Service type", width: 590 }, { label: "Appointments", width: 180, align: "right" }],
          rows: appointmentGroups((item) => item.bookingType === "Home Service" ? "Home Service" : "Store Grooming").map(([label, count]) => [label, String(count)]),
        },
        {
          title: "Grooming Style Summary",
          columns: [{ label: "Grooming style", width: 590 }, { label: "Appointments", width: 180, align: "right" }],
          rows: appointmentGroups((item) => item.style.styleName).map(([label, count]) => [label, String(count)]),
        },
        {
          title: "Groomer Workload Summary",
          columns: [{ label: "Groomer", width: 590 }, { label: "Appointments", width: 180, align: "right" }],
          rows: appointmentGroups((item) => item.groomer.groomerName).map(([label, count]) => [label, String(count)]),
        },
        {
          title: `Product Reservations (${reservations.length} records • Completed sales ${currency(completedSales)})`,
          columns: [{ label: "Code", width: 78 }, { label: "Created", width: 88 }, { label: "Customer", width: 120 }, { label: "Products", width: 245 }, { label: "Qty", width: 45, align: "right" }, { label: "Status", width: 92 }, { label: "Total", width: 102, align: "right" }],
          rows: reservations.flatMap((item) => item.items.length ? item.items.map((line, index) => [item.reservationCode, reportDateTime(item.createdAt), item.customer.customerName, line.product.productName, String(line.quantity), item.status, index === 0 ? currency(item.totalAmount) : ""]) : [[item.reservationCode, reportDateTime(item.createdAt), item.customer.customerName, "No line items", "0", item.status, currency(item.totalAmount)]]),
        },
        {
          title: `Grooming Appointments (${appointments.length} records • Completed value ${currency(completedServices)})`,
          columns: [{ label: "Code", width: 72 }, { label: "Date / time", width: 82 }, { label: "Customer", width: 100 }, { label: "Pet", width: 72 }, { label: "Style", width: 103 }, { label: "Groomer", width: 95 }, { label: "Service", width: 80 }, { label: "Status", width: 75 }, { label: "Price", width: 91, align: "right" }],
          rows: appointments.map((item) => [item.reservationCode, `${reportDate(item.appointmentDate)}\n${reportTime(item.appointmentTime)}`, item.customer.customerName, `${item.pet.petName}${item.pet.species ? ` (${item.pet.species})` : ""}`, item.style.styleName, item.groomer.groomerName, item.bookingType, item.status, currency(item.totalPrice)]),
        },
        {
          title: `Current Inventory (${products.length} products • ${totalUnits.toLocaleString("en-PH")} total units)`,
          columns: [{ label: "SKU", width: 82 }, { label: "Product", width: 220 }, { label: "Category", width: 130 }, { label: "Price", width: 90, align: "right" }, { label: "Stock", width: 65, align: "right" }, { label: "Reorder", width: 65, align: "right" }, { label: "Status", width: 118 }],
          rows: products.map((item) => [item.sku || "—", item.productName, item.category, currency(item.price), String(item.stockQuantity), String(item.reorderLevel), !item.isActive ? "Inactive" : item.stockQuantity <= 0 ? "Out of stock" : item.stockQuantity <= item.reorderLevel ? "Low stock" : "In stock"]),
        },
      ],
    });

    const filename = `business_report_${todayKey(generatedAt)}.pdf`;
    return new Response(new Uint8Array(pdf), { status: 200, headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    if (error instanceof ReportFilterError) return Response.json({ error: error.message }, { status: 400 });
    console.error("PDF report generation failed", error);
    return Response.json({ error: "The PDF report could not be generated. Please try again." }, { status: 500 });
  }
}
