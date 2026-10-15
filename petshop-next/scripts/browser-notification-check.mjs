import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

export async function checkNotificationBrowser(base, cookie, portal, verifyRead, emptyOnly = false) {
  const port = 39229;
  const browser = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-background-networking', '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${port}`, `--user-data-dir=${resolve(`.audit-browser-profile-${randomBytes(4).toString('hex')}`)}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let ws, send, debugSnapshot;
  const browserErrors = [];
  try {
    let metadata;
    for (let i = 0; i < 50; i++) { try { metadata = await (await fetch(`http://localhost:${port}/json/version`)).json(); break; } catch {} await new Promise(r => setTimeout(r, 200)); }
    assert.ok(metadata?.webSocketDebuggerUrl, 'Browser startup failed');
    ws = new WebSocket(metadata.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
    let id = 0; const waiting = new Map();
    ws.addEventListener('message', event => { const message = JSON.parse(event.data); if (message.method === 'Runtime.exceptionThrown') browserErrors.push(message.params.exceptionDetails.exception?.description?.split('\n')[0] || message.params.exceptionDetails.text); const pending = waiting.get(message.id); if (!pending) return; waiting.delete(message.id); message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result); });
    send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const current = ++id; waiting.set(current, { resolve, reject }); ws.send(JSON.stringify({ id: current, method, params, ...(sessionId ? { sessionId } : {}) })); });
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const rpc = (method, params) => send(method, params, sessionId);
    const evaluate = async expression => { const r = await rpc('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error('Browser evaluation failed'); return r.result.value; };
    debugSnapshot = async () => {
      const state = await evaluate("({path:location.pathname, bell:!!document.querySelector('.notificationBell'), badge:!!document.querySelector('.notificationBadge'), panel:!!document.querySelector('.notificationDropdown'), error:document.querySelector('.notificationError')?.textContent, busy:document.querySelector('.notificationPreview')?.getAttribute('aria-busy'), body:document.body.innerText.slice(0,400)})");
      await writeFile(`NOTIFICATION_${portal.toUpperCase()}_DEBUG.json`, JSON.stringify({state,browserErrors}, null, 2));
      const screenshot = await rpc('Page.captureScreenshot', {format:'png'}); await writeFile(`NOTIFICATION_${portal.toUpperCase()}_DEBUG.png`, Buffer.from(screenshot.data,'base64'));
    };
    const waitFor = async expression => { for (let i = 0; i < 100; i++) { try { if (await evaluate(`Boolean(${expression})`)) return; } catch {} await new Promise(r => setTimeout(r, 200)); } throw new Error(`Browser state timed out: ${expression}`); };
    const open = async () => {
      // Admin unread badges render on the server; wait for React handlers before clicking.
      await waitFor("Object.keys(document.querySelector('.notificationBell') || {}).some(key => key.startsWith('__reactProps$'))");
      await evaluate("if (document.querySelector('.notificationBell').getAttribute('aria-expanded') !== 'true') document.querySelector('.notificationBell').click()");
      await waitFor("document.querySelector('.notificationDropdown') && document.querySelector('.notificationPreview[aria-busy=false]')");
    };
    await rpc('Page.enable'); await rpc('Network.enable'); await rpc('Runtime.enable');
    await rpc('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
    const [name, ...value] = cookie.split('=');
    await rpc('Network.setCookie', { name, value: value.join('='), url: base, httpOnly: true, sameSite: 'Lax' });
    await rpc('Page.navigate', { url: `${base}/${portal}/dashboard${emptyOnly ? '?view=notifications' : ''}` });
    if (emptyOnly) {
      await waitFor("document.querySelector('.notificationEmptyCard b')?.textContent === 'No notifications yet'");
      const results = [];
      for (const width of [1280, 390, 320]) for (const theme of ['light', 'dark']) {
        await rpc('Emulation.setDeviceMetricsOverride', {width,height:850,deviceScaleFactor:1,mobile:width<768});
        await evaluate(`if (document.documentElement.dataset.theme !== '${theme}') document.querySelector('.themeToggle').click()`);
        await waitFor(`document.documentElement.dataset.theme === '${theme}'`);
        await waitFor("(() => {const r=document.querySelector('.notificationEmptyCard').getBoundingClientRect(); return r.left>=0 && r.right<=innerWidth && r.height<=260;})()");
        const appearance = await evaluate("(() => { const card=document.querySelector('.notificationEmptyCard'); const box=card.getBoundingClientRect(); return {background:getComputedStyle(card).backgroundColor, heading:getComputedStyle(card.querySelector('b')).color, description:getComputedStyle(card.querySelector('p')).color, text:card.querySelector('p').textContent, icon:!!card.querySelector('svg'), circular:getComputedStyle(card.querySelector('span')).borderRadius==='50%', fits:box.left>=0 && box.right<=innerWidth, height:box.height}; })()");
        const rgb = value => { const values = value.match(/[\d.]+/g).map(Number); return value.startsWith('color(srgb') ? values.slice(0,3) : values.slice(0,3).map(n=>n/255); };
        const luminance = value => rgb(value).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[0.2126,0.7152,0.0722][i],0);
        const contrast = (a,b) => { const values=[luminance(a),luminance(b)].sort((a,b)=>b-a); return (values[0]+0.05)/(values[1]+0.05); };
        assert.ok(contrast(appearance.heading,appearance.background)>=4.5,'Heading contrast');
        assert.ok(contrast(appearance.description,appearance.background)>=4.5,'Description contrast');
        assert.ok(appearance.fits && appearance.height<=260,'Compact card must fit viewport');
        assert.ok(appearance.icon && appearance.circular,'Bell in circular highlight');
        assert.equal(appearance.text,'Reservation and appointment updates will appear here.');
        const brightness=rgb(appearance.background).reduce((a,b)=>a+b,0)/3;
        assert.ok(theme==='dark'?brightness<0.3:brightness>0.8,'Correct theme surface');
        assert.equal(await evaluate("!!document.querySelector('.notificationBadge')"),false);
        await open();
        await waitFor("document.querySelector('.notificationEmpty b')?.textContent === 'No notifications yet'");
        assert.ok(await evaluate("!!document.querySelector('.notificationEmpty svg')"));
        await rpc('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
        await rpc('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
        await waitFor("!document.querySelector('.notificationDropdown')");
        if (width!==320) { const screenshot=await rpc('Page.captureScreenshot',{format:'png'}); await writeFile(`NOTIFICATION_EMPTY_${portal.toUpperCase()}_${width}_${theme.toUpperCase()}.png`,Buffer.from(screenshot.data,'base64')); }
        results.push({width,theme,...appearance});
      }
      await writeFile(`NOTIFICATION_EMPTY_${portal.toUpperCase()}_RESULTS.json`,JSON.stringify(results,null,2));
      return results;
    }
    await waitFor("document.querySelector('.notificationBell') && document.querySelector('.notificationBadge')");
    await evaluate("document.documentElement.dataset.theme='light'");
    const viewports = [];
    for (const width of [1280, 768, 390, 320]) {
      await rpc('Emulation.setDeviceMetricsOverride', { width, height: 850, deviceScaleFactor: 1, mobile: width < 768 });
      await open();
      assert.ok(await evaluate("(() => { const r = document.querySelector('.notificationDropdown').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; })()"), `Dropdown outside ${width}px viewport`);
      if (width === 1280) assert.equal(await evaluate("document.querySelector('.notificationDropdown').offsetWidth"), 400);
      assert.ok(await evaluate("document.querySelector('.notificationPreview').scrollHeight > document.querySelector('.notificationPreview').clientHeight"), 'Long notifications must scroll');
      assert.ok(await evaluate("getComputedStyle(document.querySelector('.notificationRow.isUnread')).backgroundColor !== getComputedStyle(document.querySelector('.notificationRow.isRead')).backgroundColor"), 'Read and unread rows must differ');
      const image = await rpc('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      if ([1280, 390].includes(width)) await writeFile(`NOTIFICATIONS_${portal.toUpperCase()}_${width}.png`, Buffer.from(image.data, 'base64'));
      viewports.push(width);
      await rpc('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await rpc('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await waitFor("!document.querySelector('.notificationDropdown') && document.activeElement.classList.contains('notificationBell')");
    }
    await rpc('Emulation.setDeviceMetricsOverride', { width: 1280, height: 850, deviceScaleFactor: 1, mobile: false });
    await open();
    await evaluate("document.querySelector('.notificationTabs button:last-child').click()");
    await waitFor("document.querySelector('.notificationTabs button:last-child').getAttribute('aria-selected') === 'true' && document.querySelector('.notificationPreview[aria-busy=false]')");
    assert.equal(await evaluate("document.querySelectorAll('.notificationRow.isRead').length"), 0);
    await evaluate("document.querySelector('.notificationTabs button:last-child').focus()");
    await rpc('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 });
    await waitFor("document.querySelector('.notificationTabs button:first-child').getAttribute('aria-selected') === 'true' && document.querySelector('.notificationPreview[aria-busy=false]')");
    await evaluate("{ const button = document.querySelector('.themeToggle'); button.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true})); button.click(); }");
    await waitFor("!document.querySelector('.notificationDropdown') && document.documentElement.dataset.theme === 'dark'");
    await open();
    const dark = await evaluate("getComputedStyle(document.querySelector('.notificationDropdown')).backgroundColor");
    assert.equal(dark, 'rgb(21, 34, 56)');
    const screenshot = await rpc('Page.captureScreenshot', { format: 'png' }); await writeFile(`NOTIFICATIONS_${portal.toUpperCase()}_DARK.png`, Buffer.from(screenshot.data, 'base64'));
    await evaluate("document.querySelector('h1').dispatchEvent(new PointerEvent('pointerdown', {bubbles:true}))");
    await waitFor("!document.querySelector('.notificationDropdown')");
    await open();
    await evaluate(`{ window.__notificationFetch = window.fetch; window.fetch = (url, options) => options?.method === 'POST' && String(url).includes('/api/${portal}/notifications') ? Promise.resolve(new Response('{}', {status:503,headers:{'Content-Type':'application/json'}})) : window.__notificationFetch(url, options); }`);
    await evaluate("Array.from(document.querySelectorAll('.notificationRow')).find(row => row.querySelector('strong').textContent === 'Grooming appointment confirmed').click()");
    await waitFor("document.querySelector('.notificationError[role=alert]') && !document.querySelector('.notificationRow:disabled')");
    await verifyRead('failed');
    await evaluate("window.fetch = window.__notificationFetch; delete window.__notificationFetch");
    await evaluate("Array.from(document.querySelectorAll('.notificationRow')).find(row => row.querySelector('strong').textContent === 'Grooming appointment confirmed').click()");
    await waitFor(`location.search.includes('view=reservations') && !document.querySelector('.notificationDropdown')`);
    await verifyRead('single');
    await open();
    await evaluate("document.querySelector('.notificationMarkAll').click()");
    await waitFor("!document.querySelector('.notificationBadge') && document.querySelector('.notificationMarkAll').disabled && document.querySelector('.notificationPreview[aria-busy=false]')");
    await verifyRead('all');
    await evaluate("document.querySelector('.notificationTabs button:last-child').click()");
    await waitFor("document.querySelector('.notificationEmpty b')?.textContent === \"You're all caught up\"");
    await evaluate("document.querySelector('.notificationFooter').click()");
    await waitFor("location.search.includes('view=notifications') && !document.querySelector('.notificationDropdown')");
    const result = { portal, viewports, scrolling: 'passed', themes: 'passed', tabs: 'passed', keyboard: 'passed', outsideDismissal: 'passed', failedUpdate: 'passed', singleReadAndNavigation: 'passed', markAllDatabaseUpdate: 'passed', badge: 'passed', emptyState: 'passed', viewAll: 'passed' };
    await writeFile(`NOTIFICATION_${portal.toUpperCase()}_TEST_RESULTS.json`, JSON.stringify(result, null, 2));
    return result;
  } catch (error) { try { await debugSnapshot?.(); } catch {} throw error; }
  finally {
    if (send && ws?.readyState === WebSocket.OPEN) { try { await send('Browser.close'); } catch {} }
    ws?.close(); browser.kill();
  }
}
