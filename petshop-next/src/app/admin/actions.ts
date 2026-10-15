"use server";

import { validTime } from "@/lib/business-time";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { uploadedImage } from "@/lib/image-upload";
import { transitionProductReservation, transitionAppointment } from "@/lib/reservation-transitions";
import { isPhilippinePhone, notifyAdministrators, notifyCustomer, requestIp, writeAudit } from "@/lib/operations";
import { readSessionToken, sessionCookieName } from "@/lib/session";
import { sendAppointmentStatus } from "@/lib/mail";

const accountStatuses = ["Active", "Suspended"] as const;

export async function updateAttendanceSetting(form:FormData){
  const admin=await requireAdmin();const minutes=Number(form.get('graceMinutes'));
  if(!Number.isInteger(minutes)||minutes<1||minutes>120)redirect('/admin/dashboard?view=settings&error=Enter%20a%20grace%20period%20from%201%20to%20120%20minutes.');
  await prisma.$transaction(async tx=>{await tx.systemSetting.upsert({where:{key:'grooming_no_show_grace_minutes'},create:{key:'grooming_no_show_grace_minutes',value:String(minutes)},update:{value:String(minutes)}});await writeAudit(tx,{userId:admin.userId,name:admin.name,role:admin.role},'UPDATE','Attendance Settings',`Changed grace period to ${minutes} minutes.`);});
  revalidatePath('/admin/dashboard');redirect('/admin/dashboard?view=settings&notice=Grace%20period%20updated.');
}
const productGroups = ["Food", "Shampoo", "Other"] as const;
const groomingStatuses = ["Pending", "Confirmed", "Checked In", "In Progress", "Completed", "Cancelled", "Cancelled - No Show"] as const;
const productReservationStatuses = ["Pending", "Approved", "Ready for Pickup", "Completed", "Cancelled"] as const;

function allowed(value: string, values: readonly string[]) {
  return values.includes(value);
}

async function requireAdmin() {
  const cookieStore = await cookies();
  const session = await readSessionToken(cookieStore.get(sessionCookieName)?.value);
  if (session?.role !== "Admin" && session?.role !== "SuperAdmin") throw new Error("Administrator access required.");
  const admin = await prisma.user.findFirst({
    where: { id: session.userId, role: { in: ["Admin", "SuperAdmin"] }, accountStatus: "Active" },
    select: { id: true },
  });
  if (!admin) throw new Error("Administrator access required.");
  return session;
}

function text(form: FormData, key: string) {
  const value = String(form.get(key) ?? "").trim();
  const limits: Record<string, number> = { name: 150, category: 100, sku: 40, description: 5000, petName: 100, breed: 100, contactNumber: 20 };
  if ((key === "name" || key === "category") && !value) throw new Error(`${key} is required.`);
  if (value.length > (limits[key] || 2000)) throw new Error(`${key} is too long.`);
  return value;
}
function number(form: FormData, key: string) {
  const input = String(form.get(key) ?? "").trim();
  const value = Number(input);
  if (!input || !Number.isFinite(value) || value < 0 || value > 99999999.99) throw new Error(`Invalid ${key}.`);
  return value;
}
function integer(form: FormData, key: string) {
  const value = number(form, key);
  if (!Number.isSafeInteger(value)) throw new Error(`Invalid ${key}.`);
  return value;
}
function id(form: FormData) {
  const value = integer(form, "id");
  if (value < 1) throw new Error("Invalid record identifier.");
  return value;
}

function productImage(form: FormData) {
  const value = text(form, "image");
  if (!value) return null;
  if (value.length > 255) throw new Error("The product image URL is too long.");
  if (/^[\w .()-]+\.(?:jpe?g|png|webp)$/i.test(value) || value.startsWith("/products/")) return value;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
  } catch {
    throw new Error("Enter a valid product image URL beginning with http:// or https://.");
  }
  return value;
}

