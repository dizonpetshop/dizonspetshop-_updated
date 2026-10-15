"use server";
import {productTaxPolicy,saveReceiptSnapshot} from '@/lib/reservation-receipt-data';
import {reservationAmounts} from '@/lib/reservation-tax';

import {groomingTaxPolicy,saveGroomingReceipt} from '@/lib/grooming-receipt';
import {recordLoyaltyQuote} from "@/lib/loyalty";

import { businessDate, validDate, validTime } from "@/lib/business-time";
import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { hasGroomingConflict } from "@/lib/grooming-conflicts";
import { prisma } from "@/lib/prisma";
import { uploadedImage } from "@/lib/image-upload";
import { transitionProductReservation, transitionAppointment } from "@/lib/reservation-transitions";
import { isPhilippinePhone, notifyAdministrators, notifyCustomer, requestIp, writeAudit } from "@/lib/operations";
import { readSessionToken, sessionCookieName } from "@/lib/session";
import { sendAppointmentReceived } from "@/lib/mail";
import { getProductPortion } from "@/lib/product-portions";
import {Prisma} from '@prisma/client';
import {productPickupPolicy} from '@/lib/product-pickup-policy';
import {parseCartLines,pickupInstant} from '@/lib/cart-rules';

const petSizes = ["Small", "Medium", "Large", "Extra Large", "Giant"] as const;
const bookingTypes = ["Salon", "Home Service"] as const;
const paymentMethods = ["Cash", "GCash", "Maya"] as const;

function text(form: FormData, key: string) {
  const value = String(form.get(key) ?? "").trim();
  const limits: Record<string, number> = { firstName: 100, surname: 100, phone: 20, petName: 100, contactName: 150, contactNumber: 20, address: 2000, instructions: 5000 };
  if (value.length > (limits[key] || 2000)) throw new Error(`${key} is too long.`);
  return value;
}
function positiveInteger(form: FormData, key: string) {
  const value = Number(form.get(key));
  if (!Number.isSafeInteger(value) || value < 1 || value > 2147483647) throw new Error(`Invalid ${key}.`);
  return value;
}
function allowed(value: string, values: readonly string[]) { return values.includes(value); }
function submissionReference(prefix: string, customerId: number, form: FormData) {
  const token = text(form, "requestToken");
  if (!/^[a-f0-9]{32}$/.test(token)) throw new Error("Please reopen the form and try again.");
  return `${prefix}-${createHash("sha256").update(`${customerId}:${token}`).digest("hex")}`.slice(0, 24);
}

async function requireClient() {
  const session = await readSessionToken((await cookies()).get(sessionCookieName)?.value);
  if (session?.role !== "User") throw new Error("Client access required.");
  const user = await prisma.user.findFirst({ where: { id: session.userId, role: "User", accountStatus: "Active" } });
  if (!user) throw new Error("Client access required.");
  return user;
}

async function ensureCustomer(user: Awaited<ReturnType<typeof requireClient>>) {
  const saved=await prisma.customer.findFirst({where:{email:user.email}});
  if(saved)return saved;
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`;
    const existing = await tx.customer.findFirst({ where: { email: user.email } });
    if (existing) return existing;
    return tx.customer.create({ data: { customerName: [user.firstName, user.surname].filter(Boolean).join(" ") || "Client", email: user.email, phone: user.phoneNumber || "Not provided" } });
  });
}

function finish(view: string, message: string, error = false): never {
  revalidatePath("/client/dashboard");
  revalidatePath("/admin/dashboard");
  redirect(`/client/dashboard?view=${view}&notice=${encodeURIComponent(message)}${error ? "&noticeKind=error" : ""}`);
}

async function updateProfileImpl(form: FormData, inline = false) {
  const user = await requireClient();
  const firstName = text(form, "firstName");
  const surname = text(form, "surname");
  const middleInitial = text(form, "middleInitial").slice(0, 2) || null;
  const phone = text(form, "phone");
  const address = text(form, "address") || null;
  if (!firstName || !surname || !isPhilippinePhone(phone)) throw new Error("Enter a name and a valid Philippine mobile number.");
  const customer = await ensureCustomer(user);
  const ip = await requestIp();
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { firstName, surname, middleInitial, phoneNumber: phone } }),
    prisma.customer.update({ where: { id: customer.id }, data: { customerName: [firstName, middleInitial, surname].filter(Boolean).join(" "), phone, address } }),
    prisma.auditLog.create({ data: { userId: user.id, userName: [firstName, surname].join(" "), role: "Customer", action: "UPDATE", module: "Customer Profile", recordId: String(customer.id), description: "Updated customer contact information.", ipAddress: ip } }),
  ]);
  if (inline) { revalidatePath('/client/dashboard'); return; }
  finish("account", "Profile updated successfully.");
}

export async function saveCheckoutProfile(form: FormData) {
  try { await updateProfileImpl(form, true); return {ok:true,error:null}; }
  catch(error) { unstable_rethrow(error); return {ok:false,error:error instanceof Error&&!error.name.startsWith('Prisma')?error.message:'Unable to save your profile.'}; }
}

async function createPetImpl(form: FormData) {
  const user = await requireClient();
  const petName = text(form, "petName");
  const species = text(form, "species");
  if (!petName || petName.length > 100) throw new Error("Enter a pet name of at most 100 characters.");
  if (!["Dog", "Cat", "Other"].includes(species)) throw new Error("Select a valid pet type.");
  const photoPath = await uploadedImage(form, "photo");
  const customer = await ensureCustomer(user);
  const ip = await requestIp();
  return prisma.$transaction(async tx => {
    const pet = await tx.pet.create({ data: { customerId: customer.id, petName, species, photoPath } });
    await writeAudit(tx, { userId: user.id, name: customer.customerName, role: "Customer" }, "CREATE", "Pet", `Added pet profile for ${petName}.`, pet.id, ip);
    return pet.id;
  });
}

async function updatePetImpl(form: FormData) {
  const user = await requireClient();
  const customer = await ensureCustomer(user);
  const petId = positiveInteger(form, "id");
  const petName = text(form, "petName");
  const species = text(form, "species");
  if (!petName || petName.length > 100) throw new Error("Enter a pet name of at most 100 characters.");
  if (!["Dog", "Cat", "Other"].includes(species)) throw new Error("Select a valid pet type.");
  const replacement = await uploadedImage(form, "photo");
  const ip = await requestIp();
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM pets WHERE id = ${petId} FOR UPDATE`;
    const current = await tx.pet.findFirst({ where: { id: petId, customerId: customer.id, isActive: 1 }, select: { photoPath: true } });
    if (!current) throw new Error("Pet profile not found.");
    await tx.pet.update({ where: { id: petId }, data: { petName, species, photoPath: replacement || current.photoPath } });
    await writeAudit(tx, { userId: user.id, name: customer.customerName, role: "Customer" }, "UPDATE", "Pet", `Updated pet profile for ${petName}.`, petId, ip);
  });
}

