import {messageImage,messageImageLimit} from '@/lib/message-image';
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { readSessionToken, sessionCookieName } from "@/lib/session";
import { logDatabaseFailure } from "@/lib/database";
import { notifyAdministrators } from "@/lib/operations";

const headers = { "Cache-Control": "private, no-store, max-age=0" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
class ChatError extends Error { constructor(message: string, readonly status = 400) { super(message); } }
type Conversation = { conversation_id: number; customer_user_id: number; customer_id: number | null };
type Message = { message_id: bigint; conversation_id: number; sender_id: number; sender_role: string; content: string; created_at: Date; read_at: Date | null; image_mime?:string|null; image_hash?:string|null; sender_name?: string };
const dto = (m: Message) => ({ id: String(m.message_id), conversationId: m.conversation_id, senderId: m.sender_id, senderRole: m.sender_role, senderName: m.sender_name || (m.sender_role === "User" ? "Customer" : "Shop support"), content: m.content, imageUrl:m.image_mime?`/api/messages/${m.message_id}/image`:null, createdAt: m.created_at.toISOString(), readAt: m.read_at?.toISOString() || null });
function positiveId(value: unknown) {
  const id = Number(value); if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647) throw new ChatError("Invalid conversation."); return id;
}
function messageContentType(request: Request) {
  return (request.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
}
async function readBody(request: Request) {
  const reader=request.body?.getReader(); if(!reader)throw new ChatError("Invalid message request.");
  const multipart=messageContentType(request)==='multipart/form-data';
  const chunks:Uint8Array[]=[];let size=0;
  try{
    for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>(multipart?messageImageLimit+32768:16384)){await reader.cancel();throw new ChatError("Message request is too large.",413);}chunks.push(chunk.value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    if(multipart){const form=await new Response(bytes,{headers:{'Content-Type':request.headers.get('content-type')!}}).formData();return {action:form.get('action'),conversationId:form.get('conversationId'),content:form.get('content'),requestKey:form.get('requestKey'),image:form.get('image')};}
    try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new ChatError("Invalid message request.");}
  }finally{reader.releaseLock();}
}
async function viewer(request: Request) {
  const session = await readSessionToken((await cookies()).get(sessionCookieName)?.value);
  if (!session) return null;
  const portal = new URL(request.url).searchParams.get("portal");
  if (portal && ((portal === "client" && session.role !== "User") || (portal === "admin" && session.role === "User") || !["client", "admin"].includes(portal))) return null;
  return { ...session, support: session.role !== "User" };
}
async function authorize(id: number, userId: number, support: boolean) {
  const rows = await prisma.$queryRaw<Conversation[]>`SELECT conversation_id,customer_user_id,customer_id FROM support_conversations WHERE conversation_id=${id} AND (customer_user_id=${userId} OR ${support})`;
  if (!rows.length) throw new ChatError("Conversation not found.", 404); return rows[0];
}
async function unread(userId: number, support: boolean) {
  const rows = await prisma.$queryRaw<{ total: bigint }[]>`SELECT COUNT(*) AS total FROM support_messages m JOIN support_conversations c ON c.conversation_id=m.conversation_id WHERE (c.customer_user_id=${userId} OR ${support}) AND m.read_at IS NULL AND ((m.sender_role='User' AND ${support}) OR (m.sender_role IN ('Admin','SuperAdmin') AND NOT ${support}))`;
  return Number(rows[0].total);
}

