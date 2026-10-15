export default function ReservationReceiptLinks({id}:{id:string}){
 return <div className="reservationReceiptLinks"><a href={`/reservations/${id}/receipt`} target="_blank" rel="noopener noreferrer">View / Print Receipt</a><a href={`/api/reservations/${id}/receipt`} download>Download PDF</a></div>;
}
