import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import AdminShell from '@/components/AdminShell';
import ReviewsPanel from '@/components/ReviewsPanel';
import {readSessionToken,sessionCookieName} from '@/lib/session';
export const dynamic='force-dynamic';
export default async function AdminReviews(){
  const session=await readSessionToken((await cookies()).get(sessionCookieName)?.value);
  if(!session||session.role==='User')redirect('/admin/login');
  return <AdminShell activeView="reviews" adminName={session.name} adminRole={session.role} isSuperAdmin={session.role==='SuperAdmin'} pageTitle="Reviews" pageDescription="Review authentic customer feedback using a consistent content policy." notificationCount={0}><ReviewsPanel mode="admin" loggedIn/></AdminShell>;
}
