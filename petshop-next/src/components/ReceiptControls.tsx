"use client";
export default function ReceiptControls({id,back,downloadPath}:{id:string;back:string;downloadPath?:string}){
 return <nav className="receiptControls" aria-label="Receipt actions"><a href={back}>Back to reservations</a><div><a className="primaryButton" href={downloadPath||`/api/reservations/${id}/receipt`} download>Download PDF</a><button type="button" onClick={()=>window.print()}>Print Receipt</button></div></nav>;
}
