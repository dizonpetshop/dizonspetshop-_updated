import {cookies} from 'next/headers';
import {prisma} from '@/lib/prisma';
import {readSessionToken,sessionCookieName} from '@/lib/session';
export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const user=await readSessionToken((await cookies()).get(sessionCookieName)?.value);
 if(!user)return new Response('Unauthorized',{status:401,headers});
 const {id}=await params;if(!/^[1-9]\d{0,17}$/.test(id))return new Response('Not found',{status:404,headers});
 const support=user.role==='Admin'||user.role==='SuperAdmin';
 const rows=await prisma.$queryRaw<{image_bytes:Uint8Array;mime_type:string}[]>`SELECT i.image_bytes,i.mime_type FROM support_message_images i JOIN support_messages m ON m.message_id=i.message_id JOIN support_conversations c ON c.conversation_id=m.conversation_id WHERE i.message_id=${BigInt(id)} AND (c.customer_user_id=${user.userId} OR ${support})`;
 if(!rows[0])return new Response('Not found',{status:404,headers});
 return new Response(new Uint8Array(rows[0].image_bytes),{headers:{...headers,'Content-Type':rows[0].mime_type,'Content-Disposition':`inline; filename="message-${id}.webp"`}});
}
