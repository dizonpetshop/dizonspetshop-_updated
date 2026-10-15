import {notFound,redirect} from 'next/navigation';
import ReservationReceiptDocument from '@/components/ReservationReceiptDocument';
import {reservationReceipt,ReceiptError} from '@/lib/reservation-receipt-data';
export const dynamic='force-dynamic';
export default async function ReceiptPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params;let receipt;
 try{receipt=await reservationReceipt(id);}catch(e){if(e instanceof ReceiptError){if(e.status===401)redirect('/client/login');notFound();}throw e;}
 return <ReservationReceiptDocument receipt={receipt}/>;
}
