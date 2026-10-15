"use client";

import { useState } from "react";

export default function ReportPdfButton({ href }: { href: string }) {
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");

  async function download() {
    setState("loading");
    setMessage("");
    try {
      const response = await fetch(href, { credentials: "same-origin" });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error || "The PDF report could not be generated.");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || "business_report.pdf";
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      setState("idle");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The PDF report could not be generated.");
      setState("error");
    }
  }

  return <div className="reportDownloadWrap">
    <button className="reportDownloadButton" disabled={state === "loading"} onClick={download} type="button">
      <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 24 24" width="16"><path d="M12 3v12m0 0 5-5m-5 5-5-5M5 19h14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/></svg>
      {state === "loading" ? "Preparing PDF…" : "Download PDF"}
    </button>
    {state === "error" && <span className="reportDownloadError" role="alert">{message}</span>}
  </div>;
}
