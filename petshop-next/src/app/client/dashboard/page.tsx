import GroomingReceiptLinks from '@/components/GroomingReceiptLinks';
import ReservationReceiptLinks from '@/components/ReservationReceiptLinks';
import ReservedProductItems from '@/components/ReservedProductItems';
import {paymentPreference} from "@/lib/cart-rules";
import ReservationCard from "@/components/ReservationCard";
import ReviewsPanel from "@/components/ReviewsPanel";
import ClientNotice from "@/components/ClientNotice";
import {getLoyaltyProgress} from "@/lib/loyalty";
import LoyaltyInvoice from "@/components/LoyaltyInvoice";
import AccountLoyalty from "@/components/AccountLoyalty";


import AppointmentAttendance from "@/components/AppointmentAttendance";
import AppointmentRefresh from "@/components/AppointmentRefresh";
import { petSummaries } from "@/lib/pet-summaries";
import MyPets from "@/components/MyPets";
import MessagesPanel from "@/components/MessagesPanel";
import ChangePasswordForm from "@/components/ChangePasswordForm";
import ClientNotificationCenter from "@/components/ClientNotificationCenter";
import { businessDate, wallClockTime, appointmentInstant } from "@/lib/business-time";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { getReservedPortion } from "@/lib/product-portions";
import { redirect } from "next/navigation";
import ClientDashboardShell from "@/components/ClientDashboardShell";

import GroomingBookingForm from "@/components/GroomingBookingForm";
import HaircutGallery from "@/components/HaircutGallery";
import ProductCatalog from "@/components/ProductCatalog";
import { dashboardViews, type DashboardView } from "@/lib/dashboard-views";
import { prisma } from "@/lib/prisma";
import { productImageUrl } from "@/lib/product-image";
import { readSessionToken, sessionCookieName } from "@/lib/session";
import { updateProfile } from "../actions";

function date(value: Date) {
  if (Number.isNaN(value.getTime())) return "Date unavailable";
  return value.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });
}

function time(value: Date) {
  if (Number.isNaN(value.getTime())) return "Time unavailable";
  return value.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });
}

function money(value: { toString(): string }) {
  const amount = Number(value.toString());
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(amount)
    : "Price unavailable";
}

async function queryOr<T>(label: string, query: () => Promise<T>, fallback: T): Promise<T> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await query();
    } catch (error) {
      console.error(`[client-dashboard] ${label} query failed (attempt ${attempt})`, error);
      if (attempt === 2) throw new Error("Dashboard data could not be loaded. Please retry.");
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  }
  return fallback;
}