export async function GET(request: Request) {
  try {
    const user = await viewer(request); if (!user) return json({ error: "Unauthorized" }, 401);
    const query = new URL(request.url).searchParams;
    if (query.get("summary") === "1") return json({ count: await unread(user.userId, user.support) });
    if (query.has("conversation")) {
      const conversation = await authorize(positiveId(query.get("conversation")), user.userId, user.support);
      const before = query.get("before");
      if (before && (!/^\d{1,19}$/.test(before) || BigInt(before) > BigInt("9223372036854775807"))) throw new ChatError("Invalid history cursor.");
      const cursor = before ? BigInt(before) : BigInt("9223372036854775807");
      const rows = await prisma.$queryRaw<Message[]>`SELECT m.*,i.mime_type AS image_mime,CONCAT_WS(' ',u.first_name,u.surname) AS sender_name FROM support_messages m JOIN users u ON u.id=m.sender_id LEFT JOIN support_message_images i ON i.message_id=m.message_id WHERE m.conversation_id=${conversation.conversation_id} AND m.message_id<${cursor} ORDER BY m.message_id DESC LIMIT 101`;
      return json({ messages: rows.slice(0,100).reverse().map(dto), hasMore: rows.length > 100 });
    }
    const search = (query.get("q") || "").trim().slice(0,100);
    const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
    const page = Math.max(0, Math.min(100000, Number.parseInt(query.get("page") || "0",10) || 0));
    const offset = page * 50;
    const rows = await prisma.$queryRaw<{ conversation_id: number; customer_user_id: number; name: string; email: string; updated_at: Date; preview: string | null; unread: bigint }[]>`SELECT c.conversation_id,c.customer_user_id,COALESCE(NULLIF(CONCAT_WS(' ',u.first_name,u.surname),''),'Customer') AS name,u.email,c.updated_at,(SELECT CASE WHEN content='' THEN 'Photo' ELSE content END FROM support_messages WHERE conversation_id=c.conversation_id ORDER BY message_id DESC LIMIT 1) AS preview,(SELECT COUNT(*) FROM support_messages m WHERE m.conversation_id=c.conversation_id AND m.read_at IS NULL AND ((m.sender_role='User' AND ${user.support}) OR (m.sender_role IN ('Admin','SuperAdmin') AND NOT ${user.support}))) AS unread FROM support_conversations c JOIN users u ON u.id=c.customer_user_id WHERE (c.customer_user_id=${user.userId} OR ${user.support}) AND (CONCAT_WS(' ',u.first_name,u.surname) LIKE ${pattern} OR u.email LIKE ${pattern}) ORDER BY c.updated_at DESC,c.conversation_id DESC LIMIT 51 OFFSET ${offset}`;
    return json({ count: await unread(user.userId,user.support), hasMore: rows.length>50, conversations: rows.slice(0,50).map(c => ({ id:c.conversation_id, customerId:c.customer_user_id, name:user.support?c.name:"Dizon's Shop Support", email:user.support?c.email:null, updatedAt:c.updated_at.toISOString(), preview:c.preview, unread:Number(c.unread) })) });
  } catch(error) {
    if(error instanceof ChatError) return json({error:error.message},error.status);
    logDatabaseFailure("Messages read",error); return json({error:"Messages are temporarily unavailable. Please try again."},503);
  }
}