async function uploadedProductImage(form: FormData, existing: string | null = null) {
  const upload = form.get("imageFile");
  if (!(upload instanceof File) || upload.size === 0) {
    return form.has("image") ? productImage(form) : existing;
  }
  if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(upload.type)) {
    throw new Error("Upload a JPG, PNG, or WebP product image.");
  }
  if (upload.size > 1_500_000) throw new Error("Product images must be smaller than 1.5 MB.");
  const bytes = new Uint8Array(await upload.arrayBuffer());
  const isJpeg = upload.type === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = upload.type === "image/png" && bytes.length >= 8 && bytes.slice(0, 8).every((value, index) => value === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index]);
  const isWebp = upload.type === "image/webp" && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  if (!isJpeg && !isPng && !isWebp) throw new Error("The uploaded file contents do not match a supported image format.");
  const encoded = Buffer.from(bytes).toString("base64");
  return `data:${upload.type};base64,${encoded}`;
}

async function updateClientStatusImpl(form: FormData) {
  const admin = await requireAdmin();
  const id = Number(form.get("id"));
  const status = text(form, "status");
  if (!id || id === admin.userId || !allowed(status, accountStatuses)) throw new Error("Invalid client update.");
  const result = await prisma.user.updateMany({ where: { id, role: "User" }, data: { accountStatus: status } });
  if (result.count !== 1) throw new Error("Client account not found.");
  await writeAudit(prisma, { userId: admin.userId, name: admin.name, role: admin.role }, "UPDATE", "Customer Account", `Changed customer account ${id} status to ${status}.`, id, await requestIp());
  revalidatePath("/admin/dashboard");
  revalidatePath("/client/dashboard");
  redirect("/admin/dashboard?view=customers&notice=Customer%20access%20updated.");
}

async function createProductImpl(form: FormData) {
  const admin = await requireAdmin();
  const group = text(form, "group");
  if (!allowed(group, productGroups)) throw new Error("Invalid product group.");
  const sku = text(form,"sku").toUpperCase();
  const product = await prisma.product.create({ data: { sku:sku || null, productName:text(form,"name"), category:text(form,"category"), productGroup:group, price:number(form,"price"), stockQuantity:integer(form,"stock"), reorderLevel:integer(form,"reorder"), description:text(form,"description") || null, image:await uploadedProductImage(form), isActive:1 } });
  await writeAudit(prisma, { userId: admin.userId, name: admin.name, role: admin.role }, "CREATE", "Product", `Created product ${product.productName}.`, product.productId, await requestIp());
  revalidatePath("/admin/dashboard");
  revalidatePath("/client/dashboard");
  redirect("/admin/dashboard?view=products&notice=Product%20added%20successfully.");
}

async function updateProductImpl(form: FormData) {
  const admin = await requireAdmin();
  const productId = id(form);
  const price = number(form, "price");
  if (!/^\d+(?:\.\d{1,2})?$/.test(String(form.get("price") ?? "").trim())) throw new Error("Price must have at most two decimal places.");
  const stock = integer(form, "stock");
  if (stock > 2147483647) throw new Error("Inventory quantity is too large.");
  const previousStock = integer(form, "previousStock");
  const previousPrice = number(form, "previousPrice");
  await prisma.$transaction(async tx => {
    const current = await tx.product.findUnique({where:{productId}});
    if (!current) throw new Error("Product not found.");
    if (current.stockQuantity !== previousStock || Number(current.price) !== previousPrice) throw new Error("Inventory changed since this editor opened. Cancel and refresh inventory before saving.");
    const result = await tx.product.updateMany({where:{productId,stockQuantity:previousStock,price:previousPrice},data:{price,stockQuantity:stock}});
    if (result.count !== 1) throw new Error("Inventory changed while saving. Cancel and refresh inventory before retrying.");
    if (current.isActive && stock <= current.reorderLevel && current.stockQuantity > current.reorderLevel) await notifyAdministrators(tx, {eventKey:`product.low-stock.${productId}.${Date.now()}`,title:"Product stock is low",message:`${current.productName} has ${stock} units available.`,type:"LOW_STOCK",relatedType:"product",relatedId:productId,link:"/admin/dashboard?view=inventory&filter=Low%20stock"});
    await writeAudit(tx, {userId:admin.userId,name:admin.name,role:admin.role}, "UPDATE", "Product", `Updated ${current.productName}: price ${current.price} to ${price}; available stock ${previousStock} to ${stock}.`, productId, await requestIp());
  });
  revalidatePath("/admin/dashboard");
  revalidatePath("/client/dashboard");
}

