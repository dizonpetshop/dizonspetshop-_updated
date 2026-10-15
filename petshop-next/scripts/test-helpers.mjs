import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { registerHooks } from "node:module";

registerHooks({ resolve(specifier, context, next) { try { return next(specifier, context); } catch (error) { if (specifier.startsWith("./") && context.parentURL?.includes("/src/lib/")) return next(`${specifier}.ts`, context); throw error; } } });
const { businessDate, validDate, validTime, wallClockTime, appointmentInstant } = await import("../src/lib/business-time.ts");
const { resolveReportPeriod, reportAppointmentWhere } = await import("../src/lib/reporting.ts");
const { uploadedImage } = await import("../src/lib/image-upload.ts");
const { createPasswordResetToken, readPasswordResetToken, passwordResetCodeMatches, withFailedAttempt, isStrongPassword } = await import("../src/lib/password-reset.ts");
process.env.AUTH_SECRET = randomBytes(32).toString("hex");
const tests = [];
const {loyaltyDiscountPercent}=await import('../src/lib/loyalty-policy.ts');
async function test(name, run) { await run(); tests.push(name); console.log(`PASS ${name}`); }
const {stockStatus}=await import("../src/lib/stock-status.ts");
const {getProductPortion,getReservedPortion}=await import("../src/lib/product-portions.ts");
await test('Receipt VAT inclusive, exclusive, exempt, zero-rated, mixed treatment and free-price validation',async()=>{
 const {reservationAmounts,parseTaxPolicy}=await import('../src/lib/reservation-tax.ts');
 const policy=treatment=>parseTaxPolicy(JSON.stringify({treatment,rate:'0.12',products:{},freeProductIds:[]}));
 const line=(price,id=1)=>({productId:id,name:'Tax test',quantity:1,unitPrice:price});
 let a=reservationAmounts([line('112')],policy('inclusive'));assert.equal(a.vatable,'100.00');assert.equal(a.vat,'12.00');assert.equal(a.total,'112.00');assert.equal(a.addedVat,'0.00');
 a=reservationAmounts([line('100')],policy('exclusive'));assert.equal(a.vat,'12.00');assert.equal(a.total,'112.00');
 a=reservationAmounts([line('100')],policy('exempt'));assert.equal(a.exempt,'100.00');assert.equal(a.vat,'0.00');assert.equal(a.total,'100.00');
 a=reservationAmounts([line('100')],policy('zero-rated'));assert.equal(a.zeroRated,'100.00');assert.equal(a.vat,'0.00');
 a=reservationAmounts([line('112'),line('100',2),line('50',3)],{...policy('inclusive'),products:{2:'exclusive',3:'exempt'}});assert.equal(a.subtotal,'262.00');assert.equal(a.total,'274.00');assert.equal(a.vat,'24.00');
 assert.throws(()=>reservationAmounts([line('0')],policy('exempt'),true));assert.equal(reservationAmounts([line('0')],{...policy('exempt'),freeProductIds:[1]},true).total,'0.00');
 assert.throws(()=>parseTaxPolicy('{"treatment":"inclusive","rate":12}'));
});
await test('Reservation cart validates distinct products, whole quantities and pickup boundaries',async()=>{
  const {parseCartLines,pickupInstant,paymentPreference}=await import('../src/lib/cart-rules.ts');
  assert.deepEqual(parseCartLines([{productId:2,quantity:3},{productId:1,quantity:1}]),[{productId:1,quantity:1},{productId:2,quantity:3}]);
  for(const lines of [[],[{productId:1,quantity:0}],[{productId:1,quantity:1.5}],[{productId:'1',quantity:1}],[{productId:1,quantity:1},{productId:1,quantity:2}]])assert.throws(()=>parseCartLines(lines));
  const now=Date.parse('2026-10-15T00:00:00Z');assert.equal(pickupInstant('2026-10-15','09:00',now).toISOString(),'2026-10-15T01:00:00.000Z');
  for(const pair of [['2026-02-30','10:00'],['2026-10-14','10:00'],['2026-10-16','08:59'],['2026-10-16','19:01'],['2026-11-30','10:00']])assert.throws(()=>pickupInstant(...pair,now));
  assert.equal(paymentPreference('PRD-GCASH-a'),'GCash');assert.equal(paymentPreference('PRD-CSH-a'),'Cash');assert.equal(paymentPreference('PRD-MAYA-a'),'Maya');
});