async function archivePetImpl(form: FormData) {
  const user = await requireClient();
  const customer = await ensureCustomer(user);
  const petId = positiveInteger(form, "id");
  const ip = await requestIp();
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM pets WHERE id = ${petId} FOR UPDATE`;
    const pet = await tx.pet.findFirst({ where: { id: petId, customerId: customer.id } });
    if (!pet) throw new Error("Pet profile not found.");
    if (!pet.isActive) return;
    const activeAppointment = await tx.groomingAppointment.count({ where: { petId, customerId: customer.id, status: { in: ["Pending", "Confirmed", "Checked In", "In Progress"] } } });
    if (activeAppointment) throw new Error("Cancel active appointments before removing this pet.");
    const result = await tx.pet.updateMany({ where: { id: petId, customerId: customer.id }, data: { isActive: 0 } });
    if (result.count !== 1) throw new Error("Pet profile not found.");
    await writeAudit(tx, { userId: user.id, name: customer.customerName, role: "Customer" }, "ARCHIVE", "Pet", `Removed ${pet.petName} from the active pet list; history preserved.`, petId, ip);
  });
}

async function bookGroomingImpl(form: FormData) {
  const user = await requireClient();
  const customer = await ensureCustomer(user);
  const petId = positiveInteger(form, "petId");
  const styleId = positiveInteger(form, "styleId");
  const groomerId = positiveInteger(form, "groomerId");
  const petSize = text(form, "petSize");
  const bookingType = text(form, "bookingType");
  const dateValue = text(form, "date");
  const timeValue = text(form, "time");
  const serviceAddress = text(form, "address") || null;
  const contactName = text(form, "contactName") || customer.customerName;
  const contactNumber = text(form, "contactNumber") || customer.phone;
  const addonIds = [...new Set(form.getAll("addonIds").map((value) => Number(value)))];
  if (addonIds.some((value) => !Number.isSafeInteger(value) || value < 1)) throw new Error("Select valid grooming add-ons.");
  if (!allowed(petSize, petSizes) || !allowed(bookingType, bookingTypes) || !validDate(dateValue) || !validTime(timeValue)) throw new Error("Complete the appointment details correctly.");
  if (bookingType === "Home Service" && (!contactName || !serviceAddress || !isPhilippinePhone(contactNumber))) throw new Error("Home service requires a customer name, complete address, and valid Philippine mobile number.");
  const appointmentDate = new Date(`${dateValue}T00:00:00.000Z`);
  const appointmentTime = new Date(`1970-01-01T${timeValue}:00.000Z`);
  const scheduledAt = new Date(`${dateValue}T${timeValue}:00+08:00`);
  const appointmentMinutes = Number(timeValue.slice(0, 2)) * 60 + Number(timeValue.slice(3));
  const today = new Date(`${businessDate()}T00:00:00Z`);
  if (appointmentDate < today || scheduledAt.getTime() <= Date.now()) throw new Error("Choose a future appointment schedule.");
  if (appointmentDate.getTime() > today.getTime() + 90 * 86400000) throw new Error("Choose an appointment within the next 90 days.");
  if (appointmentMinutes < 9 * 60 || appointmentMinutes > 19 * 60) throw new Error("Appointments are available from 9:00 AM to 7:00 PM.");
  const [pet, pricing, groomer] = await Promise.all([
    prisma.pet.findFirst({ where: { id: petId, customerId: customer.id, isActive: 1 } }),
    prisma.styleSizePricing.findFirst({ where: { styleId, petSize }, include: { style: true } }),
    prisma.groomer.findFirst({ where: { groomerId, isActive: 1 }, include: { availability: true } }),
  ]);
  if (!pet || !pricing || !groomer) throw new Error("The selected pet, package, size, or groomer is unavailable.");
  if (groomer.availability.length) {
    const daySchedule = groomer.availability.find((item) => item.isActive && item.dayOfWeek === appointmentDate.getUTCDay());
    if (!daySchedule || appointmentTime < daySchedule.startTime || appointmentTime >= daySchedule.endTime) throw new Error("Groomer is not available for this schedule. Please select another time or groomer.");
  }
  const code = submissionReference("GRM", customer.id, form);
  const existingAppointment=await prisma.groomingAppointment.findUnique({where:{reservationCode:code}});
  if(existingAppointment)redirect(`/appointments/${existingAppointment.appointmentId}/receipt`);
  if (await hasGroomingConflict(prisma, groomerId, petId, dateValue, timeValue)) throw new Error("The groomer or pet already has an appointment within this time slot.");
  const ip = await requestIp();
  const submission = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT groomer_id FROM groomers WHERE groomer_id = ${groomerId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM pets WHERE id = ${petId} FOR UPDATE`;
    const previousSubmission = await tx.groomingAppointment.findUnique({ where: { reservationCode: code } });
    if (previousSubmission) return { appointment: previousSubmission, created: false };
    if (await hasGroomingConflict(tx, groomerId, petId, dateValue, timeValue)) throw new Error("The groomer or pet already has an appointment within this time slot.");
    const currentPet = await tx.pet.findFirst({ where: { id: petId, customerId: customer.id, isActive: 1 } });
    const currentGroomer = await tx.groomer.findFirst({ where: { groomerId, isActive: 1 }, include: { availability: true } });
    if (!currentPet || !currentGroomer) throw new Error("The selected pet or groomer is no longer available.");
    if (currentGroomer.availability.length) {
      const schedule = currentGroomer.availability.find((day) => day.isActive && day.dayOfWeek === appointmentDate.getUTCDay());
      if (!schedule || appointmentTime < schedule.startTime || appointmentTime >= schedule.endTime) throw new Error("Groomer is not available for this schedule.");
    }
    const currentPricing = await tx.styleSizePricing.findFirst({ where: { styleId, petSize } });
    const selectedAddons = addonIds.length ? await tx.groomingAddon.findMany({ where: { addonId: { in: addonIds } } }) : [];
    if (!currentPricing || selectedAddons.length !== addonIds.length) throw new Error("The selected package or add-on is no longer available.");
    const taxPolicy=await groomingTaxPolicy(tx);
    const amounts=reservationAmounts([{productId:0,name:pricing.style.styleName+' ('+petSize+')',quantity:1,unitPrice:currentPricing.price.toString()},...selectedAddons.map(addon=>({productId:addon.addonId,name:addon.addonName,quantity:1,unitPrice:addon.price.toString()}))],taxPolicy);
    const totalPrice=new Prisma.Decimal(amounts.total);
    const created = await tx.groomingAppointment.create({ data: { reservationCode: code, customerId: customer.id, petId, groomingStyleId: styleId, groomerId, bookingType, contactName, contactNumber, serviceAddress: bookingType === "Home Service" ? serviceAddress : null, petSize, appointmentDate, appointmentTime, specialInstructions: text(form, "instructions") || null, totalPrice, status: "Pending", addons: { create: selectedAddons.map((addon) => ({ addonId: addon.addonId, priceAtBooking: addon.price })) } } });
    await recordLoyaltyQuote(tx,created.appointmentId,customer.id,totalPrice);
    await saveGroomingReceipt(tx,created.appointmentId,{version:1,policy:taxPolicy,amounts,customer:{name:contactName,phone:contactNumber,address:bookingType==='Home Service'?serviceAddress!:customer.address||'Not recorded'},details:[['Pet name',currentPet.petName],['Species',currentPet.species||'Not recorded'],['Breed',currentPet.breed||'Not recorded'],['Sex',currentPet.gender||'Not recorded'],['Age / date of birth',currentPet.ageDob||'Not recorded'],['Pet size',petSize],['Package',pricing.style.styleName],['Groomer',currentGroomer.groomerName]]});
    await notifyAdministrators(tx, { eventKey: `appointment.created.${created.appointmentId}`, title: bookingType === "Home Service" ? "New home service request" : "New grooming appointment", message: `${customer.customerName} booked ${pet.petName} with ${groomer.groomerName}.`, type: bookingType === "Home Service" ? "HOME_SERVICE" : "GROOMING", relatedType: "appointment", relatedId: created.appointmentId, link: `/admin/dashboard?view=reservations&q=${code}` });
    await writeAudit(tx, { userId: user.id, name: customer.customerName, role: "Customer" }, "CREATE", "Grooming Appointment", `Created ${bookingType === "Home Service" ? "home service" : "store grooming"} appointment ${code}.`, created.appointmentId, ip);
    await notifyCustomer(tx, customer.id, { eventKey: `appointment.created.${created.appointmentId}`, title: "Grooming request received", message: `Your grooming appointment for ${pet.petName} is pending review.`, type: "GROOMING_STATUS", link: "/client/dashboard?view=reservations" });
    return { appointment: created, created: true };
  }, { isolationLevel: "Serializable" });
  if(!submission.created)redirect(`/appointments/${submission.appointment.appointmentId}/receipt`);
  const appointment = submission.appointment;
  let notice = "Grooming appointment submitted and email confirmation sent.";
  if (customer.email) {
    try {
      await sendAppointmentReceived(customer.email, { name: customer.customerName, pet: pet.petName, style: pricing.style.styleName, groomer: groomer.groomerName, date: dateValue, time: timeValue, bookingType, reference: appointment.reservationCode });
    } catch (error) {
      console.error("Appointment saved but confirmation email failed", error);
      notice = "Appointment saved, but the confirmation email could not be sent.";
    }
  } else notice = "Appointment saved. Add an email to the customer profile to receive confirmations.";
  revalidatePath("/client/dashboard");revalidatePath("/admin/dashboard");
  redirect(`/appointments/${appointment.appointmentId}/receipt`);
}

