import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {resolve} from 'node:path';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

export async function checkReviewsBrowser(base,cookie,appointmentId,productReservationId,homeAppointmentId){
  const port=39239;
  const browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--disable-background-networking','--no-first-run',`--remote-debugging-port=${port}`,`--user-data-dir=${resolve('.audit-reviews-'+randomBytes(4).toString('hex'))}`,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
  let browserErrors='';browser.stderr.on('data',chunk=>{browserErrors+=chunk;});
  let ws,send;
  try{
    let metadata;for(let i=0;i<40;i++){try{metadata=await(await fetch(`http://127.0.0.1:${port}/json/version`,{signal:AbortSignal.timeout(1000)})).json();break;}catch{}if(browser.exitCode!==null)break;await new Promise(r=>setTimeout(r,200));}assert.ok(metadata,`Chrome must start (${browser.exitCode}): ${browserErrors.slice(-1200)}`);
    ws=new WebSocket(metadata.webSocketDebuggerUrl);await new Promise((yes,no)=>{ws.addEventListener('open',yes,{once:true});ws.addEventListener('error',no,{once:true});});
    let id=0;const pending=new Map();ws.addEventListener('message',e=>{const m=JSON.parse(e.data),job=pending.get(m.id);if(job){pending.delete(m.id);m.error?job.reject(new Error(m.error.message)):job.resolve(m.result);}});
    send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const next=++id;pending.set(next,{resolve,reject});ws.send(JSON.stringify({id:next,method,params,...(sessionId?{sessionId}:{})}));});
    const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
    const rpc=(method,params={})=>send(method,params,sessionId);
    const evaluate=async expression=>{const r=await rpc('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||'Browser evaluation failed');return r.result.value;};
    const wait=async expression=>{for(let i=0;i<150;i++){if(await evaluate(`Boolean(${expression})`))return;await new Promise(r=>setTimeout(r,150));}throw new Error('Timed out: '+expression);};
    await rpc('Page.enable');await rpc('Network.enable');await rpc('Emulation.setFocusEmulationEnabled',{enabled:true});await send('Target.activateTarget',{targetId});
    const [name,...value]=cookie.split('=');await rpc('Network.setCookie',{name,value:value.join('='),url:base,httpOnly:true,sameSite:'Lax'});
    await rpc('Page.navigate',{url:base+'/reviews'});await wait("document.querySelectorAll('.reviewCard').length===6");
    const layouts=[];
    for(const [width,columns] of [[1280,3],[800,2],[390,1],[320,1]])for(const theme of ['light','dark']){
      await rpc('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<768});
      await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);
      await new Promise(r=>setTimeout(r,300));
      const metrics=await evaluate("({overflow:document.documentElement.scrollWidth>innerWidth,columns:getComputedStyle(document.querySelector('.reviewsGrid')).gridTemplateColumns.split(' ').length,background:getComputedStyle(document.querySelector('.reviewCard')).backgroundColor})");
      assert.equal(metrics.overflow,false,`${width} ${theme} overflow`);assert.equal(metrics.columns,columns);layouts.push({width,theme,...metrics});
      if(width===1280||width===390){const shot=await rpc('Page.captureScreenshot',{format:'png'});await writeFile(`REVIEWS_${width}_${theme}.png`,Buffer.from(shot.data,'base64'));}
    }
    await rpc('Page.navigate',{url:base+'/client/dashboard'});await wait("document.querySelector('.clientMenuButton')&&Object.keys(document.querySelector('.clientMenuButton')).some(key=>key.startsWith('__reactProps'))");
    await evaluate("document.querySelector('.clientMenuButton').click()");await wait("document.querySelector('#client-sidebar').open");
    await evaluate("document.querySelector('#client-sidebar a[href=\"/client/dashboard?view=reviews\"]').click()");
    await wait("document.querySelector('.reviewsHeading button')&&!document.querySelector('.reviewsPanel').getAttribute('aria-busy').includes('true')");
    assert.equal(await evaluate("location.pathname==='/client/dashboard'&&new URLSearchParams(location.search).get('view')==='reviews'&&!!document.querySelector('.dashTop')&&!document.querySelector('.publicHeader')&&!document.querySelector('#client-sidebar').open"),true,'Reviews must open inside the customer portal');
    await evaluate("document.querySelector('.reviewsHeading button').click()");await wait("document.querySelector('.reviewDialog').open&&!document.querySelector('[name=appointmentId]')");

    assert.equal(await evaluate("document.querySelector('[name=reviewCategory]')===null"),true);
    await evaluate("document.querySelector('.reviewStarSelector label:nth-child(3) input').click();document.querySelector('.reviewStarSelector label:nth-child(3) input').focus()");
    await rpc('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});await rpc('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
    await wait("document.querySelector('.reviewStarSelector label:nth-child(4) input').checked");
    await evaluate("document.querySelector('[name=message]').value='<b>Safe text</b> Browser test from an isolated browser test'");
    await wait("!document.querySelector('.reviewDialog button.primaryButton').disabled");await evaluate("document.querySelector('.reviewDialog button.primaryButton').click()");
    await wait("!document.querySelector('.reviewDialog').open");
    await wait("Array.from(document.querySelectorAll('.reviewCard')).some(c=>c.textContent.includes('Browser test'))");
    assert.equal(await evaluate("document.querySelector('.reviewMessage b')!==null"),false,'Review HTML must remain escaped text');
    if(productReservationId){
      await evaluate("document.querySelector('.reviewsHeading button').click()");

      await wait("document.querySelector('.reviewDialog').open");
      await evaluate("document.querySelector('.reviewStarSelector label:nth-child(5) input').click();document.querySelector('.reviewDialog [name=message]').value='Product browser test: pickup went well.'");
      await wait("!document.querySelector('.reviewDialog button.primaryButton').disabled");await evaluate("document.querySelector('.reviewDialog button.primaryButton').click()");
      await wait("!document.querySelector('.reviewDialog').open&&Array.from(document.querySelectorAll('.reviewCard')).some(c=>c.textContent.includes('Product browser test'))");
    }
    await writeFile('REVIEWS_BROWSER_RESULTS.json',JSON.stringify({layouts,keyboardStars:'passed',submission:'passed',productSubmission:productReservationId?'passed':'not requested',automaticContentScreening:'passed',safeTextRendering:'passed'},null,2));
  }finally{if(send&&ws?.readyState===WebSocket.OPEN){try{await send('Browser.close');}catch{}}ws?.close();browser.kill();}
}
