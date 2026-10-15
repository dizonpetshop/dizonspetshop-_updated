import Link from "next/link";
import type { Prisma } from "@prisma/client";
import AdminIcon from "@/components/AdminIcon";
import AdminSubmitButton from "@/components/AdminSubmitButton";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import { prisma } from "@/lib/prisma";
import { createManagedAccount, updateManagedAccount } from "@/app/superadmin/actions";

const roles = ["User", "Admin", "SuperAdmin"] as const;
const statuses = ["Active", "Suspended"] as const;
const pageSize = 20;
const date = (value: Date) => new Intl.DateTimeFormat("en-PH", { month: "short", day: "2-digit", year: "numeric", timeZone: "Asia/Manila" }).format(value);

type AccountFilters = { currentId: number; search: string; role: string; status: string; page: number; basePath?: string };

export default async function AdminAccounts({ currentId, search, role, status, page, basePath = "/admin/dashboard" }: AccountFilters) {
  const selectedRole = roles.find((item) => item === role) || "All";
  const selectedStatus = statuses.find((item) => item === status) || "All";
  const where: Prisma.UserWhereInput = {
    ...(selectedRole !== "All" ? { role: selectedRole } : {}),
    ...(selectedStatus !== "All" ? { accountStatus: selectedStatus } : {}),
    ...(search ? { OR: [
      { email: { contains: search } },
      { firstName: { contains: search } },
      { surname: { contains: search } },
      { username: { contains: search } },
    ] } : {}),
  };
  const [total, groups] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.groupBy({ by: ["role", "accountStatus"], _count: { _all: true } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, page), pages);
  const accounts = await prisma.user.findMany({
    where,
    select: { id: true, firstName: true, surname: true, email: true, phoneNumber: true, role: true, accountStatus: true, createdAt: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (currentPage - 1) * pageSize,
    take: pageSize,
  });
  const count = (predicate: (item: (typeof groups)[number]) => boolean) => groups.filter(predicate).reduce((sum, item) => sum + item._count._all, 0);
  const linkForPage = (target: number) => {
    const params = new URLSearchParams({ view: "admins", page: String(target) });
    if (search) params.set("q", search);
    if (selectedRole !== "All") params.set("filter", selectedRole);
    if (selectedStatus !== "All") params.set("status", selectedStatus);
    return `${basePath}?${params.toString()}`;
  };

  return <section className="adminModule accountManagement">
    <header className="modernSectionHeading"><div><small>ADMIN OPERATIONS / ACCESS CONTROL</small><h2>All Accounts</h2></div><span>{total} matching records</span></header>
    <p className="accountIntro">Create accounts, assign roles, and suspend access from one place. Your own Super Admin account is protected here.</p>

    <div className="accountMetricGrid">
      <article><span>Total accounts</span><strong>{count(() => true)}</strong></article>
      <article><span>Active accounts</span><strong>{count((item) => item.accountStatus === "Active")}</strong></article>
      <article><span>Administrators</span><strong>{count((item) => item.role === "Admin")}</strong></article>
      <article><span>Super Admins</span><strong>{count((item) => item.role === "SuperAdmin")}</strong></article>
    </div>

    <details className="modernCreatePanel accountCreatePanel" id="create-account">
      <summary><span>+</span>Create an account</summary>
      <form action={createManagedAccount} className="modernAdminForm accountCreateForm">
        <input name="returnTo" type="hidden" value={basePath} />
        <label>First name<input autoComplete="given-name" maxLength={100} name="firstName" required /></label>
        <label>Surname<input autoComplete="family-name" maxLength={100} name="surname" required /></label>
        <label>Email address<input autoComplete="email" maxLength={150} name="email" type="email" required /></label>
        <label>Phone number <small>Optional; Philippine mobile number</small><input autoComplete="tel" inputMode="tel" name="phone" placeholder="09XXXXXXXXX" /></label>
        <label>Role<select defaultValue="User" name="role"><option>User</option><option>Admin</option><option>SuperAdmin</option></select></label>
        <label>Initial password<input autoComplete="new-password" minLength={8} name="password" type="password" required /></label>
        <label>Confirm password<input autoComplete="new-password" minLength={8} name="confirmPassword" type="password" required /></label>
        <p className="accountFormHint">Share the password privately with the account owner.</p>
        <div className="modernFormActions"><AdminSubmitButton pendingText="Creating account...">Create Account</AdminSubmitButton></div>
      </form>
    </details>

    <form className="adminFilterBar accountFilters" method="get">
      <input name="view" type="hidden" value="admins" />
      <label><AdminIcon name="search" /><input aria-label="Search accounts" defaultValue={search} name="q" placeholder="Search name or email" /></label>
      <select aria-label="Filter by role" defaultValue={selectedRole} name="filter"><option>All</option>{roles.map((item) => <option key={item}>{item}</option>)}</select>
      <select aria-label="Filter by status" defaultValue={selectedStatus} name="status"><option>All</option>{statuses.map((item) => <option key={item}>{item}</option>)}</select>
      <button type="submit">Apply filters</button>
      {(search || selectedRole !== "All" || selectedStatus !== "All") && <Link href={basePath === "/superadmin/dashboard" ? basePath : `${basePath}?view=admins`}>Clear</Link>}
    </form>

    <div className="adminTableCard">
      <div className="adminTableScroll"><table className="modernAdminTable accountTable">
        <thead><tr><th>Account</th><th>Contact</th><th>Created</th><th>Role</th><th>Status</th><th>Manage access</th></tr></thead>
        <tbody>{accounts.map((account) => <tr key={account.id}>
          <td><b>{[account.firstName, account.surname].filter(Boolean).join(" ") || "Unnamed account"}</b><small>{account.id === currentId ? "Your account" : `ID ${account.id}`}</small></td>
          <td><b>{account.email}</b><small>{account.phoneNumber || "No phone number"}</small></td>
          <td>{date(account.createdAt)}</td>
          <td><span className="modernStatus info">{account.role}</span></td>
          <td><span className={`modernStatus ${account.accountStatus === "Active" ? "success" : "danger"}`}>{account.accountStatus}</span></td>
          <td>{account.id === currentId ? <span className="accountProtected">Protected account</span> : <form action={updateManagedAccount} className="accountAccessForm">
            <input name="id" type="hidden" value={account.id} />
            <input name="returnTo" type="hidden" value={basePath} />
            <select aria-label={`Role for ${account.email}`} defaultValue={account.role} name="role">{roles.map((item) => <option key={item}>{item}</option>)}</select>
            <select aria-label={`Access for ${account.email}`} defaultValue={account.accountStatus} name="status">{statuses.map((item) => <option key={item}>{item}</option>)}</select>
            <ConfirmSubmitButton confirmMessage={`Save role and access changes for ${account.email}?`}>Save</ConfirmSubmitButton>
          </form>}</td>
        </tr>)}</tbody>
      </table></div>
      {!accounts.length && <div className="modernEmptyState"><b>No accounts found</b><p>Try a different search, role, or status.</p></div>}
      {pages > 1 && <nav aria-label="Account pages" className="adminPagination">
        <Link aria-disabled={currentPage === 1} className={currentPage === 1 ? "disabled" : ""} href={linkForPage(Math.max(1, currentPage - 1))}>Previous</Link>
        <span>Page {currentPage} of {pages}</span>
        <Link aria-disabled={currentPage === pages} className={currentPage === pages ? "disabled" : ""} href={linkForPage(Math.min(pages, currentPage + 1))}>Next</Link>
      </nav>}
    </div>
  </section>;
}
