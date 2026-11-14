"use client";

// Replaces the whole page when the root layout itself fails, so it carries its own document and
// styles (the app's stylesheet and fonts may be what failed). Brand colours are written out here.
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", background: "#FFF8EC", color: "#14231E", fontFamily: "system-ui, sans-serif" }}>
        <title>Something went wrong | Coupersville</title>
        <div style={{ background: "#FFF8EC", borderBottom: "1px solid #E7DFCF" }}>
          <div style={{ maxWidth: "28rem", margin: "0 auto", padding: "1rem" }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- the image pipeline may be what failed */}
            <img src="/brand/coupersville-logo-horizontal.svg" alt="Coupersville" width={175} height={40} style={{ display: "block" }} />
          </div>
        </div>
        <main style={{ maxWidth: "28rem", margin: "0 auto", padding: "3rem 1rem" }}>
          <div style={{ background: "#FDF1D6", borderRadius: 22, padding: "1.5rem", boxShadow: "0 6px 18px -6px rgba(20,35,30,.14)" }}>
            <h1 style={{ margin: 0, fontSize: "2rem", lineHeight: 1.1, color: "#14231E", fontFamily: "Georgia, serif", fontWeight: 600 }}>
              Something went wrong
            </h1>
            <p style={{ margin: "0.75rem 0 0", lineHeight: 1.5 }}>Something did not go as planned. Please try again. If the problem continues, contact Coupersville support.</p>
            {error.digest && <p style={{ margin: "0.5rem 0 0", fontSize: 14, color: "#56605B" }}>Reference: {error.digest}</p>}
          </div>
          <button
            type="button"
            onClick={() => retry()}
            style={{ marginTop: "1.5rem", minHeight: 44, padding: "0 1.25rem", borderRadius: 999, border: "2px solid #1F4D3F", background: "#1F4D3F", color: "#FFFFFF", font: "inherit", fontWeight: 600, cursor: "pointer" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
