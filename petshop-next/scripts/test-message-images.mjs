import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import sharp from 'sharp';
export async function checkMessageImages({test,p,request,clientCookie,adminCookie,otherCookie,base}){
 const png=await sharp({create:{width:24,height:24,channels:3,background:'#2467d1'}}).png().toBuffer();
 const different=await sharp({create:{width:24,height:24,channels:3,background:'#f08b30'}}).png().toBuffer();
 const start=await request('/api/messages?portal=client',clientCookie,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({action:'start'})});const {conversationId}=await start.json();
 const upload=(cookie,bytes=png,content='',key=randomBytes(16).toString('hex'),type='image/png',conversation=conversationId)=>{const body=new FormData();for(const [k,v] of Object.entries({action:'send',conversationId:conversation,content,requestKey:key}))body.set(k,String(v));body.set('image',new Blob([bytes],{type}),'chat-image.png');return request('/api/messages?portal='+(cookie===adminCookie?'admin':'client'),cookie,{method:'POST',headers:{Origin:base},body});};
 let sent,reply;
 await test('Messaging images: customer/admin exchange, private downloads, persistence and notifications',async()=>{
  const first=await upload(clientCookie);assert.equal(first.status,200);sent=(await first.json()).message;assert.equal(sent.content,'');assert.ok(sent.imageUrl);assert.equal(sent.senderRole,'User');
  const image=await request(sent.imageUrl,adminCookie);assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/webp');const metadata=await sharp(Buffer.from(await image.arrayBuffer())).metadata();assert.equal(metadata.format,'webp');assert.equal(metadata.width,24);assert.ok(!metadata.exif);
  assert.equal((await request(sent.imageUrl,otherCookie)).status,404);assert.equal((await request(sent.imageUrl)).status,401);
  const response=await upload(adminCookie,different,'Here is the photo from the shop');assert.equal(response.status,200);reply=(await response.json()).message;assert.equal(reply.senderRole,'Admin');assert.equal((await request(reply.imageUrl,clientCookie)).status,200);
  const history=await(await request(`/api/messages?portal=client&conversation=${conversationId}`,clientCookie)).json();assert.ok(history.messages.find(m=>m.id===sent.id).imageUrl);assert.ok(history.messages.find(m=>m.id===reply.id).content.includes('photo from the shop'));
  assert.ok(await p.notification.findFirst({where:{eventKey:`message:${sent.id}`,recipient:{role:'Admin'}}}));assert.ok(await p.notification.findFirst({where:{eventKey:`message:${reply.id}`,recipient:{role:'User'}}}));
 });
 await test('Messaging images: retries deduplicate attachments and conflicting requests are rejected',async()=>{
  const key=randomBytes(16).toString('hex'),first=await upload(clientCookie,png,'Image retry',key),id=(await first.json()).message.id;
  const retry=await upload(clientCookie,png,'Image retry',key);assert.equal((await retry.json()).message.id,id);assert.equal((await upload(clientCookie,different,'Image retry',key)).status,409);
  const rows=await p.$queryRaw`SELECT COUNT(*) total FROM support_message_images WHERE message_id=${BigInt(id)}`;assert.equal(Number(rows[0].total),1);
 });
 await test('Messaging images: invalid/oversized uploads and cross-customer conversation access are blocked',async()=>{
  const before=await p.supportMessage.count();
  for(const [bytes,type] of [[Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),'image/svg+xml'],[Buffer.from([137,80,78,71,13,10,26,10]),'image/png']])assert.equal((await upload(clientCookie,bytes,'',undefined,type)).status,400);
  assert.ok([400,413].includes((await upload(clientCookie,Buffer.alloc(1_500_001))).status));assert.equal((await upload(otherCookie)).status,404);assert.equal((await upload('')).status,401);assert.equal(await p.supportMessage.count(),before);
 });
 if(process.env.CART_BROWSER_AUDIT==='1')await test('Messaging images: browser picker, preview, two-way sending, reload and mobile layout',async()=>{
  const {browserSession}=await import('./browser-session.mjs');const browser=await browserSession(),{rpc,evaluate,wait}=browser;
  const file=resolve('CHAT_IMAGE_AUDIT.png');await writeFile(file,png);
  const open=async(portal,cookie)=>{await browser.setCookie(base,cookie);await rpc('Page.navigate',{url:`${base}/${portal==='admin'?'admin':'client'}/dashboard?view=messages&conversation=${conversationId}`});await wait("document.querySelector('.chatImageInput')&&!document.querySelector('.chatAttachButton').disabled&&Object.keys(document.querySelector('.chatImageInput')).some(k=>k.startsWith('__reactProps'))");};
  const choose=async()=>{const handle=await rpc('Runtime.evaluate',{expression:"document.querySelector('.chatImageInput')"});const {node}=await rpc('DOM.describeNode',{objectId:handle.result.objectId});await rpc('DOM.setFileInputFiles',{backendNodeId:node.backendNodeId,files:[file]});await wait("document.querySelector('.chatAttachmentPreview img')?.complete");};
  try{
   await open('client',clientCookie);await choose();await evaluate("document.querySelector('[aria-label=\"Remove selected image\"]').click()");await wait("!document.querySelector('.chatAttachmentPreview')");await choose();
   await evaluate("document.querySelector('.chatComposer button[type=submit]').click()");await wait("!document.querySelector('.chatAttachmentPreview')&&document.querySelector('.chatImageLink img')?.naturalWidth>0");
   await open('admin',adminCookie);await wait("document.querySelector('.chatImageLink img')?.naturalWidth>0");await choose();await evaluate("document.querySelector('.chatComposer button[type=submit]').click()");await wait("!document.querySelector('.chatAttachmentPreview')");
   await open('client',clientCookie);await wait("document.querySelectorAll('.chatImageLink').length>=4");
   for(const width of [1280,390,320]){await rpc('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);}
   const shot=await rpc('Page.captureScreenshot',{format:'png'});await writeFile('CHAT_IMAGES_320.png',Buffer.from(shot.data,'base64'));
  }catch(error){try{const shot=await rpc('Page.captureScreenshot',{format:'png'});await writeFile('CHAT_IMAGE_BROWSER_FAILURE.png',Buffer.from(shot.data,'base64'));await writeFile('CHAT_IMAGE_BROWSER_FAILURE.html',await evaluate('document.documentElement.outerHTML'));}catch{}throw error;}finally{await browser.close();}
 });
}