async function updatePackageImpl(form: FormData) {
  const admin = await requireAdmin();
  const pricingId = id(form);
  await prisma.$transaction(async tx => {
    const pricing = await tx.styleSizePricing.update({ where:{pricingId}, data:{price:number(form,"price")} });
    await tx.groomingStyle.update({ where:{styleId:pricing.styleId}, data:{styleName:text(form,"name")} });
  });
  await writeAudit(prisma, { userId: admin.userId, name: admin.name, role: admin.role }, "UPDATE", "Grooming Service", "Updated a grooming package and price.", pricingId, await requestIp());
  revalidatePath("/admin/dashboard");
  revalidatePath("/client/dashboard");
  redirect("/admin/dashboard?view=services&notice=Grooming%20package%20updated.");
}

async function updateAddonImpl(form: FormData) {
  const admin = await requireAdmin();
  const addonId = id(form);
  const addon = await prisma.groomingAddon.update({ where:{addonId}, data:{addonName:text(form,"name"),price:number(form,"price")} });
  await writeAudit(prisma, { userId: admin.userId, name: admin.name, role: admin.role }, "UPDATE", "Grooming Service", `Updated add-on ${addon.addonName}.`, addonId, await requestIp());
  revalidatePath("/admin/dashboard");
  revalidatePath("/client/dashboard");
  redirect("/admin/dashboard?view=services&notice=Add-on%20service%20updated.");
}

async function updateGroomingStatusImpl(form: FormData) {
  const admin = await requireAdmin();
  const status = text(form,"status");
  if (!allowed(status, groomingStatuses)) throw new Error("Invalid appointment status.");
  const appointmentId = BigInt(text(form,"id"));
  const ip = await requestIp();
  const appointment = await prisma.$transaction(async (tx) => {
    const { appointment, changed } = await transitionAppointment(tx, appointmentId, status, undefined, text(form,"reason"), {userId:admin.userId,name:admin.name,role:admin.role});
    if (!changed) return null;
    await writeAudit(tx, { userId: admin.userId, name: admin.name, role: admin.role }, status === "Cancelled" ? "CANCEL" : "UPDATE", "Grooming Appointment", `Changed ${appointment.reservationCode} from ${appointment.status} to ${status}.`, appointmentId, ip);
    if(status!=="Cancelled - No Show")await notifyCustomer(tx, appointment.customerId, { eventKey: `appointment.status.${appointmentId}.${status}`, title: `Grooming appointment ${status.toLowerCase()}`, message: `Your appointment for ${appointment.pet.petName} is now ${status}.`, type: "GROOMING_STATUS", relatedType: "appointment", relatedId: appointmentId, link: "/client/dashboard?view=reservations" });
    if (status === "Cancelled") await notifyAdministrators(tx, { eventKey: `appointment.cancelled.${appointmentId}`, title: "Appointment cancelled", message: `${admin.name} cancelled appointment ${appointment.reservationCode}.`, type: "GROOMING_CANCELLATION", relatedType: "appointment", relatedId: appointmentId, link: `/admin/dashboard?view=reservations&q=${appointment.reservationCode}` });
    return appointment;
  });
  if (appointment?.customer.email) {
    try {
      await sendAppointmentStatus(appointment.customer.email, { name:appointment.customer.customerName,pet:appointment.pet.petName,status,reference:appointment.reservationCode,bookingType:appointment.bookingType });
    } catch (error) {
      console.error("Appointment status saved but notification email failed", error);
    }
  }
  revalidatePath("/admin/dashboard");
  revalidatePath("/client/dashboard");
  redirect("/admin/dashboard?view=reservations&notice=Reservation%20status%20updated.");
}

