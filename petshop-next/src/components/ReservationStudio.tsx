"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import AdminIcon from './AdminIcon';
import ProductImage from './ProductImage';
import {type CartController,type CartProduct} from './ReservationCart';
import {checkoutReservationCart,saveCheckoutProfile} from '@/app/client/actions';
import type {getReservationCartQuote} from '@/app/client/actions';
import {pickupInstant,pickupPolicy as defaultPickupPolicy,pickupSlots} from '@/lib/cart-rules';

type Quote=NonNullable<Awaited<ReturnType<typeof getReservationCartQuote>>['quote']>;
const money=(n:number)=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(n);
const steps=['Customer details','Pickup schedule','Payment preference','Review & confirm'];
const timeLabel=(time:string)=>new Date(`2000-01-01T${time}:00Z`).toLocaleTimeString('en-PH',{hour:'numeric',minute:'2-digit',timeZone:'UTC'});

export default function ReservationStudio({cart,products}:{cart:CartController;products:CartProduct[]}){
  const router=useRouter(),dialog=useRef<HTMLDialogElement>(null),form=useRef<HTMLFormElement>(null),heading=useRef<HTMLHeadingElement>(null);
  const [open,setOpen]=useState(false),[step,setStep]=useState(2),[quote,setQuote]=useState<Quote|null>(null),[quoteKey,setQuoteKey]=useState(''),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[editing,setEditing]=useState(false),[pickupDate,setPickupDate]=useState(''),[pickupTime,setPickupTime]=useState(''),[payment,setPayment]=useState(''),[revision,setRevision]=useState(0);
  const [success,setSuccess]=useState<{id:string;reference:string;total:number}|null>(null);
  const [uncertain,setUncertain]=useState(false);
  const rows=cart.items.map(i=>({...i,product:products.find(p=>p.productId===i.productId)}));
  const eligible=rows.filter(i=>i.product&&i.product.stockQuantity>=i.quantity&&i.product.stockQuantity>0);
  const selected=eligible.filter(i=>i.selected);
  const selectionKey=JSON.stringify(selected.map(i=>({productId:i.productId,quantity:i.quantity})).sort((a,b)=>a.productId-b.productId));
  const fresh=quoteKey===selectionKey&&!!quote;
  const subtotal=selected.reduce((sum,i)=>sum+Math.round(i.product!.price*100)*i.quantity,0)/100;
  const total=fresh?quote.total:subtotal;
  const pickupPolicy=quote?.pickupPolicy||defaultPickupPolicy,pickupTimes=pickupSlots(pickupPolicy);
  const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10),latest=new Date(Date.now()+8*3600000+pickupPolicy.maxDays*86400000).toISOString().slice(0,10);
  const refreshQuote=useCallback(async(key:string,signal?:AbortSignal)=>{
    setLoading(true);setError('');
    try{
      const response=await fetch('/api/reservations/quote?'+new URLSearchParams({items:key}),{cache:'no-store',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(12000)]):AbortSignal.timeout(12000)});
      const result=await response.json() as Awaited<ReturnType<typeof import('@/app/client/actions').getReservationCartQuote>>;
      if(signal?.aborted)return;
      if(!result.quote){setQuote(null);setError(result.error||'Could not load checkout. Please retry.');return;}
      setQuote(result.quote);setQuoteKey(key);
    }catch{if(!signal?.aborted){setQuote(null);setError('Could not load customer details and prices. Please retry.');}}
    finally{if(!signal?.aborted)setLoading(false);}
  },[]);
  useEffect(()=>{
    if(!open||success||selectionKey==='[]'){setLoading(false);return;}
    const controller=new AbortController();setLoading(true);
    void refreshQuote(selectionKey,controller.signal);
    return()=>controller.abort();
  },[open,success,selectionKey,revision,refreshQuote]);
  useEffect(()=>{
    if(!open){dialog.current?.close();return;}
    dialog.current?.showModal();const previous=document.body.style.overflow;document.body.style.overflow='hidden';
    return()=>{document.body.style.overflow=previous;};
  },[open]);
  useEffect(()=>{if(open){dialog.current?.scrollTo({top:0});heading.current?.focus();}},[step,open,success]);
  function close(){if(busy)return;setOpen(false);setError('');}
  function scheduleValid(){try{pickupInstant(pickupDate,pickupTime,Date.now(),pickupPolicy);return true;}catch(e){setError(e instanceof Error?e.message:'Choose a pickup schedule.');return false;}}
  function next(){
    setError('');
    if(step===1&&(!selected.length||!fresh||loading)){setError(selected.length?'Wait for current prices and customer details, or retry loading.':'Select at least one available product.');return;}
    if(step===2&&(editing||!quote?.profileComplete)){setError('Save your name, valid contact number, and complete address before continuing.');return;}
    if(step===3&&!scheduleValid())return;
    if(step===4&&!payment){setError('Choose GCash, Maya, or Cash.');return;}
    setStep(n=>Math.min(5,n+1));
  }
  async function saveProfile(){
    if(!form.current)return;
    for(const name of ['firstName','surname','phone','address']){const input=form.current.elements.namedItem(name) as HTMLInputElement;if(!input.reportValidity())return;}
    setBusy(true);setError('');
    try{const result=await saveCheckoutProfile(new FormData(form.current));if(!result.ok){setError(result.error||'Unable to save profile.');return;}await refreshQuote(selectionKey);setEditing(false);router.refresh();}
    catch{setError('Unable to save your profile. Please retry.');}finally{setBusy(false);}
  }
  async function confirm(event:React.FormEvent){
    event.preventDefault();if(busy||editing||!fresh||loading)return;
    // Enter on an earlier mobile step advances that step, never submits early.
    if(window.matchMedia('(max-width: 600px)').matches&&step!==5){next();return;}
    if(quote.unconfirmedPrices.length){setError('The shop needs to confirm a product price before this reservation can be submitted.');return;}
    if(!quote.profileComplete){setStep(2);setError('Save your contact number and complete address.');return;}
    if(!scheduleValid()){setStep(3);return;}if(!payment){setStep(4);setError('Choose a payment preference.');return;}
    setBusy(true);setError('');
    try{
      const data=new FormData();data.set('items',JSON.stringify(quote.items.map(i=>({productId:i.productId,quantity:i.quantity,expectedPrice:i.price}))));data.set('requestToken',quote.requestToken);data.set('expectedTotal',String(quote.total));data.set('pickupDate',pickupDate);data.set('pickupTime',pickupTime);data.set('paymentMethod',payment);
      const result=await checkoutReservationCart(data);
      if(!result.reservation){setUncertain(false);setError(result.error||'Could not reserve your products. Refresh availability and retry.');return;}
      cart.consume(quote.items);setSuccess(result.reservation);setUncertain(false);router.refresh();
    }catch{setUncertain(true);setError('Connection interrupted. Retry confirmation with the same details to safely check whether your reservation was received.');}
    finally{setBusy(false);}
  }
  const selectedList=<div className="checkoutProductList">{quote?.items.filter(i=>selected.some(row=>row.productId===i.productId)).map(i=><article key={i.productId}><div className="cartItemPhoto"><ProductImage src={i.image} name={i.name} category={i.category}/></div><div><h4>{i.name}</h4><p>{i.quantity} × {money(i.price)}{i.portion?` / ${i.portion}`:''}</p></div><div className="checkoutProductActions"><strong>{money(Math.round(i.price*100)*i.quantity/100)}</strong><button type="button" className="checkoutRemoveProduct" disabled={busy||uncertain} aria-label={`Remove ${i.name} from reservation`} onClick={()=>{cart.remove(i.productId);setError('');}}><AdminIcon name="trash" size={16}/>Remove</button></div></article>)}</div>;
  return <>
    <button className="reservationCartTrigger" type="button" disabled={!cart.loaded} onClick={()=>{setStep(2);setOpen(true);setError('');}}><span className="reservationCartIcon"><AdminIcon name="cart" size={22}/></span><span>Reservation Cart</span><b aria-label={`${cart.items.length} products in cart`}>{cart.items.length}</b></button>
    {cart.notice&&<p className="cartToast" role="status">{cart.notice}</p>}
    <dialog ref={dialog} className="reservationCartDialog reservationStudio reservationCheckoutCompact" aria-labelledby="cart-heading" onCancel={e=>{e.preventDefault();close();}}>
      <header className="reservationCartHeader"><div><small>SHOP PICKUP · DIZON&apos;S</small><h2 ref={heading} tabIndex={-1} id="cart-heading">{success?'Reservation received':'Reservation'}</h2></div>{success&&<a className="cartViewReceipt" href={`/reservations/${success.id}/receipt`} target="_blank" rel="noopener noreferrer">View / Print Receipt</a>}{success&&<a className="cartReceiptLink" href={`/api/reservations/${success.id}/receipt`} download>Download PDF Receipt</a>}<button type="button" onClick={close} disabled={busy} aria-label="Close reservation cart"><AdminIcon name="close" size={20}/></button></header>
      <div className="reservationCartBody" aria-busy={busy||loading}>
        {error&&<div className="cartError" role="alert">{error}{!busy&&!uncertain&&selected.length>0&&<button type="button" className="studioRetry" onClick={()=>{setQuoteKey('');setRevision(n=>n+1);router.refresh();}}>Refresh availability</button>}</div>}
        {success?<div className="cartSuccess"><span>✓</span><h3>Your products are reserved.</h3><p>Reference <b>{success.reference}</b></p><p>Total: <b>{money(success.total)}</b></p><p>Preferred payment: {payment}. Payment is collected separately at the shop.</p><p>Unselected products remain in your cart.</p><a href="/client/dashboard?view=reservations" data-dashboard-view="reservations" className="primaryButton" onClick={close}>View Reservations</a><button type="button" onClick={()=>{setSuccess(null);setQuote(null);setQuoteKey('');setStep(2);setPickupDate('');setPickupTime('');setPayment('');}}>Back to cart</button></div>:!cart.loaded?<div role="status" className="studioSkeleton">Loading your cart…</div>:!rows.length?<div className="cartEmpty"><AdminIcon name="cart" size={44}/><h3>Your next essentials start here</h3><p>Add products while browsing, then choose what to reserve for shop pickup.</p><button className="primaryButton" type="button" onClick={close}>Continue Shopping</button></div>:<>
          <nav className="studioTimeline" aria-label="Reservation progress"><ol>{steps.map((label,index)=><li key={label} className={step===index+2?'isCurrent':step>index+2?'isComplete':''} aria-current={step===index+2?'step':undefined}><span>{step>index+2?'✓':index+1}</span><b>{label}</b></li>)}</ol><p role="status">Step {step-1} of 4 · {steps[step-2]}</p></nav>
          <form ref={form} className="reservationCheckoutForm studioForm studioCheckoutOnly" data-step={step} noValidate onSubmit={confirm}>
            <div className="reservationCartLayout studioLayout">
              <section className="studioCheckoutPanel" aria-label="Reservation checkout">
                <div className="studioPanelHeading studioDesktopHeading"><div><small>READY FOR PICKUP</small><h3>Reservation checkout</h3></div><AdminIcon name="calendarCheck" size={25}/></div>
                {!selected.length?<p className="studioHint">No selected products. Add a product from the catalog to begin checkout.</p>:<>
                  <section className="studioStep studioSection" data-step-panel="2"><h3><span>1</span>Customer details</h3>{loading&&!fresh?<div className="studioSkeleton" role="status"><i/><i/><i/>Loading saved customer details…</div>:(!fresh||!quote)?<p className="studioHint">Customer details are unavailable. Use Refresh availability to retry.</p>:<fieldset key={editing?'editing':'saved'} disabled={busy||uncertain} className="checkoutProfile"><legend className="reviewSrOnly">Customer information</legend>{editing?<><label>First name<input name="firstName" autoComplete="given-name" defaultValue={quote.profile.firstName||''} required/></label><label>Surname<input name="surname" autoComplete="family-name" defaultValue={quote.profile.surname||''} required/></label><label>Middle initial<input name="middleInitial" autoComplete="additional-name" defaultValue={quote.profile.middleInitial} maxLength={2}/></label><label>Contact number<input name="phone" type="tel" autoComplete="tel" defaultValue={quote.profile.phone} required/></label><label className="wideField">Complete address<textarea name="address" autoComplete="street-address" defaultValue={quote.profile.address} required rows={2}/></label><div className="wideField checkoutProfileActions"><button className="primaryButton" type="button" onClick={()=>void saveProfile()}>{busy?'Saving…':'Save Profile'}</button><button type="button" onClick={()=>setEditing(false)}>Cancel</button></div></>:<><label className="wideField">Customer name<input value={quote.profile.name} readOnly/></label><label className="wideField">Contact number<input value={quote.profile.phone} readOnly/></label><label className="wideField">Complete address<textarea value={quote.profile.address} readOnly rows={2}/></label><button className="cartProfileLink" type="button" onClick={()=>setEditing(true)}><AdminIcon name="edit" size={15}/>Edit Profile</button></>}<p className="wideField">Saved account details for shop pickup. This is not a delivery address.</p>{!quote.profileComplete&&<p className="cartError wideField">Add a valid contact number and complete address to continue.</p>}</fieldset>}</section>
                  <section className="studioStep studioSection studioReview" data-step-panel="5"><h3><span>4</span>Review & confirm</h3>{selectedList}

                  </section>
                  <section className="studioStep studioSection" data-step-panel="3"><h3><span>2</span>Pickup schedule</h3><fieldset className="checkoutPickup" disabled={busy||uncertain}><legend className="reviewSrOnly">Choose pickup date and time</legend><label>Pickup date<input name="pickupDate" type="date" value={pickupDate} min={today} max={latest} required onChange={e=>{setPickupDate(e.target.value);setPickupTime('');setError(pickupPolicy.days.includes(new Date(`${e.target.value}T12:00:00Z`).getUTCDay())?'':'The shop is closed on this day. Choose another pickup date.');}}/></label><label>Pickup time<select name="pickupTime" value={pickupTime} disabled={!pickupDate} required onChange={e=>setPickupTime(e.target.value)}><option value="">Select pickup time</option>{pickupTimes.map(time=><option key={time} value={time} disabled={new Date(`${pickupDate}T${time}:00${pickupPolicy.offset}`).getTime()<=Date.now()||new Date(`${pickupDate}T${time}:00${pickupPolicy.offset}`).getTime()>Date.now()+pickupPolicy.maxDays*86400000}>{timeLabel(time)}</option>)}</select></label><p>Philippine time · {timeLabel(pickupTimes[0])}–{timeLabel(pickupTimes.at(-1)!)} · Within {pickupPolicy.maxDays} days</p></fieldset></section>
                  <section className="studioStep studioSection" data-step-panel="4"><h3><span>3</span>Payment preference</h3><fieldset className="checkoutPayments" disabled={busy||uncertain}><legend className="reviewSrOnly">Preferred payment method</legend>{['GCash','Maya','Cash'].map(method=><label key={method} className={payment===method?'isSelected':''}><input type="radio" name="paymentMethod" value={method} checked={payment===method} required onChange={()=>setPayment(method)}/><b>{method}</b><small>Pay at pickup</small></label>)}</fieldset><p className="studioHint">Choose how you prefer to pay. No payment is collected now.</p></section>
                    <aside className="reservationCartSummary studioStep" data-step-panel="5"><h3>Reservation summary</h3><p><span>Selected products</span><b>{selected.length}</b></p><p><span>Total quantity</span><b>{selected.reduce((n,i)=>n+i.quantity,0)}</b></p><p><span>Product subtotal</span><b>{money(fresh?Number(quote.amounts.subtotal):subtotal)}</b></p><p><span>Added VAT</span><b>{money(fresh?Number(quote.amounts.addedVat):0)}</b></p><div className="cartGrandTotal"><span>Total</span><strong>{money(total)}</strong></div><small>Pay at pickup. This total reflects your selected product prices. Stock is confirmed when you submit.</small><button type="submit" className="primaryButton" disabled={busy||loading||!fresh||!!quote?.unconfirmedPrices.length||!quote?.profileComplete||editing||!selected.length||!pickupDate||!pickupTime||!payment}>{busy?'Reserving products…':uncertain?'Retry reservation confirmation':'Confirm & Reserve Products'}</button></aside>

                </>}
              </section>
            </div>
            <div className="studioMobileActions"><div><small>Selected total</small><strong>{money(total)}</strong></div><div>{step>2&&<button type="button" disabled={busy||uncertain} onClick={()=>{setStep(n=>Math.max(2,n-1));setError('');}}>Back</button>}{step<5&&<button className="primaryButton" type="button" disabled={busy||loading||uncertain} onClick={next}>Continue<AdminIcon name="chevron" size={16}/></button>}</div></div>
          </form>
        </>}
      </div>
    </dialog>
  </>;
}
