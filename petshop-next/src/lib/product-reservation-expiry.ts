import type { PrismaClient } from '@prisma/client';
import { notifyAdministrators, notifyCustomer } from './operations';
import { transitionProductReservation } from './reservation-transitions';

const activeStatuses = ['Pending', 'Approved', 'Ready for Pickup'];

// Disabled until explicitly activated. The activation cutoff preserves older,
// already-overdue reservations when the scheduler is first enabled.
export async function processProductReservationExpiry(db: PrismaClient, now = new Date()) {
  const settings = await db.systemSetting.findMany({where:{key:{in:['product_reservation_expiry_enabled_after','product_reservation_expiry_grace_minutes']}}});
  const enabledAfter = new Date(settings.find(row=>row.key==='product_reservation_expiry_enabled_after')?.value || '');
  if (!Number.isFinite(enabledAfter.getTime())) return {enabled:false,checked:0,cancelled:0};
  const grace = Number(settings.find(row=>row.key==='product_reservation_expiry_grace_minutes')?.value || '0');
  if (!Number.isInteger(grace) || grace < 0 || grace > 10080) throw new Error('Invalid product pickup grace period.');
  const cutoff = new Date(now.getTime() - grace * 60000);
  const candidates = await db.productReservation.findMany({where:{status:{in:activeStatuses},reservedUntil:{gte:enabledAfter,lte:cutoff}},select:{reservationId:true},orderBy:{reservedUntil:'asc'},take:100});
  let cancelled = 0;
  for (const {reservationId} of candidates) {
    const changed = await db.$transaction(async tx=>{
      const rows = await tx.$queryRaw<{status:string;reserved_until:Date}[]>`SELECT status,reserved_until FROM product_reservations WHERE reservation_id=${reservationId} FOR UPDATE`;
      const current = rows[0];
      if (!current || !activeStatuses.includes(current.status) || current.reserved_until < enabledAfter || current.reserved_until > cutoff) return false;
      const {reservation} = await transitionProductReservation(tx,reservationId,'Cancelled');
      const items = await tx.product.findMany({where:{productId:{in:reservation.items.map(item=>item.productId)}},select:{productId:true,productName:true}});
      const names = new Map(items.map(item=>[item.productId,item.productName]));
      const contents = reservation.items.map(item=>`${item.quantity} × ${names.get(item.productId) || 'product'}`).join(', ');
      const deadline = new Intl.DateTimeFormat('en-PH',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Manila'}).format(reservation.reservedUntil);
      const eventKey = `product-reservation.auto-cancelled.${reservationId}`;
      const message = `Reservation ${reservation.reservationCode} (${contents}) was automatically cancelled because its pickup deadline, ${deadline} (Asia/Manila),${grace ? ` plus ${grace} minutes of grace,` : ''} has passed. Reserved items have been returned to available stock. You can place a new reservation if the items are still available.`;
      await notifyCustomer(tx,reservation.customerId,{eventKey,title:'Product Reservation Automatically Cancelled',message,type:'PRODUCT_STATUS',relatedType:'product_reservation',relatedId:reservationId,link:'/client/dashboard?view=reservations'});
      await notifyAdministrators(tx,{eventKey,title:'Product Reservation Automatically Cancelled',message,type:'PRODUCT_STATUS',relatedType:'product_reservation',relatedId:reservationId,link:`/admin/dashboard?view=orders&q=${reservation.reservationCode}`});
      await tx.auditLog.create({data:{userId:null,userName:'Reservation scheduler',role:'System',action:'AUTO_CANCEL',module:'Product Reservation',recordId:String(reservationId),description:message}});
      return true;
    },{isolationLevel:'ReadCommitted'});
    if (changed) cancelled++;
  }
  return {enabled:true,checked:candidates.length,cancelled,graceMinutes:grace};
}