async function updateProductReservationStatusImpl(form: FormData) {
  const admin = await requireAdmin();
  const id = BigInt(text(form,"id"));
  const status = text(form,"status");
  if (!allowed(status, productReservationStatuses)) throw new Error("Invalid reservation status.");
  const ip = await requestIp();
  await prisma.$transaction(async tx => {
    const { reservation, changed } = await transitionProductReservation(tx, id, status);
    if (!changed) return;
    await notifyCustomer(tx, reservation.customerId, { eventKey: `product-reservation.status.${id}.${status}`, title: `Product reservation ${status.toLowerCase()}`, message: `Reservation ${reservation.reservationCode} is now ${status}.`, type: "PRODUCT_STATUS", relatedType: "product_reservation", relatedId: id, link: "/client/dashboard?view=reservations" });
    await writeAudit(tx, { userId: admin.userId, name: admin.name, role: admin.role }, status === "Cancelled" ? "CANCEL" : "UPDATE", "Product Reservation", `Changed ${reservation.reservationCode} from ${reservation.status} to ${status}.`, id, ip);
    if (status === "Cancelled") await notifyAdministrators(tx, { eventKey: `product-reservation.cancelled.${id}`, title: "Product reservation cancelled", message: `${admin.name} cancelled reservation ${reservation.reservationCode}.`, type: "PRODUCT_CANCELLATION", relatedType: "product_reservation", relatedId: id, link: `/admin/dashboard?view=orders&q=${reservation.reservationCode}` });
  });
  revalidatePath("/admin/dashboard");
  revalidatePath("/client/dashboard");
  redirect("/admin/dashboard?view=orders&notice=Order%20status%20updated.");
}

async function createGroomerImpl(form: FormData) {
  const admin = await requireAdmin();
  const name = text(form, "name");
  const contactNumber = text(form, "contactNumber") || null;
  if (!name || (contactNumber && !isPhilippinePhone(contactNumber))) throw new Error("Enter a groomer name and a valid Philippine mobile number.");
  const groomer = await prisma.groomer.create({ data: { groomerName: name, contactNumber, isActive: 1 } });
  await writeAudit(prisma, { userId: admin.userId, name: admin.name, role: admin.role }, "CREATE", "Groomer", `Added groomer ${name}.`, groomer.groomerId, await requestIp());
  revalidatePath("/admin/dashboard");
  revalidatePath("/client/dashboard");
  redirect("/admin/dashboard?view=groomers&notice=Groomer%20added%20successfully.");
}

async function updatePetRecordImpl(form: FormData) {
  const admin = await requireAdmin();
  const petId = id(form);
  const petName = text(form, "petName");
  const species = text(form, "species");
  const breed = text(form, "breed") || null;
  const ageDob = text(form, "ageDob") || null;
  const gender = text(form, "gender") || null;
  if ((ageDob && ageDob.length > 100) || (gender && !["Male", "Female"].includes(gender))) throw new Error("Enter valid pet age and gender details.");
  if (!petName || petName.length > 100 || (breed && breed.length > 100) || !["Dog", "Cat", "Other"].includes(species)) throw new Error("Enter valid pet details.");
  const current = await prisma.pet.findUnique({ where: { id: petId }, select: { photoPath: true } });
  if (!current) throw new Error("Pet profile not found.");
  await prisma.pet.update({ where: { id: petId }, data: { petName, species, breed, ageDob, gender, photoPath: await uploadedImage(form, "photo", current.photoPath) } });
  await writeAudit(prisma, { userId: admin.userId, name: admin.name, role: admin.role }, "UPDATE", "Pet", `Updated pet profile ${petName}.`, petId, await requestIp());
  revalidatePath("/admin/dashboard");
  revalidatePath("/client/dashboard");
  redirect("/admin/dashboard?view=pets&notice=Pet%20profile%20updated.");
}

