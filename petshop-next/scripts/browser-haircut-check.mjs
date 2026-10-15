import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

export async function checkHaircutBrowser(base,cookie,expected){
  const port=39233;
  const browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-background-networking','--no-first-run',`--remote-debugging-port=${port}`,`--user-data-dir=${resolve('.audit-browser-profile-'+randomBytes(4).toString('hex'))}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
  let ws,send;
  try{
    let metadata;for(let i=0;i<60;i++){try{metadata=await(await fetch(`http://localhost:${port}/json/version`)).json();break;}catch{}await new Promise(r=>setTimeout(r,200));}
    assert.ok(metadata);ws=new WebSocket(metadata.webSocketDebuggerUrl);await new Promise((yes,no)=>{ws.addEventListener('open',yes,{once:true});ws.addEventListener('error',no,{once:true});});
    let id=0;const pending=new Map();ws.addEventListener('message',e=>{const msg=JSON.parse(e.data),item=pending.get(msg.id);if(item){pending.delete(msg.id);msg.error?item.reject(new Error(msg.error.message)):item.resolve(msg.result);}});
    send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const next=++id;pending.set(next,{resolve,reject});ws.send(JSON.stringify({id:next,method,params,...(sessionId?{sessionId}:{})}));});
    const{targetId}=await send('Target.createTarget',{url:'about:blank'});const{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});const rpc=(method,params={})=>send(method,params,sessionId);
    const evaluate=async expression=>{const r=await rpc('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||'Evaluation failed');return r.result.value;};
    const wait=async expression=>{for(let i=0;i<150;i++){if(await evaluate(`Boolean(${expression})`))return;await new Promise(r=>setTimeout(r,200));}throw new Error('Timed out: '+expression);};
    await rpc('Page.enable');await rpc('Network.enable');await rpc('Emulation.setFocusEmulationEnabled',{enabled:true});await send('Target.activateTarget',{targetId});const[name,...v]=cookie.split('=');await rpc('Network.setCookie',{name,value:v.join('='),url:base,httpOnly:true,sameSite:'Lax'});
    await rpc('Page.navigate',{url:base+'/client/dashboard?view=grooming'});await wait("document.querySelector('.haircutGallery')&&document.querySelector('.bookingForm')");
    const initial=await evaluate("({time:performance.timeOrigin,style:document.querySelector('[name=styleId]').value,appointments:document.querySelectorAll('.clientListItem').length})");
    const formatter=new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'});const layouts=[];
    for(const width of [1280,1199,768,767,390,320])for(const theme of ['light','dark']){
      await rpc('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<768});await evaluate(`if(document.documentElement.dataset.theme!=='${theme}')document.querySelector('.themeToggle').click()`);
      for(const style of expected){
        await evaluate(`Array.from(document.querySelectorAll('.haircutSelectors button')).find(b=>b.textContent.includes(${JSON.stringify(style.name)})).click()`);
        await wait(`document.querySelector('.haircutInformation h3').textContent===${JSON.stringify(style.name)}&&document.querySelector('.haircutMainImage img')?.naturalWidth>0`);
        assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('.haircutInformation tbody tr')).map(r=>({size:r.querySelector('th').textContent,price:r.querySelector('td').textContent}))"),style.prices.map(p=>({size:p.size,price:formatter.format(Number(p.amount))})));
        assert.equal(await evaluate("document.querySelectorAll('.haircutSelectors button[aria-pressed=true]').length"),1);
        assert.equal(await evaluate("document.querySelector('.haircutMainImage img').alt"),style.name+' grooming style');
        assert.equal(await evaluate("performance.timeOrigin"),initial.time);assert.equal(await evaluate("document.querySelector('[name=styleId]').value"),initial.style);
      }
      assert.ok(await evaluate("document.documentElement.scrollWidth<=innerWidth"));
      assert.equal(await evaluate("getComputedStyle(document.querySelector('.groomingWorkspace')).gridTemplateColumns.split(' ').length"),width<=900?1:2);
      if(width===1280||width===390){const shot=await rpc('Page.captureScreenshot',{format:'png'});await writeFile(`HAIRCUT_${width}_${theme.toUpperCase()}.png`,Buffer.from(shot.data,'base64'));}
      layouts.push({width,theme});
    }
    await evaluate("document.querySelector('.haircutSelectors button').focus()");await rpc('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r',windowsVirtualKeyCode:13});await rpc('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await wait("document.querySelector('.haircutSelectors button').getAttribute('aria-pressed')==='true'");
    // Force an image load failure: preserve the style/prices and show the neutral fallback.
    await evaluate("document.querySelector('.haircutMainImage img').dispatchEvent(new Event('error'))");await wait("document.querySelector('.haircutMainImage .haircutPlaceholder')");
    assert.equal(await evaluate("document.querySelectorAll('.haircutInformation tbody tr').length"),5);
    await writeFile('HAIRCUT_BROWSER_RESULTS.json',JSON.stringify({selection:'passed',prices:'passed',originalImages:'passed',noReload:'passed',bookingSelectionUnchanged:'passed',keyboard:'passed',missingImageFallback:'passed',layouts},null,2));
  }finally{if(send&&ws?.readyState===WebSocket.OPEN){try{await send('Browser.close');}catch{}}ws?.close();browser.kill();}
}
