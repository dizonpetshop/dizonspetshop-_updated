"use client";

export default function AdminDashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="portalError"><section><small>ADMIN PORTAL</small><h1>That action could not be completed.</h1><p>Your data was not intentionally removed. Please check the information and try again. If the issue continues, return to the dashboard.</p><div><button onClick={reset}>Try again</button><a className="outlineButton" href="/admin/dashboard">Return to dashboard</a></div></section></main>;
}