async function updateGroomerImpl(form: FormData) {
  const admin = await requireAdmin();
  const groomerId = id(form);
  const name = text(form, "name");
  const contactNumber = text(form, "contactNumber") || null;
  if (!name || (contactNumber && !isPhilippinePhone(contactNumber))) throw new Error("Enter a groomer name and a valid Philippine mobile number.");
  const groomer = await prisma.groomer.update({ where: { groomerId }, data: { groomerName: name, contactNumber, isActive: form.get("active") === "on" ? 1 : 0 } });
  await writeAudit(prisma, { userId: admin.userId, name: admin.name, role: admin.role }, "UPDATE", "Groomer", `Updated ${groomer.groomerName} availability and contact details.`, groomerId, await requestIp());
  revalidatePath("/admin/dashboard");
  revalidatePath("/client/dashboard");
  redirect("/admin/dashboard?view=groomers&notice=Groomer%20updated.");
}

async function saveGroomerScheduleImpl(form: FormData) {
  const admin = await requireAdmin();
  const groomerId = id(form);
  const dayOfWeek = integer(form, "dayOfWeek");
  const start = text(form, "startTime");
  const end = text(form, "endTime");
  if (dayOfWeek < 0 || dayOfWeek > 6 || !validTime(start) || !validTime(end) || start >= end) throw new Error("Choose a valid work day and time range.");
  await prisma.groomerAvailability.upsert({ where: { groomerId_dayOfWeek: { groomerId, dayOfWeek } }, create: { groomerId, dayOfWeek, startTime: new Date(`1970-01-01T${start}:00.000Z`), endTime: new Date(`1970-01-01T${end}:00.000Z`), isActive: true }, update: { startTime: new Date(`1970-01-01T${start}:00.000Z`), endTime: new Date(`1970-01-01T${end}:00.000Z`), isActive: true } });
  await writeAudit(prisma, { userId: admin.userId, name: admin.name, role: admin.role }, "UPDATE", "Groomer Schedule", `Updated day ${dayOfWeek} schedule to ${start}-${end}.`, groomerId, await requestIp());
  revalidatePath("/admin/dashboard");
  revalidatePath("/client/dashboard");
  redirect("/admin/dashboard?view=groomers&notice=Groomer%20schedule%20updated.");
}

