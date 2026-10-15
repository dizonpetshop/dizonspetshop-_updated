import type { Prisma } from "@prisma/client";
import { appointmentInstant } from "./business-time";
import { lockAppointment, attendanceFor, cancelNoShow, graceMinutes, NO_SHOW } from './grooming-attendance';
import { hasGroomingConflict } from './grooming-conflicts';
import { awardGroomingStamp } from './loyalty';

export async function transitionProductReservation(tx: Prisma.TransactionClient, reservationId: bigint, status: string, customerId?: number) {
  const reservation = await tx.productReservation.findFirst({ where: { reservationId, ...(customerId ? { customerId } : {}) }, include: { items: true } });
  if (!reservation) throw new Error("Reservation not found.");
  const transitions: Record<string, readonly string[]> = { Pending: ["Approved", "Cancelled"], Approved: ["Ready for Pickup", "Cancelled"], "Ready for Pickup": ["Completed", "Cancelled"], Completed: [], Cancelled: [] };
  if (customerId && !["Pending", "Approved"].includes(reservation.status)) throw new Error("This product reservation can no longer be cancelled.");
  if (reservation.status === status) return { reservation, changed: false };
  if (!transitions[reservation.status]?.includes(status)) throw new Error(`A ${reservation.status.toLowerCase()} reservation cannot be changed to ${status}.`);
  // Claim the transition first. Only the winner may release reserved inventory.
  const result = await tx.productReservation.updateMany({ where: { reservationId, status: reservation.status }, data: { status } });
  if (result.count !== 1) throw new Error("Reservation changed while you were updating it. Please refresh.");
  if (status === "Cancelled") for (const item of reservation.items) await tx.product.update({ where: { productId: item.productId }, data: { stockQuantity: { increment: item.quantity } } });
  return { reservation, changed: true };
}

export async function transitionAppointment(tx: Prisma.TransactionClient, appointmentId: bigint, status: string, customerId?: number, reason='', actor?:{userId:number;name:string;role:string}) {
  const appointment = await lockAppointment(tx,appointmentId);
  if(customerId&&appointment.customerId!==customerId)throw new Error('Appointment not found.');
  const transitions: Record<string, readonly string[]> = { Pending: ["Confirmed", "Cancelled"], Confirmed: ["Checked In", "Completed", "Cancelled",NO_SHOW], 'Checked In':['In Progress','Completed','Cancelled'], 'In Progress':['Completed','Cancelled'], Completed: [], Cancelled: [], [NO_SHOW]:['Checked In'] };
  if (customerId && !["Pending", "Confirmed"].includes(appointment.status)) throw new Error("This appointment can no longer be cancelled.");
  if (customerId && appointmentInstant(appointment.appointmentDate, appointment.appointmentTime).getTime() <= Date.now()) throw new Error("Past appointments cannot be cancelled.");
  if (appointment.status === status) return { appointment, changed: false };
  if (!transitions[appointment.status]?.includes(status)) throw new Error(`A ${appointment.status.toLowerCase()} appointment cannot be changed to ${status}.`);
  if(status===NO_SHOW){if(reason.trim().length<5||reason.length>1000)throw new Error('Record a verified no-show reason (5–1,000 characters).');if(appointmentInstant(appointment.appointmentDate,appointment.appointmentTime).getTime()+(await graceMinutes(tx))*60000>Date.now())throw new Error('The grace period has not ended.');await cancelNoShow(tx,appointment,reason,false,new Date(),actor);return {appointment,changed:true};}
  if(appointment.status===NO_SHOW){
    if(reason.trim().length<5||reason.length>1000)throw new Error('Record a recovery reason (5–1,000 characters).');
    if(await hasGroomingConflict(tx,appointment.groomerId,appointment.petId,appointment.appointmentDate.toISOString().slice(0,10),appointment.appointmentTime.toISOString().slice(11,16)))throw new Error('Recovery would double-book the groomer or pet. Reschedule through staff instead.');
    await tx.$executeRaw`UPDATE grooming_attendance SET cancellation_reason=${'Recovered: '+reason},cancellation_kind='recovered' WHERE appointment_id=${appointmentId}`;
  }
  if(status==='Checked In')await tx.$executeRaw`INSERT INTO grooming_attendance(appointment_id,checked_in_at) VALUES(${appointmentId},${new Date()}) ON DUPLICATE KEY UPDATE checked_in_at=COALESCE(checked_in_at,VALUES(checked_in_at))`;
  if(status==='In Progress'){const attendance=await attendanceFor(tx,appointmentId);if(!attendance?.checked_in_at)throw new Error('Record arrival before starting service.');await tx.$executeRaw`UPDATE grooming_attendance SET started_at=COALESCE(started_at,${new Date()}) WHERE appointment_id=${appointmentId}`;}
  const result = await tx.groomingAppointment.updateMany({ where: { appointmentId, status: appointment.status }, data: { status, cancelledAt: status === "Cancelled" ? new Date() : null } });
  if (result.count !== 1) throw new Error("Appointment changed while you were updating it. Please refresh.");
  if(status==='Completed')await awardGroomingStamp(tx,appointmentId,appointment.customerId,actor?.userId);
  return { appointment, changed: true };
}
