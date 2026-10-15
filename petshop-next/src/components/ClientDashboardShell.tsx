"use client";

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Brand from "@/components/Brand";
import ThemeToggle from "@/components/ThemeToggle";
import ClientNotificationMenu from "@/components/ClientNotificationMenu";
import AdminIcon from "@/components/AdminIcon";
import MessageBadge from "@/components/MessageBadge";
import { dashboardViews, type DashboardView } from "@/lib/dashboard-views";

const navigation: { view: DashboardView; icon: "dashboard" | "paw" | "scissors" | "package" | "calendarCheck" | "user" | "message" | "bell" | "star"; label: string }[] = [
  { view: "dashboard", icon: "dashboard", label: "Dashboard" },
  { view: "pets", icon: "paw", label: "My Pets" },
  { view: "grooming", icon: "scissors", label: "Grooming" },
  { view: "products", icon: "package", label: "Products" },
  { view: "reservations", icon: "calendarCheck", label: "Reservations" },
  { view: "messages", icon: "message", label: "Messages" },
  { view: "reviews", icon: "star", label: "Reviews" },
  { view: "notifications", icon: "bell", label: "Notifications" },
  { view: "account", icon: "user", label: "My Account" },
];

function viewFromUrl(): DashboardView {
  const requested = new URLSearchParams(window.location.search).get("view");
  return dashboardViews.includes(requested as DashboardView) ? (requested as DashboardView) : "dashboard";
}

export default function ClientDashboardShell({
  initialView,
  children,
}: {
  initialView: DashboardView;
  children: ReactNode;
}) {
  const [view, setView] = useState<DashboardView>(initialView);
  const router = useRouter();
  const sidebar = useRef<HTMLDialogElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [menuOpen]);

  function closeMenu() {
    sidebar.current?.close();
    setMenuOpen(false);
    menuButton.current?.focus();
  }

  useEffect(() => {
    setView(initialView);
  }, [initialView]);

  useEffect(() => {
    const syncWithHistory = () => setView(viewFromUrl());
    window.addEventListener("popstate", syncWithHistory);
    return () => window.removeEventListener("popstate", syncWithHistory);
  }, []);

  function openView(nextView: DashboardView) {
    if (sidebar.current?.open) closeMenu();
    if (nextView === "products") window.dispatchEvent(new Event("client-products-open"));
    if (nextView === view) { if (nextView === "products") router.refresh(); return; }
    const url = new URL(window.location.href);
    if (nextView === "dashboard") url.searchParams.delete("view");
    else url.searchParams.set("view", nextView);
    window.history.pushState(null, "", url);
    setView(nextView);
    router.refresh();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handlePanelLink(event: MouseEvent<HTMLDivElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = (event.target as HTMLElement).closest<HTMLElement>("[data-dashboard-view]");
    if (!link) return;
    const nextView = link.dataset.dashboardView as DashboardView;
    if (!dashboardViews.includes(nextView)) return;
    event.preventDefault();
    openView(nextView);
  }

  return (
    <main className="dashShell clientOverlayShell">
      <dialog ref={sidebar} id="client-sidebar" className="clientSidebarDialog" aria-label="Customer navigation" onClose={() => { setMenuOpen(false); menuButton.current?.focus(); }} onClick={(event) => {
        if (event.target === event.currentTarget) {
          const bounds = event.currentTarget.getBoundingClientRect();
          if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeMenu();
        }
      }}>
      <aside className="dashSidebar">
        <div className="clientSidebarHeading"><Brand /><button type="button" onClick={closeMenu} aria-label="Close navigation">×</button></div>
        <nav className="dashNav" aria-label="Client portal">
          {navigation.map((item) => (
            <a
              aria-current={view === item.view ? "page" : undefined}
              className={view === item.view ? "active" : undefined}
              href={item.view === "dashboard" ? "/client/dashboard" : `/client/dashboard?view=${item.view}`}
              key={item.view}
              onClick={(event) => {
                if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                openView(item.view);
              }}
            >
              <AdminIcon name={item.icon} size={19}/>
              <span className="dashNavLabel">{item.label}</span>
              {item.view === "messages" && <MessageBadge portal="client"/>}
              {item.view === "notifications" && <MessageBadge portal="client" kind="notifications"/>}
            </a>
          ))}
        </nav>
      </aside>
      </dialog>

      <section className="dashContent">
        <header className="dashTop">
          <div className="clientMenuHeading"><button ref={menuButton} type="button" className="clientMenuButton" aria-label="Open navigation" aria-controls="client-sidebar" aria-expanded={menuOpen} onClick={() => { sidebar.current?.showModal(); setMenuOpen(true); }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button><small>CUSTOMER PORTAL</small></div>
          <div className="clientTopActions"><ClientNotificationMenu initialCount={0}/><ThemeToggle/><form action="/api/auth/logout" method="post"><button className="logoutButton">Logout</button></form></div>
        </header>
        <div className="dashboardPanels" data-active-view={view} onClick={handlePanelLink}>
          {children}
        </div>
      </section>
    </main>
  );
}
