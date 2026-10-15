import {prisma} from './prisma';
import {pickupPolicy,type PickupPolicy} from './cart-rules';
// Optional configuration in the existing settings table; absent values retain legacy rules.
export async function productPickupPolicy(db:Pick<typeof prisma,'systemSetting'>=prisma):Promise<PickupPolicy>{
 const setting=await db.systemSetting.findUnique({where:{key:'product_pickup_policy'}});
 if(!setting)return {...pickupPolicy,days:[...pickupPolicy.days]};
 try{
  const input=JSON.parse(setting.value);
  if(!input||!Number.isInteger(input.opens)||!Number.isInteger(input.closes)||input.opens<0||input.closes>23||input.opens>=input.closes||![15,30,60].includes(input.intervalMinutes)||!Number.isInteger(input.maxDays)||input.maxDays<1||input.maxDays>30||!Array.isArray(input.days)||!input.days.length||input.days.some((d:unknown)=>!Number.isInteger(d)||Number(d)<0||Number(d)>6))throw Error();
  return {...pickupPolicy,opens:input.opens,closes:input.closes,intervalMinutes:input.intervalMinutes,maxDays:input.maxDays,days:[...new Set<number>(input.days)]};
 }catch{throw new Error('Shop pickup hours are unavailable. Please contact the shop.');}
}
