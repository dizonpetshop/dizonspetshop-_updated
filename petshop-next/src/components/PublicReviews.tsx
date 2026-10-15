import Link from 'next/link';
import {listReviews} from '@/lib/reviews';

export default async function PublicReviews({page=0}:{page?:number}){
  const {reviews,hasMore}=await listReviews('public',null,{page});
  return <section className="reviewsPanel" aria-label="Customer reviews">
    <div className="reviewsHeading"><h1>Customer Reviews</h1></div>
    {reviews.length?<div className="reviewsGrid">{reviews.map(review=><article className="reviewCard" key={review.id}>
      <header><span className="reviewAvatar" aria-hidden="true">{review.name.slice(0,1).toUpperCase()}</span><div><b>{review.name}</b><time dateTime={review.createdAt}>{new Date(review.createdAt).toLocaleString('en-PH',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',hour12:true,timeZone:'Asia/Manila'})}</time></div></header>
      <span className="reviewStars" aria-label={`${review.rating} out of 5 stars`}>{[1,2,3,4,5].map(n=><span key={n} aria-hidden="true" className={n<=review.rating?'filled':''}>★</span>)}</span>
      <p className="reviewMessage">{review.message}</p>
    </article>)}</div>:<p>No customer reviews yet.</p>}
    {(page>0||hasMore)&&<nav className="reviewPagination" aria-label="More customer reviews">{page>0&&<Link href={`/reviews?page=${page-1}`}>Previous reviews</Link>}{hasMore&&<Link href={`/reviews?page=${page+1}`}>More reviews</Link>}</nav>}
  </section>;
}
