import {Prisma} from '@prisma/client';
import {prisma} from './prisma';
import {parseTaxPolicy,reservationAmounts,type TaxPolicy,type ReservationAmounts} from './reservation-tax';
import {receiptViewer,receiptBusiness,ReceiptError,type ReservationReceipt} from './reservation-receipt-data';
import {appointmentInstant} from './business-time';
import {graceMinutes} from './grooming-attendance';

export async function groomingTaxPolicy(db:Pick<Prisma.TransactionClient,'systemSetting'>=prisma){
 const row=await db.systemSetting.findUnique({where:{key:'grooming_tax_policy'}});return parseTaxPolicy(row?.value||null);
}
export type GroomingReceiptSnapshot={version:1;policy:TaxPolicy;amounts:ReservationAmounts;customer:{name:string;phone:string;address:string};details:[string,string][]};
export async function saveGroomingReceipt(tx:Prisma.TransactionClient,id:bigint,snapshot:GroomingReceiptSnapshot){
 await tx.$executeRaw`INSERT INTO grooming_appointment_receipt_snapshot(appointment_id,snapshot) VALUES(${id},${JSON.stringify(snapshot)})`;
}
export async function groomingReceipt(id:string):Promise<ReservationReceipt>{
 const {admin,user}=await receiptViewer(id);
 const a=await prisma.groomingAppointment.findFirst({where:{appointmentId:BigInt(id),...(admin?{}:{customer:{email:user.email}})},include:{customer:true,pet:true,style:true,groomer:true,addons:{include:{addon:true},orderBy:{addonId:'asc'}},loyaltyPricing:true}});
 if(!a)throw new ReceiptError('Appointment not found.',404);
 const records=await prisma.$queryRaw<{snapshot:string}[]>`SELECT snapshot FROM grooming_appointment_receipt_snapshot WHERE appointment_id=${a.appointmentId}`;
 const saved: GroomingReceiptSnapshot|null=records[0]?JSON.parse(records[0].snapshot):null;
 const warnings:string[]=[];
 const original=a.loyaltyPricing?.subtotal||a.totalPrice;
 const addonTotal=a.addons.reduce((sum,i)=>sum.add(i.priceAtBooking),new Prisma.Decimal(0));
 const fallback=[{productId:0,name:`${a.style.styleName} (${a.petSize}) — stored service balance`,quantity:1,unitPrice:original.sub(addonTotal).toFixed(2)},...a.addons.map(i=>({productId:i.addonId,name:i.addon.addonName,quantity:1,unitPrice:i.priceAtBooking.toFixed(2)}))];
 const amounts=saved?.amounts||reservationAmounts(fallback,parseTaxPolicy(null));
 const details=saved?.details||[['Pet name',a.pet.petName],['Species',a.pet.species||'Not recorded'],['Breed',a.pet.breed||'Not recorded'],['Sex',a.pet.gender||'Not recorded'],['Age / date of birth',a.pet.ageDob||'Not recorded'],['Pet size',a.petSize],['Package',a.style.styleName],['Groomer',a.groomer.groomerName]];
 const applied=!!a.loyaltyPricing?.appliedAt;
 const discount=applied?new Prisma.Decimal(a.loyaltyPricing!.discountAmount):new Prisma.Decimal(0);
 let tax=amounts;
 if(applied&&saved){const factor=new Prisma.Decimal(100-a.loyaltyPricing!.discountPercent).div(100);tax=reservationAmounts(amounts.rows.map(row=>({productId:row.productId,name:row.name,quantity:row.quantity,unitPrice:new Prisma.Decimal(row.unitPrice).mul(factor).toFixed(2)})),saved.policy);}
 const totals:[string,string][]=[['Service subtotal',amounts.subtotal]];
 if(!saved)warnings.push('Historical base price and tax treatment were not separately recorded. The stored service balance and add-on prices are shown; no current catalog price or tax rate has been substituted.');
 if(amounts.treatment==='unconfigured'&&amounts.rows.every(row=>row.treatment==='unconfigured')){totals.push(['VAT — not configured / not recorded','0.00']);warnings.push('No grooming VAT policy is configured for this booking. VAT has not been added or inferred. Contact the shop to confirm the applicable tax treatment.');}
 else{
  if(tax.rows.some(row=>row.treatment==='inclusive'||row.treatment==='exclusive'))totals.push(['VATable sales'+(applied?' after loyalty':''),tax.vatable],[`VAT (${new Prisma.Decimal(tax.rate).mul(100)}%)${new Prisma.Decimal(tax.addedVat).isZero()?' included':''}`,tax.vat]);
  if(tax.rows.some(row=>row.treatment==='exempt'))totals.push(['VAT-exempt sales',tax.exempt]);
  if(tax.rows.some(row=>row.treatment==='zero-rated'))totals.push(['Zero-rated sales',tax.zeroRated]);
 }
 if(applied){totals.push(['Booking total before loyalty',amounts.total],['Loyalty discount applied',discount.neg().toFixed(2)]);const rounding=new Prisma.Decimal(a.totalPrice).sub(tax.total);if(saved&&!rounding.isZero())totals.push(['Rounding / stored total adjustment',rounding.toFixed(2)]);}
 else if(a.loyaltyPricing?.estimatedPercent)warnings.push(`Estimated loyalty discount: ${a.loyaltyPricing.estimatedPercent}%. Final eligibility is determined on completion; it has not been deducted from this booking.`);
 totals.push(['Appointment total',a.totalPrice.toFixed(2)]);
 const settings=await prisma.systemSetting.findMany({where:{key:{in:['business_name','business_address','business_phone','business_email']}}});
 const business=receiptBusiness(settings),home=a.bookingType==='Home Service',pickupAt=appointmentInstant(a.appointmentDate,a.appointmentTime),grace=home?null:await graceMinutes(prisma);
 return {id,kind:'grooming',title:'GROOMING APPOINTMENT CONFIRMATION',reference:a.reservationCode,createdAt:a.createdAt,generatedAt:new Date(),status:a.status,customer:saved?.customer||{name:a.contactName||a.customer.customerName,phone:a.contactNumber||a.customer.phone,address:a.serviceAddress||a.customer.address||'Not recorded'},business,amounts,total:a.totalPrice.toFixed(2),historical:!saved,warnings,pickupAt,grace,deadline:grace===null?null:new Date(pickupAt.getTime()+grace*60000),enforced:!home,payment:'Payment collected separately',admin,additionalDetails:[['Service type',home?'Home Service':'Store Grooming'],...details,['Special instructions',a.specialInstructions||'None provided']],totalsOverride:totals,downloadPath:`/api/appointments/${id}/receipt`,appointmentLocation:home?(a.serviceAddress||'Not recorded'):business.address,instructions:[
 'Appointment confirmation only. Payment is collected separately. This document is not proof of payment.',
 home?'Please be available at the recorded home service address at the scheduled time.':'Please arrive at the shop for the scheduled appointment. Confirmed salon appointments without a recorded arrival may be cancelled after the configured grooming grace period.',
 'Customer cancellation is available for future Pending or Confirmed appointments. Contact the shop for assistance with other statuses.',
 ...warnings,`For assistance: ${business.phone} or ${business.email}.`,"Thank you for choosing Dizon's Pet Grooming! Please present your appointment reference on arrival.",
 ]};
}
