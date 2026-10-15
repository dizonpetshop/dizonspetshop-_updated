"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { reserveProduct,getReservationProduct } from "@/app/client/actions";
import { getProductPortion } from "@/lib/product-portions";

function ReserveButton({onPendingChange,unavailable=false}:{onPendingChange?:(pending:boolean)=>void;unavailable?:boolean}) {
  const { pending } = useFormStatus();
  useEffect(()=>{onPendingChange?.(pending);return()=>onPendingChange?.(false);},[pending,onPendingChange]);
  return <><button aria-busy={pending} aria-disabled={pending||unavailable} disabled={pending||unavailable} type="submit">Confirm &amp; Reserve Product</button>{pending && <small role="status">Submitting reservation…</small>}</>;
}

export default function ProductReserveForm({ productId, productName, stock, unitPrice, phone, address, requestToken, initialQuantity=1, onQuantityChange, onPendingChange }: { productId: number; productName: string; stock: number; unitPrice: number; phone: string; address: string; requestToken: string; initialQuantity?:number; onQuantityChange?:(quantity:number)=>void; onPendingChange?:(pending:boolean)=>void }) {
  const [quantity, setQuantity] = useState(initialQuantity);
  const [pricing,setPricing]=useState<{quantity:number;amounts:NonNullable<Awaited<ReturnType<typeof getReservationProduct>>>['amounts']}|null>(null),[pricingError,setPricingError]=useState('');
  useEffect(()=>{let active=true;setPricingError('');const timer=setTimeout(async()=>{try{const result=await getReservationProduct(productId,quantity);if(active){if(result)setPricing({quantity,amounts:result.amounts});else setPricingError('Product unavailable.');}}catch(e){if(active)setPricingError(e instanceof Error?e.message:'Unable to load current pricing.');}},150);return()=>{active=false;clearTimeout(timer);};},[productId,quantity]);
  useEffect(()=>onQuantityChange?.(quantity),[quantity,onQuantityChange]);
  useEffect(() => { setQuantity((current) => Math.max(1, Math.min(stock, current))); }, [stock]);
  const portion = getProductPortion(productName, unitPrice);
  const currentPricing=pricing?.quantity===quantity?pricing.amounts:null;
  const total = currentPricing?new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(currentPricing.total)):'Checking current total…';
  const portionPrice = portion ? new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(unitPrice) : "";
  const manilaOffset = 8 * 60 * 60 * 1000;
  const today = new Date(Date.now() + manilaOffset).toISOString().slice(0, 10);
  const latestPickupDate = new Date(Date.now() + manilaOffset + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  return <form action={reserveProduct} className="productReserveForm">
    <input type="hidden" name="requestToken" value={requestToken}/>
    {currentPricing&&<input type="hidden" name="expectedTotal" value={currentPricing.total}/>}
    <input name="productId" type="hidden" value={productId}/>
    {portion && <label>Portion / Weight<select aria-label={`Portion or weight for ${productName}`} defaultValue={portion.value} name="portion"><option value={portion.value}>{portion.label} — {portionPrice}</option></select></label>}
    <label>{portion ? "Portions" : "Qty"}<input aria-label={`${portion ? "Portions" : "Quantity"} for ${productName}`} max={stock} min="1" name="quantity" onChange={(event) => setQuantity(Math.min(stock, Math.max(1, Number(event.target.value) || 1)))} required type="number" value={quantity}/></label>
    <label>Pickup date<input max={latestPickupDate} min={today} name="pickupDate" required type="date"/></label>
    <label>Pickup time<input max="19:00" min="09:00" name="pickupTime" required type="time"/></label>
    <label>Contact<input defaultValue={phone} inputMode="tel" name="contactNumber" pattern="(?:\+63|0)9[0-9]{9}" placeholder="09XXXXXXXXX" required /></label>
    <label>Address<input defaultValue={address} name="address" placeholder="Complete address" required /></label>
    <fieldset className="shopPaymentMethods"><legend>Preferred payment method</legend>{['GCash','Maya','Cash'].map(method=><label key={method}><input type="radio" name="paymentMethod" value={method} defaultChecked={method==='Cash'} required/>{method}</label>)}</fieldset>
    <div className="productReserveTotal"><small>Total</small><b>{total}</b></div>
    {pricingError&&<p role="alert">{pricingError}</p>}
    <ReserveButton onPendingChange={onPendingChange} unavailable={!currentPricing||!!pricingError}/>
  </form>;
}
