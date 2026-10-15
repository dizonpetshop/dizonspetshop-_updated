import {getReservationCartQuote} from '@/app/client/actions';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const items=new URL(request.url).searchParams.get('items')||'';
 if(items.length>20000)return Response.json({error:'The selected cart is too large.'},{status:400,headers:{'Cache-Control':'private, no-store'}});
 const form=new FormData();form.set('items',items);
 const result=await getReservationCartQuote(form);
 return Response.json(result,{status:result.quote?200:result.error==='Client access required.'?401:400,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
