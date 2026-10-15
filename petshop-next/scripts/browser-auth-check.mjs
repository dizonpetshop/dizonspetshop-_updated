import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

export async function checkBrowserAuthentication(base) {
  const port = 39228;
  const browser = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-background-networking', '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${port}`, `--user-data-dir=${resolve(`.audit-browser-profile-${randomBytes(4).toString('hex')}`)}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let ws;
  let send;
  try {
    let metadata;
    for (let i = 0; i < 50; i++) {
      try { metadata = await (await fetch(`http://localhost:${port}/json/version`)).json(); break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    assert.ok(metadata?.webSocketDebuggerUrl, 'Headless browser could not start');
    ws = new WebSocket(metadata.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
    let id = 0;
    const waiting = new Map();
    ws.addEventListener('message', event => {
      const message = JSON.parse(event.data); const pending = waiting.get(message.id);
      if (!pending) return; waiting.delete(message.id);
      message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result);
    });
    send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      const current = ++id; waiting.set(current, { resolve, reject });
      ws.send(JSON.stringify({ id: current, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const rpc = (method, params) => send(method, params, sessionId);
    const evaluate = async expression => {
      const r = await rpc('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('Browser evaluation failed');
      return r.result.value;
    };
    const waitFor = async expression => {
      for (let i = 0; i < 100; i++) {
        try { if (await evaluate(expression)) return; } catch {}
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      throw new Error('Authentication browser state timed out');
    };
    const submit = async fields => {
      await evaluate(`(() => { const fields = ${JSON.stringify(fields)}; const form = document.querySelector('form'); for (const [name, value] of Object.entries(fields)) form.elements.namedItem(name).value = value; form.requestSubmit(); })()`);
    };
    await rpc('Page.enable'); await rpc('Network.enable');
    await rpc('Page.navigate', { url: base + '/client/register' });
    await waitFor("document.querySelector('input[name=confirmPassword]') !== null");
    const email = `browser-auth-${randomBytes(5).toString('hex')}@audit.invalid`;
    const password = `Ab1!${randomBytes(16).toString('hex')}`;
    await submit({ firstName: 'Browser', surname: 'Check', phone: '09123456789', email, password, confirmPassword: password });
    await waitFor("location.pathname === '/client/login' && document.querySelector('.authSuccess') !== null");
    assert.ok((await evaluate("document.querySelector('.authSuccess').textContent")).includes('Account created successfully.'));
    await submit({ email, password });
    await waitFor("location.pathname === '/client/dashboard' && document.querySelector('.portalNotice') !== null");
    assert.ok((await evaluate("document.querySelector('.portalNotice').textContent")).includes('Login successful. Welcome back!'));
    const cookies = (await rpc('Network.getCookies', { urls: [base] })).cookies;
    const cookie = cookies.find(c => c.name === 'petshop_session');
    assert.ok(cookie?.httpOnly); assert.equal(cookie.sameSite, 'Lax');
    await rpc('Page.navigate', { url: base + '/client/dashboard?view=account' });
    await waitFor("location.pathname === '/client/dashboard' && document.querySelector('input[name=firstName]') !== null");
    assert.equal(await evaluate("document.querySelector('input[name=firstName]').value"), 'Browser');
    await rpc('Page.reload');
    await waitFor("location.pathname === '/client/dashboard' && document.querySelector('input[name=firstName]') !== null");
    await evaluate("document.querySelector('form[action=\"/api/auth/logout\"]').requestSubmit()");
    await waitFor("location.pathname === '/' && document.querySelector('h1') !== null");
    assert.equal((await rpc('Network.getCookies', { urls: [base] })).cookies.some(c => c.name === 'petshop_session'), false);
    await rpc('Page.navigate', { url: base + '/client/dashboard' });
    await waitFor("location.pathname === '/client/login' && document.querySelector('input[name=email]') !== null");
    const result = { registration: 'passed', login: 'passed', sessionCookie: 'passed', navigation: 'passed', refresh: 'passed', logout: 'passed', protectedDashboard: 'passed' };
    await writeFile('AUTH_BROWSER_TEST_RESULTS.json', JSON.stringify(result, null, 2));
    return result;
  } finally {
    if (send && ws?.readyState === WebSocket.OPEN) { try { await send('Browser.close'); } catch {} }
    ws?.close(); browser.kill();
  }
}
