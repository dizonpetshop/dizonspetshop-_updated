import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

export async function checkMessagingBrowser(base, clientCookie, adminCookie, password, prisma) {
  const port=39231;
  const browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-background-networking','--no-first-run','--no-default-browser-check',`--remote-debugging-port=${port}`,`--user-data-dir=${resolve(`.audit-browser-profile-${randomBytes(4).toString('hex')}`)}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
  let ws,send;const tabs=[];
  try {
    let metadata;for(let i=0;i<50;i++){try{metadata=await(await fetch(`http://localhost:${port}/json/version`)).json();break;}catch{}await new Promise(r=>setTimeout(r,200));}assert.ok(metadata?.webSocketDebuggerUrl);
    ws=new WebSocket(metadata.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
    let id=0;const waiting=new Map();ws.addEventListener('message',event=>{const message=JSON.parse(event.data);const pending=waiting.get(message.id);if(!pending)return;waiting.delete(message.id);message.error?pending.reject(new Error(message.error.message)):pending.resolve(message.result);});
    send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const current=++id;waiting.set(current,{resolve,reject});ws.send(JSON.stringify({id:current,method,params,...(sessionId?{sessionId}:{})}));});
    for(const [portal,cookie] of [['client',clientCookie],['admin',adminCookie]]){
      const{browserContextId}=await send('Target.createBrowserContext',{disposeOnDetach:true});const{targetId}=await send('Target.createTarget',{url:'about:blank',browserContextId});const{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
      const rpc=(method,params)=>send(method,params,sessionId);
      const evaluate=async expression=>{const r=await rpc('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(`Browser evaluation failed (${portal}): ${r.exceptionDetails.exception?.description?.split('\n')[0] || r.exceptionDetails.text}`);return r.result.value;};
      const wait=async expression=>{for(let i=0;i<150;i++){try{if(await evaluate(`Boolean(${expression})`))return;}catch{}await new Promise(r=>setTimeout(r,200));}throw new Error(`${portal} browser timed out: ${expression}`);};
      await rpc('Page.enable');await rpc('Network.enable');await rpc('Emulation.setFocusEmulationEnabled',{enabled:true});await rpc('Emulation.setDeviceMetricsOverride',{width:1280,height:1000,deviceScaleFactor:1,mobile:false});
      const[name,...value]=cookie.split('=');await rpc('Network.setCookie',{name,value:value.join('='),url:base,httpOnly:true,sameSite:'Lax'});await rpc('Page.navigate',{url:`${base}/${portal}/dashboard?view=messages`});
      await wait("document.querySelector('.messagingWorkspace') && !document.querySelector('.chatState[role=status]')");tabs.push({portal,rpc,evaluate,wait,targetId});
    }
    const[client,admin]=tabs;
    const insert=async(tab,selector,text)=>{await send('Target.activateTarget',{targetId:tab.targetId});await tab.evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);await tab.rpc('Input.insertText',{text});};
    assert.equal(await client.evaluate("document.querySelectorAll('.dashNav .adminIcon').length"),8);
    assert.deepEqual(await client.evaluate("Array.from(document.querySelectorAll('.dashNav .dashNavLabel')).map(a=>a.textContent.trim())"),['Dashboard','My Pets','Grooming','Products','Reservations','Messages','Notifications','My Account']);
    assert.ok(await client.evaluate("document.querySelector('.dashNav a.active').getAttribute('href').includes('messages')"));
    await client.evaluate("document.querySelector('.chatConversationList .chatState button').click()");await client.wait("document.querySelector('.chatComposer textarea') && !document.querySelector('.chatState[role=status]')");
    assert.equal(await client.evaluate("document.querySelector('.chatComposer button').disabled"),true);
    await insert(client,'.chatComposer textarea','Hello support');
    assert.equal(await client.evaluate("document.querySelector('.chatComposer textarea').value"),'Hello support');
    await client.rpc('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',modifiers:8,text:'\r',windowsVirtualKeyCode:13});await client.rpc('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',modifiers:8,windowsVirtualKeyCode:13});
    await insert(client,'.chatComposer textarea','Could you help with grooming?');assert.ok(await client.evaluate("document.querySelector('.chatComposer textarea').value.includes(String.fromCharCode(10))"));
    await client.rpc('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await client.rpc('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    await client.wait("document.querySelector('.chatMessage.outgoing p')?.textContent.includes('Could you help with grooming?') && !document.querySelector('.chatComposer textarea').value");
    assert.equal(await client.evaluate("!!document.querySelector('.dashNav a[href*=messages] .sidebarUnreadBadge')"),false);
    await admin.wait("Array.from(document.querySelectorAll('.chatConversationList>button')).some(b=>b.querySelector('.chatConversationCopy b')?.textContent==='Browser Messenger')");
    await insert(admin,'.chatSearch input','Browser Messenger');await admin.wait("document.querySelectorAll('.chatConversationList>button').length===1 && document.querySelector('.chatConversationCopy b')?.textContent==='Browser Messenger'");
    assert.equal(await admin.evaluate("document.querySelector('.chatUnreadBadge').textContent"),'1');
    await admin.evaluate("document.querySelector('.chatConversationList>button').click()");await admin.wait("document.querySelector('.chatMessage.incoming p')?.textContent.includes('Could you help with grooming?')");
    await admin.wait("!document.querySelector('.chatUnreadBadge')");
    await client.rpc('Page.navigate',{url:base+'/client/dashboard'});await client.wait("document.querySelector('.dashNav') && !document.querySelector('.messagingWorkspace')");
    await insert(admin,'.chatComposer textarea','Yes, our team can help you book grooming.');await admin.evaluate("document.querySelector('.chatComposer').requestSubmit()");await admin.wait("Array.from(document.querySelectorAll('.chatMessage.outgoing p')).some(p=>p.textContent==='Yes, our team can help you book grooming.')");
    await client.wait("document.querySelector('.dashNav a[href*=messages] .sidebarUnreadBadge')?.textContent==='1'");
    await client.evaluate("document.querySelector('.notificationBell').click()");await client.wait("document.querySelector('.notificationRow strong')?.textContent==='New support reply'");
    await client.evaluate("document.querySelector('.notificationRow').click()");await client.wait("location.search.includes('view=messages') && location.search.includes('conversation=') && document.querySelector('.chatMessage.incoming p')?.textContent==='Yes, our team can help you book grooming.'");
    await client.wait("!document.querySelector('.dashNav a[href*=messages] .sidebarUnreadBadge')");
    const customer=await prisma.user.findUnique({where:{email:'browser-chat@audit.invalid'}});const conversations=await prisma.$queryRaw`SELECT conversation_id FROM support_conversations WHERE customer_user_id=${customer.id}`;const conversationId=conversations[0].conversation_id;
    const rows=await prisma.$queryRaw`SELECT content,read_at FROM support_messages WHERE conversation_id=${conversationId}`;assert.equal(rows.length,2);assert.ok(rows[0].read_at&&rows[1].read_at);
    await insert(client,'.chatComposer textarea','<img src=x onerror=alert(1)>');await client.evaluate("document.querySelector('.chatComposer').requestSubmit()");await client.wait("Array.from(document.querySelectorAll('.chatMessage p')).some(p=>p.textContent==='<img src=x onerror=alert(1)>')");assert.equal(await client.evaluate("document.querySelectorAll('.chatMessage img').length"),0);
    const layouts=[];
    for(const tab of tabs)for(const width of [1280,768,390,320])for(const theme of ['light','dark']){
      await tab.rpc('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<768});await tab.evaluate(`if(document.documentElement.dataset.theme!=='${theme}')document.querySelector('.themeToggle').click()`);
      assert.ok(await tab.evaluate("document.documentElement.scrollWidth<=innerWidth"),`${tab.portal} overflow at ${width}`);
      if(tab.portal==='client')assert.ok(await tab.evaluate("Array.from(document.querySelectorAll('.dashNav a')).every(a=>{const i=a.querySelector('svg').getBoundingClientRect(),l=a.querySelector('.dashNavLabel').getBoundingClientRect(),s=getComputedStyle(a);return s.display==='flex'&&s.flexDirection==='row'&&i.width===20&&i.height===20&&l.left>=i.right+11&&Math.abs((i.top+i.height/2)-(l.top+l.height/2))<1&&a.getBoundingClientRect().height>=44})"),`Sidebar alignment at ${width} ${theme}`);
      assert.ok(await tab.evaluate("document.querySelector('.chatComposer textarea').getBoundingClientRect().right<=innerWidth"));
      if(width===390||width===1280){const screenshot=await tab.rpc('Page.captureScreenshot',{format:'png'});await writeFile(`MESSAGES_${tab.portal.toUpperCase()}_${width}_${theme.toUpperCase()}.png`,Buffer.from(screenshot.data,'base64'));}
      if(width<700){await tab.evaluate("document.querySelector('.chatBack').click()");await tab.wait("!document.querySelector('.messagingWorkspace').classList.contains('showChat')");assert.equal(await tab.evaluate("getComputedStyle(document.querySelector('.chatWindow')).display"),'none');await tab.evaluate("document.querySelector('.chatConversationList>button').click()");await tab.wait("document.querySelector('.messagingWorkspace').classList.contains('showChat')");}
      layouts.push({portal:tab.portal,width,theme});
    }
    await client.rpc('Page.reload');await client.wait("document.querySelectorAll('.chatMessage').length===3");
    await client.evaluate("document.querySelector('form[action=\"/api/auth/logout\"]').requestSubmit()");await client.wait("location.pathname==='/'");
    await client.rpc('Page.navigate',{url:base+'/client/dashboard?view=messages'});await client.wait("location.pathname==='/client/login' && document.querySelector('.legacyAuthForm')");
    await insert(client,'.legacyAuthForm input[name=email]','browser-chat@audit.invalid');await insert(client,'.legacyAuthForm input[name=password]',password);await client.evaluate("document.querySelector('.legacyAuthForm').requestSubmit()");await client.wait("location.pathname==='/client/dashboard' && document.querySelector('.dashNav')");
    await client.evaluate("document.querySelector('.dashNav a[href*=messages]').click()");await client.wait("document.querySelector('.chatConversationList>button')");await client.evaluate("document.querySelector('.chatConversationList>button').click()");await client.wait("document.querySelectorAll('.chatMessage').length===3");
    for(const view of ['dashboard','pets','grooming','products','reservations','messages','notifications','account']){
      await client.evaluate(`Array.from(document.querySelectorAll('.dashNav a')).find(a=>new URL(a.href).searchParams.get('view')==='${view}'||('${view}'==='dashboard'&&!new URL(a.href).searchParams.get('view'))).click()`);
      await client.wait(`document.querySelector('.dashboardPanels').dataset.activeView==='${view}' && document.querySelectorAll('.dashNav a[aria-current=page]').length===1`);
      await client.wait("getComputedStyle(document.querySelector('.dashNav a.active')).color==='rgb(255, 255, 255)'");
      assert.equal(await client.evaluate("new URL(document.querySelector('.dashNav a.active').href).searchParams.get('view')||'dashboard'"),view);
      assert.equal(await client.evaluate("getComputedStyle(document.querySelector('.dashNav a.active')).color"),'rgb(255, 255, 255)');
    }
    const result={twoWay:'passed',pollingDelivery:'passed',unreadBadges:'passed',readState:'passed',notificationConversationLink:'passed',search:'passed',enterAndShiftEnter:'passed',safeTextRendering:'passed',refreshAndReloginPersistence:'passed',sidebarIconsAndNavigation:'passed',sidebarHorizontalAlignment:'passed',allClientNavigationActiveStates:'passed',layouts};await writeFile('MESSAGING_BROWSER_RESULTS.json',JSON.stringify(result,null,2));return result;
  }catch(error){for(const tab of tabs){try{const shot=await tab.rpc('Page.captureScreenshot',{format:'png'});await writeFile(`MESSAGING_${tab.portal.toUpperCase()}_DEBUG.png`,Buffer.from(shot.data,'base64'));await writeFile(`MESSAGING_${tab.portal.toUpperCase()}_DEBUG.json`,JSON.stringify(await tab.evaluate("({path:location.pathname,query:location.search,error:document.querySelector('.chatError')?.textContent,hidden:document.hidden,text:document.body.innerText.slice(-1400)})"),null,2));}catch{}}throw error;}
  finally{if(send&&ws?.readyState===WebSocket.OPEN){try{await send('Browser.close');}catch{}}ws?.close();browser.kill();}
}
