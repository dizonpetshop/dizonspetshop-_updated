import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

export async function checkAddPetBrowser(base, cookie, prisma, emptyOnly = false) {
  const port=39230;
  const browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-background-networking','--no-first-run','--no-default-browser-check',`--remote-debugging-port=${port}`,`--user-data-dir=${resolve(`.audit-browser-profile-${randomBytes(4).toString('hex')}`)}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
  let ws,send,debug;
  try {
    let metadata;
    for(let i=0;i<50;i++){try{metadata=await(await fetch(`http://localhost:${port}/json/version`)).json();break;}catch{}await new Promise(r=>setTimeout(r,200));}
    assert.ok(metadata?.webSocketDebuggerUrl,'Browser startup');
    ws=new WebSocket(metadata.webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
    let id=0;const waiting=new Map();
    ws.addEventListener('message',event=>{const message=JSON.parse(event.data);const pending=waiting.get(message.id);if(!pending)return;waiting.delete(message.id);message.error?pending.reject(new Error(message.error.message)):pending.resolve(message.result);});
    send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const current=++id;waiting.set(current,{resolve,reject});ws.send(JSON.stringify({id:current,method,params,...(sessionId?{sessionId}:{})}));});
    const{targetId}=await send('Target.createTarget',{url:'about:blank'});const{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
    const rpc=(method,params)=>send(method,params,sessionId);
    const evaluate=async expression=>{const r=await rpc('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error('Browser evaluation failed');return r.result.value;};
    const waitFor=async expression=>{for(let i=0;i<100;i++){try{if(await evaluate(`Boolean(${expression})`))return;}catch{}await new Promise(r=>setTimeout(r,200));}throw new Error(`Browser state timed out: ${expression}`);};
    const enterName=async name=>{await evaluate("document.querySelector('.addPetForm input[name=petName]').focus()");await rpc('Input.insertText',{text:name});};
    const chooseFile=async path=>{const{root}=await rpc('DOM.getDocument');const{nodeId}=await rpc('DOM.querySelector',{nodeId:root.nodeId,selector:'.addPetFileInput'});await rpc('DOM.setFileInputFiles',{nodeId,files:[path]});};
    debug=async()=>{const screenshot=await rpc('Page.captureScreenshot',{format:'png'});await writeFile('ADD_PET_DEBUG.png',Buffer.from(screenshot.data,'base64'));};
    await rpc('Page.enable');await rpc('Network.enable');await rpc('DOM.enable');
    const[name,...value]=cookie.split('=');await rpc('Network.setCookie',{name,value:value.join('='),url:base,httpOnly:true,sameSite:'Lax'});
    await rpc('Page.navigate',{url:base+'/client/dashboard?view=pets'});
    await waitFor("Object.keys(document.querySelector('.addPetForm input') || {}).some(key=>key.startsWith('__reactProps$'))");
    if(emptyOnly){
      await waitFor("document.querySelector('.myPetsEmpty h2')?.textContent==='No pets added yet'");
      assert.equal(await evaluate("document.querySelectorAll('.myPetCard').length"),0);
      await evaluate("document.querySelector('.myPetsEmpty button').click()");
      await waitFor("document.querySelector('.addPetPanel').open && document.activeElement.name==='petName'");
      await enterName('First pet from empty list');await evaluate("document.querySelector('.addPetForm').requestSubmit()");
      await waitFor("document.querySelector('.myPetInfo h2')?.textContent==='First pet from empty list' && !document.querySelector('.myPetsEmpty')");
      await writeFile('MY_PETS_EMPTY_RESULTS.json',JSON.stringify({emptyState:'passed',firstPetButton:'passed',newAccountProfile:'passed',automaticListRefresh:'passed'},null,2));return;
    }
    await evaluate("document.querySelector('.addPetPanel').open=true");
    assert.equal(await evaluate("document.querySelectorAll('.addPetForm [name=breed],.addPetForm [name=ageDob],.addPetForm [name=gender]').length"),0);
    assert.deepEqual(await evaluate("Array.from(document.querySelector('.addPetForm select').options).map(o=>o.value)"),['Dog','Cat','Other']);
    const layouts=[];
    for(const width of [1280,390,320])for(const theme of ['light','dark']){
      await rpc('Emulation.setDeviceMetricsOverride',{width,height:950,deviceScaleFactor:1,mobile:width<768});
      await evaluate(`if(document.documentElement.dataset.theme!=='${theme}')document.querySelector('.themeToggle').click()`);
      await waitFor("document.querySelector('.addPetForm').getBoundingClientRect().right<=innerWidth");
      const columns=await evaluate("getComputedStyle(document.querySelector('.addPetFields')).gridTemplateColumns.split(' ').length");assert.equal(columns,width===1280?2:1);
      assert.ok(await evaluate("document.documentElement.scrollWidth<=innerWidth"),'No horizontal overflow');
      if(width!==320){const screenshot=await rpc('Page.captureScreenshot',{format:'png'});await writeFile(`ADD_PET_${width}_${theme.toUpperCase()}.png`,Buffer.from(screenshot.data,'base64'));}
      layouts.push({width,theme,columns});
    }
    await evaluate("document.querySelector('.addPetForm').requestSubmit()");
    await waitFor("document.querySelector('.addPetFields input').getAttribute('aria-invalid')==='true'");
    const customer=await prisma.customer.findFirst({where:{email:'client@audit.invalid'}});
    const historical=await prisma.pet.findMany({where:{customerId:customer.id}});
    await enterName('Browser pet without photo');
    await evaluate("{const select=document.querySelector('.addPetForm select');select.value='Cat';select.dispatchEvent(new Event('change',{bubbles:true}));}");
    await rpc('Network.emulateNetworkConditions',{offline:false,latency:250,downloadThroughput:-1,uploadThroughput:-1});
    await evaluate("{const form=document.querySelector('.addPetForm');form.requestSubmit();form.requestSubmit();}");
    await waitFor("document.querySelector('.addPetSubmit').disabled && document.querySelector('.addPetSubmit').textContent.includes('Saving')");
    await waitFor("document.querySelector('.addPetNotice.success')");
    await rpc('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
    assert.equal(await prisma.pet.count({where:{customerId:customer.id,petName:'Browser pet without photo'}}),1);
    const first=await prisma.pet.findFirst({where:{customerId:customer.id,petName:'Browser pet without photo'}});assert.equal(first.species,'Cat');assert.equal(first.photoPath,null);assert.equal(first.breed,null);assert.equal(first.ageDob,null);assert.equal(first.gender,null);
    await waitFor("Array.from(document.querySelectorAll('.myPetInfo h2')).some(input=>input.textContent==='Browser pet without photo')");
    assert.equal(await evaluate("document.querySelector('.addPetForm input[name=petName]').value"),'');
    await evaluate("document.querySelector('.addPetPanel summary').click()");
    await enterName('Browser pet with photo');
    const invalid=resolve('.audit-pet-invalid.txt');await writeFile(invalid,'unsupported test file');
    await chooseFile(invalid);await waitFor("document.querySelector('.addPetPhotoField .addPetError')");
    assert.equal(await evaluate("document.querySelector('.addPetForm input[name=petName]').value"),'Browser pet with photo');
    await evaluate("document.querySelector('.addPetRemovePhoto').click()");
    const oversize=resolve('.audit-pet-oversize.jpg');await writeFile(oversize,Buffer.alloc(1_500_001));await chooseFile(oversize);await waitFor("document.querySelector('.addPetPhotoField .addPetError')?.textContent.includes('1.5 MB')");
    await evaluate("document.querySelector('.addPetRemovePhoto').click()");
    const image=resolve('public/products/beefteriyaki.jpg');await chooseFile(image);
    await waitFor("document.querySelector('.addPetPhotoPreview img')?.complete && document.querySelector('.addPetPhotoPreview img')?.naturalWidth>0");
    await evaluate("document.querySelector('.addPetRemovePhoto').click()");await waitFor("!document.querySelector('.addPetPhotoPreview img')");
    await evaluate("(async()=>{const bytes=await(await fetch('/products/beefteriyaki.jpg')).arrayBuffer();const transfer=new DataTransfer();transfer.items.add(new File([bytes],'dropped-pet.jpg',{type:'image/jpeg'}));document.querySelector('.addPetUpload').dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:transfer}));})()");await waitFor("document.querySelector('.addPetPhotoPreview img')?.naturalWidth>0");
    await evaluate("{window.__petFetch=window.fetch;window.fetch=(url,options)=>options?.method==='POST'?Promise.reject(new Error('Test request failure')):window.__petFetch(url,options);document.querySelector('.addPetForm').requestSubmit();}");
    await waitFor("document.querySelector('.addPetNotice.error')");
    assert.equal(await evaluate("document.querySelector('.addPetForm input[name=petName]').value"),'Browser pet with photo');assert.ok(await evaluate("document.querySelector('.addPetPhotoPreview img').naturalWidth>0"));
    assert.equal(await prisma.pet.count({where:{customerId:customer.id,petName:'Browser pet with photo'}}),0);
    await evaluate("window.fetch=window.__petFetch;delete window.__petFetch;document.querySelector('.addPetForm').requestSubmit()");
    await waitFor("document.querySelector('.addPetNotice.success') && !document.querySelector('.addPetPhotoPreview img')");
    const second=await prisma.pet.findFirst({where:{customerId:customer.id,petName:'Browser pet with photo'}});assert.ok(second.photoPath.startsWith('data:image/jpeg;base64,'));
    await waitFor("Array.from(document.querySelectorAll('.myPetInfo h2')).some(input=>input.textContent==='Browser pet with photo')");
    for(const old of historical){const current=await prisma.pet.findUnique({where:{id:old.id}});assert.equal(current.breed,old.breed);assert.equal(current.ageDob,old.ageDob);assert.equal(current.gender,old.gender);assert.equal(current.photoPath,old.photoPath);}
    const cards=[];
    for(const width of [1280,1199,768,767,390,320])for(const theme of ['light','dark']){
      await rpc('Emulation.setDeviceMetricsOverride',{width,height:950,deviceScaleFactor:1,mobile:width<768});await evaluate(`if(document.documentElement.dataset.theme!=='${theme}')document.querySelector('.themeToggle').click()`);
      await waitFor("document.querySelector('.myPetsGrid').getBoundingClientRect().right<=innerWidth");
      const columns=await evaluate("getComputedStyle(document.querySelector('.myPetsGrid')).gridTemplateColumns.split(' ').length");assert.equal(columns,width>=1200?3:width>=768?2:1);
      assert.ok(await evaluate("{const cards=Array.from(document.querySelectorAll('.myPetCard'));const heights=cards.map(c=>c.getBoundingClientRect().height);cards[0].querySelector('h2').textContent='An exceptionally long pet name that must remain balanced across the entire card layout';cards.every(c=>c.querySelector('h2').getBoundingClientRect().height<=56.1)&&Math.max(...heights)-Math.min(...heights)<1}"));
      assert.ok(await evaluate("{const cards=Array.from(document.querySelectorAll('.myPetCard'));cards.every(c=>{const buttons=Array.from(c.querySelectorAll('.myPetActions button'));return Math.abs(buttons[0].getBoundingClientRect().height-buttons[1].getBoundingClientRect().height)<1&&buttons.every(b=>b.getBoundingClientRect().right<=c.getBoundingClientRect().right)})}"));
      assert.ok(await evaluate("{const cards=Array.from(document.querySelectorAll('.myPetCard'));const heights=cards.map(c=>c.getBoundingClientRect().height);const gaps=cards.map(c=>c.getBoundingClientRect().bottom-c.querySelector('.myPetActions').getBoundingClientRect().bottom);Math.max(...heights)-Math.min(...heights)<1&&Math.max(...gaps)-Math.min(...gaps)<1&&cards.every(c=>getComputedStyle(c.querySelector('.myPetActions')).flexDirection==='column')}"));
      assert.ok(await evaluate("document.documentElement.scrollWidth<=innerWidth"));
      assert.equal(await evaluate("document.querySelector('.myPetsToolbar button')===null"),true);
      assert.ok(await evaluate("Array.from(document.querySelectorAll('.myPetInfo')).every(info=>getComputedStyle(info).textAlign==='center')"));
      assert.ok(await evaluate("Array.from(document.querySelectorAll('.myPetPhoto img')).every(img=>{const photo=img.parentElement,frame=photo.getBoundingClientRect(),image=img.getBoundingClientRect();return getComputedStyle(img).objectFit==='cover'&&frame.height===260&&Math.abs(image.width-frame.width)<1&&image.height===260&&getComputedStyle(photo).overflow==='hidden'})"));
      const screenshot=await rpc('Page.captureScreenshot',{format:'png'});if(width!==768)await writeFile(`MY_PETS_${width}_${theme.toUpperCase()}.png`,Buffer.from(screenshot.data,'base64'));cards.push({width,theme,columns});
    }
    await evaluate(`document.querySelector('[data-pet-id="${second.id}"] .myPetEditButton').click()`);
    await waitFor("document.querySelector('.myPetDialog[open] .editPetForm') && document.querySelector('.editPetForm .addPetPhotoPreview img')?.naturalWidth>0");
    assert.equal(await evaluate("document.querySelector('.editPetForm input[name=petName]').value"),'Browser pet with photo');assert.equal(await evaluate("document.querySelector('.editPetForm select').value"),'Dog');
    assert.equal(await evaluate("document.querySelectorAll('.myPetsManagement [name=breed],.myPetsManagement [name=ageDob],.myPetsManagement [name=gender]').length"),0);
    await evaluate("{const input=document.querySelector('.editPetForm input[name=petName]');input.focus();input.select();}");await rpc('Input.insertText',{text:'Renamed browser pet'});
    await evaluate("{const select=document.querySelector('.editPetForm select');select.value='Cat';select.dispatchEvent(new Event('change',{bubbles:true}));}");
    const {root:editRoot}=await rpc('DOM.getDocument');const{nodeId:editInput}=await rpc('DOM.querySelector',{nodeId:editRoot.nodeId,selector:'.editPetForm .addPetFileInput'});await rpc('DOM.setFileInputFiles',{nodeId:editInput,files:[resolve('public/products/AOZI.jpg')]});
    await waitFor("document.querySelector('.editPetForm .addPetPhotoPreview img')?.src.startsWith('blob:') && document.querySelector('.editPetForm .addPetPhotoPreview img')?.naturalWidth>0");
    await evaluate("document.querySelector('.editPetForm').requestSubmit()");
    await waitFor(`!document.querySelector('.myPetDialog[open]') && document.querySelector('[data-pet-id="${second.id}"] h2')?.textContent==='Renamed browser pet'`);
    const updated=await prisma.pet.findUnique({where:{id:second.id}});assert.equal(updated.species,'Cat');assert.notEqual(updated.photoPath,second.photoPath);
    await waitFor(`document.querySelector('[data-pet-id="${second.id}"] img')?.naturalWidth>0`);
    await evaluate(`document.querySelector('[data-pet-id="${second.id}"] .myPetRemoveButton').click()`);await waitFor("document.querySelector('.myPetRemoveDialog[open]')");
    assert.ok(await evaluate("document.querySelector('#remove-pet-title').textContent.includes('Renamed browser pet')"));
    await evaluate("document.querySelector('.myPetConfirmActions button:first-child').click()");await waitFor("!document.querySelector('.myPetRemoveDialog[open]')");assert.equal((await prisma.pet.findUnique({where:{id:second.id}})).isActive,1);
    const historyCount=await prisma.groomingAppointment.count();const petCount=await prisma.pet.count();
    await evaluate(`document.querySelector('[data-pet-id="${second.id}"] .myPetRemoveButton').click()`);await waitFor("document.querySelector('.myPetRemoveDialog[open]')");
    await evaluate("{const button=document.querySelector('.myPetConfirmRemove');button.click();button.click();}");
    await waitFor(`!document.querySelector('.myPetRemoveDialog[open]') && !document.querySelector('[data-pet-id="${second.id}"]')`);
    assert.equal((await prisma.pet.findUnique({where:{id:second.id}})).isActive,0);assert.equal(await prisma.pet.count(),petCount);assert.equal(await prisma.groomingAppointment.count(),historyCount);
    await rpc('Page.navigate',{url:base+'/client/dashboard?view=grooming'});
    await waitFor("document.querySelector('select[name=petId]')");assert.ok(await evaluate(`Array.from(document.querySelector('select[name=petId]').options).some(option=>option.value==='${first.id}')`));assert.equal(await evaluate(`Array.from(document.querySelector('select[name=petId]').options).some(option=>option.value==='${second.id}')`),false);
    const result={layouts,cards,removedFields:'passed',requiredValidation:'passed',optionalPhoto:'passed',previewAndRemoval:'passed',dragAndDrop:'passed',typeAndSizeValidation:'passed',duplicateSubmission:'passed',failureRetention:'passed',resetAndListRefresh:'passed',historicalData:'passed',bookingSelection:'passed',editAndPhotoReplacement:'passed',removeCancel:'passed',confirmedSoftRemoval:'passed',removedBookingExclusion:'passed'};await writeFile('ADD_PET_BROWSER_RESULTS.json',JSON.stringify(result,null,2));return result;
  }catch(error){try{await debug?.();}catch{}throw error;}finally{if(send&&ws?.readyState===WebSocket.OPEN){try{await send('Browser.close');}catch{}}ws?.close();browser.kill();}
}
