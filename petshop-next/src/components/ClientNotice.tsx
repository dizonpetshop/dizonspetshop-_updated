"use client";

import { useEffect, useState } from "react";

export default function ClientNotice({ message, error }: { message: string; error: boolean }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    setVisible(true);
    if (error || !["Login successful. Welcome back!", "Pet profile added.", "Pet profile added successfully.", "Appointment saved, but the confirmation email could not be sent."].includes(message)) return;
    const timer = window.setTimeout(() => {
      setVisible(false);
      const url = new URL(window.location.href);
      if (url.searchParams.get("notice") === message) {
        url.searchParams.delete("notice");
        url.searchParams.delete("noticeKind");
        window.history.replaceState(window.history.state, "", url);
      }
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [message, error]);
  if (!visible) return null;
  return <div className={`portalNotice ${error ? "error" : ""}`} role={error ? "alert" : "status"}>{message}</div>;
}
