import GroomingReceiptLinks from '@/components/GroomingReceiptLinks';
import ReservationReceiptLinks from '@/components/ReservationReceiptLinks';
import ReservedProductItems from '@/components/ReservedProductItems';
import {paymentPreference} from "@/lib/cart-rules";
import { stockStatus } from "@/lib/stock-status";
import LoyaltyInvoice from "@/components/LoyaltyInvoice";
import AppointmentAttendance from "@/components/AppointmentAttendance";
import AppointmentRefresh from "@/components/AppointmentRefresh";
import { updateAttendanceSetting } from "../actions";
import { petSummaries } from "@/lib/pet-summaries";
import ChangePasswordForm from "@/components/ChangePasswordForm";
import MessagesPanel from "@/components/MessagesPanel";
import { businessDate, wallClockTime } from "@/lib/business-time";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import AdminIcon from "@/components/AdminIcon";
import AdminProductCard from "@/components/AdminProductCard";
import AdminAccounts from "@/components/AdminAccounts";
import AdminShell from "@/components/AdminShell";
import AdminSubmitButton from "@/components/AdminSubmitButton";
import ReportPdfButton from "@/components/ReportPdfButton";
import { prisma } from "@/lib/prisma";
import { productImageSrc } from "@/lib/product-image";
import { getReservedPortion } from "@/lib/product-portions";
import { reportAppointmentWhere, reportReservationWhere, resolveReportPeriod } from "@/lib/reporting";
import { readSessionToken, sessionCookieName } from "@/lib/session";
import { createGroomer, createProduct, openNotification, saveGroomerSchedule, updateAddon, updateClientStatus, updateGroomer, updateGroomingStatus, updateLoyalty, updatePackage, updateProductReservationStatus, updatePetRecord } from "../actions";

const money = (value: { toString(): string }) => Number(value.toString()).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const date = (value: Date) => new Intl.DateTimeFormat("en-PH", { month: "short", day: "2-digit", year: "numeric", timeZone: "Asia/Manila" }).format(value);
const time = (value: Date) => new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" }).format(value);
const dayKey = (value: Date) => new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Manila" }).format(value);
const views = ["dashboard", "products", "categories", "inventory", "orders", "reservations", "customers", "pets", "groomers", "services", "schedules", "messages", "notifications", "reports", "auditlogs", "admins", "settings", "profile"] as const;
type AdminView = (typeof views)[number];
type BusinessMetrics = { totalClients: number; activeClients: number; pendingOrderCount: number; pendingAppointmentCount: number; openOrderCount: number; activeAppointmentCount: number; claimedSales: number; totalOrderCount: number; totalAppointmentCount: number; vipCustomerCount: number; availableGroomerCount: number; homeServiceCount: number };

async function loadBusinessMetrics(): Promise<BusinessMetrics[]> {
  const [totalClients, activeClients, pendingOrderCount, pendingAppointmentCount, openOrderCount, activeAppointmentCount, completedSales, totalOrderCount, totalAppointmentCount, vipCustomerCount, availableGroomerCount, homeServiceCount] = await Promise.all([
    prisma.user.count({ where: { role: "User" } }),
    prisma.user.count({ where: { role: "User", accountStatus: "Active" } }),
    prisma.productReservation.count({ where: { status: "Pending" } }),
    prisma.groomingAppointment.count({ where: { status: "Pending" } }),
    prisma.productReservation.count({ where: { status: { in: ["Pending", "Approved", "Ready for Pickup"] } } }),
    prisma.groomingAppointment.count({ where: { status: { in: ["Pending", "Confirmed", "Checked In", "In Progress"] } } }),
    prisma.productReservation.aggregate({ where: { status: "Completed" }, _sum: { totalAmount: true } }),
    prisma.productReservation.count(),
    prisma.groomingAppointment.count(),
    prisma.customer.count({ where: { rewardAvailable: true } }),
    prisma.groomer.count({ where: { isActive: 1 } }),
    prisma.groomingAppointment.count({ where: { bookingType: "Home Service", status: { in: ["Pending", "Confirmed", "Checked In", "In Progress"] } } }),
  ]);
  return [{ totalClients, activeClients, pendingOrderCount, pendingAppointmentCount, openOrderCount, activeAppointmentCount, claimedSales: Number(completedSales._sum.totalAmount || 0), totalOrderCount, totalAppointmentCount, vipCustomerCount, availableGroomerCount, homeServiceCount }];
}

const viewCopy: Record<AdminView, { title: string; description: string }> = {
  messages: { title: "Messages", description: "Read customer conversations and reply from the shared support inbox." },
  pets: { title: "Pets", description: "Review and update pet profiles with their associated customers." },
  dashboard: { title: "Dashboard", description: "Your daily operations at a glance." }, products: { title: "Products", description: "Manage product details, pricing, images, and visibility." },
  categories: { title: "Categories", description: "Review how products are organized across the catalog." }, inventory: { title: "Inventory", description: "Monitor quantities and act on low-stock items." },
  orders: { title: "Orders", description: "Track and update product pickup reservations." }, reservations: { title: "Reservations", description: "Manage grooming appointments and customer bookings." },
  customers: { title: "Customers", description: "Review client accounts and control access." }, services: { title: "Grooming Services", description: "Maintain grooming packages and add-on pricing." },
  groomers: { title: "Groomers", description: "Manage groomer availability, contacts, and weekly schedules." }, notifications: { title: "Notifications", description: "Review grooming and product reservation activity." },
  schedules: { title: "Schedules", description: "See upcoming grooming work in chronological order." }, reports: { title: "Business Reports", description: "Understand product demand and appointment activity." },
  auditlogs: { title: "Audit Logs", description: "Search the permanent record of important system actions." },
  admins: { title: "All Accounts", description: "Create accounts, assign roles, and manage access." }, settings: { title: "Settings", description: "Review system and account configuration." },
  profile: { title: "My Profile", description: "View the account currently signed in to the admin portal." },
};

