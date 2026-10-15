import {Prisma} from '@prisma/client';
export type TaxTreatment='unconfigured'|'inclusive'|'exclusive'|'exempt'|'zero-rated';
export type TaxPolicy={treatment:TaxTreatment;rate:string;products:Record<string,TaxTreatment>;freeProductIds:number[]};
export const defaultTaxPolicy:TaxPolicy={treatment:'unconfigured',rate:'0',products:{},freeProductIds:[]};
const treatments=['unconfigured','inclusive','exclusive','exempt','zero-rated'];
export function parseTaxPolicy(value:string|null):TaxPolicy{
 if(!value)return {...defaultTaxPolicy};
 try{const p=JSON.parse(value);if(!p||!treatments.includes(p.treatment)||!/^0(?:\.\d{1,6})?$/.test(String(p.rate))||!Array.isArray(p.freeProductIds)||p.freeProductIds.some((id:unknown)=>!Number.isSafeInteger(id)||Number(id)<1)||!p.products||typeof p.products!=='object'||Array.isArray(p.products)||Object.entries(p.products).some(([id,t])=>!/^\d+$/.test(id)||!treatments.includes(String(t))))throw Error();return {treatment:p.treatment,rate:String(p.rate),products:p.products,freeProductIds:p.freeProductIds};}
 catch{throw Error('Product tax configuration is invalid. Please contact the shop.');}
}
export type TaxLine={productId:number;name:string;quantity:number;unitPrice:string};
export function reservationAmounts(lines:TaxLine[],policy:TaxPolicy,validatePrices=false){
 let subtotal=new Prisma.Decimal(0),vatable=new Prisma.Decimal(0),vat=new Prisma.Decimal(0),addedVat=new Prisma.Decimal(0),exempt=new Prisma.Decimal(0),zeroRated=new Prisma.Decimal(0);
 const rows=lines.map(line=>{
  const price=new Prisma.Decimal(line.unitPrice);
  if(validatePrices&&(price.isNegative()||!price.isFinite()||(price.isZero()&&!policy.freeProductIds.includes(line.productId))))throw Error(`${line.name}: the shop must confirm a valid price before reservation. Zero-priced products require explicit free-item configuration.`);
  const amount=price.mul(line.quantity).toDecimalPlaces(2),treatment=policy.products[String(line.productId)]||policy.treatment;
  let tax=new Prisma.Decimal(0),base=amount;
  if(treatment==='inclusive'){base=amount.div(new Prisma.Decimal(1).add(policy.rate)).toDecimalPlaces(2);tax=amount.sub(base);vatable=vatable.add(base);}
  if(treatment==='exclusive'){tax=amount.mul(policy.rate).toDecimalPlaces(2);addedVat=addedVat.add(tax);vatable=vatable.add(base);}
  if(treatment==='exempt')exempt=exempt.add(amount);
  if(treatment==='zero-rated')zeroRated=zeroRated.add(amount);
  subtotal=subtotal.add(amount);vat=vat.add(tax);
  return {...line,lineTotal:amount.toFixed(2),treatment,vat:tax.toFixed(2),freeConfirmed:price.isZero()&&policy.freeProductIds.includes(line.productId)};
 });
 return {rows,subtotal:subtotal.toFixed(2),vatable:vatable.toFixed(2),vat:vat.toFixed(2),addedVat:addedVat.toFixed(2),exempt:exempt.toFixed(2),zeroRated:zeroRated.toFixed(2),total:subtotal.add(addedVat).toFixed(2),rate:policy.rate,treatment:policy.treatment};
}
export type ReservationAmounts=ReturnType<typeof reservationAmounts>;
