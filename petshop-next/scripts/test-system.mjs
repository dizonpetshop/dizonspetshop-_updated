import { PrismaClient } from "@prisma/client";
import { hash, compare } from "bcryptjs";
import { randomBytes, createHmac, randomInt } from "node:crypto";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";

// All writes and generated credentials are confined to a brand-new audit DB.
// Keep the DB for inspection; never drop any database or delete shop records.
const source = new PrismaClient();
const sourceUrl = new URL(process.env.DATABASE_URL);
if (sourceUrl.protocol !== "mysql:" || !["localhost", "127.0.0.1"].includes(sourceUrl.hostname)) throw new Error("System tests require local MySQL.");
const database = `petshop_audit_${randomBytes(6).toString("hex")}`;
const url = new URL(sourceUrl); url.pathname = `/${database}`;
const p = new PrismaClient({ datasources: { db: { url: url.toString() } } });
const results = [];
let server;
let phpServer;
const base = "http://localhost:3107";
const cronSecret = randomBytes(24).toString("hex");
const authSecret = randomBytes(32).toString("hex");
async function checkPort(port) {
  const listener = createServer();
  await new Promise((resolve, reject) => { listener.once("error", reject); listener.listen(port, "localhost", resolve); });
  await new Promise((resolve) => listener.close(resolve));
}
let serverOutput = "";
async function test(name, callback) {
  if (process.env.SYSTEM_TEST_FILTER && !new RegExp(process.env.SYSTEM_TEST_FILTER).test(name)) return;
  try { await callback(); results.push({ name, status: "passed" }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, status: "failed", error: error.message }); console.error(`FAIL ${name}: ${error.message}`); }
}
async function request(path, cookie = "", options = {}) {
  return fetch(base + path, { redirect: "manual", ...options, headers: { ...(cookie ? { Cookie: cookie } : {}), ...options.headers } });
}
async function login(email, password, portal = "client") {
  const r = await request(`/api/auth/${portal}-login`, "", { method: "POST", body: new URLSearchParams({ email, password }), headers: { Origin: base } });
  assert.equal(r.status, 303);
  assert.ok(!r.headers.get("location").includes("error="), r.headers.get("location"));
  return r.headers.get("set-cookie").split(";")[0];
}
async function html(path, cookie) { const r = await request(path, cookie); assert.equal(r.status, 200, `${path}: ${r.status}`); return r.text(); }
async function formAction(path, cookie, marker, fields) {
  const text = await html(path, cookie);
  const form = [...text.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/g)].map((m) => m[1]).find((body) => body.includes(marker));
  assert.ok(form, `Form not found: ${marker}`);
  const action = form.match(/name="(\$ACTION_ID_[^"]+)"/);
  assert.ok(action, `Server action missing: ${marker}`);
  const body = new FormData(); body.set(action[1], "");
  for (const [name, value] of Object.entries(fields)) body.set(name, String(value));
  return request(path, cookie, { method: "POST", headers: { Origin: base }, body });
}
async function callAction(path, cookie, name, fields) {
  const manifest = JSON.parse(await readFile(".next/server/server-reference-manifest.json", "utf8"));
  const match = Object.entries(manifest.node).find(([, entry]) => entry.exportedName === name);
  assert.ok(match, `Action not found: ${name}`);
  const body = new FormData(); body.set(`$ACTION_ID_${match[0]}`, "");
  for (const [key, value] of Object.entries(fields)) body.set(key, value instanceof Blob ? value : String(value));
  return request(path, cookie, { method: "POST", headers: { Origin: base }, body });
}
try {
  await checkPort(3107);
  await checkPort(3108);
  await source.$executeRawUnsafe(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  const tables = await source.$queryRaw`SHOW TABLES`;
  let pending = [];
  for (const row of tables) {
    const name = Object.values(row)[0];
    if (name.startsWith("_prisma")) continue;
    const ddl = await source.$queryRawUnsafe(`SHOW CREATE TABLE \`${name}\``);
    pending.push({ name, ddl: ddl[0]["Create Table"] });
  }
  while (pending.length) {
    const next = [];
    for (const entry of pending) {
      try { await p.$executeRawUnsafe(entry.ddl); }
      catch { next.push(entry); }
    }
    if (next.length === pending.length) throw new Error(`Cannot create test schema: ${next.map((x) => x.name).join(", ")}`);
    pending = next;
  }
  const password = `Aa1!${randomBytes(20).toString("hex")}`;
  const admin = await p.user.create({ data: { email: "admin@audit.invalid", role: "Admin", firstName: "Audit", surname: "Admin", accountStatus: "Active", password: await hash(password, 12) } });
  const {ensureAttendance}=await import('./ensure-attendance.mjs');await ensureAttendance(p);
  const {ensureLoyaltyPolicy}=await import("./ensure-loyalty-policy.mjs");await ensureLoyaltyPolicy(p);
  const style = await p.groomingStyle.create({ data: { styleName: "Isolated audit service", prices: { create: { petSize: "Small", price: "350.00" } } } });
  const groomer = await p.groomer.create({ data: { groomerName: "Isolated audit groomer", availability: { create: Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, startTime: new Date("1970-01-01T09:00:00Z"), endTime: new Date("1970-01-01T19:00:00Z") })) } } });
  const product = await p.product.create({ data: { sku: "AUDIT-001", productName: "Isolated audit item", category: "Dog Food", productGroup: "Food", price: "185.00", stockQuantity: 3, image: "beefteriyaki.jpg" } });
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3107"], { env: { ...process.env, DATABASE_URL: url.toString(), AUTH_SECRET: authSecret, GOOGLE_CLIENT_ID: "audit-client.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "isolated-test-secret", GOOGLE_REDIRECT_URI: base + "/api/auth/google/callback", CRON_SECRET: cronSecret, SMTP_HOST: "", SMTP_USER: "", SMTP_PASS: "" }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout.on("data", (bytes) => { serverOutput += bytes; }); server.stderr.on("data", (bytes) => { serverOutput += bytes; });
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw new Error("Isolated test server could not start.");
    try { const r = await request("/client/login"); if (r.status === 200) break; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  let clientCookie, adminCookie, otherCookie, customer, pet;
  if (process.env.AUTH_BROWSER_AUDIT === "1" || process.env.BROWSER_AUDIT === "1") await test("Browser registration, login, session persistence and secure logout", async () => {
    const { checkBrowserAuthentication } = await import("./browser-auth-check.mjs");
    await checkBrowserAuthentication(base);
  });
  await test("Customer registration persists a bcrypt password", async () => {
    const r = await request("/api/auth/register", "", { method: "POST", headers: { Origin: base }, body: new URLSearchParams({ firstName: "Audit", surname: "Client", phone: "09123456789", email: "client@audit.invalid", password, confirmPassword: password }) });
    assert.equal(r.status, 303); assert.ok(r.headers.get("location").includes("registered=1"));
    const user = await p.user.findUnique({ where: { email: "client@audit.invalid" } }); assert.ok(await compare(password, user.password));
    assert.equal(await p.customer.count({ where: { email: user.email } }), 1);
  });
  await test("Duplicate registration and password mismatch leave no partial accounts", async () => {
    const fields = { firstName: "Audit", surname: "Client", phone: "09123456789", email: "CLIENT@AUDIT.INVALID", password, confirmPassword: password };
    const duplicate = await request("/api/auth/register", "", { method: "POST", headers: { Origin: base }, body: new URLSearchParams(fields) });
    assert.ok(duplicate.headers.get("location").includes("error=exists"));
    assert.equal(await p.customer.count({ where: { email: "client@audit.invalid" } }), 1);
    fields.email = "mismatch@audit.invalid"; fields.confirmPassword = "Different1!";
    const mismatch = await request("/api/auth/register", "", { method: "POST", headers: { Origin: base }, body: new URLSearchParams(fields) });
    assert.ok(mismatch.headers.get("location").includes("error=mismatch"));
    assert.equal(await p.user.count({ where: { email: fields.email } }), 0);
    assert.equal(await p.customer.count({ where: { email: fields.email } }), 0);
  });
  await test("PHP bcrypt hashes remain compatible with customer login", async () => {
    const legacyHash = (await hash(password, 12)).replace(/^\$2b\$/, "$2y$");
    await p.user.create({ data: { email: "legacy-hash@audit.invalid", password: legacyHash, role: "User", accountStatus: "Active" } });
    const cookie = await login("legacy-hash@audit.invalid", password);
    await html("/client/dashboard", cookie);
    assert.equal((await p.user.findUnique({ where: { email: "legacy-hash@audit.invalid" } })).password, legacyHash);
  });
  await test("Incorrect login has a visible generic message", async () => {
    const r = await request("/api/auth/client-login", "", { method: "POST", headers: { Origin: base }, body: new URLSearchParams({ email: "missing@audit.invalid", password }) });
    assert.ok(r.headers.get("location").includes("error=invalid"));
    assert.ok((await html("/client/login?error=invalid")).includes("Invalid email or password."));
    const expired = await request("/client/dashboard", "petshop_session=invalid");
    assert.ok(expired.headers.get("location").includes("error=session"));
  });
  await test("Client and admin login; role restrictions", async () => {
    clientCookie = await login("client@audit.invalid", password); adminCookie = await login(admin.email, password, "admin");
    await html("/client/dashboard", clientCookie);
    assert.equal((await request("/admin/dashboard", clientCookie)).status, 307);
    assert.equal((await request("/api/admin/notifications", clientCookie)).status, 401);
    assert.equal((await request("/client/dashboard")).status, 307);
  });
  await test("Cross-site POST rejected", async () => { assert.equal((await request("/api/auth/logout", clientCookie, { method: "POST", headers: { Origin: "https://untrusted.invalid" }, body: new URLSearchParams() })).status, 403); });
  await test("Client pet create and edit via real server forms", async () => {
    let r = await callAction("/client/dashboard?view=pets", clientCookie, "createPet", { petName: "Audit pet", species: "Dog" }); assert.equal(r.status, 303);
    customer = await p.customer.findFirst({ where: { email: "client@audit.invalid" } }); pet = await p.pet.findFirst({ where: { customerId: customer.id } }); assert.equal(pet.breed, null); assert.equal(pet.ageDob, null); assert.equal(pet.gender, null);
    await p.pet.update({ where: { id: pet.id }, data: { breed: "Historical breed", ageDob: "Historical age", gender: "Female" } });
    r = await callAction("/client/dashboard?view=pets", clientCookie, "updatePet", { id: pet.id, petName: "Updated audit pet", species: "Dog" }); assert.equal(r.status, 303);
    assert.equal((await p.pet.findUnique({ where: { id: pet.id } })).petName, "Updated audit pet");
    const preserved = await p.pet.findUnique({ where: { id: pet.id } }); assert.equal(preserved.breed, "Historical breed"); assert.equal(preserved.ageDob, "Historical age"); assert.equal(preserved.gender, "Female");
  });
  await test("Profile updates persist in user and customer records", async () => {
    const r = await callAction("/client/dashboard?view=account", clientCookie, "updateProfile", { firstName: "Updated", surname: "Client", middleInitial: "A", phone: "09123456789", address: "Isolated audit address" }); assert.equal(r.status, 303);
    const user = await p.user.findUnique({ where: { email: "client@audit.invalid" } }); const profile = await p.customer.findUnique({ where: { id: customer.id } });
    assert.equal(user.firstName, "Updated"); assert.equal(profile.customerName, "Updated A Client"); assert.equal(profile.address, "Isolated audit address");
    assert.ok((await html("/client/dashboard", clientCookie)).toLowerCase().includes("updated client"));
  });
  const future = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  await test("Grooming booking creates client/admin notifications", async () => {
    const r = await formAction("/client/dashboard?view=grooming", clientCookie, "Submit appointment", { petId: pet.id, styleId: style.styleId, groomerId: groomer.groomerId, petSize: "Small", bookingType: "Salon", date: future, time: "10:00", requestToken: randomBytes(16).toString("hex") }); assert.equal(r.status, 303);
    assert.equal(await p.groomingAppointment.count(), 1);
    assert.ok(await p.notification.count({ where: { recipient: { email: "client@audit.invalid" } } })); assert.ok(await p.notification.count({ where: { recipientId: admin.id } }));
  });
  await test("Duplicate grooming slot is rejected", async () => {
    await formAction("/client/dashboard?view=grooming", clientCookie, "Submit appointment", { petId: pet.id, styleId: style.styleId, groomerId: groomer.groomerId, petSize: "Small", bookingType: "Salon", date: future, time: "10:00", requestToken: randomBytes(16).toString("hex") }); assert.equal(await p.groomingAppointment.count(), 1);
  });
  await test("Admin confirms grooming; client sees updated status", async () => {
    const appointment = await p.groomingAppointment.findFirst();
    const r = await formAction("/admin/dashboard?view=reservations", adminCookie, 'name="status"', { id: appointment.appointmentId, status: "Confirmed" }); assert.equal(r.status, 303);
    assert.equal((await p.groomingAppointment.findFirst()).status, "Confirmed"); assert.ok((await html("/client/dashboard?view=reservations", clientCookie)).includes("Confirmed"));
  });
  await test("Client cancels grooming; history retained", async () => {
    const appointment = await p.groomingAppointment.findFirst();
    const r = await callAction("/client/dashboard?view=reservations", clientCookie, "cancelGroomingAppointment", { id: appointment.appointmentId }); assert.equal(r.status, 303);
    assert.equal((await p.groomingAppointment.findFirst()).status, "Cancelled");
  });
  await test("Concurrent grooming requests claim one limited-capacity slot", async () => {
    const before = await p.groomingAppointment.count();
    await Promise.all([1, 2].map(() => callAction("/client/dashboard?view=grooming", clientCookie, "bookGrooming", { petId: pet.id, styleId: style.styleId, groomerId: groomer.groomerId, petSize: "Small", bookingType: "Salon", date: future, time: "14:00", requestToken: randomBytes(16).toString("hex") })));
    assert.equal(await p.groomingAppointment.count(), before + 1);
    const appointment = await p.groomingAppointment.findFirst({ where: { status: "Pending" } });
    await callAction("/client/dashboard?view=reservations", clientCookie, "cancelGroomingAppointment", { id: appointment.appointmentId });
  });
  await test("Grooming add-ons persist with authoritative total", async () => {
    const addon = await p.groomingAddon.create({ data: { addonName: "Isolated audit add-on", price: 100 } });
    await callAction("/client/dashboard?view=grooming", clientCookie, "bookGrooming", { petId: pet.id, styleId: style.styleId, groomerId: groomer.groomerId, petSize: "Small", bookingType: "Salon", date: future, time: "16:00", addonIds: addon.addonId, requestToken: randomBytes(16).toString("hex") });
    const appointment = await p.groomingAppointment.findFirst({ where: { status: "Pending" }, include: { addons: true } });
    assert.equal(String(appointment.totalPrice), "450"); assert.equal(appointment.addons.length, 1); assert.equal(String(appointment.addons[0].priceAtBooking), "100");
    await callAction("/client/dashboard?view=reservations", clientCookie, "cancelGroomingAppointment", { id: appointment.appointmentId });
  });
  await test("Groomer schedule closure blocks bookings", async () => {
    const dayOfWeek = new Date(`${future}T00:00:00Z`).getUTCDay();
    await p.groomerAvailability.update({ where: { groomerId_dayOfWeek: { groomerId: groomer.groomerId, dayOfWeek } }, data: { isActive: false } });
    const before = await p.groomingAppointment.count();
    await callAction("/client/dashboard?view=grooming", clientCookie, "bookGrooming", { petId: pet.id, styleId: style.styleId, groomerId: groomer.groomerId, petSize: "Small", bookingType: "Salon", date: future, time: "17:00", requestToken: randomBytes(16).toString("hex") }); assert.equal(await p.groomingAppointment.count(), before);
    await p.groomerAvailability.update({ where: { groomerId_dayOfWeek: { groomerId: groomer.groomerId, dayOfWeek } }, data: { isActive: true } });
  });
  await test("Product reservation uses database price and deducts stock", async () => {
    const r = await callAction("/client/dashboard?view=products", clientCookie, "reserveProduct", { productId: product.productId, quantity: 2, paymentMethod: "Cash", contactNumber: "09123456789", address: "Isolated test address", pickupDate: future, pickupTime: "11:00", requestToken: randomBytes(16).toString("hex") });
    assert.equal(r.status, 303); assert.equal((await p.product.findUnique({ where: { productId: product.productId } })).stockQuantity, 1);
    assert.equal(String((await p.productReservation.findFirst()).totalAmount), "370");
  });
  await test("Concurrent cancellation restores stock exactly once", async () => {
    const reservation = await p.productReservation.findFirst();
    await Promise.all([1, 2].map(() => callAction("/client/dashboard?view=reservations", clientCookie, "cancelProductReservation", { id: reservation.reservationId })));
    assert.equal((await p.product.findUnique({ where: { productId: product.productId } })).stockQuantity, 3);
    assert.equal((await p.productReservation.findFirst()).status, "Cancelled");
  });
  await test("Concurrent reservations cannot oversell", async () => {
    await Promise.all([1, 2].map(() => callAction("/client/dashboard?view=products", clientCookie, "reserveProduct", { productId: product.productId, quantity: 2, paymentMethod: "Cash", contactNumber: "09123456789", address: "Isolated test address", pickupDate: future, pickupTime: "12:00", requestToken: randomBytes(16).toString("hex") })));
    assert.equal((await p.product.findUnique({ where: { productId: product.productId } })).stockQuantity, 1);
    assert.equal(await p.productReservation.count({ where: { status: "Pending" } }), 1);
  });
  await test("Insufficient stock rejected without saving a reservation", async () => {
    const count = await p.productReservation.count();
    await callAction("/client/dashboard?view=products", clientCookie, "reserveProduct", { productId: product.productId, quantity: 20, paymentMethod: "Cash", contactNumber: "09123456789", address: "Isolated test address", pickupDate: future, pickupTime: "13:00", requestToken: randomBytes(16).toString("hex") });
    assert.equal(await p.productReservation.count(), count); assert.equal((await p.product.findUnique({ where: { productId: product.productId } })).stockQuantity, 1);
  });
  await test("Repeated product submission deducts stock only once", async () => {
    const fields = { productId: product.productId, quantity: 1, paymentMethod: "Cash", contactNumber: "09123456789", address: "Isolated test address", pickupDate: future, pickupTime: "13:00", requestToken: randomBytes(16).toString("hex") };
    const count = await p.productReservation.count();
    await Promise.all([1, 2].map(() => callAction("/client/dashboard?view=products", clientCookie, "reserveProduct", fields)));
    assert.equal(await p.productReservation.count(), count + 1);
    assert.equal((await p.product.findUnique({ where: { productId: product.productId } })).stockQuantity, 0);
    const page = await html("/client/dashboard?view=products", clientCookie); assert.ok(page.toLowerCase().includes("out of stock")); assert.ok(!page.includes("Reserve Product · Out of stock"));
  });
  await test("Admin inventory updates synchronize with client refresh", async () => {
    const before = await p.product.findUniqueOrThrow({where:{productId:product.productId}});
    await callAction("/admin/dashboard?view=products", adminCookie, "updateProduct", { id: product.productId, previousStock: before.stockQuantity, previousPrice: String(before.price), price: "199.50", stock: 5, name: "Forbidden rename", category: "Forbidden", group: "Other", reorder: 999, active: "off", image: "https://example.com/replaced.png" });
    const row = await p.product.findUnique({ where: { productId: product.productId } }); assert.equal(row.stockQuantity, 5); assert.equal(String(row.price), "199.5"); assert.equal(row.productName,before.productName); assert.equal(row.category,before.category); assert.equal(row.image,before.image); assert.equal(row.reorderLevel,before.reorderLevel); assert.equal(row.isActive,before.isActive);
    const page = await html("/client/dashboard?view=products", clientCookie);
    assert.ok(page.toLowerCase().includes(row.stockQuantity<=row.reorderLevel?"low stock":"in stock"));
    assert.ok(page.includes("199.50"));
    assert.ok(page.includes("softNavyProductFrame"));
    assert.ok(page.includes("Add to Reservation Cart"));
  });
  await test("Inventory-only editor rejects invalid and stale changes and preserves committed prices", async () => {
    const before=await p.product.findUniqueOrThrow({where:{productId:product.productId}});
    const items=await p.productReservationItem.findMany({where:{productId:product.productId}});
    const fields={id:product.productId,previousStock:before.stockQuantity,previousPrice:String(before.price),price:"199.50",stock:before.stockQuantity};
    for(const invalid of [{price:"-1"},{price:"1.234"},{stock:"-1"},{stock:"1.5"},{previousStock:before.stockQuantity+1},{previousPrice:"12345"}]){
      await callAction("/admin/dashboard?view=products",adminCookie,"updateProduct",{...fields,...invalid});
      const row=await p.product.findUniqueOrThrow({where:{productId:product.productId}});assert.equal(row.stockQuantity,before.stockQuantity);assert.equal(String(row.price),String(before.price));
    }
    await Promise.all([3,7].map(stock=>callAction("/admin/dashboard?view=products",adminCookie,"updateProduct",{...fields,stock})));
    const winner=await p.product.findUniqueOrThrow({where:{productId:product.productId}});assert.ok([3,7].includes(winner.stockQuantity));
    const history=await p.productReservationItem.findMany({where:{productId:product.productId}});assert.deepEqual(history,items);
    await p.product.update({where:{productId:product.productId},data:{stockQuantity:before.stockQuantity}});
    const markup=await html("/admin/dashboard?view=inventory",adminCookie);assert.ok(markup.includes("Edit Inventory"));assert.ok(markup.includes("Available Inventory Quantity"));assert.ok(markup.includes("Total Products"));
  });
  await test("Product archive respects public/client visibility", async () => {
    await p.product.update({where:{productId:product.productId},data:{isActive:0}});
    assert.equal((await p.product.findUnique({ where: { productId: product.productId } })).isActive, 0);
    assert.ok(!(await html("/client/dashboard?view=products", clientCookie)).includes(`alt="${product.productName}"`));
    await p.product.update({ where: { productId: product.productId }, data: { isActive: 1 } });
  });
  await test("Pet photo validation, persistence, and authorized access", async () => {
    const image = await readFile("public/products/beefteriyaki.jpg");
    const photo = new File([image], "audit.jpg", { type: "image/jpeg" });
    await callAction("/client/dashboard?view=pets", clientCookie, "updatePet", { id: pet.id, petName: "Updated audit pet", species: "Dog", breed: "Mixed", photo });
    const response = await request(`/api/pets/${pet.id}/image`, clientCookie); assert.equal(response.status, 200); assert.ok(Buffer.from(await response.arrayBuffer()).equals(image));
    assert.equal((await request(`/api/pets/${pet.id}/image`)).status, 401);
    const before = (await p.pet.findUnique({ where: { id: pet.id } })).photoPath;
    await callAction("/client/dashboard?view=pets", clientCookie, "updatePet", { id: pet.id, petName: "Updated audit pet", species: "Dog", photo: new File(["x"], "invalid.png", { type: "image/png" }) });
    assert.equal((await p.pet.findUnique({ where: { id: pet.id } })).photoPath, before);
  });
  await test("Customer cannot edit another customer's pet or access its photo", async () => {
    await p.user.create({ data: { email: "other@audit.invalid", role: "User", accountStatus: "Active", password: await hash(password, 12) } });
    otherCookie = await login("other@audit.invalid", password);
    await callAction("/client/dashboard?view=pets", otherCookie, "updatePet", { id: pet.id, petName: "Unauthorized edit", species: "Dog" });
    assert.equal((await p.pet.findUnique({ where: { id: pet.id } })).petName, "Updated audit pet");
    assert.equal((await request(`/api/pets/${pet.id}/image`, otherCookie)).status, 404);
  });
  await test("Simplified pet creation rejects invalid uploads and derives ownership from the session", async () => {
    const before = await p.pet.count();
    for (const photo of [new File(["not an image"], "invalid.png", { type: "image/png" }), new File([new Uint8Array(1_500_001)], "oversized.jpg", { type: "image/jpeg" })]) {
      await callAction("/client/dashboard?view=pets", clientCookie, "createPet", { petName: "Rejected upload", species: "Dog", photo });
      assert.equal(await p.pet.count(), before);
    }
    const other = await p.customer.findFirst({ where: { email: "other@audit.invalid" } });
    await callAction("/client/dashboard?view=pets", clientCookie, "createPet", { petName: "Owner-controlled creation", species: "Other", customerId: other.id, breed: "Ignored", ageDob: "Ignored", gender: "Male" });
    const created = await p.pet.findFirst({ where: { petName: "Owner-controlled creation" } });
    assert.equal(created.customerId, customer.id); assert.equal(created.breed, null); assert.equal(created.ageDob, null); assert.equal(created.gender, null);
  });
  await test("Pet archive preserves records and appointment history", async () => {
    const before = await p.groomingAppointment.count();
    await callAction("/client/dashboard?view=pets", otherCookie, "archivePet", { id: pet.id });
    assert.equal((await p.pet.findUnique({ where: { id: pet.id } })).isActive, 1);
    await callAction("/client/dashboard?view=pets", clientCookie, "archivePet", { id: pet.id });
    assert.equal((await p.pet.findUnique({ where: { id: pet.id } })).isActive, 0); assert.equal(await p.groomingAppointment.count(), before);
    await callAction("/client/dashboard?view=pets", clientCookie, "archivePet", { id: pet.id });
    assert.equal(await p.auditLog.count({ where: { recordId: String(pet.id), module: "Pet", action: "ARCHIVE" } }), 1);
    const markup = await html("/client/dashboard?view=pets", clientCookie);
    assert.ok(!markup.includes(`data-pet-id="${pet.id}"`));
    const appointmentCount = await p.groomingAppointment.count();
    await callAction("/client/dashboard?view=grooming", clientCookie, "bookGrooming", { petId: pet.id, styleId: style.styleId, groomerId: groomer.groomerId, petSize: "Small", bookingType: "Salon", date: future, time: "17:00", requestToken: randomBytes(16).toString("hex") });
    assert.equal(await p.groomingAppointment.count(), appointmentCount);
  });
  await test("Every admin and client dashboard view renders", async () => {
    for (const view of ["dashboard", "products", "categories", "inventory", "orders", "reservations", "customers", "pets", "groomers", "services", "schedules", "notifications", "reports", "auditlogs", "settings", "profile"]) await html(`/admin/dashboard?view=${view}`, adminCookie);
    for (const view of ["dashboard", "pets", "grooming", "products", "reservations", "notifications", "account", "messages"]) await html(`/client/dashboard?view=${view}`, clientCookie);
  });
  await test("Loyalty poster policy: fifth/tenth 50%, sixth regular, eleventh lifetime VIP, duplicate safety and invoice rounding",async()=>{
    await p.customer.update({where:{id:customer.id},data:{loyaltyStamps:0,rewardAvailable:false}});
    await p.$executeRaw`INSERT INTO customer_loyalty_program(customer_id,completed_visits,vip_member) VALUES(${customer.id},0,FALSE) ON DUPLICATE KEY UPDATE completed_visits=0,vip_member=FALSE,vip_since=NULL`;
    const fixture=(total='350.00')=>p.groomingAppointment.create({data:{reservationCode:'LOY-'+randomBytes(8).toString('hex'),customerId:customer.id,petId:pet.id,groomingStyleId:style.styleId,groomerId:groomer.groomerId,petSize:'Small',totalPrice:total,status:'Confirmed',appointmentDate:new Date('2030-01-01T00:00:00Z'),appointmentTime:new Date('1970-01-01T12:00:00Z')}});
    const complete=id=>callAction('/admin/dashboard?view=reservations',adminCookie,'updateGroomingStatus',{id,status:'Completed'});
    for(let visit=1;visit<=12;visit++){
      const a=await fixture(visit===5?'350.03':'350.00');
      if(visit===1)await Promise.all([complete(a.appointmentId),complete(a.appointmentId)]);else await complete(a.appointmentId);
      const current=await p.customer.findUnique({where:{id:customer.id}});assert.equal(current.loyaltyStamps,visit);assert.equal(current.rewardAvailable,visit>=11);
      const invoice=await p.$queryRaw`SELECT * FROM appointment_loyalty_pricing WHERE appointment_id=${a.appointmentId}`;
      const expected=visit===5||visit===10?50:visit>=11?10:0;assert.equal(invoice[0].discount_percent,expected);assert.equal(invoice[0].visit_number,visit);
      const saved=await p.groomingAppointment.findUnique({where:{appointmentId:a.appointmentId}});assert.equal(Number(saved.totalPrice),visit===5?175.02:visit===10?175:visit>=11?315:350);
      assert.equal(await p.loyaltyTransaction.count({where:{customerId:customer.id,reason:{startsWith:`Completed grooming appointment ${a.appointmentId};`}}}),1);
      assert.equal(await p.notification.count({where:{eventKey:`appointment.loyalty.${a.appointmentId}`}}),1);
      await complete(a.appointmentId);assert.equal((await p.customer.findUnique({where:{id:customer.id}})).loyaltyStamps,visit);
    }
    const denied=await fixture();await callAction('/admin/dashboard?view=reservations',clientCookie,'updateGroomingStatus',{id:denied.appointmentId,status:'Completed'});assert.equal((await p.groomingAppointment.findUnique({where:{appointmentId:denied.appointmentId}})).status,'Confirmed');assert.equal((await p.customer.findUnique({where:{id:customer.id}})).loyaltyStamps,12);
    await callAction('/client/dashboard?view=grooming',clientCookie,'cancelGroomingAppointment',{id:denied.appointmentId});assert.equal((await p.customer.findUnique({where:{id:customer.id}})).loyaltyStamps,12);
    const account=await html('/client/dashboard?view=account',clientCookie);assert.ok(account.includes('LIFETIME VIP'));assert.ok(account.includes('50%'));assert.ok(account.includes('max="11"'));assert.ok((await html('/client/dashboard?view=grooming',clientCookie)).includes('Final total'));
  });
  await test("Loyalty lifetime membership survives staff corrections and rejects the old redemption reset",async()=>{
    await callAction('/admin/dashboard?view=customers',adminCookie,'updateLoyalty',{id:customer.id,stamps:12,reason:'Verified completed visit count.'});
    const before=await p.loyaltyTransaction.count({where:{customerId:customer.id,changeAmount:-10}});
    await callAction('/admin/dashboard?view=customers',adminCookie,'redeemLoyaltyReward',{id:customer.id});assert.equal((await p.customer.findUnique({where:{id:customer.id}})).loyaltyStamps,12);assert.equal(await p.loyaltyTransaction.count({where:{customerId:customer.id,changeAmount:-10}}),before);
    await callAction('/admin/dashboard?view=customers',adminCookie,'updateLoyalty',{id:customer.id,stamps:10,reason:'Audited historical correction; VIP must remain.'});
    const program=await p.$queryRaw`SELECT * FROM customer_loyalty_program WHERE customer_id=${customer.id}`;assert.ok(Boolean(program[0].vip_member));assert.equal((await p.customer.findUnique({where:{id:customer.id}})).rewardAvailable,true);
  });  await test("Groomer, schedule and service editing persist", async () => {
    await callAction("/admin/dashboard?view=groomers", adminCookie, "createGroomer", { name: "Isolated new specialist", contactNumber: "09123456789" });
    const specialist = await p.groomer.findUnique({ where: { groomerName: "Isolated new specialist" } }); assert.ok(specialist);
    await callAction("/admin/dashboard?view=groomers", adminCookie, "saveGroomerSchedule", { id: specialist.groomerId, dayOfWeek: 1, startTime: "09:00", endTime: "17:00" }); assert.equal(await p.groomerAvailability.count({ where: { groomerId: specialist.groomerId } }), 1);
    await callAction("/admin/dashboard?view=groomers", adminCookie, "updateGroomer", { id: specialist.groomerId, name: specialist.groomerName, contactNumber: "09123456789" }); assert.equal((await p.groomer.findUnique({ where: { groomerId: specialist.groomerId } })).isActive, 0);
    const pricing = await p.styleSizePricing.findFirst({ where: { styleId: style.styleId } });
    await callAction("/admin/dashboard?view=services", adminCookie, "updatePackage", { id: pricing.pricingId, name: "Updated audit service", price: "390.00" }); assert.equal(String((await p.styleSizePricing.findUnique({ where: { pricingId: pricing.pricingId } })).price), "390");
  });
  await test("PDF export produces a real authorized PDF document", async () => {
    const r = await request("/api/admin/reports/pdf?range=month", adminCookie); assert.equal(r.status, 200); assert.ok(r.headers.get("content-type").includes("application/pdf")); assert.equal(Buffer.from(await r.arrayBuffer()).subarray(0, 4).toString(), "%PDF");
    assert.equal((await request("/api/admin/reports/pdf", clientCookie)).status, 401);
  });
  await test("Original product image endpoint resolves to public image", async () => {
    const r = await request(`/api/products/${product.productId}/image`); assert.equal(r.status, 307); const asset = await fetch(r.headers.get("location")); assert.equal(asset.status, 200); assert.ok(asset.headers.get("content-type").includes("image/"));
  });
  await test("Notification recipient isolation and mark-as-read", async () => {
    const items = await (await request("/api/client/notifications", clientCookie)).json(); assert.ok(items.count > 0);
    const adminNote = await p.notification.findFirst({ where: { recipientId: admin.id } });
    const denied = await request("/api/client/notifications", clientCookie, { method: "POST", headers: { Origin: base, "Content-Type": "application/json" }, body: JSON.stringify({ id: String(adminNote.notificationId) }) }); assert.equal(denied.status, 404);
    const mark = await request("/api/client/notifications", clientCookie, { method: "POST", headers: { Origin: base, "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) }); assert.equal(mark.status, 200); assert.equal((await mark.json()).count, 0);
  });
  await test("Messaging: two-way persistence, retry deduplication, notifications, read counters and privacy", async () => {
    const chat = (portal, cookie, data) => request(`/api/messages?portal=${portal}`,cookie,{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(data)});
    assert.equal((await request('/api/messages?portal=admin',clientCookie)).status,401);
    assert.equal((await request('/api/messages')).status,401);
    const starts=await Promise.all([chat('client',clientCookie,{action:'start'}),chat('client',clientCookie,{action:'start'})]);
    const a=await starts[0].json(),b=await starts[1].json();assert.equal(a.conversationId,b.conversationId);assert.ok(a.conversationId);
    const requestKey=randomBytes(16).toString('hex');
    const sent=await chat('client',clientCookie,{action:'send',conversationId:a.conversationId,content:'Hello support <script>unsafe()</script>',requestKey,senderId:admin.id,senderRole:'Admin'});assert.equal(sent.status,200);const message=(await sent.json()).message;assert.equal(message.senderRole,'User');
    const duplicate=await chat('client',clientCookie,{action:'send',conversationId:a.conversationId,content:'Hello support <script>unsafe()</script>',requestKey});assert.equal((await duplicate.json()).message.id,message.id);
    assert.equal((await chat('client',otherCookie,{action:'send',conversationId:a.conversationId,content:'Intrusion',requestKey:randomBytes(16).toString('hex')})).status,404);
    assert.equal((await request(`/api/messages?portal=client&conversation=${a.conversationId}`,otherCookie)).status,404);
    const adminUnread=await(await request('/api/messages?portal=admin&summary=1',adminCookie)).json();assert.equal(adminUnread.count,1);
    assert.equal((await(await request('/api/messages?portal=client&summary=1',clientCookie)).json()).count,0);
    const inbox=await(await request('/api/messages?portal=admin&q=Updated',adminCookie)).json();assert.ok(inbox.conversations.some(c=>c.id===a.conversationId));
    const read=await chat('admin',adminCookie,{action:'read',conversationId:a.conversationId,throughId:message.id});assert.equal((await read.json()).count,0);
    const reply=await chat('admin',adminCookie,{action:'send',conversationId:a.conversationId,content:'We can help with your appointment.',requestKey:randomBytes(16).toString('hex')});assert.equal(reply.status,200);const answer=(await reply.json()).message;assert.equal(answer.senderRole,'Admin');
    assert.equal((await(await request('/api/messages?portal=client&summary=1',clientCookie)).json()).count,1);
    await chat('client',clientCookie,{action:'read',conversationId:a.conversationId,throughId:message.id});assert.equal((await(await request('/api/messages?portal=client&summary=1',clientCookie)).json()).count,1,'Acknowledging old messages must not read a later reply');
    await chat('client',clientCookie,{action:'read',conversationId:a.conversationId,throughId:answer.id});assert.equal((await(await request('/api/messages?portal=client&summary=1',clientCookie)).json()).count,0);
    const renewed=await login('client@audit.invalid',password);const history=await(await request(`/api/messages?portal=client&conversation=${a.conversationId}`,renewed)).json();assert.equal(history.messages.length,2);assert.equal(history.messages[0].content,'Hello support <script>unsafe()</script>');
    const notes=await p.notification.findMany({where:{type:'MESSAGE_NEW'}});assert.equal(notes.length,2);assert.ok(notes.every(n=>n.link.includes(`conversation=${a.conversationId}`)));
    for(const content of ['', ' ', 'x'.repeat(2001)])assert.equal((await chat('client',clientCookie,{action:'send',conversationId:a.conversationId,content,requestKey:randomBytes(16).toString('hex')})).status,400);
    assert.equal((await request('/api/messages',clientCookie,{method:'DELETE',headers:{Origin:base}})).status,405);
    assert.equal((await chat('client',clientCookie,{action:'send',content:'x'.repeat(17000)})).status,413);
    assert.equal((await request('/api/messages?portal=client',clientCookie,{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:'{'})).status,400);
    const cross=await request('/api/messages?portal=client',clientCookie,{method:'POST',headers:{Origin:'https://untrusted.invalid','Content-Type':'application/json'},body:JSON.stringify({action:'start'})});assert.equal(cross.status,403);
  });
  await test("Messaging: serialized database rate limits survive concurrent sends and history paginates", async () => {
    const chat=(data)=>request('/api/messages?portal=client',otherCookie,{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(data)});
    const conversationId=(await(await chat({action:'start'})).json()).conversationId;
    const responses=await Promise.all(Array.from({length:22},(_,i)=>chat({action:'send',conversationId,content:`Rate fixture ${i}`,requestKey:randomBytes(16).toString('hex')})));
    assert.equal(responses.filter(r=>r.status===200).length,20);assert.equal(responses.filter(r=>r.status===429).length,2);
    const sender=await p.user.findUnique({where:{email:'other@audit.invalid'}});
    for(let i=0;i<85;i++)await p.$executeRaw`INSERT INTO support_messages(conversation_id,sender_id,sender_role,content,request_key,created_at) VALUES(${conversationId},${sender.id},'User',${`Historical fixture ${i}`},${randomBytes(16).toString('hex')},${new Date(Date.now()-120000)})`;
    const latest=await(await request(`/api/messages?portal=client&conversation=${conversationId}`,otherCookie)).json();assert.equal(latest.messages.length,100);assert.equal(latest.hasMore,true);
    const older=await(await request(`/api/messages?portal=client&conversation=${conversationId}&before=${latest.messages[0].id}`,otherCookie)).json();assert.equal(older.messages.length,5);assert.equal(older.hasMore,false);
  });
  if(process.env.MESSAGING_BROWSER_AUDIT==='1')await test("Browser messaging: customer/admin delivery, unread, notifications, persistence, search and responsive icons",async()=>{
    await p.user.create({data:{email:'browser-chat@audit.invalid',password:await hash(password,12),role:'User',accountStatus:'Active',firstName:'Browser',surname:'Messenger'}});
    const cookie=await login('browser-chat@audit.invalid',password);
    const{checkMessagingBrowser}=await import('./browser-messaging-check.mjs');await checkMessagingBrowser(base,cookie,adminCookie,password,p);
  });
  await test("Attendance automation: grace, checked-in, progress, pending, completed, home service, timezone, concurrency and idempotency",async()=>{
    assert.equal((await request('/api/cron/grooming-no-shows')).status,401);
    await p.systemSetting.update({where:{key:'grooming_attendance_enabled_after'},data:{value:'2020-01-01T00:00:00Z'}});
    const fixture=async(status,minutes,bookingType='Salon')=>{const shop=new Date(Date.now()+8*3600000+minutes*60000);const staff=await p.groomer.create({data:{groomerName:'Attendance fixture '+randomBytes(4).toString('hex')}});return p.groomingAppointment.create({data:{reservationCode:'ATT-'+randomBytes(8).toString('hex'),customerId:customer.id,petId:pet.id,groomingStyleId:style.styleId,groomerId:staff.groomerId,petSize:'Small',totalPrice:350,status,bookingType,appointmentDate:new Date(shop.toISOString().slice(0,10)+'T00:00:00Z'),appointmentTime:new Date('1970-01-01T'+shop.toISOString().slice(11,19)+'Z')}});};
    const missed=await fixture('Confirmed',-20),grace=await fixture('Confirmed',-10),future=await fixture('Confirmed',10),pending=await fixture('Pending',-20),completed=await fixture('Completed',-20),home=await fixture('Confirmed',-20,'Home Service'),arrived=await fixture('Confirmed',-20),progress=await fixture('Confirmed',-20);
    await callAction('/admin/dashboard?view=reservations',adminCookie,'updateGroomingStatus',{id:arrived.appointmentId,status:'Checked In'});
    await callAction('/admin/dashboard?view=reservations',adminCookie,'updateGroomingStatus',{id:progress.appointmentId,status:'Checked In'});
    await callAction('/admin/dashboard?view=reservations',adminCookie,'updateGroomingStatus',{id:progress.appointmentId,status:'In Progress'});
    const arriveStart=new Date(arrived.appointmentDate.toISOString().slice(0,10)+'T'+arrived.appointmentTime.toISOString().slice(11,19)+'+08:00');
    await p.$executeRaw`UPDATE grooming_attendance SET checked_in_at=${new Date(arriveStart.getTime()-5*60000)} WHERE appointment_id=${arrived.appointmentId}`;
    const progressStart=new Date(progress.appointmentDate.toISOString().slice(0,10)+'T'+progress.appointmentTime.toISOString().slice(11,19)+'+08:00');
    await p.$executeRaw`UPDATE grooming_attendance SET checked_in_at=${new Date(progressStart.getTime()+10*60000)} WHERE appointment_id=${progress.appointmentId}`;
    const legacy=await fixture('Confirmed',-20);await p.groomingAppointment.update({where:{appointmentId:legacy.appointmentId},data:{appointmentDate:new Date('2019-01-01T00:00:00Z')}});
    const moved=await fixture('Confirmed',-20);await p.groomingAppointment.update({where:{appointmentId:moved.appointmentId},data:{appointmentDate:future.appointmentDate,appointmentTime:future.appointmentTime}});
    const job=()=>request('/api/cron/grooming-no-shows','',{headers:{Authorization:`Bearer ${cronSecret}`}});
    const results=await Promise.all([job(),job()]);assert.ok(results.every(r=>r.status===200));
    for(const record of [legacy,moved])assert.equal((await p.groomingAppointment.findUnique({where:{appointmentId:record.appointmentId}})).status,'Confirmed');
    assert.equal((await p.groomingAppointment.findUnique({where:{appointmentId:missed.appointmentId}})).status,'Cancelled - No Show');
    for(const [a,status]of [[grace,'Confirmed'],[future,'Confirmed'],[pending,'Pending'],[completed,'Completed'],[home,'Confirmed'],[arrived,'Checked In'],[progress,'In Progress']])assert.equal((await p.groomingAppointment.findUnique({where:{appointmentId:a.appointmentId}})).status,status);
    const noteCount=await p.notification.count({where:{eventKey:`appointment.noshow.${missed.appointmentId}`}});assert.equal(noteCount,2);await job();assert.equal(await p.notification.count({where:{eventKey:`appointment.noshow.${missed.appointmentId}`}}),noteCount);
    const meta=await p.$queryRaw`SELECT * FROM grooming_attendance WHERE appointment_id=${missed.appointmentId}`;assert.equal(meta[0].cancellation_kind,'automatic');assert.ok(meta[0].cancelled_at);assert.equal(await p.auditLog.count({where:{action:'AUTO_CANCEL',recordId:String(missed.appointmentId)}}),1);
    const racing=await fixture('Confirmed',-20);await Promise.all([job(),callAction('/admin/dashboard?view=reservations',adminCookie,'updateGroomingStatus',{id:racing.appointmentId,status:'Checked In'})]);const raced=await p.groomingAppointment.findUnique({where:{appointmentId:racing.appointmentId}});assert.ok(['Checked In','Cancelled - No Show'].includes(raced.status));const attendance=await p.$queryRaw`SELECT * FROM grooming_attendance WHERE appointment_id=${racing.appointmentId}`;assert.equal(Boolean(attendance[0].checked_in_at),raced.status==='Checked In');
    await callAction('/admin/dashboard?view=reservations',clientCookie,'updateGroomingStatus',{id:pending.appointmentId,status:'Checked In'});assert.equal((await p.groomingAppointment.findUnique({where:{appointmentId:pending.appointmentId}})).status,'Pending');
    await callAction('/admin/dashboard?view=reservations',adminCookie,'updateGroomingStatus',{id:home.appointmentId,status:'Cancelled - No Show',reason:'Groomer verified customer was unavailable at the address.'});assert.equal((await p.groomingAppointment.findUnique({where:{appointmentId:home.appointmentId}})).status,'Cancelled - No Show');
    const restored=await fixture('Confirmed',-120);await job();await callAction('/admin/dashboard?view=reservations',adminCookie,'updateGroomingStatus',{id:restored.appointmentId,status:'Checked In',reason:'Staff corrected a missing arrival record.'});assert.equal((await p.groomingAppointment.findUnique({where:{appointmentId:restored.appointmentId}})).status,'Checked In');
    const blocked=await fixture('Confirmed',-20);await job();await callAction('/admin/dashboard?view=reservations',adminCookie,'updateGroomingStatus',{id:blocked.appointmentId,status:'Checked In',reason:'Staff requests recovery of the missed appointment.'});assert.equal((await p.groomingAppointment.findUnique({where:{appointmentId:blocked.appointmentId}})).status,'Cancelled - No Show');
    await callAction('/admin/dashboard?view=settings',adminCookie,'updateAttendanceSetting',{graceMinutes:30});assert.equal((await p.systemSetting.findUnique({where:{key:'grooming_no_show_grace_minutes'}})).value,'30');
    const display=await html('/client/dashboard?view=reservations',clientCookie);assert.ok(display.includes('Cancelled'));assert.ok(display.includes('Automatically cancelled'));assert.ok((await html('/admin/dashboard?view=reservations',adminCookie)).includes('Checked In'));
  });
  if(process.env.HAIRCUT_BROWSER_AUDIT==='1')await test("Browser haircut gallery: authoritative prices, images, selection, accessibility and responsive themes",async()=>{
    const originals=await source.groomingStyle.findMany({include:{prices:{orderBy:{pricingId:"asc"}}}});
    const expected=[];
    for(const original of originals){const cloned=await p.groomingStyle.create({data:{styleName:original.styleName}});for(const price of original.prices)await p.styleSizePricing.create({data:{styleId:cloned.styleId,petSize:price.petSize,price:price.price}});expected.push({name:original.styleName,prices:original.prices.map(r=>({size:r.petSize,amount:String(r.price)}))});}
    const before=JSON.stringify(await p.styleSizePricing.findMany({orderBy:{pricingId:'asc'}}));
    const{checkHaircutBrowser}=await import('./browser-haircut-check.mjs');await checkHaircutBrowser(base,clientCookie,expected);
    assert.equal(JSON.stringify(await p.styleSizePricing.findMany({orderBy:{pricingId:'asc'}})),before);
  });
  if (process.env.PET_BROWSER_AUDIT === "1") await test("Browser simplified Add Pet: fields, upload, validation, duplicate guard, persistence and responsive themes", async () => {
    const { checkAddPetBrowser } = await import("./browser-pet-check.mjs");
    await checkAddPetBrowser(base, clientCookie, p);
  });
  if (process.env.PET_BROWSER_AUDIT === "1") await test("Browser My Pets: empty state and first pet for a new customer", async () => {
    await p.user.create({data:{email:'empty-pets@audit.invalid',password:await hash(password,12),role:'User',accountStatus:'Active'}});
    const cookie=await login('empty-pets@audit.invalid',password);
    const { checkAddPetBrowser }=await import('./browser-pet-check.mjs');await checkAddPetBrowser(base,cookie,p,true);
    const owner=await p.customer.findFirst({where:{email:'empty-pets@audit.invalid'}});assert.ok(owner);assert.equal(await p.pet.count({where:{customerId:owner.id}}),1);
  });
  await test("Automatic product expiry notifies the client once and safely restores uncollected stock",async()=>{
    const now=Date.now();
    await p.systemSetting.upsert({where:{key:'product_reservation_expiry_enabled_after'},create:{key:'product_reservation_expiry_enabled_after',value:new Date(now-2*3600000).toISOString()},update:{value:new Date(now-2*3600000).toISOString()}});
    await p.systemSetting.upsert({where:{key:'product_reservation_expiry_grace_minutes'},create:{key:'product_reservation_expiry_grace_minutes',value:'0'},update:{value:'0'}});
    const item=await p.product.create({data:{productName:'Expiry fixture',category:'Dog Food',productGroup:'Food',price:12.50,stockQuantity:100,isActive:1}});
    const fixture=async(status,offset)=>{
      const row=await p.productReservation.create({data:{reservationCode:'EXP-'+randomBytes(8).toString('hex'),customerId:customer.id,totalAmount:25,status,reservedUntil:new Date(now+offset),items:{create:{productId:item.productId,quantity:2,unitPrice:12.50}}}});
      await p.product.update({where:{productId:item.productId},data:{stockQuantity:{decrement:2}}});return row;
    };
    const expired=await Promise.all(['Pending','Approved','Ready for Pickup'].map(status=>fixture(status,-60000)));
    const future=await fixture('Pending',3600000),historical=await fixture('Approved',-3*3600000),completed=await fixture('Completed',-60000),cancelled=await fixture('Cancelled',-60000);
    const before=(await p.product.findUniqueOrThrow({where:{productId:item.productId}})).stockQuantity;
    const job=async()=>{const response=await request('/api/cron/grooming-no-shows','',{headers:{Authorization:`Bearer ${cronSecret}`}});assert.equal(response.status,200);return response.json();};
    await Promise.all([job(),job()]);
    assert.equal((await p.product.findUniqueOrThrow({where:{productId:item.productId}})).stockQuantity,before+6);
    const recipient=await p.user.findUniqueOrThrow({where:{email:'client@audit.invalid'}});
    for(const reservation of expired){
      const row=await p.productReservation.findUniqueOrThrow({where:{reservationId:reservation.reservationId}});assert.equal(row.status,'Cancelled');assert.equal(String(row.totalAmount),'25');
      const notes=await p.notification.findMany({where:{eventKey:`product-reservation.auto-cancelled.${reservation.reservationId}`,recipientId:recipient.id}});assert.equal(notes.length,1);assert.ok(notes[0].message.includes(reservation.reservationCode));assert.ok(notes[0].message.includes('pickup deadline'));assert.equal(notes[0].link,'/client/dashboard?view=reservations');
      assert.equal(await p.auditLog.count({where:{module:'Product Reservation',action:'AUTO_CANCEL',recordId:String(reservation.reservationId)}}),1);
    }
    for(const [reservation,status]of[[future,'Pending'],[historical,'Approved'],[completed,'Completed'],[cancelled,'Cancelled']])assert.equal((await p.productReservation.findUniqueOrThrow({where:{reservationId:reservation.reservationId}})).status,status);
    await job();assert.equal((await p.product.findUniqueOrThrow({where:{productId:item.productId}})).stockQuantity,before+6);
    const racing=await fixture('Ready for Pickup',-60000),raceStock=(await p.product.findUniqueOrThrow({where:{productId:item.productId}})).stockQuantity;
    await Promise.all([job(),callAction('/admin/dashboard?view=orders',adminCookie,'updateProductReservationStatus',{id:racing.reservationId,status:'Completed'})]);
    const winner=await p.productReservation.findUniqueOrThrow({where:{reservationId:racing.reservationId}});assert.ok(['Cancelled','Completed'].includes(winner.status));assert.equal((await p.product.findUniqueOrThrow({where:{productId:item.productId}})).stockQuantity,raceStock+(winner.status==='Cancelled'?2:0));
    const feed=await request('/api/client/notifications?take=100',clientCookie);assert.equal(feed.status,200);assert.ok((await feed.text()).includes('Product Reservation Automatically Cancelled'));
  });
  await test("Admin All/Unread filters and mark-all enforce recipient isolation", async () => {
    const client = await p.user.findUnique({ where: { email: "client@audit.invalid" } });
    const foreign = await p.notification.create({ data: { recipientId: client.id, eventKey: "isolation-check", title: "Client-only update", message: "Isolated recipient check", type: "PRODUCT_STATUS", link: "/client/dashboard?view=reservations" } });
    const denied = await request("/api/admin/notifications", adminCookie, { method: "POST", headers: { Origin: base, "Content-Type": "application/json" }, body: JSON.stringify({ id: String(foreign.notificationId) }) }); assert.equal(denied.status, 404);
    const mark = await request("/api/admin/notifications", adminCookie, { method: "POST", headers: { Origin: base, "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) }); assert.equal((await mark.json()).count, 0);
    assert.equal((await p.notification.findUnique({ where: { notificationId: foreign.notificationId } })).isRead, false);
    const all = await (await request("/api/admin/notifications?take=100", adminCookie)).json(); assert.ok(all.notifications.length); assert.ok(all.notifications.every(n => n.isRead));
    const unread = await (await request("/api/admin/notifications?unread=1", adminCookie)).json(); assert.equal(unread.notifications.length, 0);
    const invalid = await request("/api/admin/notifications", adminCookie, { method: "POST", headers: { Origin: base, "Content-Type": "application/json" }, body: JSON.stringify({ id: "99999999999999999999999999" }) }); assert.equal(invalid.status, 400);
  });
  if (process.env.NOTIFICATION_BROWSER_AUDIT === "1") for (const portal of ["client", "admin"]) await test(`Browser ${portal}: notification empty state light/dark contrast and mobile layout`, async () => {
    await p.user.create({data:{email:`empty-${portal}@audit.invalid`,password:await hash(password,12),role:portal==='client'?'User':'Admin',accountStatus:'Active',firstName:'Empty',surname:'Inbox'}});
    const cookie = await login(`empty-${portal}@audit.invalid`,password,portal);
    const { checkNotificationBrowser } = await import("./browser-notification-check.mjs");
    await checkNotificationBrowser(base,cookie,portal,()=>{},true);
  });
  if (process.env.NOTIFICATION_BROWSER_AUDIT === "1") for (const portal of ["client", "admin"]) await test(`Browser ${portal}: notification interactions, themes, responsive layout and database updates`, async () => {
    const recipient = portal === "client" ? await p.user.findUnique({ where: { email: "client@audit.invalid" } }) : admin;
    const fixture = await p.notification.create({ data: { recipientId: recipient.id, eventKey: `browser-primary-${portal}`, title: "Grooming appointment confirmed", message: "Your appointment is confirmed. Review your reservation details.", type: "GROOMING_STATUS", link: `/${portal}/dashboard?view=reservations` } });
    for (let i = 0; i < 18; i++) await p.notification.create({ data: { recipientId: recipient.id, eventKey: `browser-${portal}-${i}`, title: i % 2 ? "Product reservation updated" : "Grooming appointment cancelled", message: "Isolated browser test update with details that should wrap within every mobile screen width.", type: i % 2 ? "PRODUCT_STATUS" : "GROOMING_STATUS", link: `/${portal}/dashboard?view=reservations`, isRead: i % 3 === 0 } });
    const { checkNotificationBrowser } = await import("./browser-notification-check.mjs");
    await checkNotificationBrowser(base, portal === "client" ? clientCookie : adminCookie, portal, async kind => {
      if (kind === "failed") assert.equal((await p.notification.findUnique({ where: { notificationId: fixture.notificationId } })).isRead, false);
      else if (kind === "single") assert.equal((await p.notification.findUnique({ where: { notificationId: fixture.notificationId } })).isRead, true);
      else assert.equal(await p.notification.count({ where: { recipientId: recipient.id, isRead: false } }), 0);
    });
  });
  await test("Legacy PHP uses the same database and enforces pet ownership", async () => {
    await mkdir(".audit-php-sessions", { recursive: true });
    phpServer = spawn("C:/xampp/php/php.exe", ["-d", `session.save_path=${resolve(".audit-php-sessions")}`, "-S", "localhost:3108", "-t", ".."], { env: { ...process.env, DB_HOST: sourceUrl.hostname, DB_NAME: database, DB_USER: decodeURIComponent(sourceUrl.username), DB_PASS: decodeURIComponent(sourceUrl.password), SMTP_USER: "", SMTP_PASS: "" }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    phpServer.stdout.on("data", (bytes) => { serverOutput += bytes; }); phpServer.stderr.on("data", (bytes) => { serverOutput += bytes; });
    const php = (path, cookie = "", options = {}) => fetch(`http://localhost:3108${path}`, { redirect: "manual", signal: AbortSignal.timeout(10000), ...options, headers: { ...(cookie ? { Cookie: cookie } : {}), ...options.headers } });
    for (let attempt = 0; attempt < 30; attempt++) { try { if ((await php("/auth/login.php")).status === 200) break; } catch {} await new Promise((resolve) => setTimeout(resolve, 100)); }
    const loginResponse = await php("/auth/login.php", "", { method: "POST", headers: { Origin: "http://localhost:3108" }, body: new URLSearchParams({ email: "client@audit.invalid", password }) });
    assert.equal(loginResponse.status, 302); const cookie = loginResponse.headers.getSetCookie().at(-1).split(";")[0];
    const other = await p.customer.findFirst({ where: { email: "other@audit.invalid" } });
    const denied = await php("/public/save_pet.php", cookie, { method: "POST", headers: { Origin: "http://localhost:3108" }, body: new URLSearchParams({ customer_id: String(other.id), pet_name: "Unauthorized legacy pet", species: "Dog" }) }); assert.equal(denied.status, 403);
    const saved = await php("/public/save_pet.php", cookie, { method: "POST", headers: { Origin: "http://localhost:3108" }, body: new URLSearchParams({ customer_id: String(customer.id), pet_name: "Legacy audit pet", species: "Dog", breed: "Mixed" }) }); assert.equal(saved.status, 302);
    assert.ok(await p.pet.findFirst({ where: { petName: "Legacy audit pet", customerId: customer.id } }));
    const page = await (await php("/public/products.php", cookie)).text(); const token = page.match(/name="csrf_token" value="([^"]+)"/)[1];
    const before = (await p.product.findUnique({ where: { productId: product.productId } })).stockQuantity;
    const reserved = await php("/public/save_appointment.php", cookie, { method: "POST", headers: { Origin: "http://localhost:3108" }, body: new URLSearchParams({ csrf_token: token, product_id: String(product.productId), quantity: "1" }) }); assert.equal(reserved.status, 302);
    const legacyReservation = await p.productReservation.findFirst({ where: { reservationCode: { startsWith: "PR-" } }, orderBy: { reservationId: "desc" } });
    assert.ok(Math.abs(legacyReservation.createdAt.getTime() - Date.now()) < 10000, "Legacy timestamps must use the same UTC convention as Next.js");
    assert.ok(Math.abs(legacyReservation.reservedUntil.getTime() - Date.now() - 24 * 3600000) < 10000, "Legacy 24-hour holds must not shift by eight hours");
    assert.equal((await p.product.findUnique({ where: { productId: product.productId } })).stockQuantity, before - 1);
    assert.ok(await p.notification.count({ where: { message: { contains: "Reference: PR-" } } }));
    assert.equal((await php("/public/admin.php", cookie)).status, 302);
    const forged = await php("/public/save_pet.php", cookie, { method: "POST", headers: { Origin: "https://untrusted.invalid" }, body: new URLSearchParams() }); assert.equal(forged.status, 403);
    const recoveryPage = await (await php("/auth/forgot_password.php", cookie)).text();
    const recoveryToken = recoveryPage.match(/name="csrf_token" value="([^"]+)"/)[1];
    const failedMail = await php("/auth/forgot_password.php", cookie, { method: "POST", headers: { Origin: "http://localhost:3108" }, body: new URLSearchParams({ csrf_token: recoveryToken, request_code: "1", email: "client@audit.invalid" }) });
    const recoveryText = await failedMail.text(); assert.ok(recoveryText.includes("Email delivery is unavailable")); assert.ok(!recoveryText.includes("For testing"));
    assert.equal((await p.user.findUnique({ where: { email: "client@audit.invalid" } })).resetToken, null);
  });
  if (process.env.BROWSER_AUDIT === "1" || process.env.PRODUCT_BROWSER_AUDIT === "1") await test("Browser: responsive columns, search, categories, badges, images, and reservation UI", async () => {
    const original = (await readFile("../schema", "utf8")).split("TRUNCATE TABLE products;")[1].split("USE petshop_db;")[0];
    const catalog = [...original.matchAll(/\('([^']+)', '([^']+)', '([^']+)', ([\d.]+), '([^']+)'\)/g)];
    await p.product.createMany({ data: catalog.map((match, index) => ({ sku: `UI-${index}`, category: match[1], productName: match[2], description: match[3], price: match[4], image: match[5], productGroup: "Food", stockQuantity: index % 2 === 0 ? 2 : 0 })) });
    const { checkBrowser } = await import("./browser-check.mjs");
    await checkBrowser(base, clientCookie, p);
  });
  const {checkCart}=await import('./test-cart.mjs');
  await checkCart({test,p,request,html,callAction,clientCookie,adminCookie,otherCookie,customer,base});
  const {checkReceipts}=await import('./test-receipts.mjs');
  await checkReceipts({test,p,request,html,callAction,clientCookie,adminCookie,otherCookie,customer});
  const {checkGroomingReceipts}=await import('./test-grooming-receipts.mjs');
  await checkGroomingReceipts({test,p,request,html,callAction,clientCookie,adminCookie,otherCookie,customer,base});
  const {checkMessageImages}=await import('./test-message-images.mjs');
  await checkMessageImages({test,p,request,clientCookie,adminCookie,otherCookie,base});
  const {checkGoogleAuth}=await import('./test-google-auth.mjs');
  await checkGoogleAuth({test,p,request,html,admin});
  const {checkReviews}=await import('./test-reviews.mjs');
  await checkReviews({test,request,html,p,clientCookie,otherCookie,adminCookie,customer,style,groomer,base});
  await test("Authenticated password change keeps this session and revokes old sessions", async () => {
    const oldCookie = clientCookie; const nextPassword = `Bb2!${randomBytes(20).toString("hex")}`;
    const r = await callAction("/client/dashboard?view=account", clientCookie, "changePassword", { currentPassword: password, password: nextPassword, confirmPassword: nextPassword });
    assert.ok(r.headers.get("set-cookie")); clientCookie = r.headers.get("set-cookie").split(";")[0];
    assert.equal((await request("/api/client/notifications", oldCookie)).status, 401); assert.equal((await request("/api/client/notifications", clientCookie)).status, 200);
    assert.ok(await compare(nextPassword, (await p.user.findUnique({ where: { email: "client@audit.invalid" } })).password));
  });
  await test("Grooming reminders use latest completed visit and retain failed sends for retry", async () => {
    assert.equal((await request("/api/cron/grooming-reminders")).status, 401);
    const reminderPet = await p.pet.create({ data: { customerId: customer.id, petName: "Isolated reminder pet", species: "Dog" } });
    const createVisit = (daysAgo) => p.groomingAppointment.create({ data: { reservationCode: `AUD-${randomBytes(8).toString("hex")}`, customerId: customer.id, petId: reminderPet.id, groomingStyleId: style.styleId, groomerId: groomer.groomerId, petSize: "Small", totalPrice: 350, appointmentDate: new Date(new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10)), appointmentTime: new Date("1970-01-01T09:00:00Z"), status: "Completed", confirmationEmailSentAt: new Date() } });
    await createVisit(45); const recent = await createVisit(1);
    let result = await (await request("/api/cron/grooming-reminders", "", { headers: { Authorization: `Bearer ${cronSecret}` } })).json(); assert.equal(result.checked, 0);
    await p.groomingAppointment.update({ where: { appointmentId: recent.appointmentId }, data: { appointmentDate: new Date(new Date(Date.now() - 35 * 86400000).toISOString().slice(0, 10)) } });
    result = await (await request("/api/cron/grooming-reminders", "", { headers: { Authorization: `Bearer ${cronSecret}` } })).json(); assert.equal(result.failed, 1); assert.equal(result.sent, 0);
    const row = await p.groomingAppointment.findUnique({ where: { appointmentId: recent.appointmentId } }); assert.equal(row.reminderEmailSentAt, null); assert.ok(row.confirmationEmailSentAt);
  });
  await test("Suspended account session denied immediately", async () => {
    await p.user.update({ where: { id: admin.id }, data: { accountStatus: "Suspended" } }); assert.equal((await request("/api/admin/notifications", adminCookie)).status, 401); await p.user.update({ where: { id: admin.id }, data: { accountStatus: "Active" } });
  });
  await test("Repeated invalid administrator passwords trigger timed lockout", async () => {
    for (let attempt = 0; attempt < 5; attempt++) await request("/api/auth/admin-login", "", { method: "POST", headers: { Origin: base }, body: new URLSearchParams({ email: admin.email, password: randomBytes(12).toString("hex") }) });
    assert.ok((await p.user.findUnique({ where: { id: admin.id } })).lockoutTime);
    const correct = await request("/api/auth/admin-login", "", { method: "POST", headers: { Origin: base }, body: new URLSearchParams({ email: admin.email, password }) }); assert.ok(correct.headers.get("location").includes("error=invalid"));
    await p.user.update({ where: { id: admin.id }, data: { failedAttempts: 0, lockoutTime: null } });
  });
  await test("Password update invalidates previously issued session", async () => {
    const user = await p.user.findUnique({ where: { email: "client@audit.invalid" } }); await p.user.update({ where: { id: user.id }, data: { password: await hash(randomBytes(24).toString("hex"), 12) } }); assert.equal((await request("/client/dashboard", clientCookie)).status, 307);
  });
  await test("Logout clears the session cookie", async () => {
    const r = await request("/api/auth/logout", adminCookie, { method: "POST", headers: { Origin: base }, body: new URLSearchParams({ destination: "admin" }) }); assert.equal(r.status, 303); assert.ok(r.headers.get("set-cookie").includes("1970"));
    assert.equal((await request("/api/admin/notifications", adminCookie)).status, 401, "Logged-out cookies must not be replayable");
  });
  await test("Super Admin bootstrap and authorized account management", async () => {
    const bootstrap = await p.user.create({ data: { email: "bootstrap@audit.invalid", role: "Admin", accountStatus: "Active", password: await hash(password, 12) } });
    const r = await request("/api/auth/superadmin-setup", "", { method: "POST", headers: { Origin: base }, body: new URLSearchParams({ email: bootstrap.email, password }) }); assert.equal(r.status, 303); assert.ok(r.headers.get("location").includes("/superadmin/dashboard"));
    const rootCookie = r.headers.get("set-cookie").split(";")[0]; await html("/superadmin/dashboard", rootCookie); await html("/admin/dashboard?view=admins", rootCookie);
    const managedPassword = `Dd4!${randomBytes(20).toString("hex")}`;
    const created = await callAction("/superadmin/dashboard", rootCookie, "createManagedAccount", { firstName: "Managed", surname: "Audit", email: "managed@audit.invalid", role: "Admin", password: managedPassword, confirmPassword: managedPassword, returnTo: "/superadmin/dashboard" }); assert.equal(created.status, 303);
    const managed = await p.user.findUnique({ where: { email: "managed@audit.invalid" } }); assert.equal(managed.role, "Admin"); assert.ok(await compare(managedPassword, managed.password));
    await callAction("/superadmin/dashboard", rootCookie, "updateManagedAccount", { id: managed.id, role: "User", status: "Suspended", returnTo: "/superadmin/dashboard" }); assert.equal((await p.user.findUnique({ where: { id: managed.id } })).accountStatus, "Suspended");
    const second = await request("/api/auth/superadmin-setup", "", { method: "POST", headers: { Origin: base }, body: new URLSearchParams({ email: admin.email, password }) }); assert.ok(second.headers.get("location").includes("setup-closed"));
  });
  await test("Password reset verification is one-time and invalidates sessions", async () => {
    const user = await p.user.findUnique({ where: { email: "other@audit.invalid" } });
    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const digest = createHmac("sha256", authSecret).update(`password-reset:${user.id}:${user.email}:${code}`).digest("hex");
    await p.user.update({ where: { id: user.id }, data: { resetToken: `v1.${Date.now()}.0.${digest}`, resetExpires: new Date(Date.now() + 600000) } });
    const nextPassword = `Cc3!${randomBytes(20).toString("hex")}`;
    const wrongCode = String((Number(code) + 1) % 1000000).padStart(6, "0");
    const incorrect = await Promise.all(Array.from({ length: 5 }, () => request("/api/auth/forgot-password/reset", "", { method: "POST", headers: { Origin: base, "Content-Type": "application/json" }, body: JSON.stringify({ email: user.email, code: wrongCode, password: nextPassword, confirmPassword: nextPassword }) })));
    assert.ok(incorrect.every((response) => response.status === 400)); assert.equal((await p.user.findUnique({ where: { id: user.id } })).resetToken, null);
    await p.user.update({ where: { id: user.id }, data: { resetToken: `v1.${Date.now()}.0.${digest}`, resetExpires: new Date(Date.now() + 600000) } });
    const send = () => request("/api/auth/forgot-password/reset", "", { method: "POST", headers: { Origin: base, "Content-Type": "application/json" }, body: JSON.stringify({ email: user.email, code, password: nextPassword, confirmPassword: nextPassword }) });
    assert.equal((await send()).status, 200); assert.equal((await send()).status, 400);
    assert.equal((await request("/api/client/notifications", otherCookie)).status, 401);
    assert.ok(await compare(nextPassword, (await p.user.findUnique({ where: { id: user.id } })).password));
  });
} catch (error) { results.push({ name: "Test setup", status: "failed", error: error.message }); console.error(error.message); }
finally {
  server?.kill(); phpServer?.kill(); await p.$disconnect(); await source.$disconnect();
  await writeFile("SYSTEM_TEST_RESULTS.json", JSON.stringify({ database, timestamp: new Date().toISOString(), results }, null, 2));
  await writeFile("SYSTEM_TEST_SERVER.log", serverOutput);
  console.log(`Audit database retained: ${database}. No shop data changed.`);
  if (results.some((item) => item.status === "failed")) process.exitCode = 1;
}
