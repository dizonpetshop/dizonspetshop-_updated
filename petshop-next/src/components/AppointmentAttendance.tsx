import { prisma } from '@/lib/prisma';
import type { Attendance } from '@/lib/grooming-attendance';
export default async function AppointmentAttendance({id}:{id:bigint}){
  const records=await prisma.$queryRaw<Attendance[]>`SELECT * FROM grooming_attendance WHERE appointment_id=${id}`;
  const record=records[0];if(!record)return null;
  const timestamp=(value:Date)=>value.toLocaleString('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'});
  return <div className="appointmentAttendance">{record.checked_in_at&&<small>Checked in: {timestamp(record.checked_in_at)}</small>}{record.started_at&&<small>Service started: {timestamp(record.started_at)}</small>}{record.cancellation_reason&&<small>{record.cancellation_reason}</small>}{record.cancelled_at&&<small>Cancellation recorded: {timestamp(record.cancelled_at)}</small>}</div>;
}