export default async function ClientDashboard({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; notice?: string; noticeKind?: string; conversation?: string }>;
}) {
  const cookieStore = await cookies();
  const session = await readSessionToken(cookieStore.get(sessionCookieName)?.value);
  if (session?.role !== "User") redirect("/client/login");

  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { id: true, role: true, accountStatus: true, email: true, firstName: true, middleInitial: true, surname: true, phoneNumber: true, createdAt: true } });
  if (!user || user.role !== "User" || user.accountStatus !== "Active") {
    redirect("/client/login");
  }

  const params = await searchParams;
  const requestedView = params.view;
  const view: DashboardView = dashboardViews.includes(requestedView as DashboardView) ? (requestedView as DashboardView) : "dashboard";
  const customer = await queryOr("customer", () => prisma.customer.findFirst({
    where: { email: user.email },
    select: { id: true, customerName: true, phone: true, address: true, loyaltyStamps: true, rewardAvailable: true, rewardRedeemedAt: true },
  }), null);

  let productsFailed = false;
  const [products, pets, appointments, productReservations, pricing, groomers] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: 1 },
      select: { productId: true, productName: true, category: true, productGroup: true, price: true, stockQuantity: true, reorderLevel: true, isActive: true, description: true },
      orderBy: [{ productGroup: "asc" }, { productName: "asc" }],
    }).then((rows) => rows.map((row) => ({ ...row, image: productImageUrl(row.productId) }))).catch((error) => {
      console.error("[client-dashboard] Product catalog query failed", error);
      productsFailed = true;
      return [];
    }),
    customer
      ? queryOr("pets", () => petSummaries(customer.id), [])
      : [],
    customer
      ? queryOr("grooming appointments", () => prisma.groomingAppointment.findMany({
          where: { customerId: customer.id },
          include: { pet: { select: { id: true, petName: true } }, style: { select: { styleId: true, styleName: true } }, groomer: { select: { groomerId: true, groomerName: true } } },
          orderBy: [{ appointmentDate: "desc" }, { appointmentTime: "desc" }],
        }), [])
      : [],
    customer
      ? queryOr("product reservations", () => prisma.productReservation.findMany({
          where: { customerId: customer.id },
          include: { items: { include: { product: { select: { productId: true, productName: true } } } } },
          orderBy: { createdAt: "desc" },
        }), [])
      : [],
    queryOr("grooming prices", () => prisma.styleSizePricing.findMany({ include: { style: true }, orderBy: [{ styleId: "asc" }, { pricingId: "asc" }] }), []),
    queryOr("groomers", () => prisma.groomer.findMany({ where: { isActive: 1 }, orderBy: { groomerName: "asc" } }), []),
  ]);
  const loyaltyProgress=customer?await getLoyaltyProgress(prisma,customer.id):{visits:0,vip:false};
  const addons = await queryOr("grooming add-ons", () => prisma.groomingAddon.findMany({ orderBy: { addonName: "asc" } }), []);
  const styles = [...new Map(pricing.map((item) => [item.styleId, item.style])).values()];

  const upcoming = appointments.filter(
    (item) => ["Pending", "Confirmed", "Checked In", "In Progress"].includes(item.status) && appointmentInstant(item.appointmentDate, item.appointmentTime).getTime() >= Date.now(),
  );
  const activeProductReservations = productReservations.filter((item) =>
    ["Pending", "Approved", "Ready for Pickup"].includes(item.status),
  );
  const next = [...upcoming].sort(
    (a, b) => a.appointmentDate.getTime() - b.appointmentDate.getTime() || a.appointmentTime.getTime() - b.appointmentTime.getTime(),
  )[0];

  return (
    <ClientDashboardShell initialView={view}>
        {params.notice && <ClientNotice message={params.notice} error={params.noticeKind === "error"} />}
        <div data-dashboard-panel="dashboard" className="clientDashboardOverview">
            <section className="dashHero">
              <h1 className="dashboardGreeting">Good day, {[user.firstName, user.surname].filter(Boolean).join(" ") || "Client"}!</h1>
              
              
              
            </section>
            <section className="metricGrid">
              <article className="metric"><span>Registered pets</span><strong>{pets.length}</strong><small>Pet profiles</small></article>
              <article className="metric"><span>Upcoming grooming</span><strong>{upcoming.length}</strong><small>Active schedule</small></article>
              <article className="metric"><span>Product reservations</span><strong>{activeProductReservations.length}</strong><small>Active pickup items</small></article>
              <article className="metric"><span>Loyalty stamps</span><strong>{loyaltyProgress.vip ? "VIP" : `${loyaltyProgress.visits}/11`}</strong><small>{loyaltyProgress.vip ? "Lifetime 10% service discount" : "5th & 10th visits: 50% off"}</small></article>
            </section>
            
            <section className="dashGrid">
              <article className="dashPanel">
                {next ? (
                  <div className="scheduleItem"><span>{next.appointmentDate.getUTCDate()}</span><div><b>{next.pet.petName} · {next.style.styleName}</b><small>{date(next.appointmentDate)} · {wallClockTime(next.appointmentTime)} · {next.groomer.groomerName}</small></div><em>{next.status.toUpperCase()}</em></div>
                ) : null}
                {activeProductReservations.map((reservation) => (
                  <div className="scheduleItem dashboardProductReservation" key={reservation.reservationId.toString()}>
                    <span aria-hidden="true">🛍</span>
                    <div>
                      <b>{reservation.items.map((item) => `${item.product.productName} × ${item.quantity}`).join(", ")}</b>
                      <small>Product reservation · {reservation.reservationCode} · ₱{money(reservation.totalAmount)}</small>
                      <small>{reservation.status === "Ready for Pickup" ? "Ready for pickup at the shop" : "Shop pickup"}</small>
                    </div>
                    <em>{reservation.status.toUpperCase()}</em>
                  </div>
                ))}
                {!next && !activeProductReservations.length && <Empty title="No upcoming reservations" detail="Your grooming appointments and product reservations will appear here." />}
              </article>
              
            </section>
        </div>

        <div data-dashboard-panel="messages">
          <PortalSection eyebrow="SHOP SUPPORT" title="Messages" description="">
            {view === "messages" && <MessagesPanel portal="client" initialConversation={Number(params.conversation) || undefined}/>}
          </PortalSection>
        </div>
        <div data-dashboard-panel="pets">
          <PortalSection eyebrow="PET PROFILES" title="My Pets" description="">
            <MyPets pets={pets.map(pet => ({ id: pet.id, petName: pet.petName, species: pet.species, hasPhoto: pet.hasPhoto }))}/>
          </PortalSection>
        </div>

        <div data-dashboard-panel="grooming">{view === "grooming" && <AppointmentRefresh/>}
          <PortalSection eyebrow="CARE SCHEDULE" title="" description="">
            <HaircutGallery styles={styles.map(style => ({ id: style.styleId, name: style.styleName, prices: pricing.filter(item => item.styleId === style.styleId).map(item => ({ id: item.pricingId, size: item.petSize, amount: item.price.toString() })) }))}>
            {pets.length && styles.length && groomers.length ? <details className="clientActionPanel" open><summary>Grooming Appointment Form</summary><GroomingBookingForm completedVisits={loyaltyProgress.visits} vipMember={loyaltyProgress.vip} addons={addons.map((item) => ({ id: item.addonId, label: item.addonName, price: Number(item.price.toString()) }))} prices={pricing.map((item) => ({ styleId: item.styleId, petSize: item.petSize, price: Number(item.price.toString()) }))} requestToken={randomBytes(16).toString("hex")} address={customer?.address || ""} customerName={customer?.customerName || [user.firstName, user.surname].filter(Boolean).join(" ")} groomers={groomers.map((item) => ({ id: item.groomerId, label: item.groomerName }))} minimumDate={businessDate()} pets={pets.map((item) => ({ id: item.id, label: item.petName }))} phone={customer?.phone || user.phoneNumber || ""} styles={styles.map((item) => ({ id: item.styleId, label: item.styleName }))}/></details> : <div className="portalHint">Add a pet profile before booking. Grooming reservations require an available package and groomer.</div>}</HaircutGallery>
          </PortalSection>
        </div>

        <div data-dashboard-panel="products">
          <PortalSection eyebrow="PET ESSENTIALS" title="Products" description="">
            {productsFailed ? <div className="dashboardEmpty" role="alert"><b>Products could not be loaded</b><small>Please retry. Your inventory is temporarily unavailable.</small><a href="/client/dashboard?view=products">Retry products</a></div> : <ProductCatalog userId={user.id} products={products.map((product) => ({ productId: product.productId, productName: product.productName, category: product.category, description: product.description, stockQuantity: product.stockQuantity, reorderLevel: product.reorderLevel, image: product.image, price: Number(product.price.toString()) }))} address={customer?.address || ""} phone={customer?.phone || user.phoneNumber || ""} />}
          </PortalSection>
        </div>

        <div data-dashboard-panel="reservations">{view === "reservations" && <AppointmentRefresh/>}
          <PortalSection eyebrow="ORDER HISTORY" title="Reservations" description="">
            {!appointments.length && !productReservations.length ? <Empty title="No reservations yet" detail="Your product and grooming reservations will appear here." /> : <div className="reservationColumns"><div><h3>Product reservations</h3>{productReservations.length ? <div className="clientList">{productReservations.map((reservation) => <ReservationCard key={reservation.reservationId.toString()} id={reservation.reservationId.toString()} kind="product" title={reservation.items.map((item) => `${item.quantity} × ${item.product.productName}${getReservedPortion(item.product.productName, Number(item.unitPrice.toString())) ? ` (${getReservedPortion(item.product.productName, Number(item.unitPrice.toString()))} each)` : ""}`).join(", ")} schedule={`Pickup: ${date(reservation.reservedUntil)} at ${time(reservation.reservedUntil)} - ₱${money(reservation.totalAmount)}`} reference={`${reservation.reservationCode} - Payment: ${paymentPreference(reservation.reservationCode)} - Reserved ${date(reservation.createdAt)}`} status={reservation.status}><ReservedProductItems items={reservation.items}/><ReservationReceiptLinks id={String(reservation.reservationId)}/></ReservationCard>)}</div> : <Empty title="No product reservations" detail="Reserved pickup items will appear here." />}</div><div><h3>Grooming reservations</h3>{appointments.length ? <div className="clientList">{appointments.map((item) => <ReservationCard key={item.appointmentId.toString()} id={item.appointmentId.toString()} kind="grooming" title={`${item.pet.petName} - ${item.style.styleName}`} schedule={`${date(item.appointmentDate)} at ${wallClockTime(item.appointmentTime)} - ${item.groomer.groomerName}`} reference={`${item.reservationCode} - ${item.bookingType === "Home Service" ? "HOME SERVICE" : "STORE SERVICE"}`} status={item.status}><AppointmentAttendance id={item.appointmentId}/><LoyaltyInvoice id={item.appointmentId}/><GroomingReceiptLinks id={String(item.appointmentId)}/></ReservationCard>)}</div> : <Empty title="No grooming reservations" detail="Booked grooming services will appear here." />}</div></div>}
          </PortalSection>
        </div>

        <div data-dashboard-panel="reviews"><section className="clientView">{view === "reviews" && <ReviewsPanel mode="mine" loggedIn/>}</section></div>
        <div data-dashboard-panel="notifications"><PortalSection eyebrow="UPDATES" title="Notifications" description="">{view === "notifications" ? <ClientNotificationCenter/> : <p role="status">Loading notifications?</p>}</PortalSection></div>
        <div data-dashboard-panel="account" className="clientAccountLayout">{view === "account" && <AppointmentRefresh/>}
          <PortalSection eyebrow="PERSONAL DETAILS" title="My account" description="">
            <AccountLoyalty visits={loyaltyProgress.visits} vip={loyaltyProgress.vip}/>
            <form id="client-profile-form" action={updateProfile} className="profileEditForm"><label>First name<input name="firstName" defaultValue={user.firstName || ""} required /></label><label>Middle initial<input name="middleInitial" defaultValue={user.middleInitial || ""} maxLength={2} /></label><label>Surname<input name="surname" defaultValue={user.surname || ""} required /></label><label>Email address<input value={user.email} readOnly /></label><label>Phone number<input name="phone" defaultValue={user.phoneNumber || customer?.phone || ""} required /></label><label className="wideField">Address<textarea name="address" defaultValue={customer?.address || ""} rows={3} /></label></form><ChangePasswordForm initialOpen/><div className="accountProfileFooter"><div className="profileMeta"><span>Account: <b>{user.accountStatus}</b></span><span>Member since: <b>{date(user.createdAt)}</b></span></div><button type="submit" form="client-profile-form">Save profile</button></div>
          </PortalSection>
        </div>
    </ClientDashboardShell>
  );
}

function PortalSection({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: React.ReactNode }) {
  return <section className="clientView"><header className="clientViewHeader"><small>{eyebrow}</small>{title && <h1>{title}</h1>}{description && <p>{description}</p>}</header>{children}</section>;
}

function Empty({ title, detail }: { title: string; detail: string }) {
  return <div className="dashboardEmpty"><b>{title}</b><small>{detail}</small></div>;
}
