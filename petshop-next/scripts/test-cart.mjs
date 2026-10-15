import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
export async function checkCart({test,p,request,html,callAction,clientCookie,adminCookie,otherCookie,customer,base}){
  const make=async(name,price,stock=10)=>p.product.create({data:{sku:'CART-'+randomBytes(5).toString('hex'),productName:name,category:'Dog Food',productGroup:'Food',price,stockQuantity:stock,reorderLevel:2,isActive:1,image:'beefteriyaki.jpg'}});
  const a=await make('Cart audit A','10.25'),b=await make('Cart audit B','20.50'),c=await make('Cart audit C','30.75');
  const tomorrow=new Date(Date.now()+86400000+8*3600000).toISOString().slice(0,10);
  const details={pickupDate:tomorrow,pickupTime:'12:00',paymentMethod:'GCash'};
  const token=()=>randomBytes(16).toString('hex');
  const send=(fields,cookie=clientCookie)=>callAction('/client/dashboard?view=products',cookie,'checkoutReservationCart',{...details,requestToken:token(),...fields});
  const lines=[{productId:a.productId,quantity:2,expectedPrice:10.25},{productId:b.productId,quantity:3,expectedPrice:20.5}];
  let reservation;
  await p.customer.update({where:{id:customer.id},data:{phone:'09123456789',address:'Saved isolated cart address'}});
  await test('Cart: direct quote is private, authenticated, read-only and returns the saved profile',async()=>{
    const path='/api/reservations/quote?'+new URLSearchParams({items:JSON.stringify([{productId:a.productId,quantity:1}])});
    const before=await p.productReservation.count(),stock=(await p.product.findUnique({where:{productId:a.productId}})).stockQuantity;
    assert.equal((await request(path)).status,401);
    const start=performance.now(),response=await request(path,clientCookie),result=await response.json();
    assert.equal(response.status,200);assert.ok(response.headers.get('cache-control').includes('no-store'));assert.equal(result.quote.profile.address,'Saved isolated cart address');assert.equal(result.quote.items[0].quantity,1);assert.equal(result.quote.total,10.25);
    console.log(`Quote endpoint latency (isolated test server): ${Math.round(performance.now()-start)} ms`);
    assert.equal(await p.productReservation.count(),before);assert.equal((await p.product.findUnique({where:{productId:a.productId}})).stockQuantity,stock);
    await p.product.update({where:{productId:a.productId},data:{price:0}});
    try{const blocked=await request(path,clientCookie),preview=await blocked.json();assert.equal(blocked.status,200);assert.equal(preview.quote.profile.address,'Saved isolated cart address');assert.equal(preview.quote.items[0].name,a.productName);assert.deepEqual(preview.quote.unconfirmedPrices,[a.productName]);}
    finally{await p.product.update({where:{productId:a.productId},data:{price:'10.25'}});}
  });
  await test('Cart: one checkout persists multiple items, saved profile and payment, using real prices',async()=>{
    const key=token(),before=await p.productReservation.count();
    await send({requestToken:key,items:JSON.stringify(lines),contactNumber:'09999999999',address:'Forged address',total:'0.01'});
    assert.equal(await p.productReservation.count(),before+1);
    const meta=await p.$queryRaw`SELECT reservation_id,payment_method FROM product_reservation_checkout WHERE customer_id=${customer.id} AND request_key=${key}`;assert.equal(meta.length,1);assert.equal(meta[0].payment_method,'GCash');
    reservation=await p.productReservation.findUniqueOrThrow({where:{reservationId:meta[0].reservation_id},include:{items:true}});
    assert.equal(reservation.items.length,2);assert.equal(Number(reservation.totalAmount),82);assert.equal(reservation.contactNumber,'09123456789');assert.equal(reservation.deliveryAddress,'Saved isolated cart address');assert.equal(reservation.status,'Pending');assert.ok(reservation.reservationCode.startsWith('PRD-GCASH-'));
    assert.equal((await p.product.findUnique({where:{productId:a.productId}})).stockQuantity,8);assert.equal((await p.product.findUnique({where:{productId:b.productId}})).stockQuantity,7);
    assert.equal(await p.notification.count({where:{eventKey:`product-reservation.created.${reservation.reservationId}`,recipient:{role:'Admin'}}}),1);
    assert.ok((await html('/client/dashboard?view=reservations',clientCookie)).includes(a.productName));assert.ok((await html('/admin/dashboard?view=orders',adminCookie)).includes(b.productName));
  });
  await test('Cart: cancellation restores every item exactly once under concurrent requests',async()=>{
    await Promise.all([1,2].map(()=>callAction('/client/dashboard?view=reservations',clientCookie,'cancelProductReservation',{id:String(reservation.reservationId)})));
    assert.equal((await p.product.findUnique({where:{productId:a.productId}})).stockQuantity,10);assert.equal((await p.product.findUnique({where:{productId:b.productId}})).stockQuantity,10);
  });
  await test('Cart: stock/price conflicts roll back the entire reservation and inventory changes',async()=>{
    const before=await p.productReservation.count();
    for(const invalid of [[...lines.map(i=>({...i})),{productId:c.productId,quantity:50,expectedPrice:30.75}],[{productId:a.productId,quantity:2,expectedPrice:0.01},lines[1]],[{productId:a.productId,quantity:1.5,expectedPrice:10.25}],[lines[0],lines[0]]])await send({items:JSON.stringify(invalid)});
    assert.equal(await p.productReservation.count(),before);assert.equal((await p.product.findUnique({where:{productId:a.productId}})).stockQuantity,10);
    await p.product.update({where:{productId:b.productId},data:{isActive:0}});await send({items:JSON.stringify(lines)});assert.equal(await p.productReservation.count(),before);await p.product.update({where:{productId:b.productId},data:{isActive:1}});
  });
  await test('Cart: repeated and conflicting submissions cannot create duplicate reservations',async()=>{
    const key=token(),before=await p.productReservation.count();
    await Promise.all([1,2].map(()=>send({requestToken:key,items:JSON.stringify(lines)})));
    assert.equal(await p.productReservation.count(),before+1);assert.equal((await p.product.findUnique({where:{productId:a.productId}})).stockQuantity,8);
    await send({requestToken:key,items:JSON.stringify(lines),paymentMethod:'Maya'});assert.equal(await p.productReservation.count(),before+1);
    const meta=await p.$queryRaw`SELECT reservation_id FROM product_reservation_checkout WHERE request_key=${key} AND customer_id=${customer.id}`;
    await callAction('/client/dashboard?view=reservations',clientCookie,'cancelProductReservation',{id:String(meta[0].reservation_id)});
  });
  await test('Cart: pickup, profile and payment validation cannot be bypassed or forged',async()=>{
    const before=await p.productReservation.count();
    for(const fields of [{pickupDate:'2000-01-01'},{pickupTime:'19:01'},{pickupDate:'2099-01-01'},{paymentMethod:'Bank Transfer'}])await send({items:JSON.stringify(lines),...fields});
    await p.customer.update({where:{id:customer.id},data:{address:null}});await send({items:JSON.stringify(lines),address:'Forged address'});await p.customer.update({where:{id:customer.id},data:{address:'Saved isolated cart address'}});
    assert.equal(await p.productReservation.count(),before);
    await send({items:JSON.stringify(lines)},adminCookie);assert.equal(await p.productReservation.count(),before);
    const guest=await send({items:JSON.stringify(lines)},'');assert.equal(guest.status,307);
  });
  await test('Cart: concurrent different checkouts cannot oversell any selected product',async()=>{
    const limited=await make('Cart last unit','12.00',1),before=await p.productReservation.count();
    const selection=[{productId:limited.productId,quantity:1,expectedPrice:12},{productId:c.productId,quantity:1,expectedPrice:30.75}];
    const otherUser=await p.user.findUniqueOrThrow({where:{email:'other@audit.invalid'}});
    const otherCustomer=await p.customer.findFirstOrThrow({where:{email:otherUser.email}});await p.customer.update({where:{id:otherCustomer.id},data:{phone:'09123456789',address:'Other isolated pickup contact address'}});
    await Promise.all([send({items:JSON.stringify(selection)}),send({items:JSON.stringify(selection)},otherCookie)]);
    assert.equal(await p.productReservation.count(),before+1);assert.equal((await p.product.findUnique({where:{productId:limited.productId}})).stockQuantity,0);assert.equal((await p.product.findUnique({where:{productId:c.productId}})).stockQuantity,9);
  });
  await test('Cart: configured pickup days and hours are enforced server-side',async()=>{
    const before=await p.productReservation.count();
    const day=new Date(tomorrow+'T12:00:00Z').getUTCDay();
    try{
      await p.systemSetting.upsert({where:{key:'product_pickup_policy'},create:{key:'product_pickup_policy',value:JSON.stringify({opens:10,closes:16,intervalMinutes:30,maxDays:7,days:[(day+1)%7]})},update:{value:JSON.stringify({opens:10,closes:16,intervalMinutes:30,maxDays:7,days:[(day+1)%7]})}});
      await send({items:JSON.stringify(lines)});assert.equal(await p.productReservation.count(),before);
      await p.systemSetting.update({where:{key:'product_pickup_policy'},data:{value:JSON.stringify({opens:10,closes:11,intervalMinutes:30,maxDays:7,days:[day]})}});
      await send({items:JSON.stringify(lines)});assert.equal(await p.productReservation.count(),before);
    }finally{await p.systemSetting.delete({where:{key:'product_pickup_policy'}});}
  });
  if(process.env.CART_BROWSER_AUDIT==='1')await test('Cart: browser persistence, customer isolation, selected checkout, profile autofill and responsive layouts',async()=>{
    const products=[await make('Cart browser A','10.25'),await make('Cart browser B','20.50'),await make('Cart browser C','30.75'),await make('Cart browser unavailable','4.00',0)];
    const {checkCartBrowser}=await import('./browser-cart-check.mjs');await checkCartBrowser({base,clientCookie,otherCookie,p,customer,products});
  });
}
