import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import AdminAccounts from "@/components/AdminAccounts";
import AdminIcon from "@/components/AdminIcon";
import Brand from "@/components/Brand";
import ThemeToggle from "@/components/ThemeToggle";
import { prisma } from "@/lib/prisma";
import { readSessionToken, sessionCookieName } from "@/lib/session";

const valueOf = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] || "" : value || "";
const dateTime = (value: Date) => new Intl.DateTimeFormat("en-PH", { month: "short", day: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" }).format(value);

export default async function SuperAdminDashboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const session = await readSessionToken((await cookies()).get(sessionCookieName)?.value);
  if (session?.role !== "SuperAdmin") redirect("/superadmin/login");

  const currentAdmin = await prisma.user.findFirst({
    where: { id: session.userId, role: "SuperAdmin", accountStatus: "Active" },
    select: { id: true, firstName: true, surname: true, email: true },
  });
  if (!currentAdmin) redirect("/superadmin/login");

  const [totalAccounts, activeAdmins, suspendedAccounts, auditLogs] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: { in: ["Admin", "SuperAdmin"] }, accountStatus: "Active" } }),
    prisma.user.count({ where: { accountStatus: "Suspended" } }),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
  ]);
  const adminName = [currentAdmin.firstName, currentAdmin.surname].filter(Boolean).join(" ") || "Super Administrator";
  const notice = valueOf(query.notice);
  const error = valueOf(query.error);
  const page = Math.max(1, Number.parseInt(valueOf(query.page), 10) || 1);

  return <main className="superAdminWorkspace">
    <header className="superAdminTopbar">
      <Brand />
      <div><ThemeToggle /><Link className="superAdminOperationsLink" href="/admin/dashboard"><AdminIcon name="dashboard" size={16}/>Shop Operations</Link><form action="/api/auth/logout" method="post"><input name="destination" type="hidden" value="superadmin"/><button type="submit"><AdminIcon name="logout" size={16}/>Logout</button></form></div>
    </header>
    <div className="superAdminContent">
      <section className="superAdminHero"><div><small>SECURE CONTROL CENTER</small><h1>Welcome, {currentAdmin.firstName || "Super Admin"}.</h1><p>Manage system access, administrator roles, and recent security activity.</p></div><span><AdminIcon name="admins" size={26}/><b>{adminName}</b><small>{currentAdmin.email}</small></span></section>

      {notice && <div className="adminToast success" role="status"><span>✓</span>{notice}</div>}
      {error && <div className="adminToast error" role="alert">{error === "email-exists" ? "An account with that email already exists." : error === "invalid-update" ? "The account change could not be saved." : "Check the account details and confirm that both passwords match."}</div>}

      <section className="superAdminMetricGrid">
        <article><span><AdminIcon name="customers"/></span><div><small>Total accounts</small><strong>{totalAccounts}</strong><p>All registered system users</p></div></article>
        <article><span><AdminIcon name="admins"/></span><div><small>Active administrators</small><strong>{activeAdmins}</strong><p>Admin and Super Admin access</p></div></article>
        <article className={suspendedAccounts ? "warning" : ""}><span><AdminIcon name="warning"/></span><div><small>Suspended accounts</small><strong>{suspendedAccounts}</strong><p>Accounts without system access</p></div></article>
      </section>

      <AdminAccounts basePath="/superadmin/dashboard" currentId={currentAdmin.id} page={page} role={valueOf(query.filter)} search={valueOf(query.q).trim()} status={valueOf(query.status)} />

      <section className="superAdminAudit adminPanel">
        <header className="modernSectionHeading"><div><small>SECURITY MONITORING</small><h2>Recent activity</h2></div><Link href="/admin/dashboard?view=auditlogs">View full audit log</Link></header>
        {auditLogs.length ? <div className="adminTableScroll"><table className="modernAdminTable"><thead><tr><th>User</th><th>Action</th><th>Module</th><th>Description</th><th>Date</th></tr></thead><tbody>{auditLogs.map((log) => <tr key={log.auditLogId.toString()}><td><b>{log.userName}</b><small>{log.role}</small></td><td><span className="modernStatus info">{log.action}</span></td><td>{log.module}</td><td>{log.description}</td><td>{dateTime(log.createdAt)}</td></tr>)}</tbody></table></div> : <div className="modernEmptyState"><b>No audit activity yet</b><p>Important account and administration actions will appear here.</p></div>}
      </section>
    </div>
  </main>;
}
