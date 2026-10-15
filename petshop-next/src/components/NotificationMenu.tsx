"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import AdminIcon from "@/components/AdminIcon";

export type ClientNotification = { id: string; title: string; message: string; type: string; link: string; isRead: boolean; createdAt: string };
export const notificationUpdatedEvent = "client-notifications-updated";

export function notificationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  const elapsed = date.getTime() - Date.now();
  const absolute = Math.abs(elapsed);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (absolute < 60_000) return "Just now";
  if (absolute < 3_600_000) return formatter.format(Math.round(elapsed / 60_000), "minute");
  if (absolute < 86_400_000) return formatter.format(Math.round(elapsed / 3_600_000), "hour");
  if (absolute < 604_800_000) return formatter.format(Math.round(elapsed / 86_400_000), "day");
  return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" }).format(date);
}

function notificationIcon(item: ClientNotification) {
  const context = `${item.type} ${item.title}`.toUpperCase();
  if (context.includes("MESSAGE") || context.includes("SUPPORT REPLY")) return "message" as const;
  if (context.includes("CANCEL")) return "close" as const;
  if (/STOCK|INVENTORY|WARNING/.test(context)) return "warning" as const;
  if (/PRODUCT|ORDER/.test(context)) return "package" as const;
  if (/GROOM|APPOINTMENT/.test(context)) return "calendar" as const;
  if (/LOYALTY|REWARD/.test(context)) return "sales" as const;
  return "bell" as const;
}

