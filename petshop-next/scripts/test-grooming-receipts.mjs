import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
export async function checkGroomingReceipts({test,p,request,html,callAction,clientCookie,adminCookie,otherCookie,customer,base}){
 const pet=await p.pet.create({data:{customerId:customer.id,petName:'Receipt grooming pet',species:'Dog',breed:'Poodle',gender:'Female',ageDob:'2024-01-02'}});
 const style=await p.groomingStyle.create({data:{styleName:'Receipt grooming package'}});
 const pricing=await p.styleSizePricing.create({data:{styleId:style.styleId,petSize:'Small',price:112}});
 const addon=await p.groomingAddon.create({data:{addonName:'Receipt grooming add-on',price:56}});
 const groomer=await p.groomer.create({data:{groomerName:'Receipt groomer',availability:{create:Array.from({length:7},(_,dayOfWeek)=>({dayOfWeek,startTime:new Date('1970-01-01T09:00:00Z'),endTime:new Date('1970-01-01T19:00:00Z')}))}}});
 const date=new Date(Date.now()+3*86400000+8*3600000).toISOString().slice(0,10);
 const key=randomBytes(16).toString('hex');let appointment;
 const policy=treatment=>p.systemSetting.upsert({where:{key:'grooming_tax_policy'},create:{key:'grooming_tax_policy',value:JSON.stringify({treatment,rate:'0.12',products:{},freeProductIds:[]})},update:{value:JSON.stringify({treatment,rate:'0.12',products:{},freeProductIds:[]})}});
 const fields={petId:pet.id,styleId:style.styleId,groomerId:groomer.groomerId,petSize:'Small',bookingType:'Salon',date,time:'10:00',addonIds:addon.addonId,instructions:'Handle gently; receipt audit',requestToken:key};
 await test('Grooming receipt: submit redirects to receipt with stored service/add-ons and VAT-inclusive snapshot',async()=>{
  try{await policy('inclusive');const response=await callAction('/client/dashboard?view=grooming',clientCookie,'bookGrooming',fields);assert.equal(response.status,303);
   appointment=await p.groomingAppointment.findFirstOrThrow({where:{petId:pet.id},orderBy:{appointmentId:'desc'}});assert.equal(Number(appointment.totalPrice),168);assert.ok(response.headers.get('location').includes(`/appointments/${appointment.appointmentId}/receipt`));
   const rows=await p.$queryRaw`SELECT snapshot FROM grooming_appointment_receipt_snapshot WHERE appointment_id=${appointment.appointmentId}`;const snapshot=JSON.parse(rows[0].snapshot);assert.equal(snapshot.amounts.vat,'18.00');assert.equal(snapshot.amounts.vatable,'150.00');
   const page=await html(`/appointments/${appointment.appointmentId}/receipt`,clientCookie);for(const value of ['GROOMING APPOINTMENT CONFIRMATION',appointment.reservationCode,'Receipt grooming pet','Poodle','Receipt groomer','Receipt grooming package','Receipt grooming add-on','Handle gently','VAT (12%)','Print Receipt','Download PDF','₱168.00'])assert.ok(page.includes(value),value);
   const before=await p.groomingAppointment.count();await callAction('/client/dashboard?view=grooming',clientCookie,'bookGrooming',fields);assert.equal(await p.groomingAppointment.count(),before);
  }finally{await p.systemSetting.deleteMany({where:{key:'grooming_tax_policy'}});}
 });
 await test('Grooming receipt: PDF/admin access, owner isolation and immutable booking prices',async()=>{
  assert.ok(appointment);const path=`/api/appointments/${appointment.appointmentId}/receipt`;
  const pdf=await request(path,adminCookie);assert.equal(pdf.status,200);assert.ok(pdf.headers.get('content-disposition').includes(appointment.reservationCode));const bytes=Buffer.from(await pdf.arrayBuffer());assert.equal(bytes.subarray(0,5).toString(),'%PDF-');await writeFile('GROOMING_RECEIPT_AUDIT.pdf',bytes);
  assert.equal((await request(path)).status,401);assert.equal((await request(path,otherCookie)).status,404);assert.equal((await request(`/appointments/${appointment.appointmentId}/receipt`,otherCookie)).status,404);
  await p.styleSizePricing.update({where:{pricingId:pricing.pricingId},data:{price:999}});await p.groomingAddon.update({where:{addonId:addon.addonId},data:{price:999}});await p.pet.update({where:{id:pet.id},data:{petName:'Changed after booking'}});
  const page=await html(`/appointments/${appointment.appointmentId}/receipt`,adminCookie);assert.ok(page.includes('₱112.00'));assert.ok(page.includes('₱56.00'));assert.ok(page.includes('Receipt grooming pet'));assert.ok(!page.includes('₱999.00'));
 });
 await test('Grooming receipt: home service, VAT-exclusive calculation and no fabricated home-service grace',async()=>{
  try{await policy('exclusive');await p.styleSizePricing.update({where:{pricingId:pricing.pricingId},data:{price:112}});await p.groomingAddon.update({where:{addonId:addon.addonId},data:{price:56}});
   await callAction('/client/dashboard?view=grooming',clientCookie,'bookGrooming',{...fields,time:'14:00',requestToken:randomBytes(16).toString('hex'),bookingType:'Home Service',contactName:'Home receipt customer',contactNumber:'09123456789',address:'Home receipt service address'});
   const home=await p.groomingAppointment.findFirstOrThrow({where:{petId:pet.id,bookingType:'Home Service'}});assert.equal(Number(home.totalPrice),188.16);const page=await html(`/appointments/${home.appointmentId}/receipt`,clientCookie);assert.ok(page.includes('Home receipt service address'));assert.ok(page.includes('Not applicable to home service'));assert.ok(page.includes('₱20.16'));
  }finally{await p.systemSetting.deleteMany({where:{key:'grooming_tax_policy'}});}
 });
 await test('Grooming receipt: completed loyalty discount and historical fallback preserve stored totals',async()=>{
  const raw=await p.groomingAppointment.create({data:{reservationCode:'HIST-'+randomBytes(7).toString('hex'),customerId:customer.id,petId:pet.id,groomingStyleId:style.styleId,groomerId:groomer.groomerId,petSize:'Small',appointmentDate:new Date(date),appointmentTime:new Date('1970-01-01T12:00:00Z'),totalPrice:200,status:'Completed'}});
  const page=await html(`/appointments/${raw.appointmentId}/receipt`,clientCookie);assert.ok(page.includes('Historical base price'));assert.ok(page.includes('₱200.00'));assert.equal(Number((await p.groomingAppointment.findUnique({where:{appointmentId:raw.appointmentId}})).totalPrice),200);
  await p.appointmentLoyaltyPricing.update({where:{appointmentId:appointment.appointmentId},data:{discountPercent:10,discountAmount:16.8,appliedAt:new Date(),visitNumber:12}});await p.groomingAppointment.update({where:{appointmentId:appointment.appointmentId},data:{status:'Completed',totalPrice:151.2}});
  const completed=await html(`/appointments/${appointment.appointmentId}/receipt`,clientCookie);assert.ok(completed.includes('Loyalty discount applied'));assert.ok(completed.includes('₱151.20'));assert.ok(completed.includes('₱16.20'));
 });
 if(process.env.CART_BROWSER_AUDIT==='1')await test('Grooming receipt: real browser A4 printing and responsive layout',async()=>{
  const {browserSession}=await import('./browser-session.mjs');const browser=await browserSession(),{rpc,evaluate,wait}=browser;
  try{await browser.setCookie(base,clientCookie);await rpc('Page.navigate',{url:base+`/appointments/${appointment.appointmentId}/receipt`});await wait("document.querySelector('.reservationReceipt')&&document.querySelector('.receiptBrand img').naturalWidth>0");
   for(const width of [1280,390,320]){await rpc('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);}
   await rpc('Emulation.setEmulatedMedia',{media:'print'});assert.equal(await evaluate("getComputedStyle(document.querySelector('.receiptControls')).display"),'none');const printed=await rpc('Page.printToPDF',{printBackground:true,preferCSSPageSize:true});await writeFile('GROOMING_PRINT_AUDIT.pdf',Buffer.from(printed.data,'base64'));await rpc('Emulation.setEmulatedMedia',{media:''});const shot=await rpc('Page.captureScreenshot',{format:'png'});await writeFile('GROOMING_RECEIPT_320.png',Buffer.from(shot.data,'base64'));
  }finally{await browser.close();}
 });
}