await test('Google OAuth state, PKCE and signed identity validation',async()=>{
  const {createGoogleFlow,verifyGoogleFlow,verifyGoogleIdentity,googleConfig}=await import('../src/lib/google-auth.ts');
  const {generateKeyPair,SignJWT}=await import('jose');const {createHash}=await import('node:crypto');
  const flow=await createGoogleFlow();const verified=await verifyGoogleFlow(flow.token,flow.state);
  assert.equal(createHash('sha256').update(verified.verifier).digest('base64url'),flow.challenge);
  await assert.rejects(()=>verifyGoogleFlow(flow.token,'x'.repeat(43)));await assert.rejects(()=>verifyGoogleFlow(flow.token+'bad',flow.state));
  const {privateKey,publicKey}=await generateKeyPair('RS256');const key=async()=>publicKey;
  const token=async(overrides={},issuer='https://accounts.google.com',aud='audit-client')=>new SignJWT({sub:'123456789',nonce:flow.nonce,email:'customer@gmail.com',email_verified:true,given_name:'Customer',...overrides}).setProtectedHeader({alg:'RS256'}).setIssuer(issuer).setAudience(aud).setIssuedAt().setExpirationTime('5m').sign(privateKey);
  const identity=await verifyGoogleIdentity(await token(),flow.nonce,'audit-client',key);assert.equal(identity.subject,'123456789');assert.equal(identity.authoritative,true);
  for(const overrides of [{nonce:'wrong'},{email_verified:false},{email:'invalid'},{azp:'another-client'}])await assert.rejects(async()=>verifyGoogleIdentity(await token(overrides),flow.nonce,'audit-client',key));
  await assert.rejects(async()=>verifyGoogleIdentity(await token({},'https://attacker.invalid'),flow.nonce,'audit-client',key));
  await assert.rejects(async()=>verifyGoogleIdentity(await token({},'https://accounts.google.com','wrong-client'),flow.nonce,'audit-client',key));
  const thirdParty=await verifyGoogleIdentity(await token({email:'customer@example.com'}),flow.nonce,'audit-client',key);assert.equal(thirdParty.authoritative,false);
  const names=['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GOOGLE_REDIRECT_URI'],old=names.map(n=>process.env[n]);
  try{process.env.GOOGLE_CLIENT_ID='test';process.env.GOOGLE_CLIENT_SECRET='test';process.env.GOOGLE_REDIRECT_URI='http://localhost:3000/api/auth/google/callback';assert.equal(googleConfig().secure,false);process.env.GOOGLE_REDIRECT_URI='http://attacker.invalid/api/auth/google/callback';assert.throws(()=>googleConfig());}finally{names.forEach((n,i)=>{if(old[i]===undefined)delete process.env[n];else process.env[n]=old[i];});}
});