export async function getReservationProduct(productId: number, quantity = 1) {
  await requireClient();
  if (!Number.isSafeInteger(productId) || productId < 1 || productId > 2147483647) throw new Error("Invalid product.");
  const product = await prisma.product.findFirst({ where: { productId, isActive: 1 }, select: { productName: true, stockQuantity: true, price: true } });
  if(!Number.isSafeInteger(quantity)||quantity<1||quantity>2147483647)throw new Error('Choose a whole-number quantity.');
  if(!product)return null;
  const amounts=reservationAmounts([{productId,name:product.productName,quantity,unitPrice:product.price.toString()}],await productTaxPolicy(),true);
  return {stockQuantity:product.stockQuantity,price:Number(product.price),amounts,requestToken:randomBytes(16).toString('hex')};
}

export async function getReservationCartQuote(form:FormData){
  try{
    const user=await requireClient();
    const input=String(form.get('items')||'');if(input.length>20000)throw new Error('The selected cart is too large.');
    const lines=parseCartLines(JSON.parse(input));
    const [customer,products,taxPolicy,pickupPolicy]=await Promise.all([ensureCustomer(user),prisma.product.findMany({where:{productId:{in:lines.map(l=>l.productId)},isActive:1},select:{productId:true,productName:true,category:true,price:true,stockQuantity:true}}),productTaxPolicy(),productPickupPolicy()]);
    const items=lines.map(line=>{const p=products.find(p=>p.productId===line.productId);if(!p)throw new Error(`Product #${line.productId} is no longer available. Remove it from the cart.`);if(p.stockQuantity<line.quantity)throw new Error(`${p.productName}: only ${p.stockQuantity} available. Adjust the cart quantity.`);return {productId:p.productId,name:p.productName,category:p.category,price:Number(p.price),quantity:line.quantity,stock:p.stockQuantity,image:`/api/products/${p.productId}/image`,portion:getProductPortion(p.productName,Number(p.price))?.label||null};});
    const amounts=reservationAmounts(items.map(i=>({productId:i.productId,name:i.name,quantity:i.quantity,unitPrice:String(i.price)})),taxPolicy);
    const unconfirmedPrices=items.filter(i=>i.price<=0&&!taxPolicy.freeProductIds.includes(i.productId)).map(i=>i.name);
    return {quote:{unconfirmedPrices,amounts,pickupPolicy,items,profile:{firstName:user.firstName,surname:user.surname,middleInitial:user.middleInitial||'',name:customer.customerName,phone:customer.phone||user.phoneNumber||'',address:customer.address||''},profileComplete:isPhilippinePhone(customer.phone||user.phoneNumber||'')&&Boolean(customer.address?.trim()),requestToken:randomBytes(16).toString('hex'),total:Number(amounts.total)},error:null};
  }catch(error){return {quote:null,error:error instanceof Error&&!error.name.startsWith('Prisma')?error.message:'Could not check your cart. Please refresh and try again.'};}
}

