export default function GroomingReceiptLinks({id}:{id:string}){
 return <div className="reservationReceiptLinks"><a href={`/appointments/${id}/receipt`} target="_blank" rel="noopener noreferrer">View / Print Receipt</a><a href={`/api/appointments/${id}/receipt`} download>Download PDF</a></div>;
}
