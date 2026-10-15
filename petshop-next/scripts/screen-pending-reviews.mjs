import {PrismaClient} from '@prisma/client';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

export async function screenPendingReviews(db){
  let cursor=BigInt(0),checked=0,approved=0,flagged=0;
  for(;;){
    const rows=await db.$queryRaw`SELECT review_id FROM grooming_reviews r WHERE r.status='Pending' AND r.review_id>${cursor} ORDER BY review_id LIMIT 100`;
    if(!rows.length)break;
    for(const row of rows){
      cursor=row.review_id;
      await db.$transaction(async tx=>{
        const locked=await tx.$queryRaw`SELECT * FROM grooming_reviews WHERE review_id=${row.review_id} FOR UPDATE`;
        const review=locked[0];if(!review||review.status!=='Pending')return;
        const result={status:'Approved',reason:'Published immediately under the customer review policy.'};checked++;
        if(result.status==='Approved')approved++;else flagged++;
        if(review.moderation_reason===result.reason)return;
        await tx.$executeRaw`UPDATE grooming_reviews SET status=${result.status},moderation_reason=${result.reason},moderated_by=NULL,moderated_at=UTC_TIMESTAMP(3),updated_at=UTC_TIMESTAMP(3),version=version+1 WHERE review_id=${review.review_id}`;
        await tx.auditLog.create({data:{userName:'Automatic review screening',role:'System',action:'AutoModerate',module:'Reviews',recordId:String(review.review_id),description:`Pending → ${result.status}. ${result.reason} Rating retained: ${review.rating}.`}});
      });
    }
  }
  return {checked,approved,flagged};
}
if(process.argv[1]&&fileURLToPath(import.meta.url).toLowerCase()===resolve(process.argv[1]).toLowerCase()){
  const db=new PrismaClient();try{console.log(JSON.stringify(await screenPendingReviews(db)));}finally{await db.$disconnect();}
}
