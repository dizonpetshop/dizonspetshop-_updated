"use client";

import { useEffect } from "react";

export default function ClientDashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Client dashboard render failed", error);
  }, [error]);

  return (
    <main className="portalError">
      <section>
        <small>CLIENT PORTAL</small>
        <h1>We couldn&apos;t load your dashboard.</h1>
        <p>Please retry the request. If the problem continues, sign out and sign in again.</p>
        <div>
          <button type="button" onClick={reset}>Try again</button>
          <form action="/api/auth/logout" method="post"><button type="submit">Sign out</button></form>
        </div>
        {error.digest && <code>Reference: {error.digest}</code>}
      </section>
    </main>
  );
}