export async function checkoutReservationCart(form:FormData){
  try{
    const user=await requireClient(),customer=await ensureCustomer(user);
    const input=String(form.get('items')||'');if(input.length>20000)throw new Error('The selected cart is too large.');
    const lines=parseCartLines(JSON.parse(input));
    const requestKey=String(form.get('requestToken')||'');if(!/^[a-f0-9]{32}$/.test(requestKey))throw new Error('Reopen checkout and try again.');
    const paymentMethod=text(form,'paymentMethod'),pickupDate=text(form,'pickupDate'),pickupTime=text(form,'pickupTime');
    if(!paymentMethods.includes(paymentMethod as typeof paymentMethods[number]))throw new Error('Select Cash, GCash, or Maya.');
    const fingerprint=createHash('sha256').update(JSON.stringify({lines,paymentMethod,pickupDate,pickupTime})).digest('hex');
    const ip=await requestIp();
    const saved=await prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM users WHERE id=${user.id} FOR UPDATE`;
      const retry=await tx.$queryRaw<{reservation_id:bigint;request_fingerprint:string}[]>`SELECT reservation_id,request_fingerprint FROM product_reservation_checkout WHERE customer_id=${customer.id} AND request_key=${requestKey}`;
      if(retry.length){if(retry[0].request_fingerprint!==fingerprint)throw new Error('This checkout was already received with different items or pickup details. Check Reservations before starting another checkout.');const original=await tx.productReservation.findUniqueOrThrow({where:{reservationId:retry[0].reservation_id}});return {id:String(original.reservationId),reference:original.reservationCode,total:Number(original.totalAmount),repeated:true};}
      const profile=await tx.customer.findUniqueOrThrow({where:{id:customer.id}});
      const phone=profile.phone||user.phoneNumber||'';
      if(!isPhilippinePhone(phone)||!profile.address?.trim())throw new Error('Save a valid Philippine contact number and complete address in My Account before checkout.');
      const pickupAt=pickupInstant(pickupDate,pickupTime,Date.now(),await productPickupPolicy(tx));
      // Lock every selected product in a deterministic order; no partial orders.
      for(const line of lines)await tx.$queryRaw`SELECT product_id FROM products WHERE product_id=${line.productId} FOR UPDATE`;
      const items=[];let total=new Prisma.Decimal(0);
      for(const line of lines){
        const product=await tx.product.findFirst({where:{productId:line.productId,isActive:1}});
        if(!product)throw new Error(`Product #${line.productId} is no longer available.`);
        if(product.stockQuantity<line.quantity)throw new Error(`${product.productName}: only ${product.stockQuantity} available. Adjust the cart and retry.`);
        if(line.expectedPrice===undefined||!product.price.equals(line.expectedPrice))throw new Error(`${product.productName}: the price changed. Return to the cart and refresh checkout.`);
        total=total.add(product.price.mul(line.quantity));items.push({product,line});
      }
      const amounts=reservationAmounts(items.map(({product,line})=>({productId:product.productId,name:product.productName,quantity:line.quantity,unitPrice:product.price.toString()})),await productTaxPolicy(tx),true);total=new Prisma.Decimal(amounts.total);
      if(form.has('expectedTotal')&&!total.equals(String(form.get('expectedTotal'))))throw new Error('Tax or pricing changed. Refresh availability before confirming.');
      if(total.greaterThan('99999999.99'))throw new Error('The selected reservation total is too large. Reduce the quantity.');
      const code=submissionReference(`PRD-${paymentMethod==='Cash'?'CSH':paymentMethod.toUpperCase()}`,customer.id,form);
      for(const {product,line} of items){
        const changed=await tx.product.updateMany({where:{productId:product.productId,isActive:1,stockQuantity:{gte:line.quantity}},data:{stockQuantity:{decrement:line.quantity}}});
        if(changed.count!==1)throw new Error(`${product.productName}: stock changed. Please retry.`);
        if(product.stockQuantity>product.reorderLevel&&product.stockQuantity-line.quantity<=product.reorderLevel)await notifyAdministrators(tx,{eventKey:`product.low-stock.${code}.${product.productId}`,title:'Product stock is low',message:`${product.productName} has ${product.stockQuantity-line.quantity} units available.`,type:'LOW_STOCK',relatedType:'product',relatedId:product.productId,link:'/admin/dashboard?view=inventory'});
      }
      const reservation=await tx.productReservation.create({data:{reservationCode:code,customerId:customer.id,customerName:profile.customerName,contactNumber:phone,deliveryAddress:profile.address,totalAmount:total,status:'Pending',reservedUntil:pickupAt,items:{create:items.map(({product,line})=>({productId:product.productId,quantity:line.quantity,unitPrice:product.price}))}}});
      await saveReceiptSnapshot(tx,reservation.reservationId,amounts);
      await tx.$executeRaw`INSERT INTO product_reservation_checkout(reservation_id,customer_id,request_key,request_fingerprint,payment_method) VALUES(${reservation.reservationId},${customer.id},${requestKey},${fingerprint},${paymentMethod})`;
      const description=items.map(({product,line})=>`${line.quantity} × ${product.productName}${getProductPortion(product.productName,Number(product.price))?' (1/2 kilo each)':''}`).join(', ');
      await notifyCustomer(tx,customer.id,{eventKey:`product-reservation.created.${reservation.reservationId}`,title:'Products reserved',message:`${code}: ${description}. Pickup ${pickupDate} ${pickupTime}. Preferred payment: ${paymentMethod}. Payment is collected separately.`,type:'PRODUCT_STATUS',link:'/client/dashboard?view=reservations'});
      await notifyAdministrators(tx,{eventKey:`product-reservation.created.${reservation.reservationId}`,title:'New product reservation',message:`${profile.customerName}: ${description}. Pickup ${pickupDate} ${pickupTime}. Preferred payment: ${paymentMethod}.`,type:'PRODUCT_RESERVATION',relatedType:'product_reservation',relatedId:reservation.reservationId,link:`/admin/dashboard?view=orders&q=${code}`});
      await writeAudit(tx,{userId:user.id,name:profile.customerName,role:'Customer'},'CREATE','Product Reservation',`Created multi-product reservation ${code}: ${description}. Payment preference: ${paymentMethod}.`,reservation.reservationId,ip);
      return {id:String(reservation.reservationId),reference:code,total:Number(total),repeated:false};
    },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted,maxWait:10000,timeout:20000});
    revalidatePath('/client/dashboard');revalidatePath('/admin/dashboard');revalidatePath('/');
    return {reservation:saved,error:null};
  }catch(error){return {reservation:null,error:error instanceof Error&&!error.name.startsWith('Prisma')?error.message:'The reservation could not be saved. Nothing was partially reserved. Please refresh availability and retry.'};}
}

