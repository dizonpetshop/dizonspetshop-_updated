import {PrismaClient} from '@prisma/client';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
export async function ensureReservationCheckout(db){
  const type=async(table,field)=>{const rows=await db.$queryRawUnsafe(`SHOW COLUMNS FROM \`${table}\` WHERE Field='${field}'`);const t=rows[0]?.Type;if(!/^(?:big)?int(?:\(\d+\))?(?: unsigned)?$/i.test(t||''))throw new Error('Unsupported checkout key type.');return t;};
  const reservation=await type('product_reservations','reservation_id'),customer=await type('customers','id');
  await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS product_reservation_checkout (
    reservation_id ${reservation} NOT NULL PRIMARY KEY,
    customer_id ${customer} NOT NULL,
    request_key VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    request_fingerprint VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    payment_method VARCHAR(10) NOT NULL,
    UNIQUE KEY checkout_customer_request(customer_id,request_key),
    FOREIGN KEY(reservation_id) REFERENCES product_reservations(reservation_id) ON DELETE RESTRICT,
    FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  console.log('Reservation checkout idempotency metadata ready; existing reservations preserved.');
}
if(process.argv[1]&&fileURLToPath(import.meta.url).toLowerCase()===resolve(process.argv[1]).toLowerCase()){const db=new PrismaClient();try{await ensureReservationCheckout(db);}finally{await db.$disconnect();}}