async function updateLoyaltyImpl(form: FormData) {
  const admin = await requireAdmin();
  const customerId = id(form);
  const stamps = integer(form, "stamps");
  const reason = text(form, "reason");
  if (stamps < 0 || stamps > 100000 || reason.length < 3 || reason.length > 255) throw new Error("Completed visit count must be between 0 and 100000 and include a reason.");
  const ip = await requestIp();
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM customers WHERE id=${customerId} FOR UPDATE`;
    const customer = await tx.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new Error("Customer profile not found.");
    await tx.$executeRaw`INSERT IGNORE INTO customer_loyalty_program(customer_id,completed_visits,vip_member)
      SELECT id,GREATEST(loyalty_stamps,(SELECT COUNT(*) FROM grooming_appointments WHERE customer_id=${customerId} AND status='Completed')),GREATEST(loyalty_stamps,(SELECT COUNT(*) FROM grooming_appointments WHERE customer_id=${customerId} AND status='Completed'))>=11 FROM customers WHERE id=${customerId}`;
    const programs=await tx.$queryRaw<{completed_visits:number;vip_member:number}[]>`SELECT completed_visits,vip_member FROM customer_loyalty_program WHERE customer_id=${customerId} FOR UPDATE`;
    const change = stamps - programs[0].completed_visits;
    const vip=Boolean(programs[0].vip_member)||stamps>=11;
    await tx.$executeRaw`UPDATE customer_loyalty_program SET completed_visits=${stamps},vip_member=${vip},vip_since=IF(${vip},COALESCE(vip_since,${new Date()}),vip_since) WHERE customer_id=${customerId}`;
    await tx.customer.update({where:{id:customerId},data:{loyaltyStamps:stamps,rewardAvailable:vip}});
    await tx.loyaltyTransaction.create({ data: { customerId, changedById: admin.userId, changeAmount: change, balanceAfter: stamps, reason } });
    await writeAudit(tx, { userId: admin.userId, name: admin.name, role: admin.role }, "UPDATE", "Loyalty", `Changed ${customer.customerName} completed visit count from ${programs[0].completed_visits} to ${stamps}: ${reason}`, customerId, ip);
  });
  revalidatePath("/admin/dashboard");
  revalidatePath("/client/dashboard");
  redirect("/admin/dashboard?view=customers&notice=Loyalty%20progress%20updated.");
}

async function redeemLoyaltyRewardImpl(form: FormData) {
  await requireAdmin();
  throw new Error("Loyalty discounts are applied automatically to completed grooming. Lifetime VIP progress cannot be redeemed or reset.");
}

async function updateLoyaltySettingImpl(form: FormData) {
  const admin = await requireAdmin();
  const label = text(form, "rewardLabel");
  if (label.length < 3 || label.length > 120) throw new Error("Enter a reward label between 3 and 120 characters.");
  await prisma.systemSetting.upsert({ where: { key: "loyalty_reward_label" }, create: { key: "loyalty_reward_label", value: label }, update: { value: label } });
  await writeAudit(prisma, { userId: admin.userId, name: admin.name, role: admin.role }, "UPDATE", "Settings", `Updated loyalty reward label to ${label}.`, "loyalty_reward_label", await requestIp());
  revalidatePath("/admin/dashboard");
  revalidatePath("/client/dashboard");
  redirect("/admin/dashboard?view=settings&notice=Settings%20updated.");
}

async function openNotificationImpl(form: FormData) {
  const admin = await requireAdmin();
  const notificationId = BigInt(text(form, "id"));
  const notification = await prisma.notification.findFirst({ where: { notificationId, recipientId: admin.userId } });
  if (!notification) throw new Error("Notification not found.");
  await prisma.notification.update({ where: { notificationId }, data: { isRead: true, readAt: new Date() } });
  revalidatePath("/admin/dashboard");
  revalidatePath("/client/dashboard");
  redirect(notification.link);
}

export async function updateClientStatus(form: FormData) {
  try { return await updateClientStatusImpl(form); }
  catch (error) {
    unstable_rethrow(error);
    const message = error instanceof Error && !error.name.startsWith("Prisma") ? error.message : "The request could not be saved. Please refresh and try again.";
    redirect(`/admin/dashboard?view=customers&error=${encodeURIComponent(message)}`);
  }
}

export async function createProduct(form: FormData) {
  try { return await createProductImpl(form); }
  catch (error) {
    unstable_rethrow(error);
    const message = error instanceof Error && !error.name.startsWith("Prisma") ? error.message : "The request could not be saved. Please refresh and try again.";
    redirect(`/admin/dashboard?view=products&error=${encodeURIComponent(message)}`);
  }
}

export async function updatePackage(form: FormData) {
  try { return await updatePackageImpl(form); }
  catch (error) {
    unstable_rethrow(error);
    const message = error instanceof Error && !error.name.startsWith("Prisma") ? error.message : "The request could not be saved. Please refresh and try again.";
    redirect(`/admin/dashboard?view=services&error=${encodeURIComponent(message)}`);
  }
}

export async function updateAddon(form: FormData) {
  try { return await updateAddonImpl(form); }
  catch (error) {
    unstable_rethrow(error);
    const message = error instanceof Error && !error.name.startsWith("Prisma") ? error.message : "The request could not be saved. Please refresh and try again.";
    redirect(`/admin/dashboard?view=services&error=${encodeURIComponent(message)}`);
  }
}

export async function updateGroomingStatus(form: FormData) {
  try { return await updateGroomingStatusImpl(form); }
  catch (error) {
    unstable_rethrow(error);
    const message = error instanceof Error && !error.name.startsWith("Prisma") ? error.message : "The request could not be saved. Please refresh and try again.";
    redirect(`/admin/dashboard?view=reservations&error=${encodeURIComponent(message)}`);
  }
}

export async function updateProductReservationStatus(form: FormData) {
  try { return await updateProductReservationStatusImpl(form); }
  catch (error) {
    unstable_rethrow(error);
    const message = error instanceof Error && !error.name.startsWith("Prisma") ? error.message : "The request could not be saved. Please refresh and try again.";
    redirect(`/admin/dashboard?view=orders&error=${encodeURIComponent(message)}`);
  }
}

export async function createGroomer(form: FormData) {
  try { return await createGroomerImpl(form); }
  catch (error) {
    unstable_rethrow(error);
    const message = error instanceof Error && !error.name.startsWith("Prisma") ? error.message : "The request could not be saved. Please refresh and try again.";
    redirect(`/admin/dashboard?view=groomers&error=${encodeURIComponent(message)}`);
  }
}

export async function updatePetRecord(form: FormData) {
  try { return await updatePetRecordImpl(form); }
  catch (error) {
    unstable_rethrow(error);
    const message = error instanceof Error && !error.name.startsWith("Prisma") ? error.message : "The request could not be saved. Please refresh and try again.";
    redirect(`/admin/dashboard?view=pets&error=${encodeURIComponent(message)}`);
  }
}

export async function updateGroomer(form: FormData) {
  try { return await updateGroomerImpl(form); }
  catch (error) {
    unstable_rethrow(error);
    const message = error instanceof Error && !error.name.startsWith("Prisma") ? error.message : "The request could not be saved. Please refresh and try again.";
    redirect(`/admin/dashboard?view=groomers&error=${encodeURIComponent(message)}`);
  }
}

export async function saveGroomerSchedule(form: FormData) {
  try { return await saveGroomerScheduleImpl(form); }
  catch (error) {
    unstable_rethrow(error);
    const message = error instanceof Error && !error.name.startsWith("Prisma") ? error.message : "The request could not be saved. Please refresh and try again.";
    redirect(`/admin/dashboard?view=groomers&error=${encodeURIComponent(message)}`);
  }
}

export async function updateLoyalty(form: FormData) {
  try { return await updateLoyaltyImpl(form); }
  catch (error) {
    unstable_rethrow(error);
    const message = error instanceof Error && !error.name.startsWith("Prisma") ? error.message : "The request could not be saved. Please refresh and try again.";
    redirect(`/admin/dashboard?view=customers&error=${encodeURIComponent(message)}`);
  }
}

export async function redeemLoyaltyReward(form: FormData) {
  try { return await redeemLoyaltyRewardImpl(form); }
  catch (error) {
    unstable_rethrow(error);
    const message = error instanceof Error && !error.name.startsWith("Prisma") ? error.message : "The request could not be saved. Please refresh and try again.";
    redirect(`/admin/dashboard?view=customers&error=${encodeURIComponent(message)}`);
  }
}

export async function updateLoyaltySetting(form: FormData) {
  try { return await updateLoyaltySettingImpl(form); }
  catch (error) {
    unstable_rethrow(error);
    const message = error instanceof Error && !error.name.startsWith("Prisma") ? error.message : "The request could not be saved. Please refresh and try again.";
    redirect(`/admin/dashboard?view=settings&error=${encodeURIComponent(message)}`);
  }
}

export async function openNotification(form: FormData) {
  try { return await openNotificationImpl(form); }
  catch (error) {
    unstable_rethrow(error);
    const message = error instanceof Error && !error.name.startsWith("Prisma") ? error.message : "The request could not be saved. Please refresh and try again.";
    redirect(`/admin/dashboard?view=notifications&error=${encodeURIComponent(message)}`);
  }
}

export async function updateProduct(form: FormData) {
  try { await updateProductImpl(form); return { success: true }; }
  catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error && !error.name.startsWith("Prisma") ? error.message : "Could not update the product. Check the details and retry." };
  }
}