export async function getGroomingSlots(petId: number, groomerId: number, date: string) {
  const user = await requireClient();
  if (!Number.isSafeInteger(petId) || !Number.isSafeInteger(groomerId) || !validDate(date) || date < businessDate()) return [];
  const pet = await prisma.pet.findFirst({ where: { id: petId, isActive: 1, customer: { email: user.email } } });
  const groomer = await prisma.groomer.findFirst({ where: { groomerId, isActive: 1 }, include: { availability: true } });
  if (!pet || !groomer) return [];
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  const schedule = groomer.availability.find((item) => item.dayOfWeek === day && item.isActive);
  if (groomer.availability.length && !schedule) return [];
  const appointments = await prisma.groomingAppointment.findMany({ where: { appointmentDate: new Date(`${date}T00:00:00Z`), OR: [{ groomerId }, { petId }], status: { in: ["Pending", "Confirmed", "Checked In", "In Progress"] } }, select: { appointmentTime: true } });
  const start = schedule ? schedule.startTime.getUTCHours() * 60 + schedule.startTime.getUTCMinutes() : 9 * 60;
  const end = schedule ? schedule.endTime.getUTCHours() * 60 + schedule.endTime.getUTCMinutes() : 19 * 60 + 1;
  const slots: string[] = [];
  for (let minutes = 9 * 60; minutes <= 19 * 60; minutes += 30) {
    if (minutes < start || minutes >= end) continue;
    const time = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    if (new Date(`${date}T${time}:00+08:00`).getTime() <= Date.now()) continue;
    if (appointments.some((item) => Math.abs(item.appointmentTime.getUTCHours() * 60 + item.appointmentTime.getUTCMinutes() - minutes) < 60)) continue;
    slots.push(time);
  }
  return slots;
}