export async function POST(request: Request) {
  try {
    const user = await viewer(request); if (!user) return json({error:"Unauthorized"},401);
    if (!['application/json','multipart/form-data'].includes(messageContentType(request))) return json({error:"Submit a valid message request."},400);
    const body = await readBody(request);
    if (!body || typeof body !== "object") throw new ChatError("Invalid message request.");
    if (body.action === "start") {
      if(user.support) throw new ChatError("Customers start support conversations.",403);
      const id = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM users WHERE id=${user.userId} FOR UPDATE`;
        const account = await tx.user.findUniqueOrThrow({where:{id:user.userId}});
        if(account.accountStatus!=='Active'||account.role!=='User') throw new ChatError("Account is unavailable.",403);
        let customer = await tx.customer.findFirst({where:{email:account.email}});
        if(!customer) customer=await tx.customer.create({data:{customerName:[account.firstName,account.surname].filter(Boolean).join(' ')||'Customer',email:account.email,phone:account.phoneNumber||'Not provided'}});
        const now=new Date();
        await tx.$executeRaw`INSERT INTO support_conversations(customer_user_id,customer_id,created_at,updated_at) VALUES(${user.userId},${customer.id},${now},${now}) ON DUPLICATE KEY UPDATE customer_user_id=VALUES(customer_user_id)`;
        const rows=await tx.$queryRaw<Conversation[]>`SELECT conversation_id FROM support_conversations WHERE customer_user_id=${user.userId}`;return rows[0].conversation_id;
      });
      return json({conversationId:id});
    }
    const conversation=await authorize(positiveId(body.conversationId),user.userId,user.support);
    if(body.action === "read") {
      if(typeof body.throughId!=='string'||!/^\d{1,19}$/.test(body.throughId)||BigInt(body.throughId)>BigInt('9223372036854775807')) throw new ChatError("Invalid read cursor.");
      const now=new Date();
      await prisma.$executeRaw`UPDATE support_messages SET read_at=${now} WHERE conversation_id=${conversation.conversation_id} AND message_id<=${BigInt(body.throughId)} AND read_at IS NULL AND ((sender_role='User' AND ${user.support}) OR (sender_role IN ('Admin','SuperAdmin') AND NOT ${user.support}))`;
      return json({count:await unread(user.userId,user.support)});
    }
    if(body.action !== "send") throw new ChatError("Invalid message action.");
    const content=typeof body.content==='string'?body.content.trim():'';
    const upload=body.image instanceof File&&body.image.size?body.image:null;
    if((!content&&!upload)||content.length>2000||/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(content)) throw new ChatError("Enter a message between 1 and 2,000 characters.");
    if(typeof body.requestKey!=='string'||!/^[a-f0-9]{32}$/.test(body.requestKey)) throw new ChatError("Invalid submission. Please try again.");
    let image:Awaited<ReturnType<typeof messageImage>>|null=null;
    if(upload){try{image=await messageImage(upload);}catch(e){throw new ChatError(e instanceof Error?e.message:'Invalid image.');}}
    const message=await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM users WHERE id=${user.userId} FOR UPDATE`;
      const account=await tx.user.findUniqueOrThrow({where:{id:user.userId}});
      if(account.accountStatus!=='Active'||account.role!==user.role) throw new ChatError("Account is unavailable.",403);
      const existing=await tx.$queryRaw<Message[]>`SELECT m.*,i.mime_type AS image_mime,i.source_hash AS image_hash FROM support_messages m LEFT JOIN support_message_images i ON i.message_id=m.message_id WHERE m.sender_id=${user.userId} AND m.request_key=${body.requestKey}`;
      if(existing.length){if(existing[0].conversation_id!==conversation.conversation_id||existing[0].content!==content||(existing[0].image_hash||null)!==(image?.hash||null))throw new ChatError("This submission was already used.",409);return existing[0];}
      const since=new Date(Date.now()-60000);
      const recent=await tx.$queryRaw<{total:bigint}[]>`SELECT COUNT(*) AS total FROM support_messages WHERE sender_id=${user.userId} AND created_at>=${since}`;
      if(Number(recent[0].total)>=20) throw new ChatError("Please wait a minute before sending more messages.",429);
      const now=new Date();
      await tx.$executeRaw`INSERT INTO support_messages(conversation_id,sender_id,sender_role,content,request_key,created_at) VALUES(${conversation.conversation_id},${user.userId},${user.role},${content},${body.requestKey},${now})`;
      await tx.$executeRaw`UPDATE support_conversations SET updated_at=${now} WHERE conversation_id=${conversation.conversation_id}`;
      const rows=await tx.$queryRaw<Message[]>`SELECT * FROM support_messages WHERE sender_id=${user.userId} AND request_key=${body.requestKey}`;
      if(image){await tx.$executeRaw`INSERT INTO support_message_images(message_id,mime_type,image_bytes,source_hash) VALUES(${rows[0].message_id},${image.mime},${image.bytes},${image.hash})`;rows[0].image_mime=image.mime;}
      const event={eventKey:`message:${rows[0].message_id}`,title:user.support?"New support reply":"New customer message",message:content.slice(0,180)||(image?'Sent an image':''),type:"MESSAGE_NEW",relatedType:"conversation",relatedId:conversation.conversation_id,link:`/${user.support?'client':'admin'}/dashboard?view=messages&conversation=${conversation.conversation_id}`};
      if(user.support) await tx.notification.createMany({data:[{recipientId:conversation.customer_user_id,...event,relatedId:String(event.relatedId)}],skipDuplicates:true});
      else await notifyAdministrators(tx,event);
      return rows[0];
    });
    return json({message:dto(message)});
  } catch(error) {
    if(error instanceof ChatError) return json({error:error.message},error.status);
    logDatabaseFailure("Messages update",error); return json({error:"Your message could not be saved. Please try again."},503);
  }
}
