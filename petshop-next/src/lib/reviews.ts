import {Prisma} from '@prisma/client';
import {prisma} from './prisma';
import {writeAudit} from './operations';
import type {SessionPayload} from './session';


export class ReviewError extends Error {constructor(message:string,public status=400){super(message);}}
export const reviewRules='Reviews may be rejected or hidden only for spam, unrelated content, harassment, hate speech, threats, or disclosure of private information. Honest negative experiences are welcome. Every rating follows the same moderation process.';
export type ReviewRow={review_id:bigint;user_id:number;customer_id:number;appointment_id:bigint|null;product_reservation_id:bigint|null;rating:number;title:string;message:string;status:string;moderation_reason:string|null;created_at:Date;updated_at:Date;version:number;display_name:string;reservation_code:string;pet_name:string|null;style_name:string;target_status:string};
const publicWhere=Prisma.sql`r.status='Approved'`;
const columns=Prisma.sql`r.*,COALESCE(NULLIF(u.first_name,''),'Customer') AS display_name,COALESCE(a.reservation_code,o.reservation_code) AS reservation_code,p.pet_name,COALESCE(s.style_name,(SELECT GROUP_CONCAT(pr.product_name SEPARATOR ', ') FROM product_reservation_items ri JOIN products pr ON pr.product_id=ri.product_id WHERE ri.reservation_id=o.reservation_id)) AS style_name,COALESCE(a.status,o.status) AS target_status`;
const joins=Prisma.sql`FROM grooming_reviews r JOIN users u ON u.id=r.user_id LEFT JOIN grooming_appointments a ON a.appointment_id=r.appointment_id LEFT JOIN product_reservations o ON o.reservation_id=r.product_reservation_id LEFT JOIN pets p ON p.id=a.pet_id LEFT JOIN grooming_styles s ON s.style_id=a.grooming_style_id`;
export function reviewDTO(r:ReviewRow,privateView=false){return {id:String(r.review_id),name:r.display_name,rating:r.rating,title:r.title,message:r.message,createdAt:r.created_at.toISOString(),kind:r.product_reservation_id?'product':r.appointment_id?'grooming':'general',verified:r.target_status==='Completed',...(privateView?{appointmentId:r.appointment_id?String(r.appointment_id):null,reservationId:r.product_reservation_id?String(r.product_reservation_id):null,reference:r.reservation_code,pet:r.pet_name,service:r.style_name,status:r.status,reason:r.moderation_reason,version:r.version}: {})};}
export async function listReviews(mode:'public'|'mine'|'admin',user:SessionPayload|null,filters:{rating?:number;status?:string;q?:string;page?:number}={}){
  if(mode!=='public'&&!user)throw new ReviewError('Please log in.',401);
  if(mode==='admin'&&user?.role!=='Admin'&&user?.role!=='SuperAdmin')throw new ReviewError('Administrator access required.',403);
  const scope=mode==='public'?publicWhere:mode==='mine'?Prisma.sql`r.user_id=${user!.userId} AND r.status<>'Removed'`:Prisma.sql`r.status<>'Removed'`;
  const rating=filters.rating?Prisma.sql`AND r.rating=${filters.rating}`:Prisma.empty;
  const status=mode==='admin'&&filters.status?Prisma.sql`AND r.status=${filters.status}`:Prisma.empty;
  const query=filters.q?.trim().slice(0,100);
  const search=mode==='admin'&&query?Prisma.sql`AND (r.message LIKE ${'%'+query+'%'} OR r.title LIKE ${'%'+query+'%'} OR u.first_name LIKE ${'%'+query+'%'} OR COALESCE(a.reservation_code,o.reservation_code) LIKE ${'%'+query+'%'})`:Prisma.empty;
  const rows=await prisma.$queryRaw<ReviewRow[]>(Prisma.sql`SELECT ${columns} ${joins} WHERE ${scope} ${rating} ${status} ${search} ORDER BY r.created_at DESC,r.review_id DESC LIMIT 25 OFFSET ${(filters.page||0)*24}`);
  const distribution=await prisma.$queryRaw<{rating:number;total:bigint;verified:bigint}[]>(Prisma.sql`SELECT r.rating,COUNT(*) total,SUM(CASE WHEN a.status='Completed' OR o.status='Completed' THEN 1 ELSE 0 END) verified ${joins} WHERE ${publicWhere} GROUP BY r.rating`);
  const counts=[1,2,3,4,5].map(n=>Number(distribution.find(r=>r.rating===n)?.total||0));
  const total=counts.reduce((a,b)=>a+b,0),average=total?counts.reduce((sum,n,i)=>sum+n*(i+1),0)/total:0;
  const statuses=mode==='admin'?await prisma.$queryRaw<{status:string;total:bigint}[]>`SELECT status,COUNT(*) total FROM grooming_reviews WHERE status<>'Removed' GROUP BY status`:[];
  return {reviews:rows.slice(0,24).map(r=>reviewDTO(r,mode!=='public')),hasMore:rows.length>24,stats:{total,average,counts,verified:distribution.reduce((sum,r)=>sum+Number(r.verified),0),statuses:statuses.map(s=>({status:s.status,total:Number(s.total)}))},appointments:[]};
}
export function reviewId(value:unknown){if(typeof value!=='string'||!/^\d{1,18}$/.test(value)||BigInt(value)<BigInt(1))throw new ReviewError('Invalid review or appointment.');return BigInt(value);}
export function validateReview(body:Record<string,unknown>){
  if(typeof body.rating!=='number'||!Number.isInteger(body.rating)||body.rating<1||body.rating>5)throw new ReviewError('Choose a rating from 1 to 5.');
  if(typeof body.message!=='string'||!body.message.trim()||body.message.trim().length>2000)throw new ReviewError('Write a review between 1 and 2,000 characters.');
  if(body.title!==undefined&&typeof body.title!=='string')throw new ReviewError('Invalid title.');
  const title=String(body.title||'').trim();if(title.length>100)throw new ReviewError('Use at most 100 characters for the title.');
  return {rating:body.rating,title,message:body.message.trim()};
}
export async function mutateReview(user:SessionPayload,body:Record<string,unknown>){
  const action=body.action;
  if(!['create','edit','remove','moderate'].includes(String(action)))throw new ReviewError('Invalid action.');
  if(action==='moderate'?user.role==='User':user.role!=='User')throw new ReviewError('Access denied.',403);
  return prisma.$transaction(async tx=>{
    // Serialize each actor's mutations, including durable rate limiting and duplicate clicks.
    await tx.$queryRaw`SELECT id FROM users WHERE id=${user.userId} FOR UPDATE`;
    const recent=await tx.auditLog.count({where:{userId:user.userId,module:'Reviews',createdAt:{gte:new Date(Date.now()-60000)}}});
    if(recent>=10)throw new ReviewError('Please wait a minute before making more review changes.',429);
    let id:bigint;
    let screening:{status:'Approved';reason:string}|undefined;
    if(action==='create'){
      const input=validateReview(body);
      screening={status:'Approved',reason:'Published immediately by the customer.'};
      if(body.reservationId!=null&&body.appointmentId!=null)throw new ReviewError('Select one grooming appointment or product reservation.');
      const account=await tx.user.findUniqueOrThrow({where:{id:user.userId}});
      let customer=await tx.customer.findFirst({where:{email:account.email}});
      if(!customer)customer=await tx.customer.create({data:{email:account.email,customerName:[account.firstName,account.surname].filter(Boolean).join(' ').slice(0,150)||'Customer',phone:account.phoneNumber||'Not provided'}});
      const product=body.reservationId!=null;
      const hasTarget=product||body.appointmentId!=null;
      const targetId=hasTarget?reviewId(product?body.reservationId:body.appointmentId):null;
      if(targetId){
        const targetOwner=product?await tx.productReservation.findFirst({where:{reservationId:targetId,customer:{email:account.email}},select:{customerId:true}}):await tx.groomingAppointment.findFirst({where:{appointmentId:targetId,customer:{email:account.email}},select:{customerId:true}});
        if(!targetOwner)throw new ReviewError('This appointment or reservation does not belong to you.',403);
        customer=await tx.customer.findUniqueOrThrow({where:{id:targetOwner.customerId}});
        const target=product?Prisma.sql`product_reservation_id=${targetId}`:Prisma.sql`appointment_id=${targetId}`;
        if((await tx.$queryRaw<{review_id:bigint}[]>(Prisma.sql`SELECT review_id FROM grooming_reviews WHERE ${target}`)).length)throw new ReviewError('This appointment or reservation already has a review.',409);
      }
      await tx.$executeRaw`INSERT INTO grooming_reviews(user_id,customer_id,appointment_id,product_reservation_id,rating,title,message,status,moderation_reason,moderated_at,created_at,updated_at) VALUES(${user.userId},${customer.id},${product?null:targetId},${product?targetId:null},${input.rating},${input.title},${input.message},'Approved',${screening.reason},UTC_TIMESTAMP(3),UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))`;
      const inserted=await tx.$queryRaw<{id:bigint}[]>`SELECT LAST_INSERT_ID() AS id`;id=inserted[0].id;
    }else{
      id=reviewId(body.id);
      const rows=await tx.$queryRaw<ReviewRow[]>`SELECT * FROM grooming_reviews WHERE review_id=${id} FOR UPDATE`;const old=rows[0];
      if(!old||(action!=='moderate'&&old.user_id!==user.userId))throw new ReviewError('Review not found.',404);
      if(typeof body.version!=='number'||body.version!==old.version)throw new ReviewError('This review changed. Refresh and try again.',409);
      if(action==='edit'){
        if(old.status==='Removed')throw new ReviewError('Removed reviews cannot be edited.');
        const input=validateReview(body);
        screening={status:'Approved',reason:'Published immediately by the customer.'};
        await tx.$executeRaw`UPDATE grooming_reviews SET rating=${input.rating},title=${input.title},message=${input.message},status=${screening.status},moderation_reason=${screening.reason},moderated_by=NULL,moderated_at=UTC_TIMESTAMP(3),updated_at=UTC_TIMESTAMP(3),version=version+1 WHERE review_id=${id}`;
      }else if(action==='remove'){
        if(old.status==='Removed')throw new ReviewError('This review is already removed.',409);
        await tx.$executeRaw`UPDATE grooming_reviews SET status='Removed',updated_at=UTC_TIMESTAMP(3),version=version+1 WHERE review_id=${id}`;
      }else{
        if(old.status==='Removed')throw new ReviewError('Customer-removed reviews cannot be published.');
        if(!['Approved','Rejected','Hidden'].includes(String(body.status)))throw new ReviewError('Choose a valid moderation status.');
        const reason=typeof body.reason==='string'?body.reason.trim():'';
        if(!reason||reason.length>500)throw new ReviewError('Provide a moderation reason (1–500 characters).');
        if(body.status===old.status)throw new ReviewError('Review already has this status.',409);
        await tx.$executeRaw`UPDATE grooming_reviews SET status=${String(body.status)},moderation_reason=${reason},moderated_by=${user.userId},moderated_at=UTC_TIMESTAMP(3),updated_at=UTC_TIMESTAMP(3),version=version+1 WHERE review_id=${id}`;
        await writeAudit(tx,user,'Moderate','Reviews',`${old.status} → ${body.status}. Reason: ${reason}. Rating retained: ${old.rating}.`,id);
        return {id:String(id)};
      }
    }
    await writeAudit(tx,user,String(action),'Reviews',`Customer ${action} review; ${action==='remove'?'removed from public display':`${screening?.status}. ${screening?.reason}`}.`,id);
    return {id:String(id),status:screening?.status};
  },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted});
}