async function reserveProductImpl(form: FormData) {
  const user = await requireClient();
  const customer = await ensureCustomer(user);
  const productId = positiveInteger(form, "productId");
  const quantity = positiveInteger(form, "quantity");
  const selectedPortion = text(form, "portion");
  const paymentMethod = text(form, "paymentMethod");
  const contactNumber = text(form, "contactNumber") || customer.phone;
  const deliveryAddress = text(form, "address") || customer.address;
  const pickupDate = text(form, "pickupDate");
  const pickupTime = text(form, "pickupTime");
  if (!allowed(paymentMethod, paymentMethods)) throw new Error("Select Cash, GCash, or Maya.");
  if (!isPhilippinePhone(contactNumber) || !deliveryAddress) throw new Error("A valid Philippine contact number and complete address are required. Update your account details or complete the reservation form.");
  if (!validDate(pickupDate) || !validTime(pickupTime)) throw new Error("Choose a valid pickup date and time.");
  const pickupAt = new Date(`${pickupDate}T${pickupTime}:00+08:00`);
  const pickupMinutes = Number(pickupTime.slice(0, 2)) * 60 + Number(pickupTime.slice(3));
  if (Number.isNaN(pickupAt.getTime()) || pickupAt.getTime() <= Date.now() || pickupMinutes < 9 * 60 || pickupMinutes > 19 * 60) throw new Error("Choose a future pickup time between 9:00 AM and 7:00 PM.");
  if (pickupAt.getTime() > Date.now() + 30 * 24 * 60 * 60 * 1000) throw new Error("Pickup must be scheduled within the next 30 days.");
  const paymentCode = paymentMethod === "Cash" ? "CSH" : paymentMethod.toUpperCase();
  const reservationCode = submissionReference(`PRD-${paymentCode}`, customer.id, form);
  if (await prisma.productReservation.findUnique({ where: { reservationCode } })) finish("reservations", "This product reservation was already received.");
  const ip = await requestIp();
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT product_id FROM products WHERE product_id = ${productId} FOR UPDATE`;
    if (await tx.productReservation.findUnique({ where: { reservationCode } })) return;
    const product = await tx.product.findFirst({ where: { productId, isActive: 1 } });
    if (!product) throw new Error("The selected product is unavailable.");
    const portion = getProductPortion(product.productName, Number(product.price.toString()));
    if (portion ? selectedPortion !== portion.value : selectedPortion !== "") throw new Error("Choose a valid portion for this product.");
    const unitPrice = product.price;
    const amounts=reservationAmounts([{productId,name:product.productName,quantity,unitPrice:unitPrice.toString()}],await productTaxPolicy(tx),true);
    if(form.has('expectedTotal')&&!new Prisma.Decimal(amounts.total).equals(String(form.get('expectedTotal'))))throw new Error('Tax or pricing changed. Reopen the product reservation before confirming.');
    const stock = await tx.product.updateMany({ where: { productId, isActive: 1, stockQuantity: { gte: quantity } }, data: { stockQuantity: { decrement: quantity } } });
    if (stock.count !== 1) throw new Error("The requested quantity is no longer available.");
    if (product.stockQuantity > product.reorderLevel && product.stockQuantity - quantity <= product.reorderLevel) {
      await notifyAdministrators(tx, { eventKey: `product.low-stock.${reservationCode}`, title: "Product stock is low", message: `${product.productName} has ${product.stockQuantity - quantity} units available (alert level ${product.reorderLevel}).`, type: "LOW_STOCK", relatedType: "product", relatedId: productId, link: "/admin/dashboard?view=inventory&filter=Low%20stock" });
    }
    const reservation = await tx.productReservation.create({ data: { reservationCode, customerId: customer.id, customerName: customer.customerName, contactNumber, deliveryAddress, totalAmount: new Prisma.Decimal(amounts.total), status: "Pending", reservedUntil: pickupAt, items: { create: { productId, quantity, unitPrice } } } });
    await saveReceiptSnapshot(tx,reservation.reservationId,amounts);
    const portionDescription = portion ? ` (${portion.label} each)` : "";
    await notifyCustomer(tx, customer.id, { eventKey: `product-reservation.created.${reservation.reservationId}`, title: "Product reserved", message: `Your reservation for ${quantity} x ${product.productName}${portionDescription} is pending review.`, type: "PRODUCT_STATUS", link: "/client/dashboard?view=reservations" });
    await notifyAdministrators(tx, { eventKey: `product-reservation.created.${reservation.reservationId}`, title: "New product reservation", message: `${customer.customerName} reserved ${quantity} x ${product.productName}${portionDescription}.`, type: "PRODUCT_RESERVATION", relatedType: "product_reservation", relatedId: reservation.reservationId, link: `/admin/dashboard?view=orders&q=${reservationCode}` });
    await writeAudit(tx, { userId: user.id, name: customer.customerName, role: "Customer" }, "CREATE", "Product Reservation", `Created product reservation ${reservationCode}.`, reservation.reservationId, ip);
  }, { isolationLevel: "Serializable" }).catch((error: unknown) => {
    if (error instanceof Error && ["The selected product is unavailable.", "The requested quantity is no longer available."].includes(error.message)) {
      revalidatePath("/client/dashboard");
      finish("products", `${error.message} Please refresh availability or choose another product.`, true);
    }
    throw error;
  });
  revalidatePath("/client/dashboard");
  const pickupLabel = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }).format(pickupAt);
  finish("reservations", `Product reserved for pickup on ${pickupLabel}. Payment: ${paymentMethod}.`);
}

async function cancelGroomingAppointmentImpl(form: FormData) {
  const user = await requireClient();
  const customer = await ensureCustomer(user);
  const appointmentId = BigInt(text(form, "id"));
  const ip = await requestIp();
  await prisma.$transaction(async (tx) => {
    const { appointment } = await transitionAppointment(tx, appointmentId, "Cancelled", customer.id);
    await notifyCustomer(tx, customer.id, { eventKey: `appointment.status.${appointmentId}.Cancelled`, title: "Appointment cancelled", message: `Your appointment ${appointment.reservationCode} has been cancelled.`, type: "GROOMING_STATUS", link: "/client/dashboard?view=reservations" });
    await notifyAdministrators(tx, { eventKey: `appointment.cancelled.${appointmentId}`, title: "Appointment cancelled", message: `${customer.customerName} cancelled appointment ${appointment.reservationCode}.`, type: "GROOMING_CANCELLATION", relatedType: "appointment", relatedId: appointmentId, link: `/admin/dashboard?view=reservations&q=${appointment.reservationCode}` });
    await writeAudit(tx, { userId: user.id, name: customer.customerName, role: "Customer" }, "CANCEL", "Grooming Appointment", `Cancelled appointment ${appointment.reservationCode}.`, appointmentId, ip);
  });
  finish("reservations", "Reservation cancelled successfully.");
}

async function cancelProductReservationImpl(form: FormData) {
  const user = await requireClient();
  const customer = await ensureCustomer(user);
  const reservationId = BigInt(text(form, "id"));
  const ip = await requestIp();
  await prisma.$transaction(async (tx) => {
    const { reservation } = await transitionProductReservation(tx, reservationId, "Cancelled", customer.id);
    await notifyCustomer(tx, customer.id, { eventKey: `product-reservation.status.${reservationId}.Cancelled`, title: "Product reservation cancelled", message: `Your reservation ${reservation.reservationCode} has been cancelled and stock released.`, type: "PRODUCT_STATUS", link: "/client/dashboard?view=reservations" });
    await notifyAdministrators(tx, { eventKey: `product-reservation.cancelled.${reservationId}`, title: "Product reservation cancelled", message: `${customer.customerName} cancelled reservation ${reservation.reservationCode}.`, type: "PRODUCT_CANCELLATION", relatedType: "product_reservation", relatedId: reservationId, link: `/admin/dashboard?view=orders&q=${reservation.reservationCode}` });
    await writeAudit(tx, { userId: user.id, name: customer.customerName, role: "Customer" }, "CANCEL", "Product Reservation", `Cancelled product reservation ${reservation.reservationCode}.`, reservationId, ip);
  });
  finish("reservations", "Reservation cancelled successfully.");
}

export async function updateProfile(form: FormData) {
  try { return await updateProfileImpl(form); }
  catch (error) {
    unstable_rethrow(error);
    const message = error instanceof Error && !error.name.startsWith("Prisma") ? error.message : "The request could not be saved. Please refresh and try again.";
    finish("account", message, true);
  }
}

export async function createPet(form: FormData): Promise<{ ok: boolean; message: string; fields?: { petName?: string; species?: string; photo?: string } }> {
  const inline = form.get("inline") === "1";
  if (inline) {
    const fields: { petName?: string; species?: string; photo?: string } = {};
    const name = String(form.get("petName") || "").trim();
    if (!name || name.length > 100) fields.petName = "Enter a pet name of at most 100 characters.";
    if (!["Dog", "Cat", "Other"].includes(String(form.get("species") || ""))) fields.species = "Select a valid pet type.";
    if (Object.keys(fields).length) return { ok: false, message: "Please check the highlighted fields.", fields };
  }
  try {
    await createPetImpl(form);
    if (!inline) finish("pets", "Pet profile added.");
    revalidatePath("/client/dashboard"); revalidatePath("/admin/dashboard");
    return { ok: true, message: "Pet profile added successfully." };
  }
  catch (error) {
    unstable_rethrow(error);
    const message = error instanceof Error && !error.name.startsWith("Prisma") ? error.message : "The request could not be saved. Please refresh and try again.";
    if (inline) return { ok: false, message, ...(/image|JPG|PNG|WebP/i.test(message) ? { fields: { photo: message } } : {}) };
    finish("pets", message, true);
  }
}

export async function updatePet(form: FormData): Promise<{ ok: boolean; message: string; fields?: { petName?: string; species?: string; photo?: string } }> {
  const inline = form.get("inline") === "1";
  try {
    await updatePetImpl(form);
    if (!inline) finish("pets", "Pet profile updated successfully.");
    revalidatePath("/client/dashboard"); revalidatePath("/admin/dashboard");
    return { ok: true, message: "Pet profile updated successfully." };
  }
  catch (error) {
    unstable_rethrow(error);
    const message = error instanceof Error && !error.name.startsWith("Prisma") ? error.message : "The request could not be saved. Please refresh and try again.";
    if (inline) return { ok: false, message, ...(/image|JPG|PNG|WebP/i.test(message) ? { fields: { photo: message } } : {}) };
    finish("pets", message, true);
  }
}

export async function archivePet(form: FormData): Promise<{ ok: boolean; message: string }> {
  const inline = form.get("inline") === "1";
  try {
    await archivePetImpl(form);
    if (!inline) finish("pets", "Pet removed successfully.");
    revalidatePath("/client/dashboard"); revalidatePath("/admin/dashboard");
    return { ok: true, message: "Pet removed successfully." };
  }
  catch (error) {
    unstable_rethrow(error);
    const message = error instanceof Error && !error.name.startsWith("Prisma") ? error.message : "The request could not be saved. Please refresh and try again.";
    if (inline) return { ok: false, message };
    finish("pets", message, true);
  }
}

export async function bookGrooming(form: FormData) {
  try { return await bookGroomingImpl(form); }
  catch (error) {
    unstable_rethrow(error);
    const message = error instanceof Error && !error.name.startsWith("Prisma") ? error.message : "The request could not be saved. Please refresh and try again.";
    finish("grooming", message, true);
  }
}

export async function reserveProduct(form: FormData) {
  try { return await reserveProductImpl(form); }
  catch (error) {
    unstable_rethrow(error);
    const message = error instanceof Error && !error.name.startsWith("Prisma") ? error.message : "The request could not be saved. Please refresh and try again.";
    finish("products", message, true);
  }
}

export async function cancelGroomingAppointment(form: FormData) {
  try { return await cancelGroomingAppointmentImpl(form); }
  catch (error) {
    unstable_rethrow(error);
    const message = error instanceof Error && !error.name.startsWith("Prisma") ? error.message : "The request could not be saved. Please refresh and try again.";
    finish("reservations", message, true);
  }
}

export async function cancelProductReservation(form: FormData) {
  try { return await cancelProductReservationImpl(form); }
  catch (error) {
    unstable_rethrow(error);
    const message = error instanceof Error && !error.name.startsWith("Prisma") ? error.message : "The request could not be saved. Please refresh and try again.";
    finish("reservations", message, true);
  }
}
