import { spawn } from "node:child_process";
import { writeFile, access } from "node:fs/promises";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";

export async function checkBrowser(base, cookie, prisma) {
  const chromePath = "C:/Program Files/Google/Chrome/Application/chrome.exe";
  await access(chromePath);
  const port = 39227;
  const profile = resolve(`.audit-browser-profile-${randomBytes(4).toString("hex")}`);
  const browser = spawn(chromePath, ["--headless=new", "--disable-background-networking", "--no-first-run", "--no-default-browser-check", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
  let ws;
  let send;
  try {
    let metadata;
    for (let attempt = 0; attempt < 50; attempt++) {
      try { metadata = await (await fetch(`http://localhost:${port}/json/version`)).json(); break; } catch {}
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    assert.ok(metadata?.webSocketDebuggerUrl, "Headless Chrome could not start");
    ws = new WebSocket(metadata.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.addEventListener("open", resolve, { once: true }); ws.addEventListener("error", reject, { once: true }); });
    let id = 0;
    const waiting = new Map();
    ws.addEventListener("message", (event) => { const message = JSON.parse(event.data); const pending = waiting.get(message.id); if (!pending) return; waiting.delete(message.id); message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result); });
    send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const currentId = ++id; waiting.set(currentId, { resolve, reject }); ws.send(JSON.stringify({ id: currentId, method, params, ...(sessionId ? { sessionId } : {}) })); });
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    const rpc = (method, params) => send(method, params, sessionId);
    const evaluate = async (expression) => {
      const response = await rpc("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
      return response.result.value;
    };
    const waitFor = async (expression) => { for (let attempt = 0; attempt < 50; attempt++) { if (await evaluate(`Boolean(${expression})`)) return; await new Promise((resolve) => setTimeout(resolve, 200)); } throw new Error(`Browser state timed out: ${expression}`); };
    await rpc("Page.enable"); await rpc("Network.enable");await rpc('Emulation.setFocusEmulationEnabled',{enabled:true});await send('Target.activateTarget',{targetId});
    await rpc("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
    const [name, ...value] = cookie.split("=");
    await rpc("Network.setCookie", { name, value: value.join("="), url: base, httpOnly: true, sameSite: "Lax" });
    await rpc("Emulation.setDeviceMetricsOverride", { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });
    await rpc("Page.navigate", { url: base + "/client/dashboard?view=products" });
    await waitFor("document.querySelectorAll('.productBrowseCard').length >= 8");
    await waitFor("Array.from(document.querySelectorAll('.productBrowseCard img')).every(img => img.complete && img.naturalWidth > 0)");
    assert.equal(await evaluate("document.querySelectorAll('.productCatalogTools select').length"), 0, "Category dropdown is removed");
    assert.ok(await evaluate("Boolean(document.querySelector('.shopStockLabel') && document.querySelector('.shopSoldOut'))"));
    await evaluate("document.querySelector('.soldOut .productViewTrigger').click()");await waitFor("document.querySelector('.shopProductDialog[open]')");assert.ok(await evaluate("document.querySelector('.shopProductDialog .productReserveTrigger').disabled"));await evaluate("document.querySelector('.shopProductDialog header button').click()");
    const viewports = [];
    for (const [width, columns, filename] of [[1200, 4, "PRODUCTS_DESKTOP_AUDIT.png"], [992, 2, "PRODUCTS_TABLET_AUDIT.png"], [390, 2, "PRODUCTS_MOBILE_AUDIT.png"], [320,1,"PRODUCTS_SMALL_MOBILE_AUDIT.png"]]) {
      await rpc("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
      const actual = await evaluate("getComputedStyle(document.querySelector('.productBrowseGrid')).gridTemplateColumns.split(' ').length"); assert.equal(actual, columns);
      assert.ok(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"), `Horizontal overflow at ${width}px`);
      for(const theme of ['light','dark']){await evaluate(`document.documentElement.dataset.theme='${theme}'`);assert.ok(await evaluate("document.documentElement.scrollWidth<=innerWidth"));const themed=await rpc('Page.captureScreenshot',{format:'png'});if(width===1200||width===390)await writeFile(`PRODUCTS_${width}_${theme.toUpperCase()}.png`,Buffer.from(themed.data,'base64'));}
      const screenshot = await rpc("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }); await writeFile(filename, Buffer.from(screenshot.data, "base64"));
      viewports.push({ width, columns, screenshot: filename });
    }
    await rpc("Emulation.setDeviceMetricsOverride", { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });
    await evaluate("document.querySelector('.productCatalogTools input').focus()");
    await rpc("Input.insertText", { text: "aozi" });
    await waitFor("document.querySelectorAll('.productBrowseCard').length === 1 && document.querySelector('.productBrowseCard h3').textContent === 'Aozi'");
    await evaluate("{ const input = document.querySelector('.productCatalogTools input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ''); input.dispatchEvent(new Event('input', { bubbles: true })); }");
    await waitFor("document.querySelectorAll('.productBrowseCard').length >= 8");
    await evaluate("Array.from(document.querySelectorAll('.shopCategoryTabs button')).find(b=>b.textContent==='Cat Food').click()");
    await waitFor("document.querySelectorAll('.productBrowseCard').length > 0 && Array.from(document.querySelectorAll('.shopCardCopy>small')).every(label => label.textContent === 'Cat Food')");
    await evaluate("document.querySelector('.shopCategoryTabs button').click()");
    await waitFor("document.querySelectorAll('.productBrowseCard').length >= 8");
    await evaluate("Array.from(document.querySelectorAll('.shopCategoryTabs button')).find(b=>b.textContent==='Cat Food').click()");await waitFor("Array.from(document.querySelectorAll('.shopCategoryTabs button')).some(b=>b.textContent==='Cat Food'&&b.getAttribute('aria-pressed')==='true')");await evaluate("document.querySelector('.shopCategoryTabs button').click()");await waitFor("document.querySelectorAll('.productBrowseCard').length>=8");
    await evaluate("Array.from(document.querySelectorAll('.productBrowseCard')).find(card => card.querySelector('h3').textContent === 'Aozi').querySelector('.productViewTrigger').click()");
    await waitFor("document.querySelector('.shopProductDialog[open] .shopDetailPhoto img')?.naturalWidth>0");
    assert.ok(await evaluate("document.querySelector('.shopDetailPhoto img').getBoundingClientRect().height<=document.querySelector('.shopDetailPhoto').clientHeight"),'Product detail image fits its frame');
    await rpc('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await rpc('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await waitFor("!document.querySelector('.shopProductDialog[open]')");
    await evaluate("Array.from(document.querySelectorAll('.productBrowseCard')).find(card=>card.querySelector('h3').textContent==='Aozi').querySelector('.productViewTrigger').click()");await waitFor("document.querySelector('.shopProductDialog[open]')");
    const details=await rpc('Page.captureScreenshot',{format:'png'});await writeFile('PRODUCT_DETAILS_AUDIT.png',Buffer.from(details.data,'base64'));
    await evaluate("{const input=document.querySelector('.shopDetailPrice input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'2');input.dispatchEvent(new Event('input',{bubbles:true}));}");
    await evaluate("document.querySelector('.shopProductDialog .productReserveTrigger').click()");
    await waitFor("document.querySelector('.productReserveForm') !== null");
    assert.equal(await evaluate("Number(document.querySelector('.productReserveForm input[name=quantity]').max)"), 2);
    assert.equal(await evaluate("document.querySelector('.productReserveForm input[name=quantity]').value"),'2');
    assert.ok(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "Reservation form causes horizontal overflow");
    for(const width of [1280,768,390,320])for(const theme of ['light','dark']){await rpc('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768});await evaluate(`document.documentElement.dataset.theme='${theme}'`);assert.ok(await evaluate("document.querySelector('.shopProductDialog').getBoundingClientRect().width<=innerWidth && document.querySelector('.shopProductDialog').scrollWidth<=document.querySelector('.shopProductDialog').clientWidth"));const shot=await rpc('Page.captureScreenshot',{format:'png'});if(width===1280||width===390)await writeFile(`PRODUCT_RESERVATION_${width}_${theme.toUpperCase()}.png`,Buffer.from(shot.data,'base64'));}
    const tomorrow=new Date(Date.now()+8*3600000+86400000).toISOString().slice(0,10);
    await evaluate(`document.querySelector('[name=pickupDate]').value='${tomorrow}';document.querySelector('[name=pickupTime]').value='12:00';document.querySelector('[name=contactNumber]').value='09123456789';document.querySelector('[name=address]').value='Isolated browser pickup address';document.querySelector('[name=paymentMethod][value=GCash]').click();document.querySelector('.productReserveForm').requestSubmit()`);
    await waitFor("location.search.includes('view=reservations') && !document.querySelector('.shopProductDialog[open]')");
    if(prisma){const product=await prisma.product.findFirst({where:{productName:'Aozi'}});assert.equal(product.stockQuantity,0);const reservation=await prisma.productReservation.findFirst({where:{items:{some:{productId:product.productId}}},include:{items:true}});assert.equal(reservation.items[0].quantity,2);assert.equal(Number(reservation.totalAmount),Number(product.price)*2);}
    await writeFile("BROWSER_TEST_RESULTS.json", JSON.stringify({ viewports, search: "passed", category: "passed", images: "passed", badges: "passed", buttons: "passed", reservationInterface: "passed" }, null, 2));
    return viewports;
  } finally {
    if (send && ws?.readyState === WebSocket.OPEN) { try { await send("Browser.close"); } catch {} }
    ws?.close(); browser.kill();
  }
}
