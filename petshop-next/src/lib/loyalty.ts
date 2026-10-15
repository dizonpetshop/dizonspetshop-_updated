import {Prisma,type PrismaClient} from '@prisma/client';
import {notifyCustomer} from './operations';
import {loyaltyDiscountPercent} from './loyalty-policy';
type DB=Prisma.TransactionClient|PrismaClient;
export type LoyaltyProgress={visits:number;vip:boolean};
export async function getLoyaltyProgress(db:DB,customerId:number):Promise<LoyaltyProgress>{
  const rows=await db.$queryRaw<{completed_visits:number;vip_member:number}[]>`SELECT completed_visits,vip_member FROM customer_loyalty_program WHERE customer_id=${customerId}`;
  if(rows[0])return {visits:rows[0].completed_visits,vip:Boolean(rows[0].vip_member)};
  const counts=await db.$queryRaw<{visits:bigint|number}[]>`SELECT GREATEST(c.loyalty_stamps,(SELECT COUNT(*) FROM grooming_appointments a WHERE a.customer_id=c.id AND a.status='Completed')) AS visits FROM customers c WHERE c.id=${customerId}`;
  const visits=Number(counts[0]?.visits||0);return {visits,vip:visits>=11};
}
export async function recordLoyaltyQuote(tx:Prisma.TransactionClient,id:bigint,customerId:number,subtotal:Prisma.Decimal){const progress=await getLoyaltyProgress(tx,customerId);const estimate=loyaltyDiscountPercent(progress.visits+1,progress.vip);await tx.$executeRaw`INSERT INTO appointment_loyalty_pricing(appointment_id,subtotal,estimated_percent) VALUES(${id},${subtotal.toString()},${estimate})`;}
export async function awardGroomingStamp(tx:Prisma.TransactionClient,appointmentId:bigint,customerId:number,actorId?:number){
  if(!actorId)throw new Error('An authorized staff member must record completion.');
  await tx.$queryRaw`SELECT id FROM customers WHERE id=${customerId} FOR UPDATE`;
  await tx.$executeRaw`INSERT IGNORE INTO customer_loyalty_program(customer_id,completed_visits,vip_member) SELECT c.id,GREATEST(c.loyalty_stamps,(SELECT COUNT(*) FROM grooming_appointments a WHERE a.customer_id=c.id AND a.status='Completed' AND a.appointment_id<>${appointmentId})),GREATEST(c.loyalty_stamps,(SELECT COUNT(*) FROM grooming_appointments a WHERE a.customer_id=c.id AND a.status='Completed' AND a.appointment_id<>${appointmentId}))>=11 FROM customers c WHERE c.id=${customerId}`;
  const rows=await tx.$queryRaw<{completed_visits:number;vip_member:number}[]>`SELECT completed_visits,vip_member FROM customer_loyalty_program WHERE customer_id=${customerId} FOR UPDATE`;
  const after=rows[0].completed_visits+1,vip=Boolean(rows[0].vip_member)||after>=11,percent=loyaltyDiscountPercent(after,Boolean(rows[0].vip_member));
  await tx.$executeRaw`INSERT IGNORE INTO appointment_loyalty_pricing(appointment_id,subtotal) SELECT appointment_id,total_price FROM grooming_appointments WHERE appointment_id=${appointmentId}`;
  const prices=await tx.$queryRaw<{subtotal:Prisma.Decimal}[]>`SELECT subtotal FROM appointment_loyalty_pricing WHERE appointment_id=${appointmentId} FOR UPDATE`;
  const subtotal=new Prisma.Decimal(prices[0].subtotal.toString());const total=subtotal.mul(100-percent).div(100).toDecimalPlaces(2);const discount=subtotal.sub(total);
  await tx.$executeRaw`UPDATE appointment_loyalty_pricing SET discount_percent=${percent},discount_amount=${discount.toString()},visit_number=${after},applied_at=${new Date()} WHERE appointment_id=${appointmentId}`;
  await tx.groomingAppointment.update({where:{appointmentId},data:{totalPrice:total}});
  await tx.$executeRaw`UPDATE customer_loyalty_program SET completed_visits=${after},vip_member=${vip},vip_since=IF(${vip},COALESCE(vip_since,${new Date()}),vip_since) WHERE customer_id=${customerId}`;
  await tx.customer.update({where:{id:customerId},data:{loyaltyStamps:after,rewardAvailable:vip}});
  await tx.loyaltyTransaction.create({data:{customerId,changedById:actorId,changeAmount:1,balanceAfter:after,reason:`Completed grooming appointment ${appointmentId}; visit ${after}; ${percent}% discount`}});
  await notifyCustomer(tx,customerId,{eventKey:`appointment.loyalty.${appointmentId}`,title:after===11?'Lifetime VIP unlocked':percent===50?'50% loyalty discount applied':'Loyalty stamp earned',message:`Completed grooming visit ${after}. ${percent?`${percent}% service discount applied: ₱${discount.toFixed(2)} off; final total ₱${total.toFixed(2)}.`:'This visit is charged at its original service price.'} ${vip?'You are a lifetime VIP with 10% off services.':''}`,type:'LOYALTY',relatedType:'appointment',relatedId:appointmentId,link:'/client/dashboard?view=account'});
}
