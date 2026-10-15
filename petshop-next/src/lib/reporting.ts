import type { Prisma } from "@prisma/client";
import { businessDate, validDate } from "./business-time";

export const reportRanges = ["today", "week", "month", "year", "custom"] as const;
export type ReportRange = (typeof reportRanges)[number];

type ReportPeriodInput = { range?: string | null; from?: string | null; to?: string | null };

export type ReportPeriod = {
  range: ReportRange;
  from: string;
  to: string;
  start: Date;
  end: Date;
};

const dateInputPattern = /^\d{4}-\d{2}-\d{2}$/;

function validDateInput(value?: string | null) {
  if (!value || !dateInputPattern.test(value) || !validDate(value)) return "";
  const parsed = new Date(`${value}T12:00:00+08:00`);
  if (Number.isNaN(parsed.getTime())) return "";
  const [year, month, day] = value.split("-").map(Number);
  return businessDate(parsed) === value ? value : "";
}

export function resolveReportPeriod(input: ReportPeriodInput, now = new Date(), strict = false): ReportPeriod {
  if (strict && input.range && !reportRanges.includes(input.range as ReportRange)) throw new ReportFilterError("Invalid report range.");
  if (strict && input.from && !validDateInput(input.from)) throw new ReportFilterError("Invalid report start date.");
  if (strict && input.to && !validDateInput(input.to)) throw new ReportFilterError("Invalid report end date.");
  const range = reportRanges.includes(input.range as ReportRange) ? input.range as ReportRange : "month";
  const from = validDateInput(input.from);
  const to = validDateInput(input.to);
  const today = businessDate(now);
  const start = range === "today"
    ? new Date(`${today}T00:00:00+08:00`)
    : range === "week"
      ? new Date(now.getTime() - 7 * 86400000)
      : range === "year"
        ? new Date(`${today.slice(0, 4)}-01-01T00:00:00+08:00`)
        : range === "custom" && from
          ? new Date(`${from}T00:00:00+08:00`)
          : new Date(`${today.slice(0, 7)}-01T00:00:00+08:00`);
  const end = range === "custom" && to ? new Date(`${to}T23:59:59.999+08:00`) : now;

  if (strict && start > end) throw new ReportFilterError("The report start date must be on or before the end date.");
  return { range, from, to, start, end };
}

export class ReportFilterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReportFilterError";
  }
}

export function reportAppointmentWhere(period: ReportPeriod): Prisma.GroomingAppointmentWhereInput {
  return { appointmentDate: { gte: new Date(`${businessDate(period.start)}T00:00:00Z`), lte: new Date(`${businessDate(period.end)}T00:00:00Z`) } };
}

export function reportReservationWhere(period: ReportPeriod): Prisma.ProductReservationWhereInput {
  return { createdAt: { gte: period.start, lte: period.end } };
}

export function reportFilterLabel(period: ReportPeriod) {
  const label = new Intl.DateTimeFormat("en-PH", { month: "short", day: "2-digit", year: "numeric", timeZone: "Asia/Manila" });
  const preset = { today: "Today", week: "This week", month: "This month", year: "This year", custom: "Custom range" }[period.range];
  return `${preset}: ${label.format(period.start)} to ${label.format(period.end)}`;
}
