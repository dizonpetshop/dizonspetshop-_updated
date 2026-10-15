import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
export async function checkReviews({test,request,html,p,clientCookie,otherCookie,adminCookie,customer,style,groomer,base}){
  const send=(cookie,body)=>request('/api/reviews',cookie,{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const mine=async()=> (await request('/api/reviews?mode=mine',clientCookie)).json();
  const publicData=async()=> (await request('/api/reviews')).json();
  let id,version=1;
  await test('Reviews: authentication, role restrictions and field validation remain enforced',async()=>{
    assert.equal((await send('',{action:'create',rating:5,message:'Good'})).status,401);
    for(const body of [{rating:0,message:'Good'},{rating:6,message:'Good'},{rating:1.5,message:'Good'},{rating:5,message:'  '},{rating:5,message:'x'.repeat(2001)}])assert.equal((await send(clientCookie,{action:'create',...body})).status,400);
    assert.equal((await request('/api/reviews?mode=admin',clientCookie)).status,403);
    assert.equal((await send(adminCookie,{action:'create',rating:5,message:'Admin'})).status,403);
  });
  await test('Reviews: no booking needed and even negative feedback is published immediately',async()=>{
    const created=await send(clientCookie,{action:'create',rating:1,message:'The service was disappointing. <b>Literal text</b>'});assert.equal(created.status,200);const result=await created.json();id=result.id;assert.equal(result.status,'Approved');
    const review=(await mine()).reviews.find(r=>r.id===id);assert.equal(review.status,'Approved');assert.equal(review.kind,'general');assert.equal(review.verified,false);assert.equal(review.appointmentId,null);assert.equal(review.reservationId,null);
    let data=await publicData();assert.equal(data.stats.total,1);assert.equal(data.stats.average,1);assert.equal(data.stats.verified,0);assert.equal(data.reviews[0].id,id);
    for(const field of ['email','phone','address','appointmentId','reservationId','reference'])assert.ok(!(field in data.reviews[0]));
    assert.equal((await send(adminCookie,{action:'moderate',id,version,status:'Hidden',reason:'Admin content review.'})).status,200);version++;
    assert.equal((await publicData()).stats.total,0);
    assert.equal((await send(adminCookie,{action:'moderate',id,version,status:'Approved',reason:'Meets content rules.'})).status,200);version++;
  });
  await test('Reviews: edits publish immediately, owner isolation and stale version checks remain',async()=>{
    assert.equal((await send(otherCookie,{action:'edit',id,version,rating:5,message:'Not mine'})).status,404);
    assert.equal((await send(clientCookie,{action:'edit',id,version:1,rating:5,message:'Stale'})).status,409);
    const edited=await send(clientCookie,{action:'edit',id,version,rating:3,message:'Updated review'});assert.equal(edited.status,200);assert.equal((await edited.json()).status,'Approved');version++;
    assert.equal((await publicData()).stats.average,3);
    assert.equal((await send(clientCookie,{action:'remove',id,version})).status,200);assert.equal((await publicData()).stats.total,0);
  });
  await test('Reviews: optional links accept unfinished transactions but enforce ownership and duplicates',async()=>{
    const pet=await p.pet.findFirstOrThrow({where:{customerId:customer.id}}),product=await p.product.findFirstOrThrow();
    const appointment=await p.groomingAppointment.create({data:{reservationCode:'REV-'+randomBytes(6).toString('hex'),customerId:customer.id,petId:pet.id,groomingStyleId:style.styleId,groomerId:groomer.groomerId,bookingType:'Home Service',petSize:'Small',status:'Pending',appointmentDate:new Date('2026-01-01'),appointmentTime:new Date('1970-01-01T09:00:00Z'),totalPrice:350}});
    const order=await p.productReservation.create({data:{reservationCode:'REV-P-'+randomBytes(6).toString('hex'),customerId:customer.id,totalAmount:product.price,status:'Pending',reservedUntil:new Date(),items:{create:{productId:product.productId,quantity:1,unitPrice:product.price}}}});
    for(const target of [{appointmentId:String(appointment.appointmentId)},{reservationId:String(order.reservationId)}]){
      assert.equal((await send(otherCookie,{action:'create',...target,rating:5,message:'Not mine'})).status,403);
      const response=await send(clientCookie,{action:'create',...target,rating:4,message:'My reservation experience'});assert.equal(response.status,200);const saved=await response.json();assert.equal(saved.status,'Approved');
      assert.equal((await send(clientCookie,{action:'create',...target,rating:4,message:'Duplicate'})).status,409);
    }
    const data=await publicData();assert.equal(data.stats.total,2);assert.equal(data.stats.verified,0);
    for(const review of (await mine()).reviews.filter(r=>r.status==='Approved'))assert.equal((await send(clientCookie,{action:'remove',id:review.id,version:review.version})).status,200);
  });
  if(process.env.REVIEWS_BROWSER_AUDIT==='1')await test('Reviews: browser writes without bookings, keyboard stars and responsive themes',async()=>{
    const user=await p.user.findUniqueOrThrow({where:{email:'client@audit.invalid'}});
    for(let i=0;i<6;i++)await p.$executeRaw`INSERT INTO grooming_reviews(user_id,customer_id,rating,title,message,status,created_at,updated_at) VALUES(${user.id},${customer.id},${i%5+1},'','Isolated browser fixture','Approved',UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))`;
    const {checkReviewsBrowser}=await import('./browser-reviews-check.mjs');await checkReviewsBrowser(base,clientCookie,null,'general');
  });
  await test('Reviews: public/customer/admin routes and durable rate limit still work',async()=>{
    assert.ok((await html('/reviews')).includes('Customer Reviews'));assert.ok((await html('/client/dashboard?view=reviews',clientCookie)).includes('Write a Review'));assert.ok((await html('/admin/reviews',adminCookie)).includes('Reviews Management'));
    const user=await p.user.findUniqueOrThrow({where:{email:'client@audit.invalid'}});await p.auditLog.createMany({data:Array.from({length:10},()=>({userId:user.id,userName:'Audit',role:'User',action:'rate-fixture',module:'Reviews',description:'Isolated test'}))});assert.equal((await send(clientCookie,{action:'create',rating:5,message:'Limited'})).status,429);
  });
}