export default function AppointmentStatus({status}:{status:string}){
  const tone=status.startsWith('Cancelled')?'danger':['Completed','Approved'].includes(status)?'success':status==='Pending'?'warning':'info';
  return <span className={`appointmentStatus ${tone}`}>{status==='Cancelled - No Show'?'Cancelled – No Show':status}</span>;
}