export default function NotificationMenu({ initialCount = 0, portal = "client", onOpen }: { initialCount?: number; portal?: "client" | "admin"; onOpen?: () => void }) {
  const router = useRouter();
  const id = useId();
  const endpoint = `/api/${portal}/notifications`;
  const center = `/${portal}/dashboard?view=notifications`;
  const [count, setCount] = useState(initialCount);
  const [items, setItems] = useState<ClientNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"all" | "unread">("all");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const requestVersion = useRef(0);
  const mutating = useRef(false);

  const load = useCallback(async () => {
    if (mutating.current) return;
    const version = ++requestVersion.current;
    try {
      const response = await fetch(`${endpoint}?take=30${tab === "unread" ? "&unread=1" : ""}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const result = await response.json() as { count: number; notifications: ClientNotification[] };
      if (version !== requestVersion.current) return;
      setCount(result.count); setItems(result.notifications); setError("");
    } catch {
      if (version === requestVersion.current) setError("Notifications are temporarily unavailable. Please try again.");
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [endpoint, tab]);

  useEffect(() => {
    setLoading(true); void load();
    const refresh = () => void load();
    const interval = window.setInterval(refresh, 20_000);
    window.addEventListener("focus", refresh);
    window.addEventListener(notificationUpdatedEvent, refresh);
    return () => { requestVersion.current++; window.clearInterval(interval); window.removeEventListener("focus", refresh); window.removeEventListener(notificationUpdatedEvent, refresh); };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const positionPanel = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(400, window.innerWidth - 32);
      setPosition({ top: Math.min(rect.bottom + 12, Math.max(16, window.innerHeight - 240)), left: Math.max(16, Math.min(rect.right - width, window.innerWidth - width - 16)) });
    };
    const outside = (event: Event) => {
      if (!panelRef.current?.contains(event.target as Node) && !buttonRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); buttonRef.current?.focus(); }
    };
    positionPanel();
    const frame = requestAnimationFrame(() => panelRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus());
    document.addEventListener("pointerdown", outside); document.addEventListener("focusin", outside); document.addEventListener("keydown", keyboard);
    window.addEventListener("resize", positionPanel); window.addEventListener("scroll", positionPanel, true);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("pointerdown", outside); document.removeEventListener("focusin", outside); document.removeEventListener("keydown", keyboard); window.removeEventListener("resize", positionPanel); window.removeEventListener("scroll", positionPanel, true); };
  }, [open]);

  async function mark(item?: ClientNotification) {
    if (mutating.current) return;
    mutating.current = true; requestVersion.current++;
    setPending(item?.id || "all"); setError("");
    let updated = false;
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item ? { id: item.id } : { all: true }) });
      if (!response.ok) throw new Error();
      const result = await response.json() as { count: number; link?: string };
      updated = true;
      setCount(result.count);
      setItems(current => current.map(entry => !item || entry.id === item.id ? { ...entry, isRead: true } : entry));
      if (item) {
        setOpen(false);
        router.push(result.link || center); router.refresh();
      } else router.refresh();
    } catch { setError("This notification could not be updated. Please try again."); }
    finally {
      mutating.current = false; setPending(null); setLoading(false);
      if (updated) window.dispatchEvent(new Event(notificationUpdatedEvent));
    }
  }

  function toggle() {
    if (!open) { onOpen?.(); void load(); }
    setOpen(value => !value);
  }
  const visible = tab === "unread" ? items.filter(item => !item.isRead) : items;
  return <div className="notificationMenu">
    <button ref={buttonRef} className="notificationBell" type="button" aria-label={`Notifications, ${count} unread`} aria-expanded={open} aria-haspopup="dialog" aria-controls={open ? id : undefined} onClick={toggle} onKeyDown={event => { if (event.key === "ArrowDown" && !open) { event.preventDefault(); toggle(); } }}>
      <AdminIcon name="bell" size={21}/>{count > 0 && <span className="notificationBadge" aria-hidden="true">{count > 99 ? "99+" : count}</span>}
    </button>
    {open && createPortal(<section id={id} ref={panelRef} role="dialog" aria-label="Notifications" className="notificationDropdown" style={{ top: position.top, left: position.left, maxHeight: `calc(100dvh - ${position.top + 16}px)` }}>
      <header className="notificationHeader"><div><h2>Notifications</h2><span>{count ? `${count} unread notification${count === 1 ? "" : "s"}` : "You're all caught up"}</span></div><button className="notificationMarkAll" type="button" disabled={count === 0 || !!pending} onClick={() => void mark()}>{pending === "all" ? "Updating…" : "Mark all as read"}</button></header>
      <div className="notificationTabs" role="tablist" aria-label="Filter notifications">{(["all", "unread"] as const).map(value => <button key={value} id={`${id}-${value}`} role="tab" type="button" aria-selected={tab === value} aria-controls={`${id}-list`} tabIndex={tab === value ? 0 : -1} disabled={!!pending} onClick={() => { if (tab !== value) { setLoading(true); setTab(value); } }} onKeyDown={event => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) { event.preventDefault(); const next = event.key === "Home" ? "all" : event.key === "End" ? "unread" : value === "all" ? "unread" : "all"; if (tab !== next) { setLoading(true); setTab(next); } document.getElementById(`${id}-${next}`)?.focus(); } }}>{value === "all" ? "All" : "Unread"}{value === "unread" && count > 0 && <span>{count > 99 ? "99+" : count}</span>}</button>)}</div>
      {error && <div className="notificationError" role="alert">{error}<button type="button" onClick={() => { setLoading(true); void load(); }}>Retry</button></div>}
      <div id={`${id}-list`} className="notificationPreview" role="tabpanel" aria-labelledby={`${id}-${tab}`} aria-busy={loading}>
        {loading ? <div className="notificationEmpty" role="status"><span><AdminIcon name="clock" size={25}/></span><b>Loading your updates</b><p>One moment, please.</p></div> : visible.length ? visible.map(item => <button key={item.id} className={`notificationRow ${item.isRead ? "isRead" : "isUnread"}`} type="button" disabled={!!pending} onClick={() => void mark(item)}>
          <span className={`notificationType ${notificationIcon(item)}`}><AdminIcon name={notificationIcon(item)} size={20}/></span><span className="notificationCopy"><strong>{item.title}</strong><span className="notificationDescription">{item.message}</span><time dateTime={item.createdAt} title={new Date(item.createdAt).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}>{notificationTime(item.createdAt)}</time><span className="notificationSrOnly">{item.isRead ? "Read" : "Unread"}</span></span>{!item.isRead && <span className="notificationUnreadDot" aria-hidden="true"/>}
        </button>) : !error && <div className="notificationEmpty"><span><AdminIcon name="bell" size={27}/></span><b>{tab === "unread" ? "You're all caught up" : "No notifications yet"}</b><p>{tab === "unread" ? "You've read all your updates. We'll let you know when there's something new." : "Reservation and appointment updates will appear here."}</p></div>}
      </div>
      <a className="notificationFooter" href={center} onClick={event => { if (!event.ctrlKey && !event.metaKey && !event.shiftKey && event.button === 0) { event.preventDefault(); setOpen(false); router.push(center); router.refresh(); } }}>View all notifications <span aria-hidden="true">→</span></a>
    </section>, document.body)}
  </div>;
}
