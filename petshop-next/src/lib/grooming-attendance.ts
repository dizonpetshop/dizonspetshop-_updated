import type { Prisma, PrismaClient } from '@prisma/client';
import { appointmentInstant, wallClockTime } from './business-time';
import { notifyCustomer, notifyAdministrators } from './operations';

export const NO_SHOW = 'Cancelled - No Show';
export const ACTIVE_APPOINTMENTS = ['Pending','Confirmed','Checked In','In Progress'];
export type Attendance = {appointment_id:bigint;checked_in_at:Date|null;started_at:Date|null;cancellation_reason:string|null;cancellation_kind:string|null;cancelled_at:Date|null};
export async function attendanceFor(tx:Prisma.TransactionClient,id:bigint){const rows=await tx.$queryRaw<Attendance[]>`SELECT * FROM grooming_attendance WHERE appointment_id=${id} FOR UPDATE`;return rows[0];}
export async function lockAppointment(tx:Prisma.TransactionClient,id:bigint){
  const initial=await tx.groomingAppointment.findUnique({where:{appointmentId:id}});if(!initial)throw new Error('Appointment not found.');
  await tx.$queryRaw`SELECT groomer_id FROM groomers WHERE groomer_id=${initial.groomerId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM pets WHERE id=${initial.petId} FOR UPDATE`;
  const locked=await tx.$queryRaw<{status:string;groomer_id:number;pet_id:number;booking_type:string;scheduled_date:string;scheduled_time:string}[]>`SELECT status,groomer_id,pet_id,booking_type,DATE_FORMAT(appointment_date,'%Y-%m-%d') AS scheduled_date,TIME_FORMAT(appointment_time,'%H:%i:%s') AS scheduled_time FROM grooming_appointments WHERE appointment_id=${id} FOR UPDATE`;
  const current=await tx.groomingAppointment.findUniqueOrThrow({where:{appointmentId:id},include:{customer:true,pet:true,style:true}});
  if(!locked[0]||locked[0].groomer_id!==initial.groomerId||locked[0].pet_id!==initial.petId)throw new Error('Appointment was rescheduled. Refresh and retry.');
  return {...current,status:locked[0].status,bookingType:locked[0].booking_type,appointmentDate:new Date(locked[0].scheduled_date+'T00:00:00Z'),appointmentTime:new Date('1970-01-01T'+locked[0].scheduled_time+'Z')};
}
export async function graceMinutes(db:Prisma.TransactionClient|PrismaClient){const setting=await db.systemSetting.findUnique({where:{key:'grooming_no_show_grace_minutes'}});const value=Number(setting?.value??15);return Number.isInteger(value)&&value>=1&&value<=120?value:15;}
export async function cancelNoShow(tx:Prisma.TransactionClient,appointment:Awaited<ReturnType<typeof lockAppointment>>,reason:string,automatic:boolean,now:Date,actor?:{userId:number;name:string;role:string}){
  const record=await attendanceFor(tx,appointment.appointmentId);
  if(!['Confirmed'].includes(appointment.status)||record?.checked_in_at||record?.started_at)throw new Error('Only an unstarted, confirmed appointment can be recorded as a no-show.');
  await tx.groomingAppointment.update({where:{appointmentId:appointment.appointmentId},data:{status:NO_SHOW,cancelledAt:now}});
  await tx.$executeRaw`INSERT INTO grooming_attendance(appointment_id,cancellation_reason,cancellation_kind,cancelled_at) VALUES(${appointment.appointmentId},${reason},${automatic?'automatic':'verified'},${now}) ON DUPLICATE KEY UPDATE cancellation_reason=VALUES(cancellation_reason),cancellation_kind=VALUES(cancellation_kind),cancelled_at=VALUES(cancelled_at)`;
  const eventKey=`appointment.noshow.${appointment.appointmentId}`;
  const detail=`${appointment.reservationCode} · ${appointment.pet.petName} · ${appointment.style.styleName} · ${appointment.appointmentDate.toISOString().slice(0,10)} ${wallClockTime(appointment.appointmentTime)} (Asia/Manila). Reason: ${reason}`;
  await notifyCustomer(tx,appointment.customerId,{eventKey,title:automatic?'Grooming Appointment Automatically Cancelled':'Grooming Appointment Cancelled - No Show',message:(automatic?'Your grooming appointment was automatically cancelled because the scheduled arrival time and grace period have passed without a recorded check-in. ':'Staff verified that the appointment could not proceed. ')+detail,type:'GROOMING_NO_SHOW',relatedType:'appointment',relatedId:appointment.appointmentId,link:'/client/dashboard?view=reservations'});
  await notifyAdministrators(tx,{eventKey,title:'Grooming appointment cancelled - no show',message:detail,type:'GROOMING_NO_SHOW',relatedType:'appointment',relatedId:appointment.appointmentId,link:`/admin/dashboard?view=reservations&q=${appointment.reservationCode}`});
  await tx.auditLog.create({data:{userId:actor?.userId??null,userName:actor?.name??'Attendance scheduler',role:actor?.role??'System',action:automatic?'AUTO_CANCEL':'NO_SHOW',module:'Grooming Appointment',recordId:String(appointment.appointmentId),description:detail}});
}
export async function processNoShows(db:PrismaClient,now=new Date()){
  const enabled=await db.systemSetting.findUnique({where:{key:'grooming_attendance_enabled_after'}});
  const enabledAfter=new Date(enabled?.value??'');if(!Number.isFinite(enabledAfter.getTime()))throw new Error('Attendance upgrade is required.');
  const grace=await graceMinutes(db);
  const appointments=await db.$queryRaw<{appointment_id:bigint}[]>`SELECT a.appointment_id FROM grooming_appointments a LEFT JOIN grooming_attendance t ON t.appointment_id=a.appointment_id WHERE a.status='Confirmed' AND a.booking_type='Salon' AND t.checked_in_at IS NULL AND t.started_at IS NULL AND TIMESTAMP(a.appointment_date,a.appointment_time)>=${new Date(enabledAfter.getTime()+8*3600000)} AND TIMESTAMP(a.appointment_date,a.appointment_time)<=${new Date(now.getTime()+8*3600000-grace*60000)} ORDER BY a.appointment_date,a.appointment_time LIMIT 100`;
  let cancelled=0;
  for(const row of appointments){const changed=await db.$transaction(async tx=>{const a=await lockAppointment(tx,row.appointment_id);const attendance=await attendanceFor(tx,a.appointmentId);const start=appointmentInstant(a.appointmentDate,a.appointmentTime).getTime();if(a.status!=='Confirmed'||a.bookingType!=='Salon'||attendance?.checked_in_at||attendance?.started_at||start<enabledAfter.getTime()||start+grace*60000>now.getTime())return false;await cancelNoShow(tx,a,'Automatically cancelled because the customer did not check in within the allowed grace period.',true,now);return true;},{isolationLevel:'ReadCommitted'});if(changed)cancelled++;}
  return {checked:appointments.length,cancelled,graceMinutes:grace,timezone:'Asia/Manila'};
}
