import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
export async function checkReceipts({test,p,request,html,callAction,clientCookie,otherCookie,adminCookie,customer}){
 const product=await p.product.create({data:{sku:'RCP-'+randomBytes(5).toString('hex'),productName:'Receipt audit product',category:'Dog Food',price:100,stockQuantity:30,isActive:1,reorderLevel:0}});
 const tomorrow=new Date(Date.now()+86400000+8*3600000).toISOString().slice(0,10);
 const setting=policy=>p.systemSetting.upsert({where:{key:'product_reservation_tax_policy'},create:{key:'product_reservation_tax_policy',value:JSON.stringify(policy)},update:{value:JSON.stringify(policy)}});
 const policy=treatment=>({treatment,rate:'0.12',products:{},freeProductIds:[]});
 let id;
 await test('Receipt: product pickup grace follows product policy, separately from grooming',async()=>{
  const original=await p.systemSetting.findUnique({where:{key:'product_reservation_expiry_grace_minutes'}});
  const r=await p.productReservation.create({data:{reservationCode:'GRACE-'+randomBytes(7).toString('hex'),customerId:customer.id,totalAmount:100,reservedUntil:new Date(tomorrow+'T12:00:00+08:00'),items:{create:{productId:product.productId,quantity:1,unitPrice:100}}}});
  try{await p.systemSetting.upsert({where:{key:'product_reservation_expiry_grace_minutes'},create:{key:'product_reservation_expiry_grace_minutes',value:'15'},update:{value:'15'}});const page=await html(`/reservations/${r.reservationId}/receipt`,clientCookie);assert.ok(page.includes('15 minutes'));assert.ok(page.includes('12:15 PM'));}
  finally{if(original)await p.systemSetting.update({where:{key:original.key},data:{value:original.value}});else await p.systemSetting.delete({where:{key:'product_reservation_expiry_grace_minutes'}});}
 });
 await test('Receipt: VAT exclusive snapshot, admin/customer access, printing and PDF filename',async()=>{
  try{
   await setting(policy('exclusive'));
   const before=await p.productReservation.count();
   await callAction('/client/dashboard?view=products',clientCookie,'checkoutReservationCart',{items:JSON.stringify([{productId:product.productId,quantity:1,expectedPrice:100}]),requestToken:randomBytes(16).toString('hex'),pickupDate:tomorrow,pickupTime:'12:00',paymentMethod:'Maya',expectedTotal:'112'});
   assert.equal(await p.productReservation.count(),before+1);const r=await p.productReservation.findFirstOrThrow({where:{customerId:customer.id},orderBy:{reservationId:'desc'}});id=String(r.reservationId);assert.equal(Number(r.totalAmount),112);
   const snapshot=await p.$queryRaw`SELECT snapshot FROM product_reservation_receipt_snapshot WHERE reservation_id=${r.reservationId}`;assert.equal(JSON.parse(snapshot[0].snapshot).amounts.vat,'12.00');
   const view=await html(`/reservations/${id}/receipt`,clientCookie);for(const text of ['Dizon','PRODUCT RESERVATION CONFIRMATION',r.reservationCode,'Receipt audit product','VATable sales','VAT (12%)','Maya','Print Receipt','dizons-logo.jpg'])assert.ok(view.includes(text),text);
   const pdf=await request(`/api/reservations/${id}/receipt`,adminCookie);assert.equal(pdf.status,200);assert.ok(pdf.headers.get('content-disposition').includes(r.reservationCode));assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0,5).toString(),'%PDF-');
   const tampered=JSON.parse(snapshot[0].snapshot);tampered.amounts.rows[0].unitPrice='999.00';
   await p.$executeRaw`UPDATE product_reservation_receipt_snapshot SET snapshot=${JSON.stringify(tampered)} WHERE reservation_id=${r.reservationId}`;
   const reconciled=await html(`/reservations/${id}/receipt`,adminCookie);assert.ok(reconciled.includes('Stored item details differ'));assert.ok(reconciled.includes('₱100.00'));assert.ok(!reconciled.includes('₱999.00'));
   await p.$executeRaw`UPDATE product_reservation_receipt_snapshot SET snapshot=${snapshot[0].snapshot} WHERE reservation_id=${r.reservationId}`;
   assert.equal((await request(`/api/reservations/${id}/receipt`,otherCookie)).status,404);assert.equal((await request(`/api/reservations/${id}/receipt`)).status,401);assert.equal((await request(`/reservations/${id}/receipt`,otherCookie)).status,404);
   await setting(policy('exempt'));await p.product.update({where:{productId:product.productId},data:{price:200}});const historical=await html(`/reservations/${id}/receipt`,adminCookie);assert.ok(historical.includes('VAT (12%)'));assert.ok(historical.includes('₱112.00'));assert.ok(historical.includes('₱100.00'));assert.equal(Number((await p.productReservation.findUnique({where:{reservationId:BigInt(id)}})).totalAmount),112);
  }finally{await p.systemSetting.deleteMany({where:{key:'product_reservation_tax_policy'}});await p.product.update({where:{productId:product.productId},data:{price:100}});}
 });
 await test('Receipt: inclusive/exempt totals, zero-price validation and explicit free configuration',async()=>{
  const send=()=>callAction('/client/dashboard?view=products',clientCookie,'checkoutReservationCart',{items:JSON.stringify([{productId:product.productId,quantity:1,expectedPrice:0}]),requestToken:randomBytes(16).toString('hex'),pickupDate:tomorrow,pickupTime:'12:00',paymentMethod:'Cash'});
  try{
   await p.product.update({where:{productId:product.productId},data:{price:0}});const before=await p.productReservation.count();await send();assert.equal(await p.productReservation.count(),before);
   await setting({...policy('exempt'),freeProductIds:[product.productId]});await send();assert.equal(await p.productReservation.count(),before+1);const r=await p.productReservation.findFirstOrThrow({where:{customerId:customer.id},orderBy:{reservationId:'desc'}});assert.equal(Number(r.totalAmount),0);const page=await html(`/reservations/${r.reservationId}/receipt`,clientCookie);assert.ok(page.includes('VAT-exempt sales'));assert.ok(!page.includes('zero stored price without'));
  }finally{await p.systemSetting.deleteMany({where:{key:'product_reservation_tax_policy'}});await p.product.update({where:{productId:product.productId},data:{price:100}});}
 });
 await test('Receipt: long item tables paginate and historical zero-price discrepancies are preserved and audited',async()=>{
  const r=await p.productReservation.create({data:{reservationCode:'RCPT-'+randomBytes(8).toString('hex'),customerId:customer.id,customerName:'Receipt history customer',contactNumber:'09123456789',deliveryAddress:'Saved receipt history address',totalAmount:9999,reservedUntil:new Date(tomorrow+'T12:00:00+08:00'),items:{create:Array.from({length:100},(_,i)=>({productId:product.productId,quantity:1,unitPrice:i===0?0:100}))}}});
  const before=await p.productReservation.findUnique({where:{reservationId:r.reservationId},include:{items:true}});
  const pdf=await request(`/api/reservations/${r.reservationId}/receipt`,clientCookie);assert.equal(pdf.status,200);const data=Buffer.from(await pdf.arrayBuffer()).toString('latin1');assert.ok((data.match(/\/Type\s*\/Page\b/g)||[]).length>=3);
  const page=await html(`/reservations/${r.reservationId}/receipt`,adminCookie);assert.ok(page.includes('Historical tax treatment was not recorded'));assert.ok(page.includes('zero stored price'));assert.ok(page.includes('total differs'));assert.equal((page.match(/Receipt audit product/g)||[]).length>=100,true);
  assert.ok(await p.auditLog.findFirst({where:{module:'Reservation Receipt',action:'RECONCILIATION',recordId:String(r.reservationId)}}));const after=await p.productReservation.findUnique({where:{reservationId:r.reservationId},include:{items:true}});assert.equal(Number(after.totalAmount),9999);assert.deepEqual(after.items.map(i=>String(i.unitPrice)),before.items.map(i=>String(i.unitPrice)));
 });
}
