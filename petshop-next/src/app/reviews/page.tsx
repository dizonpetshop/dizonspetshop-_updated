import {redirect} from 'next/navigation';
import PublicHeader from '@/components/PublicHeader';
import PublicReviews from '@/components/PublicReviews';
export const dynamic='force-dynamic';
export const metadata={title:"Customer Reviews | Dizon's Pet Grooming"};
export default async function ReviewsPage({searchParams}:{searchParams:Promise<{view?:string;page?:string}>}){
  const params=await searchParams;
  if(params.view==='mine')redirect('/client/dashboard?view=reviews');
  const page=Math.max(0,Math.min(100000,Number.parseInt(params.page||'0',10)||0));
  return <div className="homePage reviewsPage"><PublicHeader/><main className="landing"><div className="reviewsPageInner"><PublicReviews page={page}/></div></main></div>;
}