await test("Half-kilo products use their editable catalog price",()=>{for(const name of ["Beef Teriyaki","Cuties Catz","Holistic","Special Dog","Toeicat","ToeiDog","Top Breed Adult","Zoi Cat","Zoi Dog"]){assert.deepEqual(getProductPortion(name,123),{value:"half-kilo",label:"1/2 kilo",price:123});assert.equal(getReservedPortion(name,123),"1/2 kilo");}assert.equal(getProductPortion("Denta Pro",210),null);assert.equal(getReservedPortion("Denta Pro",210),null);});
await test("Stock status honors each product threshold and zero inventory",()=>{assert.equal(stockStatus(0,5).label,"Out of Stock");assert.equal(stockStatus(5,5).label,"Low Stock");assert.equal(stockStatus(6,5).label,"In Stock");assert.equal(stockStatus(15,50).label,"Low Stock");assert.equal(stockStatus(1,0).label,"In Stock");});
await test('Loyalty milestones and permanent VIP service discount',()=>{for(const [visit,rate] of [[1,0],[4,0],[5,50],[6,0],[9,0],[10,50],[11,10],[12,10],[100,10]])assert.equal(loyaltyDiscountPercent(visit),rate);assert.equal(loyaltyDiscountPercent(5,true),10);});
await test("Manila date and report ranges independent of server timezone", () => {
  const now = new Date("2026-10-13T18:00:00Z");
  assert.equal(businessDate(now), "2026-10-14");
  for (const timezone of ["UTC", "America/Los_Angeles", "Asia/Singapore"]) {
    process.env.TZ = timezone;
    const midnightAppointment=appointmentInstant(new Date('2026-10-15T00:00:00Z'),new Date('1970-01-01T00:05:00Z'));
    assert.equal(midnightAppointment.toISOString(),'2026-10-14T16:05:00.000Z');
    assert.equal(new Date(midnightAppointment.getTime()+15*60000).toISOString(),'2026-10-14T16:20:00.000Z');
    assert.equal(resolveReportPeriod({ range: "today" }, now).start.toISOString(), "2026-10-13T16:00:00.000Z");
    assert.equal(resolveReportPeriod({ range: "month" }, now).start.toISOString(), "2026-09-30T16:00:00.000Z");
    assert.equal(resolveReportPeriod({ range: "year" }, now).start.toISOString(), "2025-12-31T16:00:00.000Z");
    assert.equal(reportAppointmentWhere(resolveReportPeriod({ range: "today" }, now)).appointmentDate.gte.toISOString(), "2026-10-14T00:00:00.000Z");
    assert.match(wallClockTime(new Date("1970-01-01T09:00:00Z")), /9:00/);
  }
});
await test("Invalid calendar dates and times are rejected", () => { assert.equal(validDate("2026-02-30"), false); assert.equal(validDate("2024-02-29"), true); assert.equal(validTime("24:00"), false); assert.equal(validTime("09:60"), false); assert.equal(validTime("09:00"), true); assert.throws(() => resolveReportPeriod({ range: "custom", from: "2026-10-15", to: "2026-10-14" }, new Date(), true)); });
await test("Truncated PNG and mismatched image contents are rejected", async () => {
  const form = new FormData(); form.set("photo", new File([new Uint8Array([137])], "bad.png", { type: "image/png" })); await assert.rejects(() => uploadedImage(form, "photo"));
  form.set("photo", new File(["not an image"], "bad.jpg", { type: "image/jpeg" })); await assert.rejects(() => uploadedImage(form, "photo"));
  form.set("photo", new File([new Uint8Array(1_500_001)], "large.jpg", { type: "image/jpeg" })); await assert.rejects(() => uploadedImage(form, "photo"));
});
await test("Reset codes bound to user/email and failure count", () => {
  const token = createPasswordResetToken(1, "a@example.invalid", "123456"); const parsed = readPasswordResetToken(token);
  assert.equal(passwordResetCodeMatches(1, "a@example.invalid", "123456", parsed.hash), true);
  assert.equal(passwordResetCodeMatches(2, "a@example.invalid", "123456", parsed.hash), false);
  assert.equal(passwordResetCodeMatches(1, "b@example.invalid", "123456", parsed.hash), false);
  assert.equal(readPasswordResetToken(withFailedAttempt(token, 3)).attempts, 3);
  assert.equal(isStrongPassword("weakpassword"), false); assert.equal(isStrongPassword(`Aa1!${"x".repeat(69)}`), false);
});
console.log(`${tests.length} helper tests passed.`);
