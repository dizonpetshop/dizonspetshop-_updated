import PDFDocument from 'pdfkit';
import {resolve} from 'node:path';
import {receiptDate,receiptTotals,type ReservationReceipt} from './reservation-receipt-data';

export async function reservationReceiptPdf(r:ReservationReceipt){
 const doc=new PDFDocument({size:'A4',margin:45,bufferPages:true,info:{Title:`${r.title||'Product Reservation Confirmation'} ${r.reference}`,Author:r.business.name}});
 const chunks:Buffer[]=[];const complete=new Promise<Buffer>((yes,no)=>{doc.on('data',(b:Buffer)=>chunks.push(b));doc.on('end',()=>yes(Buffer.concat(chunks)));doc.on('error',no);});
 const navy='#132b4c',blue='#2563eb',muted='#526278',width=505,bottom=780;
 const clean=(s:string)=>s.replace(/[\x00-\x1f\x7f]/g,' ');
 const money=(n:string)=>`PHP ${Number(n).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
 const ensure=(height:number)=>{if(doc.y+height>bottom){doc.addPage();doc.font('Helvetica').fontSize(10).fillColor(muted).text(`${r.business.name} | ${r.reference}`,45,40,{width});doc.y=65;}};
 const section=(title:string)=>{ensure(45);doc.moveDown(.6).font('Helvetica-Bold').fontSize(12).fillColor(navy).text(title.toUpperCase());const y=doc.y+5;doc.moveTo(45,y).lineTo(550,y).strokeColor('#cbd8ed').stroke();doc.y=y+14;};
 const detail=(label:string,value:string)=>{doc.font('Helvetica').fontSize(11);const h=Math.max(17,doc.heightOfString(clean(value),{width:355}));ensure(h+8);const y=doc.y;doc.fillColor(muted).text(label,45,y,{width:140});doc.fillColor(navy).text(clean(value),195,y,{width:355});doc.y=y+h+7;};
 doc.image(resolve(process.cwd(),'public/assets/dizons-logo.jpg'),45,43,{fit:[56,56]});
 doc.fillColor(navy).font('Helvetica-Bold').fontSize(19).text(r.business.name.toUpperCase(),115,45,{width:435});
 doc.fontSize(11).fillColor(blue).text(r.title||'PRODUCT RESERVATION CONFIRMATION',115,73,{width:435});
 doc.font('Helvetica').fontSize(10.5).fillColor(muted).text(`${r.business.address}\n${r.business.phone} | ${r.business.email}`,115,94,{width:435});
 doc.y=Math.max(doc.y+16,150);detail('Reference',r.reference);detail('Generated',`${receiptDate(r.generatedAt)} (Philippine time)`);
 section(r.kind==='grooming'?'Appointment details':'Reservation details');detail('Reserved',receiptDate(r.createdAt));detail('Reservation status',r.status);detail('Reservation type',r.kind==='grooming'?'Grooming Appointment':'Product Pickup');detail('Customer',r.customer.name);detail('Contact number',r.customer.phone);detail('Customer address',r.customer.address);detail('Payment preference',r.payment);detail('Payment record','Payment collected separately; this is not proof of payment.');
 for(const [label,value] of r.additionalDetails||[])detail(label,value);
 section(r.kind==='grooming'?'Appointment schedule':'Pickup schedule');detail(r.kind==='grooming'?'Appointment date':'Pickup date',r.pickupAt.toLocaleDateString('en-PH',{dateStyle:'long',timeZone:'Asia/Manila'}));detail(r.kind==='grooming'?'Appointment time':'Pickup time',r.pickupAt.toLocaleTimeString('en-PH',{hour:'numeric',minute:'2-digit',timeZone:'Asia/Manila'})+' (Philippine time)');detail(r.kind==='grooming'?'Service location':'Pickup location',r.appointmentLocation||r.business.address);detail('Grace period',r.grace===null?'Not configured':r.grace===0?'No additional grace period':`${r.grace} minutes`);detail(r.kind==='grooming'?'Salon arrival deadline':'Pickup deadline',r.deadline?receiptDate(r.deadline):'No enforced deadline recorded for this reservation');
 section(r.kind==='grooming'?'Services and add-ons':'Reserved products');
 const xs=[45,73,303,343,433],ws=[28,230,40,90,117];
 function tableHeader(){const y=doc.y;doc.rect(45,y,width,28).fill('#eaf0fb');doc.font('Helvetica-Bold').fontSize(10).fillColor(navy);['#',r.kind==='grooming'?'Service':'Product','Qty','Unit price','Line total'].forEach((v,i)=>doc.text(v,xs[i]+5,y+8,{width:ws[i]-10,align:i>=2?'right':'left'}));doc.y=y+34;}
 ensure(65);tableHeader();
 r.amounts.rows.forEach((row,index)=>{
  doc.font('Helvetica').fontSize(11);const height=Math.max(36,doc.heightOfString(clean(row.name),{width:220})+18);
  if(doc.y+height>bottom){ensure(height);tableHeader();}
  const y=doc.y;doc.fillColor(navy);const values=[String(index+1),clean(row.name),String(row.quantity),money(row.unitPrice),money(row.lineTotal)];
  values.forEach((v,i)=>doc.text(v,xs[i]+5,y+7,{width:ws[i]-10,align:i>=2?'right':'left'}));
  doc.moveTo(45,y+height).lineTo(550,y+height).strokeColor('#e1e7ef').stroke();doc.y=y+height+4;
 });
 const totals=receiptTotals(r);ensure(totals.length*28+45);doc.y+=15;
 for(const [label,value] of totals){const final=label==='Reservation total'||label==='Appointment total',y=doc.y;if(final)doc.rect(270,y-5,280,30).fill('#eaf0fb');doc.font(final?'Helvetica-Bold':'Helvetica').fontSize(final?12:11).fillColor(navy).text(label,280,y,{width:150});doc.text(money(value),435,y,{width:110,align:'right'});doc.y=y+28;}
 section(r.kind==='grooming'?'Appointment instructions':'Pickup instructions');
 const instructions=r.instructions||[
  'Reservation confirmation only. Payment is collected separately. This document is not proof of payment.',
  r.deadline?'Please collect your products by the pickup deadline. Eligible uncollected reservations are automatically cancelled by the shop scheduler, with reserved stock released.':'Please collect your products at the scheduled pickup time. Contact the shop for assistance.',
  'Customer cancellation is available while the reservation is Pending or Approved. Other statuses require shop assistance.',
  ...r.warnings,
  `For assistance, contact ${r.business.phone} or ${r.business.email}.`,
  "Thank you for choosing Dizon's Pet Grooming! Please present your reservation reference when collecting your products.",
 ];
 for(const text of instructions){doc.font('Helvetica').fontSize(10.5);ensure(doc.heightOfString(text,{width})+14);doc.fillColor(muted).text(text,45,doc.y,{width}).moveDown(.7);}
 const pages=doc.bufferedPageRange();for(let i=pages.start;i<pages.start+pages.count;i++){doc.switchToPage(i);const margin=doc.page.margins.bottom;doc.page.margins.bottom=0;doc.font('Helvetica').fontSize(9).fillColor(muted).text(`${r.reference} | Page ${i+1} of ${pages.count}`,45,doc.page.height-28,{width,align:'right',lineBreak:false});doc.page.margins.bottom=margin;}
 doc.end();return complete;
}
