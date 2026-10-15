"use client";

import { useCallback, useEffect, useState } from "react";
import AdminIcon from "@/components/AdminIcon";
import { notificationTime, notificationUpdatedEvent, type ClientNotification } from "@/components/ClientNotificationMenu";

export default function ClientNotificationCenter() {
  const [items, setItems] = useState<ClientNotification[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/client/notifications?take=100", { cache: "no-store" });
      const result = await response.json() as { count?: number; notifications?: ClientNotification[]; error?: string };
      if (!response.ok) throw new Error(result.error);
      setItems(result.notifications || []);
      setCount(result.count || 0);
      setError("");
    } catch {
      setError("Notifications are temporarily unavailable. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const refresh = () => void load();
    window.addEventListener(notificationUpdatedEvent, refresh);
    return () => window.removeEventListener(notificationUpdatedEvent, refresh);
  }, [load]);

  async function mark(id?: string) {
    try {
      const response = await fetch("/api/client/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(id ? { id } : { all: true }) });
      const result = await response.json() as { count?: number; link?: string; error?: string };
      if (!response.ok) throw new Error(result.error);
      setCount(result.count || 0);
      setItems((current) => current.map((item) => !id || item.id === id ? { ...item, isRead: true } : item));
      window.dispatchEvent(new Event(notificationUpdatedEvent));
      if (id && result.link) window.location.assign(result.link);
    } catch {
      setError("The notification could not be updated. Please try again.");
    }
  }

  if (loading) return <div className="clientNotificationState">Loading notifications...</div>;
  return <div className="clientNotificationCenter">
    <div className="clientNotificationCenterToolbar"><span><b>{items.length}</b> notifications - <b>{count}</b> unread</span>{count > 0 && <button onClick={() => void mark()} type="button">Mark all as read</button>}</div>
    {error && <p className="clientNotificationPageError" role="alert">{error} <button type="button" onClick={() => void load()}>Retry notifications</button></p>}
    {items.length ? <div className="clientNotificationList">{items.map((item) => <article className={item.isRead ? "isRead" : "isUnread"} key={item.id}><span className="clientNotificationType" aria-hidden="true"><AdminIcon name={item.type.includes("MESSAGE") ? "message" : item.type.includes("GROOMING") ? "scissors" : item.type.includes("RESERVATION") ? "calendarCheck" : "bell"} size={20}/></span><div><div className="clientNotificationTitle"><strong>{item.title}</strong>{!item.isRead && <em>New</em>}</div><p>{item.message}</p><small>{notificationTime(item.createdAt)} - {item.type.replaceAll("_", " ").toLowerCase()}</small></div><button onClick={() => void mark(item.id)} type="button">{item.isRead ? "Open" : "Mark as read"}</button></article>)}</div> : !error && <div className="notificationEmpty notificationEmptyCard"><span><AdminIcon name="bell" size={27}/></span><b>No notifications yet</b><p>Reservation and appointment updates will appear here.</p></div>}
  </div>;
}
