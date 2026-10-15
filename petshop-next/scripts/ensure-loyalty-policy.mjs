import {PrismaClient} from '@prisma/client';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
export async function ensureLoyaltyPolicy(p){
  const idType=async(table,field)=>{const rows=await p.$queryRawUnsafe(`SHOW COLUMNS FROM ${table} WHERE Field='${field}'`);const type=rows[0].Type;if(!/^(?:bigint|int)(?:\(\d+\))?(?: unsigned)?$/i.test(type))throw new Error('Unsupported loyalty ID type');return type;};
  await p.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS customer_loyalty_program (customer_id ${await idType('customers','id')} PRIMARY KEY,completed_visits INT NOT NULL DEFAULT 0,vip_member BOOLEAN NOT NULL DEFAULT FALSE,vip_since DATETIME(3) NULL,CONSTRAINT customer_loyalty_program_fk FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE RESTRICT)`);
  await p.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS appointment_loyalty_pricing (appointment_id ${await idType('grooming_appointments','appointment_id')} PRIMARY KEY,subtotal DECIMAL(10,2) NOT NULL,estimated_percent INT NOT NULL DEFAULT 0,discount_percent INT NOT NULL DEFAULT 0,discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0,visit_number INT NULL,applied_at DATETIME(3) NULL,CONSTRAINT appointment_loyalty_pricing_fk FOREIGN KEY(appointment_id) REFERENCES grooming_appointments(appointment_id) ON DELETE RESTRICT)`);
  // Seed once from real completed history or existing credited stamps, never sum
  // them (the same visit may already have been manually credited).
  await p.$executeRawUnsafe(`INSERT IGNORE INTO customer_loyalty_program(customer_id,completed_visits,vip_member,vip_since) SELECT c.id,GREATEST(c.loyalty_stamps,COUNT(a.appointment_id)),GREATEST(c.loyalty_stamps,COUNT(a.appointment_id))>=11,IF(GREATEST(c.loyalty_stamps,COUNT(a.appointment_id))>=11,UTC_TIMESTAMP(3),NULL) FROM customers c LEFT JOIN grooming_appointments a ON a.customer_id=c.id AND a.status='Completed' GROUP BY c.id,c.loyalty_stamps`);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const p=new PrismaClient();try{await ensureLoyaltyPolicy(p);console.log('Loyalty policy tables ready. Existing invoice totals preserved.');}finally{await p.$disconnect();}}