function valueOf(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] || "" : value || ""; }
function statusTone(status: string) {
  if(status.startsWith("Cancelled"))return "danger"; if(["Checked In","In Progress"].includes(status))return "info";
  const normalized = status.toLowerCase();
  if (["active", "completed", "claimed", "confirmed", "ready for pickup"].includes(normalized)) return "success";
  if (["cancelled", "suspended"].includes(normalized)) return "danger";
  if (["pending"].includes(normalized)) return "warning";
  return "info";
}

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const requestedView = valueOf(query.view);
  const activeView: AdminView = views.includes(requestedView as AdminView) ? requestedView as AdminView : "dashboard";
  const search = valueOf(query.q).trim().toLowerCase();
  const filter = valueOf(query.filter).trim();
  const notice = valueOf(query.notice);
  const accountError = valueOf(query.error);
  const now = new Date();
  const reportPeriod = resolveReportPeriod({ range: valueOf(query.range) || "month", from: valueOf(query.from), to: valueOf(query.to) }, now);
  const { range, start: rangeStart, end: rangeEnd } = reportPeriod;
  const cookieStore = await cookies();
  const session = await readSessionToken(cookieStore.get(sessionCookieName)?.value);
  if (session?.role !== "Admin" && session?.role !== "SuperAdmin") redirect("/admin/login");
  const currentAdmin = await prisma.user.findFirst({ where: { id: session.userId, role: { in: ["Admin", "SuperAdmin"] }, accountStatus: "Active" }, select: { id: true, firstName: true, surname: true, username: true, email: true, phoneNumber: true, role: true, accountStatus: true, createdAt: true } });
  if (!currentAdmin) redirect("/admin/login");
  if (activeView === "admins" && currentAdmin.role !== "SuperAdmin") redirect("/admin/dashboard");

  const needsAppointments = ["dashboard", "reservations", "schedules", "reports"].includes(activeView);
  const needsOrders = ["dashboard", "orders", "reports"].includes(activeView);
  const needsProducts = ["dashboard", "products", "categories", "inventory", "reports"].includes(activeView);
  const needsBusinessTotals = activeView === "dashboard" || activeView === "reports";
  let productsFailed = false;
  const [clients, customerProfiles, products, packages, addons, appointments, productReservations, businessMetricsRows, groomers, notificationsList, auditLogs, unreadCount] = await Promise.all([
    activeView === "customers" ? prisma.user.findMany({ where: { role: "User" }, select: { id: true, email: true, firstName: true, surname: true, phoneNumber: true, accountStatus: true, createdAt: true }, orderBy: { createdAt: "desc" } }) : Promise.resolve([]),
    activeView === "customers" ? prisma.customer.findMany({ include: { loyaltyTransactions: { orderBy: { createdAt: "desc" }, take: 3 } } }) : Promise.resolve([]),
    needsProducts ? prisma.product.findMany({ select: { productId: true, sku: true, productName: true, category: true, productGroup: true, price: true, stockQuantity: true, reorderLevel: true, isActive: true, description: true, createdAt: true }, orderBy: [{ isActive: "desc" }, { category: "asc" }, { productName: "asc" }] }).then((rows) => rows.map((row) => ({ ...row, image: null as string | null }))).catch(() => { productsFailed = true; return []; }) : Promise.resolve([]),
    activeView === "services" ? prisma.styleSizePricing.findMany({ include: { style: true }, orderBy: [{ styleId: "asc" }, { pricingId: "asc" }] }) : Promise.resolve([]),
    activeView === "services" ? prisma.groomingAddon.findMany({ orderBy: { addonName: "asc" } }) : Promise.resolve([]),
    needsAppointments ? prisma.groomingAppointment.findMany({ where: activeView === "reports" ? reportAppointmentWhere(reportPeriod) : undefined, include: { customer: true, pet: true, style: true, groomer: true }, orderBy: [{ appointmentDate: "desc" }, { appointmentTime: "desc" }] }) : Promise.resolve([]),
    needsOrders ? prisma.productReservation.findMany({ where: activeView === "reports" ? reportReservationWhere(reportPeriod) : undefined, include: { customer: true, items: { include: { product: { select: { productId: true, productName: true } } } } }, orderBy: { createdAt: "desc" }, take: activeView === "dashboard" ? 10 : undefined }) : Promise.resolve([]),
    needsBusinessTotals ? loadBusinessMetrics() : Promise.resolve([]),
    ["dashboard", "groomers"].includes(activeView) ? prisma.groomer.findMany({ include: { availability: { orderBy: { dayOfWeek: "asc" } } }, orderBy: { groomerName: "asc" } }) : Promise.resolve([]),
    activeView === "notifications" ? prisma.notification.findMany({ where: { recipientId: session.userId }, orderBy: { createdAt: "desc" }, take: 100 }) : Promise.resolve([]),
    activeView === "auditlogs" ? prisma.auditLog.findMany({ where: { AND: [search ? { OR: [{ userName: { contains: search } }, { action: { contains: search } }, { module: { contains: search } }] } : {}, filter && filter !== "All" ? { module: filter } : {}, valueOf(query.from) ? { createdAt: { gte: new Date(`${valueOf(query.from)}T00:00:00+08:00`) } } : {}, valueOf(query.to) ? { createdAt: { lte: new Date(`${valueOf(query.to)}T23:59:59+08:00`) } } : {}] }, orderBy: { createdAt: "desc" }, take: 250 }) : Promise.resolve([]),
    prisma.notification.count({ where: { recipientId: session.userId, isRead: false } }),
  ]);

  const petRecords = activeView === "pets" ? await petSummaries() : [];
  const visiblePets = petRecords.filter((pet) => (!search || `${pet.petName} ${pet.breed || ""} ${pet.customer.customerName} ${pet.customer.email || ""}`.toLowerCase().includes(search)) && (!filter || filter === "All" || pet.species === filter));
  const businessMetrics = businessMetricsRows[0] || { totalClients: 0, activeClients: 0, pendingOrderCount: 0, pendingAppointmentCount: 0, openOrderCount: 0, activeAppointmentCount: 0, claimedSales: 0, totalOrderCount: 0, totalAppointmentCount: 0, vipCustomerCount: 0, availableGroomerCount: 0, homeServiceCount: 0 };
  const { totalClients, activeClients, pendingOrderCount, pendingAppointmentCount, openOrderCount, activeAppointmentCount, claimedSales, totalOrderCount, totalAppointmentCount, vipCustomerCount, availableGroomerCount, homeServiceCount } = businessMetrics;

  const loyaltyRows=activeView === "customers" ? await prisma.$queryRaw<{customer_id:number;completed_visits:number;vip_member:number}[]>`SELECT * FROM customer_loyalty_program`:[];
  const loyaltyByCustomer=new Map(loyaltyRows.map(row=>[row.customer_id,row]));
  const adminName = [currentAdmin.firstName, currentAdmin.surname].filter(Boolean).join(" ") || session.name || "Administrator";
  const today = new Date();
  const todayKey = dayKey(today);
  const activeProducts = products.filter((item) => item.isActive);
  const lowStockProducts = activeProducts.filter((item) => item.stockQuantity <= item.reorderLevel);
  const todayAppointments = appointments.filter((item) => dayKey(item.appointmentDate) === todayKey && item.status !== "Cancelled");
  const completedSales = Number(claimedSales || 0);
  const notifications = unreadCount;
  const customerProfileByEmail = new Map(customerProfiles.filter((item) => item.email).map((item) => [item.email!.toLowerCase(), item]));
  const categoryRows = [...new Set(products.map((item) => item.category))].sort().map((category) => ({ category, products: products.filter((item) => item.category === category) }));
  const inventoryCategoryStats = categoryRows.map((item) => [item.category, item.products.reduce((sum, product) => sum + product.stockQuantity, 0)] as const).sort((a, b) => b[1] - a[1]);
  const stockHealth = [
    ["Healthy", activeProducts.filter((item) => item.stockQuantity > item.reorderLevel).length, "green"],
    ["Low stock", activeProducts.filter((item) => item.stockQuantity > 0 && item.stockQuantity <= item.reorderLevel).length, "amber"],
    ["Out of stock", activeProducts.filter((item) => item.stockQuantity <= 0).length, "red"],
  ] as const;
  const visibleProducts = products.filter((item) => (!search || `${item.productName} ${item.sku || ""} ${item.category}`.toLowerCase().includes(search)) && (!filter || filter === "All" || (filter === "Active" ? item.isActive : filter === "Inactive" ? !item.isActive : filter === "Low stock" ? item.isActive && item.stockQuantity <= item.reorderLevel : item.category === filter)));
  const visibleClients = clients.filter((item) => (!search || `${item.firstName || ""} ${item.surname || ""} ${item.email}`.toLowerCase().includes(search)) && (!filter || filter === "All" || item.accountStatus === filter));
  const visibleOrders = productReservations.filter((item) => (!search || `${item.reservationCode} ${item.customer.customerName} ${item.items.map((line) => line.product.productName).join(" ")}`.toLowerCase().includes(search)) && (!filter || filter === "All" || item.status === filter));
  const visibleAppointments = appointments.filter((item) => (!search || `${item.reservationCode} ${item.customer.customerName} ${item.pet.petName} ${item.style.styleName}`.toLowerCase().includes(search)) && (!filter || filter === "All" || item.status === filter));
  const requestedPage = Math.max(1, Number.parseInt(valueOf(query.page), 10) || 1);
  const pageSize = ["products", "inventory"].includes(activeView) ? 12 : 15;
  const activeListLength = ["products", "inventory"].includes(activeView) ? visibleProducts.length : activeView === "customers" ? visibleClients.length : activeView === "orders" ? visibleOrders.length : visibleAppointments.length;
  const totalPages = Math.max(1, Math.ceil(activeListLength / pageSize));
  const currentPage = Math.min(requestedPage, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pagedProducts = visibleProducts.slice(pageStart, pageStart + pageSize);
  const pagedClients = visibleClients.slice(pageStart, pageStart + pageSize);
  const pagedOrders = visibleOrders.slice(pageStart, pageStart + pageSize);
  const pagedAppointments = visibleAppointments.slice(pageStart, pageStart + pageSize);
  const productSales = new Map<string, number>();
  for (const reservation of productReservations.filter((item) => item.status !== "Cancelled")) for (const item of reservation.items) productSales.set(item.product.productName, (productSales.get(item.product.productName) || 0) + item.quantity);
  const topProducts = [...productSales].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const completedProductSales = new Map<string, number>();
  for (const reservation of productReservations.filter((item) => item.status === "Completed")) for (const item of reservation.items) completedProductSales.set(item.product.productName, (completedProductSales.get(item.product.productName) || 0) + item.quantity);
  const topCompletedProducts = [...completedProductSales].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const stockStats = products.map((item) => [item.productName, item.stockQuantity] as const).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const appointmentStats = ["Pending", "Confirmed", "Completed", "Cancelled"].map((status) => [status, appointments.filter((item) => item.status === status).length] as const);
  const serviceTypeStats = [["Store Grooming", appointments.filter((item) => item.bookingType !== "Home Service").length], ["Home Service", appointments.filter((item) => item.bookingType === "Home Service").length]] as const;
  const styleStats = [...new Set(appointments.map((item) => item.style.styleName))].map((name) => [name, appointments.filter((item) => item.style.styleName === name).length] as const).sort((a, b) => b[1] - a[1]);
  const groomerStats = [...new Set(appointments.map((item) => item.groomer.groomerName))].map((name) => [name, appointments.filter((item) => item.groomer.groomerName === name).length] as const);
  const trendSpanDays = Math.max(1, Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / 86400000));
  const monthlyTrend = trendSpanDays > 45;
  const trendKey = (value: Date) => monthlyTrend ? dayKey(value).slice(0, 7) : dayKey(value);
  const trendLabel = (value: Date) => new Intl.DateTimeFormat("en-PH", monthlyTrend ? { month: "short", year: "2-digit", timeZone: "Asia/Manila" } : { month: "short", day: "numeric", timeZone: "Asia/Manila" }).format(value);
  const trendBuckets = new Map<string, { label: string; orders: number; appointments: number }>();
  const trendCursor = new Date(rangeStart);
  const trendLimit = monthlyTrend ? Math.ceil(trendSpanDays / 28) + 2 : 45;
  for (let index = 0; trendCursor <= rangeEnd && index < trendLimit; index++) {
    const key = trendKey(trendCursor);
    if (!trendBuckets.has(key)) trendBuckets.set(key, { label: trendLabel(trendCursor), orders: 0, appointments: 0 });
    if (monthlyTrend) trendCursor.setUTCMonth(trendCursor.getUTCMonth() + 1, 1); else trendCursor.setUTCDate(trendCursor.getUTCDate() + 1);
  }
  for (const reservation of productReservations) { const bucket = trendBuckets.get(trendKey(reservation.createdAt)); if (bucket) bucket.orders++; }
  for (const appointment of appointments) { const bucket = trendBuckets.get(trendKey(appointment.appointmentDate)); if (bucket) bucket.appointments++; }
  const activityTrend = [...trendBuckets.values()];
  const maxInventoryUnits = Math.max(1, ...inventoryCategoryStats.map(([, units]) => units));
  const maxProductSales = Math.max(1, ...topProducts.map(([, count]) => count), ...topCompletedProducts.map(([, count]) => count), ...stockStats.map(([, count]) => count));
  const maxAppointments = Math.max(1, ...appointmentStats.map(([, count]) => count), ...groomerStats.map(([, count]) => count), ...serviceTypeStats.map(([, count]) => count), ...styleStats.map(([, count]) => count));
  const reportPdfSearch = new URLSearchParams({ range });
  if (reportPeriod.from) reportPdfSearch.set("from", reportPeriod.from);
  if (reportPeriod.to) reportPdfSearch.set("to", reportPeriod.to);
  const reportPdfHref = `/api/admin/reports/pdf?${reportPdfSearch.toString()}`;

  return <AdminShell activeView={activeView} adminName={adminName} adminRole={currentAdmin.role === "SuperAdmin" ? "Super Administrator" : "Administrator"} isSuperAdmin={currentAdmin.role === "SuperAdmin"} notificationCount={notifications} pageDescription={viewCopy[activeView].description} pageTitle={viewCopy[activeView].title}>
    {activeView === "dashboard" && <AppointmentRefresh/>}
    {notice && <div className="adminToast success" role="status"><span>✓</span>{notice}</div>}
    {activeView !== "admins" && accountError && <div className="adminToast error" role="alert">{accountError}</div>}
    {activeView === "admins" && accountError && <div className="adminToast error" role="alert">{accountError === "email-exists" ? "An account with that email already exists." : accountError === "invalid-update" ? "The account change could not be saved. Check the selected role and status." : "Check the account details and confirm that both passwords match."}</div>}
    {activeView === "dashboard" && <>
      <section className="adminWelcome"><div><p className="adminEyebrow">{new Intl.DateTimeFormat("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "Asia/Manila" }).format(today)}</p><h2>Welcome back, {currentAdmin.firstName || "Admin"}.</h2></div></section>
      {(notifications > 0) && <section className="adminAttention" id="attention"><AdminIcon name="bell"/><div><b>{notifications} unread notification{notifications === 1 ? "" : "s"}</b><p>New appointments, home-service requests, cancellations, and product reservations appear here.</p></div><Link href="/admin/dashboard?view=notifications">Review now</Link></section>}
      <section className="adminMetricGrid">
        <Metric icon="products" label="Total Products" value={products.length} detail={`${activeProducts.length} currently visible`} />
        <Metric icon="customers" label="Total Customers" value={totalClients} detail={`${activeClients} active accounts`} />
        <Metric icon="orders" label="Pending Orders" value={openOrderCount} detail="Awaiting completion" tone="amber" />
        <Metric icon="calendar" label="Reservations Today" value={todayAppointments.length} detail={`${activeAppointmentCount} active bookings`} />
        <Metric icon="services" label="Home Service" value={homeServiceCount} detail="Active home requests" tone="amber" />
        <Metric icon="admins" label="Available Groomers" value={availableGroomerCount} detail="Ready for selection" tone="green" />
        <Metric icon="warning" label="Low Stock Items" value={lowStockProducts.length} detail="At or below alert level" tone="red" />
        <Metric icon="customers" label="VIP Customers" value={vipCustomerCount} detail="Lifetime VIP · 10% off services" tone="green" />
        <Metric icon="sales" label="Completed Sales" value={`₱${completedSales.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`} detail="Completed product reservations" tone="green" />
      </section>
      <div className="adminDashboardGrid">
        <section className="adminPanel"><SectionHeading eyebrow="LATEST ACTIVITY" title="Recent Orders" action={<Link href="/admin/dashboard?view=orders">View all</Link>} />{productReservations.length ? <div className="adminTableScroll"><table className="modernAdminTable"><thead><tr><th>Order</th><th>Customer</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead><tbody>{productReservations.slice(0, 5).map((item) => <tr key={item.reservationId.toString()}><td><b>{item.reservationCode}</b></td><td>{item.customer.customerName}</td><td>{date(item.createdAt)}</td><td>₱{money(item.totalAmount)}</td><td><StatusBadge status={item.status}/></td></tr>)}</tbody></table></div> : <EmptyState title="No orders yet" text="Product reservations will appear here." />}</section>
        <section className="adminPanel"><SectionHeading eyebrow="SHORTCUTS" title="Quick Actions"/><div className="adminQuickActions"><Link href="/admin/dashboard?view=products#add-product"><AdminIcon name="products"/>Add Product</Link><Link href="/admin/dashboard?view=categories"><AdminIcon name="categories"/>View Categories</Link><Link href="/admin/dashboard?view=reservations"><AdminIcon name="calendar"/>Reservations</Link><Link href="/admin/dashboard?view=orders"><AdminIcon name="orders"/>View Orders</Link><Link href="/admin/dashboard?view=customers"><AdminIcon name="customers"/>View Customers</Link></div></section>
      </div>
      <div className="adminDashboardGrid lower">
        <section className="adminPanel"><SectionHeading eyebrow="TODAY" title="Upcoming Appointments" action={<Link href="/admin/dashboard?view=schedules">Full schedule</Link>} />{todayAppointments.length ? <div className="adminTableScroll"><table className="modernAdminTable"><thead><tr><th>Customer</th><th>Service</th><th>Time</th><th>Status</th></tr></thead><tbody>{todayAppointments.slice(0, 6).map((item) => <tr key={item.appointmentId.toString()}><td><b>{item.customer.customerName}</b><small>{item.pet.petName}</small></td><td>{item.style.styleName}</td><td>{wallClockTime(item.appointmentTime)}</td><td><StatusBadge status={item.status}/></td></tr>)}</tbody></table></div> : <EmptyState title="No appointments today" text="Today's confirmed and pending bookings will appear here." />}</section>
        <section className="adminPanel"><SectionHeading eyebrow="INVENTORY ALERT" title="Low Stock Products" action={<Link href="/admin/dashboard?view=inventory">View inventory</Link>} />{lowStockProducts.length ? <div className="adminCompactList">{lowStockProducts.slice(0, 6).map((item) => <Link href={`/admin/dashboard?view=products&q=${encodeURIComponent(item.productName)}`} key={item.productId}><span><b>{item.productName}</b><small>{item.category}</small></span><StatusBadge status={`${item.stockQuantity} left`} tone="warning"/></Link>)}</div> : <EmptyState title="Stock levels look good" text="No active products are below their alert level." />}</section>
      </div>
    </>}

    {(activeView === "products" || activeView === "inventory") && <section className="adminModule"><SectionHeading eyebrow="CATALOG MANAGEMENT" title="All Products" detail={`${visibleProducts.length} of ${products.length} products`} />
      <div className="adminMetricGrid compact"><Metric icon="products" label="Total Products" value={products.length} detail="Catalog records"/><Metric icon="package" label="In Stock Products" value={products.filter(p=>stockStatus(p.stockQuantity,p.reorderLevel).tone==="in").length} detail="Above threshold"/><Metric icon="warning" label="Low Stock Products" value={products.filter(p=>stockStatus(p.stockQuantity,p.reorderLevel).tone==="low").length} detail="Needs attention"/><Metric icon="warning" label="Out of Stock Products" value={products.filter(p=>stockStatus(p.stockQuantity,p.reorderLevel).tone==="out").length} detail="Zero available"/></div><FilterBar filter={filter} options={["All", "Active", "Inactive", ...categoryRows.map((item) => item.category)]} placeholder="Search products, SKU, or category..." search={valueOf(query.q)} view={activeView === "inventory" ? "inventory" : "products"} />
      <details className="modernCreatePanel" id="add-product"><summary><span>+</span>Add a new product</summary><form action={createProduct} className="modernAdminForm"><label>SKU <span>*</span><input name="sku" required /></label><label>Product name <span>*</span><input name="name" required /></label><label>Category <span>*</span><input name="category" required /></label><label>Product group <span>*</span><select name="group"><option>Food</option><option>Shampoo</option><option>Other</option></select></label><label>Price <span>*</span><input name="price" type="number" min="0" step="0.01" required /></label><label>Quantity <span>*</span><input name="stock" type="number" min="0" required /></label><label>Low-stock alert <span>*</span><input name="reorder" type="number" min="0" defaultValue="5" required /></label><label className="spanTwo">Description<input name="description" /></label><label className="spanTwo">Product image <small>JPG, PNG, or WebP. Maximum 1.5 MB.</small><input name="imageFile" type="file" accept="image/jpeg,image/png,image/webp" /></label><div className="modernFormActions"><AdminSubmitButton pendingText="Adding product...">Add Product</AdminSubmitButton></div></form></details>
      {productsFailed ? <div className="dashboardEmpty" role="alert"><b>Inventory could not be loaded</b><p>Please retry to retrieve current product records.</p><Link href={`/admin/dashboard?view=${activeView}`}>Retry inventory</Link></div> : visibleProducts.length ? <><div className="databaseCardGrid modernProductGrid">{pagedProducts.map((product) => <AdminProductCard key={product.productId} id={product.productId} sku={product.sku || "Not assigned"} name={product.productName} category={product.category} description={product.description || ""} group={product.productGroup} price={money(product.price)} stock={product.stockQuantity} reorder={product.reorderLevel} active={product.isActive === 1} imageSrc={productImageSrc(product.image, product.productName, product.category, product.productId)} />)}</div><Pagination filter={filter} page={currentPage} pages={totalPages} search={valueOf(query.q)} view={activeView === "inventory" ? "inventory" : "products"}/></> : <EmptyState action="Add Product" href="/admin/dashboard?view=products#add-product" title={products.length ? "No matching products found" : "No products available"} text={products.length ? "Try a different search or category." : "Products will appear here when inventory records are available."} />}
    </section>}

    {activeView === "categories" && <section className="adminModule"><SectionHeading eyebrow="CATALOG STRUCTURE" title="Product Categories" detail={`${categoryRows.length} categories`} /><div className="adminCategoryGrid">{categoryRows.map((item) => <Link href={`/admin/dashboard?view=products&filter=${encodeURIComponent(item.category)}`} key={item.category}><span className="categoryIcon"><AdminIcon name="categories"/></span><b>{item.category}</b><p>{item.products.length} product{item.products.length === 1 ? "" : "s"}</p><small>{item.products.filter((product) => product.isActive).length} active · {item.products.reduce((sum, product) => sum + product.stockQuantity, 0)} units</small></Link>)}</div>{!categoryRows.length && <EmptyState action="Add Product" href="/admin/dashboard?view=products#add-product" title="No categories yet" text="Categories are created from the category field on products." />}</section>}


    {activeView === "pets" && <section className="adminModule"><SectionHeading eyebrow="PET PROFILES" title="Registered Pets" detail={`${visiblePets.length} matching records`}/><FilterBar view="pets" search={search} filter={filter} options={["All", "Dog", "Cat", "Other"]} placeholder="Pet name, breed, or customer"/><div className="clientCardGrid">{visiblePets.map((pet) => <form key={pet.id} action={updatePetRecord} className="clientEditCard"><input type="hidden" name="id" value={pet.id}/>{pet.photoPath && <img src={`/api/pets/${pet.id}/image`} alt={pet.petName} width={80} height={80}/>}<p>{pet.customer.customerName} - {pet.customer.email || "No email"}</p><small>{pet.isActive ? "Active" : "Archived"}</small><label>Pet name<input name="petName" defaultValue={pet.petName} maxLength={100} required/></label><label>Species<select name="species" defaultValue={pet.species || "Other"}><option>Dog</option><option>Cat</option><option>Other</option></select></label><label>Breed<input name="breed" defaultValue={pet.breed || ""} maxLength={100}/></label><label>Age / date of birth<input name="ageDob" defaultValue={pet.ageDob || ""} maxLength={100}/></label><label>Gender<select name="gender" defaultValue={pet.gender || ""}><option value="">Unspecified</option><option>Male</option><option>Female</option></select></label><label>Replace photo<input name="photo" type="file" accept="image/jpeg,image/png,image/webp"/></label><AdminSubmitButton>Save pet</AdminSubmitButton></form>)}</div>{!visiblePets.length && <EmptyState title="No matching pets" text="Pet profiles appear after a client registers a pet."/>}</section>}
    {activeView === "customers" && <section className="adminModule"><SectionHeading eyebrow="CUSTOMER MANAGEMENT" title="Customer Accounts & Loyalty" detail={`${visibleClients.length} of ${clients.length} customers`} /><FilterBar filter={filter} options={["All", "Active", "Suspended"]} placeholder="Search customer name or email..." search={valueOf(query.q)} view="customers"/><div className="adminTableCard"><div className="adminTableScroll"><table className="modernAdminTable"><thead><tr><th>Customer</th><th>Contact & Address</th><th>Status</th><th>Loyalty</th><th>Account access</th></tr></thead><tbody>{pagedClients.map((client) => { const originalProfile = customerProfileByEmail.get(client.email.toLowerCase()); const program=originalProfile?loyaltyByCustomer.get(originalProfile.id):undefined; const profile=originalProfile?{...originalProfile,loyaltyStamps:program?.completed_visits??originalProfile.loyaltyStamps,rewardAvailable:Boolean(program?.vip_member??originalProfile.rewardAvailable)}:undefined; return <tr key={client.id}><td><b>{profile?.customerName || [client.firstName, client.surname].filter(Boolean).join(" ") || "Customer"}</b><small>{client.email} · Joined {date(client.createdAt)}</small></td><td><b>{profile?.phone || client.phoneNumber || "Not provided"}</b><small>{profile?.address || "No address saved"}</small></td><td><StatusBadge status={client.accountStatus}/></td><td>{profile ? <div className="loyaltyAdminCell"><b>{profile.loyaltyStamps} completed visits</b><small>{profile.rewardAvailable ? "Lifetime VIP · 10% off services" : "In progress"}</small><form action={updateLoyalty} className="adminInlineForm"><input name="id" type="hidden" value={profile.id}/><input aria-label="Stamp balance" max="100000" min="0" name="stamps" type="number" defaultValue={profile.loyaltyStamps}/><input aria-label="Reason" name="reason" placeholder="Reason" required/><AdminSubmitButton>Save</AdminSubmitButton></form><small>5th/10th: 50% · 11th onward: lifetime 10%. No redemption or reset.</small></div> : <small>Profile created on first booking</small>}</td><td><form action={updateClientStatus} className="adminInlineForm"><input type="hidden" name="id" value={client.id}/><select aria-label={`Access status for ${client.email}`} name="status" defaultValue={client.accountStatus}><option>Active</option><option>Suspended</option></select><AdminSubmitButton>Update</AdminSubmitButton></form></td></tr>})}</tbody></table></div>{!visibleClients.length && <EmptyState title="No customers found" text="Try changing the search or status filter." />}<Pagination filter={filter} page={currentPage} pages={totalPages} search={valueOf(query.q)} view="customers"/></div></section>}

    {activeView === "orders" && <section className="adminModule"><SectionHeading eyebrow="ORDER MANAGEMENT" title="Product Pickup Reservations" detail={`${visibleOrders.length} records`} /><FilterBar filter={filter} options={["All", "Pending", "Approved", "Ready for Pickup", "Completed", "Cancelled"]} placeholder="Search order, customer, or product..." search={valueOf(query.q)} view="orders"/><div className="adminTableCard"><div className="adminTableScroll"><table className="modernAdminTable"><thead><tr><th>Reservation</th><th>Customer / Items</th><th>Contact & Address</th><th>Pickup</th><th>Status & Action</th></tr></thead><tbody>{pagedOrders.map((item) => <tr key={item.reservationId.toString()}><td><b>{item.reservationCode}</b><small>₱{money(item.totalAmount)}</small></td><td><b>{item.customerName || item.customer.customerName}</b><small>{item.items.map((line) => `${line.product.productName} x ${line.quantity}${getReservedPortion(line.product.productName, Number(line.unitPrice.toString())) ? ` (${getReservedPortion(line.product.productName, Number(line.unitPrice.toString()))} each)` : ""}`).join(", ")}</small><ReservedProductItems items={item.items}/><ReservationReceiptLinks id={String(item.reservationId)}/></td><td><b>{item.contactNumber || item.customer.phone}</b><small>{item.deliveryAddress || item.customer.address || "No address saved"}</small></td><td><b>{date(item.reservedUntil)}</b><small>{time(item.reservedUntil)}</small><small>Payment: {paymentPreference(item.reservationCode)}</small></td><td>{item.status === "Cancelled" ? <StatusBadge status={item.status}/> : <form action={updateProductReservationStatus} className="adminInlineForm"><input type="hidden" name="id" value={item.reservationId.toString()}/><StatusBadge status={item.status}/><select aria-label={`Status for ${item.reservationCode}`} name="status" defaultValue={item.status}><option>Pending</option><option>Approved</option><option>Ready for Pickup</option><option>Completed</option><option>Cancelled</option></select><AdminSubmitButton>Save</AdminSubmitButton></form>}</td></tr>)}</tbody></table></div>{!visibleOrders.length && <EmptyState title="No orders found" text="Product pickup reservations will appear here." />}<Pagination filter={filter} page={currentPage} pages={totalPages} search={valueOf(query.q)} view="orders"/></div></section>}

    {(activeView === "reservations" || activeView === "schedules") && <section className="adminModule"><AppointmentRefresh/><SectionHeading eyebrow={activeView === "schedules" ? "TEAM CALENDAR" : "APPOINTMENT MANAGEMENT"} title={activeView === "schedules" ? "Grooming Schedule" : "Grooming Appointments"} detail={`${visibleAppointments.length} appointments`} /><FilterBar filter={filter} options={["All", "Pending", "Confirmed", "Checked In", "In Progress", "Completed", "Cancelled", "Cancelled - No Show"]} placeholder="Search reference, customer, pet, or service..." search={valueOf(query.q)} view={activeView}/><div className="adminTableCard"><div className="adminTableScroll"><table className="modernAdminTable"><thead><tr><th>Reference / Type</th><th>Customer / Pet</th><th>Contact / Address</th><th>Service</th><th>Schedule</th><th>Groomer</th><th>Status & Action</th></tr></thead><tbody>{pagedAppointments.map((item) => <tr key={item.appointmentId.toString()}><td><b>{item.reservationCode}</b><small><StatusBadge status={item.bookingType === "Home Service" ? "HOME SERVICE" : "STORE SERVICE"}/></small></td><td><b>{item.contactName || item.customer.customerName}</b><small>{item.pet.petName}</small></td><td><b>{item.contactNumber || item.customer.phone}</b><small>{item.bookingType === "Home Service" ? item.serviceAddress || item.customer.address || "Address unavailable" : "In-store appointment"}</small></td><td>{item.style.styleName}<small>{item.petSize}</small></td><td><b>{date(item.appointmentDate)}</b><small>{wallClockTime(item.appointmentTime)}</small></td><td>{item.groomer.groomerName}</td><td><form action={updateGroomingStatus} className="adminInlineForm"><input type="hidden" name="id" value={item.appointmentId.toString()}/><StatusBadge status={item.status}/><select aria-label={`Status for ${item.reservationCode}`} name="status" defaultValue={item.status}><option>Pending</option><option>Confirmed</option><option>Checked In</option><option>In Progress</option><option>Completed</option><option>Cancelled</option><option>Cancelled - No Show</option></select><input name="reason" placeholder="Reason for no-show / recovery" maxLength={1000} aria-label="Verified absence or recovery reason"/><AdminSubmitButton>Save</AdminSubmitButton></form><AppointmentAttendance id={item.appointmentId}/><LoyaltyInvoice id={item.appointmentId}/><GroomingReceiptLinks id={String(item.appointmentId)}/></td></tr>)}</tbody></table></div>{!visibleAppointments.length && <EmptyState title="No appointments found" text="Try changing the search or status filter." />}<Pagination filter={filter} page={currentPage} pages={totalPages} search={valueOf(query.q)} view={activeView}/></div></section>}

    {activeView === "groomers" && <section className="adminModule"><SectionHeading eyebrow="TEAM MANAGEMENT" title="Groomers" detail={`${groomers.filter((item) => item.isActive === 1).length} available`} /><details className="modernCreatePanel"><summary><span>+</span>Add groomer</summary><form action={createGroomer} className="modernAdminForm"><label>Name<input name="name" required/></label><label>Contact number<input inputMode="tel" name="contactNumber" pattern="(?:\+63|0)9[0-9]{9}" placeholder="09XXXXXXXXX"/></label><div className="modernFormActions"><AdminSubmitButton>Add Groomer</AdminSubmitButton></div></form></details><div className="groomerAdminGrid">{groomers.map((groomer) => <article className="adminTableCard groomerAdminCard" key={groomer.groomerId}><form action={updateGroomer} className="modernAdminForm"><input name="id" type="hidden" value={groomer.groomerId}/><label>Name<input name="name" defaultValue={groomer.groomerName} required/></label><label>Contact<input inputMode="tel" name="contactNumber" defaultValue={groomer.contactNumber || ""}/></label><label className="adminCheckbox"><input name="active" type="checkbox" defaultChecked={groomer.isActive === 1}/> Available for booking</label><div className="modernFormActions"><AdminSubmitButton>Save Groomer</AdminSubmitButton></div></form><div className="groomerSchedules"><h3>Weekly schedule</h3>{groomer.availability.map((slot) => <p key={slot.availabilityId}><b>{["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][slot.dayOfWeek]}</b><span>{slot.startTime.toISOString().slice(11, 16)}-{slot.endTime.toISOString().slice(11, 16)}</span></p>)}<form action={saveGroomerSchedule} className="adminInlineForm"><input name="id" type="hidden" value={groomer.groomerId}/><select name="dayOfWeek" aria-label="Day"><option value="1">Monday</option><option value="2">Tuesday</option><option value="3">Wednesday</option><option value="4">Thursday</option><option value="5">Friday</option><option value="6">Saturday</option><option value="0">Sunday</option></select><input aria-label="Start time" name="startTime" type="time" defaultValue="09:00" required/><input aria-label="End time" name="endTime" type="time" defaultValue="19:00" required/><AdminSubmitButton>Set Day</AdminSubmitButton></form></div></article>)}</div></section>}

    {activeView === "services" && <section className="adminModule"><SectionHeading eyebrow="SERVICE CATALOG" title="Packages and Add-ons" detail={`${packages.length + addons.length} price records`} /><div className="modernManagementColumns"><section className="adminTableCard"><SectionHeading eyebrow="SIZE-BASED" title="Grooming Packages"/><div className="adminTableScroll"><table className="modernAdminTable"><thead><tr><th>Package</th><th>Pet size</th><th>Price</th><th>Action</th></tr></thead><tbody>{packages.map((item) => <tr key={item.pricingId}><td colSpan={4}><form action={updatePackage} className="serviceEditRow"><input type="hidden" name="id" value={item.pricingId}/><label><span>Package</span><input name="name" defaultValue={item.style.styleName}/></label><label><span>Pet size</span><input value={item.petSize} disabled readOnly/></label><label><span>Price</span><input type="number" name="price" step="0.01" min="0" defaultValue={money(item.price)}/></label><AdminSubmitButton>Save</AdminSubmitButton></form></td></tr>)}</tbody></table></div></section><section className="adminTableCard"><SectionHeading eyebrow="OPTIONAL CARE" title="Add-on Services"/><div className="adminAddonList">{addons.map((item) => <form action={updateAddon} className="serviceEditRow addon" key={item.addonId}><input type="hidden" name="id" value={item.addonId}/><label><span>Service name</span><input name="name" defaultValue={item.addonName}/></label><label><span>Price</span><input type="number" name="price" step="0.01" min="0" defaultValue={money(item.price)}/></label><AdminSubmitButton>Save</AdminSubmitButton></form>)}</div></section></div></section>}

    {activeView === "messages" && <section className="adminModule"><MessagesPanel portal="admin" initialConversation={Number(valueOf(query.conversation)) || undefined}/></section>}
    {activeView === "notifications" && <section className="adminModule"><SectionHeading eyebrow="ACTIVITY INBOX" title="Notifications" detail={`${notificationsList.filter((item) => !item.isRead).length} unread`} />{notificationsList.length ? <div className="notificationList">{notificationsList.map((item) => <form action={openNotification} className={`notificationItem ${item.isRead ? "isRead" : ""}`} key={item.notificationId.toString()}><input name="id" type="hidden" value={item.notificationId.toString()}/><span><AdminIcon name="bell"/></span><div><b>{item.title}</b><p>{item.message}</p><small>{date(item.createdAt)} at {time(item.createdAt)} · {item.type.replaceAll("_", " ")}</small></div><button type="submit">Open</button></form>)}</div> : <div className="notificationEmpty notificationEmptyCard"><span><AdminIcon name="bell" size={27}/></span><b>No notifications yet</b><p>Reservation and appointment updates will appear here.</p></div>}</section>}

    {activeView === "reports" && <section className="adminModule"><SectionHeading eyebrow="DATABASE INSIGHTS" title="Reports & Analytics" action={<div className="reportHeadingActions"><span>{date(rangeStart)} to {date(rangeEnd)}</span><ReportPdfButton href={reportPdfHref}/></div>}/><form className="reportFilters" method="get"><input name="view" type="hidden" value="reports"/><select name="range" defaultValue={range}><option value="today">Today</option><option value="week">This week</option><option value="month">This month</option><option value="year">This year</option><option value="custom">Custom range</option></select><input aria-label="From date" name="from" type="date" defaultValue={valueOf(query.from)}/><input aria-label="To date" name="to" type="date" defaultValue={valueOf(query.to)}/><button>Apply</button></form><div className="adminMetricGrid compact"><Metric icon="sales" label="Completed Sales" value={`₱${productReservations.filter((item) => item.status === "Completed").reduce((sum, item) => sum + Number(item.totalAmount), 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`} detail="Completed product reservations" tone="green"/><Metric icon="orders" label="Product Reservations" value={productReservations.length} detail="Selected reporting period"/><Metric icon="calendar" label="Appointments" value={appointments.length} detail={`${appointments.filter((item) => item.status === "Completed").length} completed`}/></div><ActivityTrendChart points={activityTrend}/><div className="reportGrid modernReports"><ReportChart title="Most reserved products" rows={topProducts} maximum={maxProductSales} empty="No product reservations in this period."/><ReportChart title="Completed product sales" rows={topCompletedProducts} maximum={maxProductSales} empty="No completed product reservations in this period."/><ReportChart title="Current stock by product" rows={stockStats} maximum={maxProductSales}/><ReportChart title="Appointment status" rows={appointmentStats} maximum={maxAppointments}/><ReportChart title="Store vs Home Service" rows={serviceTypeStats} maximum={maxAppointments}/><ReportChart title="Most selected grooming styles" rows={styleStats} maximum={maxAppointments}/><ReportChart title="Groomer workload" rows={groomerStats} maximum={maxAppointments} empty="No groomer activity in this period."/></div></section>}

    {activeView === "auditlogs" && <section className="adminModule"><SectionHeading eyebrow="ACCOUNTABILITY" title="Audit Logs" detail={`${auditLogs.length} records`} /><form className="adminFilterBar auditFilters" method="get"><input name="view" type="hidden" value="auditlogs"/><label><AdminIcon name="search"/><input name="q" defaultValue={valueOf(query.q)} placeholder="User, action, or module"/></label><select name="filter" defaultValue={filter || "All"}><option>All</option>{["Authentication", "Customer Profile", "Pet", "Grooming Appointment", "Product Reservation", "Product", "Groomer", "Groomer Schedule", "Loyalty", "Admin Account", "Settings"].map((item) => <option key={item}>{item}</option>)}</select><input aria-label="From date" name="from" type="date" defaultValue={valueOf(query.from)}/><input aria-label="To date" name="to" type="date" defaultValue={valueOf(query.to)}/><button>Apply filters</button></form><div className="adminTableCard"><div className="adminTableScroll"><table className="modernAdminTable"><thead><tr><th>Date & Time</th><th>User / Role</th><th>Action</th><th>Module</th><th>Reference</th><th>Description / IP</th></tr></thead><tbody>{auditLogs.map((item) => <tr key={item.auditLogId.toString()}><td><b>{date(item.createdAt)}</b><small>{time(item.createdAt)}</small></td><td><b>{item.userName}</b><small>{item.role}</small></td><td><StatusBadge status={item.action}/></td><td>{item.module}</td><td>{item.recordId || "-"}</td><td>{item.description}<small>{item.ipAddress || "IP unavailable"}</small></td></tr>)}</tbody></table></div>{!auditLogs.length && <EmptyState title="No matching audit entries" text="Change the filters to broaden the results."/>}</div></section>}

    {activeView === "admins" && <AdminAccounts currentId={currentAdmin.id} search={valueOf(query.q).trim()} role={filter} status={valueOf(query.status).trim()} page={Math.max(1, Number.parseInt(valueOf(query.page), 10) || 1)} />}

    {activeView === "settings" && <section className="adminModule"><SectionHeading eyebrow="SYSTEM" title="Business Settings"/><form action={updateAttendanceSetting} className="modernAdminForm"><label>Attendance grace period (minutes)<input type="number" name="graceMinutes" min={1} max={120} defaultValue={(await prisma.systemSetting.findUnique({where:{key:"grooming_no_show_grace_minutes"}}))?.value || "15"} required/><small>Asia/Manila. Confirmed in-store appointments only.</small></label><AdminSubmitButton>Save Grace Period</AdminSubmitButton></form><div className="adminProfileCard"><strong>Loyalty policy</strong><p>One stamp per completed grooming. Visits 5 and 10 receive 50% off. Visit 6 is regular price. Visit 11 starts lifetime VIP membership with 10% off all services. Progress never resets.</p></div></section>}

    {activeView === "profile" && <section className="adminModule"><SectionHeading eyebrow="ACCOUNT" title="Profile Information"/><div className="adminProfileCard"><div className="adminProfileHero"><span>{adminName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}</span><div><h3>{adminName}</h3><p>{currentAdmin.role === "SuperAdmin" ? "Super Administrator" : "Administrator"}</p></div><StatusBadge status={currentAdmin.accountStatus}/></div><dl><div><dt>Full name</dt><dd>{adminName}</dd></div><div><dt>Email address</dt><dd>{currentAdmin.email}</dd></div><div><dt>Username</dt><dd>{currentAdmin.username || "Not configured"}</dd></div><div><dt>Phone number</dt><dd>{currentAdmin.phoneNumber || "Not provided"}</dd></div><div><dt>Role</dt><dd>{currentAdmin.role}</dd></div><div><dt>Account created</dt><dd>{date(currentAdmin.createdAt)}</dd></div></dl><p className="adminPermissionNote">Profile details are shown securely from the authenticated database account. Passwords are never displayed.</p><ChangePasswordForm/></div></section>}
  </AdminShell>;
}

function Metric({ icon, label, value, detail, tone = "blue" }: { icon: "products" | "customers" | "orders" | "calendar" | "warning" | "sales" | "package" | "services" | "admins" | "bell"; label: string; value: string | number; detail: string; tone?: string }) {
  return <article className={`adminMetric ${tone}`}><span><AdminIcon name={icon}/></span><div><p>{label}</p><strong>{value}</strong><small>{detail}</small></div></article>;
}
function SectionHeading({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail?: string; action?: React.ReactNode }) {
  return <header className="modernSectionHeading"><div><small>{eyebrow}</small><h2>{title}</h2></div>{action || (detail && <span>{detail}</span>)}</header>;
}
function StatusBadge({ status, tone }: { status: string; tone?: "success" | "warning" | "danger" | "info" }) { return <span className={`modernStatus ${tone || statusTone(status)}`}>{status}</span>; }
function EmptyState({ title, text, action, href }: { title: string; text: string; action?: string; href?: string }) { return <div className="modernEmptyState"><span><AdminIcon name="package" size={25}/></span><b>{title}</b><p>{text}</p>{action && href && <Link href={href}>{action}</Link>}</div>; }
function FilterBar({ view, search, filter, options, placeholder }: { view: string; search: string; filter: string; options: string[]; placeholder: string }) {
  return <form className="adminFilterBar" method="get"><input name="view" type="hidden" value={view}/><label><AdminIcon name="search"/><input aria-label={placeholder} defaultValue={search} name="q" placeholder={placeholder}/></label><select aria-label="Filter records" defaultValue={filter || "All"} name="filter">{options.map((option) => <option key={option}>{option}</option>)}</select><button type="submit">Apply filters</button>{(search || (filter && filter !== "All")) && <Link href={`/admin/dashboard?view=${view}`}>Clear</Link>}</form>;
}
function Pagination({ view, search, filter, page, pages }: { view: string; search: string; filter: string; page: number; pages: number }) {
  if (pages <= 1) return null;
  const href = (target: number) => {
    const params = new URLSearchParams({ view, page: String(target) });
    if (search) params.set("q", search);
    if (filter && filter !== "All") params.set("filter", filter);
    return `/admin/dashboard?${params.toString()}`;
  };
  return <nav aria-label="Records pagination" className="adminPagination"><Link aria-disabled={page === 1} className={page === 1 ? "disabled" : ""} href={href(Math.max(1, page - 1))}>Previous</Link><span>Page {page} of {pages}</span><Link aria-disabled={page === pages} className={page === pages ? "disabled" : ""} href={href(Math.min(pages, page + 1))}>Next</Link></nav>;
}
function StockHealthChart({ rows }: { rows: readonly (readonly [string, number, "green" | "amber" | "red"])[] }) {
  const colors = { green: "#2fa46f", amber: "#e0a22e", red: "#df5262" } as const;
  const total = rows.reduce((sum, [, count]) => sum + count, 0);
  let cursor = 0;
  const stops = rows.map(([, count, tone]) => {
    const start = cursor;
    cursor += total ? (count / total) * 100 : 0;
    return `${colors[tone]} ${start}% ${cursor}%`;
  });
  return <article className="reportCard stockHealthCard"><h3>Active product stock health</h3><div className="stockHealthVisual"><div aria-label={`${total} active products by stock health`} className="stockHealthDonut" role="img" style={{ background: total ? `conic-gradient(${stops.join(",")})` : "#edf0f4" }}><span><b>{total}</b><small>products</small></span></div><div className="stockHealthLegend">{rows.map(([label, count, tone]) => <div key={label}><i className={tone}/><span>{label}</span><b>{count}</b><small>{total ? Math.round((count / total) * 100) : 0}%</small></div>)}</div></div></article>;
}
function ActivityTrendChart({ points }: { points: readonly { label: string; orders: number; appointments: number }[] }) {
  const width = 760, height = 250, left = 42, right = 18, top = 22, bottom = 42;
  const chartWidth = width - left - right, chartHeight = height - top - bottom;
  const maximum = Math.max(1, ...points.flatMap((point) => [point.orders, point.appointments]));
  const x = (index: number) => left + (points.length <= 1 ? chartWidth / 2 : (index / (points.length - 1)) * chartWidth);
  const y = (value: number) => top + chartHeight - (value / maximum) * chartHeight;
  const orderLine = points.map((point, index) => `${x(index)},${y(point.orders)}`).join(" ");
  const appointmentLine = points.map((point, index) => `${x(index)},${y(point.appointments)}`).join(" ");
  const labelStep = Math.max(1, Math.ceil(points.length / 7));
  return <article className="activityTrendCard"><header><div><small>ACTIVITY TREND</small><h3>Reservations over time</h3><p>Product reservations and grooming appointments in the selected period.</p></div><div className="trendLegend"><span><i className="orders"/>Product reservations</span><span><i className="appointments"/>Appointments</span></div></header>{points.length ? <svg aria-label="Reservation activity line graph" role="img" viewBox={`0 0 ${width} ${height}`}><title>Reservation activity over time</title>{[0, .25, .5, .75, 1].map((ratio) => <g key={ratio}><line className="trendGridLine" x1={left} x2={width - right} y1={top + chartHeight * ratio} y2={top + chartHeight * ratio}/><text className="trendYAxis" x={left - 9} y={top + chartHeight * ratio + 3}>{Math.round(maximum * (1 - ratio))}</text></g>)}<polyline className="trendLine orders" fill="none" points={orderLine}/><polyline className="trendLine appointments" fill="none" points={appointmentLine}/>{points.map((point, index) => <g key={`${point.label}-${index}`}><circle className="trendPoint orders" cx={x(index)} cy={y(point.orders)} r="3.5"/><circle className="trendPoint appointments" cx={x(index)} cy={y(point.appointments)} r="3.5"/>{(index % labelStep === 0 || index === points.length - 1) && <text className="trendXAxis" textAnchor="middle" x={x(index)} y={height - 12}>{point.label}</text>}</g>)}</svg> : <p className="chartEmpty">No activity in this reporting period.</p>}</article>;
}
function ReportChart({ title, rows, maximum, empty = "No report data yet." }: { title: string; rows: readonly (readonly [string, number])[]; maximum: number; empty?: string }) {
  return <article className="reportCard"><h3>{title}</h3>{rows.length ? <div className="reportBars">{rows.map(([label, count]) => <div key={label}><header><span>{label}</span><b>{count}</b></header><i><em style={{ width: `${Math.max(count ? 6 : 0, (count / maximum) * 100)}%` }}/></i></div>)}</div> : <p>{empty}</p>}</article>;
}
