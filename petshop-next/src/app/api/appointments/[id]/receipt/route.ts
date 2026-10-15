import {groomingReceipt} from '@/lib/grooming-receipt';
import {ReceiptError} from '@/lib/reservation-receipt-data';
import {reservationReceiptPdf} from '@/lib/reservation-receipt-pdf';
export const runtime='nodejs';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 try{const {id}=await params,r=await groomingReceipt(id),pdf=await reservationReceiptPdf(r);
  const filename='Dizons_Grooming_Appointment_'+r.reference.replace(/[^a-zA-Z0-9_-]/g,'_')+'.pdf';
  return new Response(new Uint8Array(pdf),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${filename}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch(e){return Response.json({error:e instanceof ReceiptError?e.message:'Unable to generate this appointment receipt. Please retry.'},{status:e instanceof ReceiptError?e.status:503,headers:{'Cache-Control':'private, no-store'}});}
}
