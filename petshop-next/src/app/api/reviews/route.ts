import {cookies} from 'next/headers';
import {NextResponse} from 'next/server';
import {readSessionToken,sessionCookieName} from '@/lib/session';
import {listReviews,mutateReview,ReviewError} from '@/lib/reviews';

const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
async function session(){return readSessionToken((await cookies()).get(sessionCookieName)?.value);}
function failure(error:unknown){if(error instanceof ReviewError)return json({error:error.message},error.status);console.error('Reviews operation failed',error);return json({error:'Reviews are temporarily unavailable. Please try again.'},503);}
export async function GET(request:Request){try{
  const p=new URL(request.url).searchParams,mode=p.get('mode')||'public';
  if(!['public','mine','admin'].includes(mode))throw new ReviewError('Invalid review view.');
  const rating=Number(p.get('rating')||0),page=Number(p.get('page')||0);
  if(!Number.isInteger(rating)||rating<0||rating>5||!Number.isInteger(page)||page<0||page>100000)throw new ReviewError('Invalid filter.');
  return json(await listReviews(mode as 'public'|'mine'|'admin',await session(),{rating,page,status:p.get('status')||'',q:p.get('q')||''}));
}catch(e){return failure(e);}}
export async function POST(request:Request){try{
  const user=await session();if(!user)throw new ReviewError('Please log in to write a review.',401);
  if(request.headers.get('origin')!==new URL(request.url).origin)throw new ReviewError('Invalid request origin.',403);
  if(!request.headers.get('content-type')?.startsWith('application/json'))throw new ReviewError('Use a JSON request.');
  const reader=request.body?.getReader();if(!reader)throw new ReviewError('Missing review.');
  let size=0;const chunks:Uint8Array[]=[];
  try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>16384){await reader.cancel();throw new ReviewError('Review request is too large.',413);}chunks.push(part.value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  let body;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new ReviewError('Invalid JSON.');}
  if(!body||typeof body!=='object'||Array.isArray(body))throw new ReviewError('Invalid review.');
  return json(await mutateReview(user,body));
}catch(e){return failure(e);}}
