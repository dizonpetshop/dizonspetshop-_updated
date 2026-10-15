import {cookies} from 'next/headers';
import {Prisma} from '@prisma/client';
import {prisma} from './prisma';
import {readSessionToken,sessionCookieName} from './session';
import {paymentPreference} from './cart-rules';
import {parseTaxPolicy,reservationAmounts,type ReservationAmounts,type TaxLine} from './reservation-tax';

type DB=Prisma.TransactionClient;
export async function productTaxPolicy(db:Pick<DB,'systemSetting'>=prisma){const setting=await db.systemSetting.findUnique({where:{key:'product_reservation_tax_policy'}});return parseTaxPolicy(setting?.value||null);}
export async function saveReceiptSnapshot(db:DB,id:bigint,amounts:ReservationAmounts){
 await db.$executeRaw`INSERT INTO product_reservation_receipt_snapshot(reservation_id,snapshot) VALUES(${id},${JSON.stringify({version:1,amounts})})`;
}
export class ReceiptError extends Error{constructor(message:string,public status:number){super(message);}}
export async function receiptViewer(id:string){
 const session=await readSessionToken((await cookies()).get(sessionCookieName)?.value);
 if(!session)throw new ReceiptError('Please log in to view this receipt.',401);
 if(!/^[1-9]\d{0,17}$/.test(id))throw new ReceiptError('Reservation not found.',404);
 const user=await prisma.user.findFirst({where:{id:session.userId,accountStatus:'Active',role:session.role},select:{email:true}});
 if(!user)throw new ReceiptError('Please log in again.',401);
 const admin=session.role==='Admin'||session.role==='SuperAdmin';
 return {session,admin,user};
}
export function receiptBusiness(settings:{key:string;value:string}[]){
 const get=(key:string)=>settings.find(s=>s.key===key)?.value.trim();
 return {name:get('business_name')||"Dizon's Pet Grooming",address:get('business_address')||'037 E. Pascual St., Tangos South, Navotas, Philippines 1489',phone:get('business_phone')||'0945 260 8113',email:get('business_email')||'dizonspetgrooming@gmail.com',logo:'/assets/dizons-logo.jpg'};
}
export async function reservationReceipt(id:string){
 const {session,admin,user}=await receiptViewer(id);
 const r=await prisma.productReservation.findFirst({where:{reservationId:BigInt(id),...(admin?{}:{customer:{email:user.email}})},include:{customer:true,items:{include:{product:{select:{productName:true}}},orderBy:{reservationItemId:'asc'}}}});
 if(!r)throw new ReceiptError('Reservation not found.',404);
 const saved=await prisma.$queryRaw<{snapshot:string}[]>`SELECT snapshot FROM product_reservation_receipt_snapshot WHERE reservation_id=${r.reservationId}`;
 const lines:TaxLine[]=r.items.map(i=>({productId:i.productId,name:i.product.productName,quantity:i.quantity,unitPrice:i.unitPrice.toFixed(2)}));
 let amounts=reservationAmounts(lines,parseTaxPolicy(null)),historical=true;
 const warnings:string[]=[];
 if(saved[0]){try{const snapshot=JSON.parse(saved[0].snapshot);if(snapshot.version!==1||!snapshot.amounts?.rows)throw Error();amounts=snapshot.amounts;historical=false;}catch{warnings.push('The saved tax breakdown could not be verified. Please contact the shop.');}}
 const storedSubtotal=lines.reduce((sum,i)=>sum.add(new Prisma.Decimal(i.unitPrice).mul(i.quantity)),new Prisma.Decimal(0));
 if(!storedSubtotal.equals(amounts.subtotal)||amounts.rows.length!==lines.length||amounts.rows.some((row,index)=>row.productId!==lines[index]?.productId||row.quantity!==lines[index]?.quantity||!new Prisma.Decimal(row.unitPrice).equals(lines[index]?.unitPrice||-1)))warnings.push('Stored item details differ from the receipt snapshot. Shop review is required.');
 if(!new Prisma.Decimal(amounts.total).equals(r.totalAmount))warnings.push('The stored reservation total differs from the available item and tax breakdown. The original total is preserved; contact the shop for review.');
 if(lines.some(i=>new Prisma.Decimal(i.unitPrice).isZero()&&!amounts.rows.find(row=>row.productId===i.productId)?.freeConfirmed))warnings.push('A product has a zero stored price without recorded free-item confirmation. The original price is preserved for shop review.');
 if(historical)warnings.push('Historical tax treatment was not recorded. No current tax rate has been applied to this reservation.');
 // The reservation item records remain authoritative even if a snapshot is inconsistent.
 amounts={...amounts,subtotal:storedSubtotal.toFixed(2),rows:lines.map(line=>{const old=amounts.rows.find(row=>row.productId===line.productId);return {...line,name:old?.name||line.name,lineTotal:new Prisma.Decimal(line.unitPrice).mul(line.quantity).toFixed(2),treatment:old?.treatment||'unconfigured',vat:old?.vat||'0.00',freeConfirmed:old?.freeConfirmed||false};})};
 const settings=await prisma.systemSetting.findMany({where:{key:{in:['business_name','business_address','business_phone','business_email','product_reservation_expiry_enabled_after','product_reservation_expiry_grace_minutes']}}});
 const setting=(key:string)=>settings.find(s=>s.key===key)?.value.trim();
 const business={name:setting('business_name')||"Dizon's Pet Grooming",address:setting('business_address')||'037 E. Pascual St., Tangos South, Navotas, Philippines 1489',phone:setting('business_phone')||'0945 260 8113',email:setting('business_email')||'dizonspetgrooming@gmail.com',logo:'/assets/dizons-logo.jpg'};
 const enabled=new Date(setting('product_reservation_expiry_enabled_after')||'');
 const rawGrace=setting('product_reservation_expiry_grace_minutes');
 const grace=rawGrace!==undefined&&/^\d+$/.test(rawGrace)&&Number(rawGrace)<=10080?Number(rawGrace):null;
 const enforced=Number.isFinite(enabled.getTime())&&r.reservedUntil>=enabled;
 const deadline=enforced&&grace!==null?new Date(r.reservedUntil.getTime()+grace*60000):null;
 if(warnings.some(w=>!w.startsWith('Historical'))){
  const exists=await prisma.auditLog.findFirst({where:{module:'Reservation Receipt',action:'RECONCILIATION',recordId:id},select:{auditLogId:true}});
  if(!exists)await prisma.auditLog.create({data:{userId:session.userId,userName:session.name,role:session.role,module:'Reservation Receipt',action:'RECONCILIATION',recordId:id,description:warnings.join(' ')}});
 }
 return {id,reference:r.reservationCode,createdAt:r.createdAt,generatedAt:new Date(),status:r.status,customer:{name:r.customerName||r.customer.customerName,phone:r.contactNumber||r.customer.phone,address:r.deliveryAddress||r.customer.address||'Not recorded'},business,amounts,total:r.totalAmount.toFixed(2),historical,warnings,pickupAt:r.reservedUntil,grace,deadline,enforced,payment:paymentPreference(r.reservationCode),admin};
}
export type ReservationReceipt=Awaited<ReturnType<typeof reservationReceipt>>&{kind?:'grooming';title?:string;additionalDetails?:[string,string][];totalsOverride?:[string,string][];instructions?:string[];downloadPath?:string;appointmentLocation?:string};
export const receiptDate=(date:Date)=>date.toLocaleString('en-PH',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Manila'});
export function receiptTotals(r:ReservationReceipt){
 if(r.totalsOverride)return r.totalsOverride;
 const a=r.amounts,rows:[string,string][]=[['Product subtotal',a.subtotal]];
 if(!r.historical){
  if(a.rows.some(i=>i.treatment==='inclusive'||i.treatment==='exclusive'))rows.push(['VATable sales',a.vatable],[`VAT (${new Prisma.Decimal(a.rate).mul(100).toString()}%)${new Prisma.Decimal(a.addedVat).isZero()?' included':''}`,a.vat]);
  if(a.rows.some(i=>i.treatment==='exempt'))rows.push(['VAT-exempt sales',a.exempt]);
  if(a.rows.some(i=>i.treatment==='zero-rated'))rows.push(['Zero-rated sales',a.zeroRated]);
 }
 rows.push(['Reservation total',r.total]);return rows;
}
