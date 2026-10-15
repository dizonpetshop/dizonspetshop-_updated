export function loyaltyDiscountPercent(visit:number,vip=false){return vip||visit>=11?10:visit===5||visit===10?50:0;}
