import {PrismaClient} from '@prisma/client';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export async function ensureProductExpiry(db){
  await db.systemSetting.upsert({where:{key:'product_reservation_expiry_grace_minutes'},create:{key:'product_reservation_expiry_grace_minutes',value:'0'},update:{}});
  await db.systemSetting.upsert({where:{key:'product_reservation_expiry_enabled_after'},create:{key:'product_reservation_expiry_enabled_after',value:new Date().toISOString()},update:{}});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const db=new PrismaClient();try{await ensureProductExpiry(db);console.log('Product pickup expiry enabled. Already-overdue reservations are preserved.');}finally{await db.$disconnect();}
}
