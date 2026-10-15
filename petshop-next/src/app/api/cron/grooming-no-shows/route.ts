import { prisma } from '@/lib/prisma';
import { processNoShows } from '@/lib/grooming-attendance';
import { processProductReservationExpiry } from '@/lib/product-reservation-expiry';
export const runtime='nodejs';
export async function GET(request:Request){
  if(!process.env.CRON_SECRET||request.headers.get('authorization')!==`Bearer ${process.env.CRON_SECRET}`)return Response.json({error:'Unauthorized'},{status:401});
  try{
    const [grooming,productReservations]=await Promise.all([processNoShows(prisma),processProductReservationExpiry(prisma)]);
    return Response.json({...grooming,productReservations},{headers:{'Cache-Control':'no-store'}});
  }catch(error){console.error('Reservation cancellation job failed',error instanceof Error?error.name:'Unknown');return Response.json({error:'Reservation cancellation processing failed; retry safely.'},{status:503});}
}
