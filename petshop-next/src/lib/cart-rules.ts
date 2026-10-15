export type CartLine={productId:number;quantity:number;expectedPrice?:number};
// Existing reservation policy, shared by the server and responsive checkout.
export type PickupPolicy={timezone:string;offset:string;opens:number;closes:number;intervalMinutes:number;maxDays:number;days:number[]};
export const pickupPolicy:PickupPolicy={timezone:'Asia/Manila',offset:'+08:00',opens:9,closes:19,intervalMinutes:30,maxDays:30,days:[0,1,2,3,4,5,6]};
export const pickupSlots=(policy:PickupPolicy)=>Array.from({length:Math.floor((policy.closes-policy.opens)*60/policy.intervalMinutes)+1},(_,n)=>{const minutes=policy.opens*60+n*policy.intervalMinutes;return `${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;});
export function parseCartLines(value:unknown):CartLine[]{
  if(!Array.isArray(value)||!value.length||value.length>100)throw new Error('Select between 1 and 100 products.');
  const seen=new Set<number>();
  return value.map(item=>{
    if(!item||typeof item!=='object'||!Number.isSafeInteger(item.productId)||item.productId<1||item.productId>2147483647||!Number.isSafeInteger(item.quantity)||item.quantity<1||item.quantity>2147483647)throw new Error('Every product needs a valid whole-number quantity of at least 1.');
    if(seen.has(item.productId))throw new Error('Combine duplicate products into a single cart row.');seen.add(item.productId);
    if(item.expectedPrice!==undefined&&(typeof item.expectedPrice!=='number'||!Number.isFinite(item.expectedPrice)||item.expectedPrice<0))throw new Error('Invalid product price. Refresh checkout.');
    return {productId:item.productId,quantity:item.quantity,...(item.expectedPrice===undefined?{}:{expectedPrice:item.expectedPrice})};
  }).sort((a,b)=>a.productId-b.productId);
}
export function pickupInstant(date:string,time:string,now=Date.now(),policy=pickupPolicy){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(time))throw new Error('Choose a valid pickup date and time.');
  const day=new Date(`${date}T00:00:00Z`);
  if(Number.isNaN(day.getTime())||day.toISOString().slice(0,10)!==date)throw new Error('Choose a valid pickup date.');
  const hour=Number(time.slice(0,2)),minute=Number(time.slice(3));
  if(!policy.days.includes(day.getUTCDay()))throw new Error('The shop is closed on this day. Choose another pickup date.');
  if(minute>59||hour<policy.opens||hour>policy.closes||(hour===policy.closes&&minute!==0))throw new Error('Choose a pickup time within the shop pickup hours.');
  if((hour*60+minute-policy.opens*60)%policy.intervalMinutes!==0)throw new Error('Choose an available pickup time from the list.');
  const pickup=new Date(`${date}T${time}:00${policy.offset}`);
  if(pickup.getTime()<=now)throw new Error('Choose a future pickup time.');
  if(pickup.getTime()>now+policy.maxDays*86400000)throw new Error(`Pickup must be scheduled within the next ${policy.maxDays} days.`);
  return pickup;
}
export function paymentPreference(code:string){return code.startsWith('PRD-GCASH-')?'GCash':code.startsWith('PRD-MAYA-')?'Maya':code.startsWith('PRD-CSH-')?'Cash':'Not recorded';}
