import type { ReactNode } from "react";
import AppointmentStatus from "@/components/AppointmentStatus";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import { cancelGroomingAppointment, cancelProductReservation } from "@/app/client/actions";

export default function ReservationCard({id,kind,title,schedule,reference,status,children}:{id:string;kind:"product"|"grooming";title:string;schedule:string;reference:string;status:string;children?:ReactNode}){
  const canCancel=(kind==="product"?["Pending","Approved"]:["Pending","Confirmed"]).includes(status);
  return <article className="clientListItem groomingAppointmentCard unifiedReservationCard">
    <div><h3>{title}</h3><p>{schedule}</p><small>{reference}</small>{children}</div>
    <div className="clientRecordActions"><AppointmentStatus status={status}/>{canCancel&&<form action={kind==="product"?cancelProductReservation:cancelGroomingAppointment}><input name="id" type="hidden" value={id}/><ConfirmSubmitButton className="clientCancelButton" pendingText="Cancelling..." confirmMessage={kind==="product"?"Cancel this product reservation? Reserved stock will be released.":"Cancel this grooming appointment?"}>Cancel</ConfirmSubmitButton></form>}</div>
  </article>;
}