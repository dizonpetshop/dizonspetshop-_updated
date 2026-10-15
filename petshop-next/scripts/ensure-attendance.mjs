import { PrismaClient } from '@prisma/client';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export async function ensureAttendance(p){
  const ids=await p.$queryRawUnsafe("SHOW COLUMNS FROM grooming_appointments WHERE Field='appointment_id'");const idType=ids[0].Type;if(!/^bigint(?:\(\d+\))?(?: unsigned)?$/i.test(idType))throw new Error('Unsupported appointment ID type.');
  const cols=await p.$queryRawUnsafe("SHOW COLUMNS FROM grooming_appointments WHERE Field='status'");
  const type=cols[0].Type;
  if(type.startsWith('enum(')&&!type.includes("'Checked In'"))await p.$executeRawUnsafe(`ALTER TABLE grooming_appointments MODIFY status ${type.slice(0,-1)},'Checked In','In Progress','Cancelled - No Show') NOT NULL DEFAULT 'Pending'`);
  await p.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS grooming_attendance (
    appointment_id ${idType} NOT NULL PRIMARY KEY,
    checked_in_at DATETIME(3) NULL, started_at DATETIME(3) NULL,
    cancellation_reason TEXT NULL, cancellation_kind VARCHAR(20) NULL,
    cancelled_at DATETIME(3) NULL,
    CONSTRAINT grooming_attendance_appointment_fk FOREIGN KEY(appointment_id) REFERENCES grooming_appointments(appointment_id) ON DELETE RESTRICT
  )`);
  await p.systemSetting.upsert({where:{key:'grooming_no_show_grace_minutes'},create:{key:'grooming_no_show_grace_minutes',value:'15'},update:{}});
  await p.systemSetting.upsert({where:{key:'grooming_attendance_enabled_after'},create:{key:'grooming_attendance_enabled_after',value:new Date().toISOString()},update:{}});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const p=new PrismaClient();try{await ensureAttendance(p);console.log('Attendance schema ready; existing appointments preserved.');}finally{await p.$disconnect();}}
