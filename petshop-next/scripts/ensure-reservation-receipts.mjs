import {PrismaClient} from '@prisma/client';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
export async function ensureReservationReceipts(db){
 const columns=await db.$queryRawUnsafe("SHOW COLUMNS FROM product_reservations WHERE Field='reservation_id'");
 const type=columns[0]?.Type;if(!/^(?:big)?int(?:\(\d+\))?(?: unsigned)?$/i.test(type||''))throw Error('Unsupported reservation key type.');
 await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS product_reservation_receipt_snapshot(reservation_id ${type} NOT NULL PRIMARY KEY,snapshot LONGTEXT NOT NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),FOREIGN KEY(reservation_id) REFERENCES product_reservations(reservation_id) ON DELETE RESTRICT) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
 const appointmentColumns=await db.$queryRawUnsafe("SHOW COLUMNS FROM grooming_appointments WHERE Field='appointment_id'");
 const appointmentType=appointmentColumns[0]?.Type;if(!/^(?:big)?int(?:\(\d+\))?(?: unsigned)?$/i.test(appointmentType||''))throw Error('Unsupported appointment key type.');
 await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS grooming_appointment_receipt_snapshot(appointment_id ${appointmentType} NOT NULL PRIMARY KEY,snapshot LONGTEXT NOT NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),FOREIGN KEY(appointment_id) REFERENCES grooming_appointments(appointment_id) ON DELETE RESTRICT) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
 console.log('Reservation receipt snapshots ready; historical records unchanged.');
}
if(process.argv[1]&&fileURLToPath(import.meta.url).toLowerCase()===resolve(process.argv[1]).toLowerCase()){const db=new PrismaClient();try{await ensureReservationReceipts(db);}finally{await db.$disconnect();}}
