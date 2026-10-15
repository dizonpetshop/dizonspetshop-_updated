import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
export async function browserSession(port=40000+randomBytes(2).readUInt16BE(0)%10000){
  const browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--disable-background-networking',`--remote-debugging-port=${port}`,`--user-data-dir=${resolve('.audit-cart-'+randomBytes(4).toString('hex'))}`,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
  let errors='';browser.stderr.on('data',chunk=>{errors+=chunk;});
  let metadata;for(let i=0;i<40;i++){try{metadata=await(await fetch(`http://127.0.0.1:${port}/json/version`,{signal:AbortSignal.timeout(1000)})).json();break;}catch{}if(browser.exitCode!==null)break;await new Promise(r=>setTimeout(r,200));}
  if(!metadata){browser.kill();throw new Error('Chrome did not start: '+errors.slice(-500));}
  const ws=new WebSocket(metadata.webSocketDebuggerUrl);await new Promise((yes,no)=>{ws.addEventListener('open',yes,{once:true});ws.addEventListener('error',no,{once:true});});
  let id=0;const pending=new Map();ws.addEventListener('message',event=>{const m=JSON.parse(event.data),job=pending.get(m.id);if(job){pending.delete(m.id);clearTimeout(job.timeout);m.error?job.reject(new Error(m.error.message)):job.resolve(m.result);}});
  const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const next=++id;const timeout=setTimeout(()=>{pending.delete(next);reject(new Error('Browser command timed out: '+method));},15000);pending.set(next,{resolve,reject,timeout});ws.send(JSON.stringify({id:next,method,params,...(sessionId?{sessionId}:{})}));});
  const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
  const rpc=(method,params={})=>send(method,params,sessionId);
  const evaluate=async expression=>{const r=await rpc('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||'Browser evaluation failed');return r.result.value;};
  const wait=async expression=>{for(let i=0;i<150;i++){if(await evaluate(`Boolean(${expression})`))return;await new Promise(r=>setTimeout(r,150));}throw new Error('Timed out: '+expression);};
  await rpc('Page.enable');await rpc('Network.enable');await rpc('Emulation.setFocusEmulationEnabled',{enabled:true});await send('Target.activateTarget',{targetId});
  return {rpc,evaluate,wait,setCookie:async(base,cookie)=>{const [name,...parts]=cookie.split('=');await rpc('Network.setCookie',{name,value:parts.join('='),url:base,httpOnly:true,sameSite:'Lax'});},close:async()=>{try{await send('Browser.close');}catch{}ws.close();browser.kill();}};
}
