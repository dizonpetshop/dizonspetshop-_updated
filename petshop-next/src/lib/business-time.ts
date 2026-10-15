const offsetMs = 8 * 60 * 60 * 1000;
export function businessDate(value = new Date()) {
  return new Date(value.getTime() + offsetMs).toISOString().slice(0, 10);
}
export function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
export function validTime(value: string) { return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value); }
export function appointmentInstant(date: Date, time: Date) {
  return new Date(`${date.toISOString().slice(0, 10)}T${time.toISOString().slice(11, 19)}+08:00`);
}
// MySQL TIME stores a wall clock, represented by Prisma on 1970-01-01 UTC.
export function wallClockTime(value: Date) {
  return new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(value);
}
