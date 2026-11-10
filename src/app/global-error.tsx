"use client";

// Replaces the whole page when the root layout itself fails, so it carries its own document and
// styles (the app's stylesheet and fonts may be what failed).
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", background: "#F2F4F8", color: "#121A4D", fontFamily: "system-ui, sans-serif" }}>
        <title>Something went wrong | Coupersville</title>
        <div style={{ background: "#FFFFFF", borderBottom: "1.5px solid #1B2A8F" }}>
          <p style={{ maxWidth: "28rem", margin: "0 auto", padding: "1.1rem 1rem", fontWeight: 800, fontSize: "1.5rem", color: "#1B2A8F" }}>
            Coupersville
          </p>
        </div>
        <main style={{ maxWidth: "28rem", margin: "0 auto", padding: "3rem 1rem" }}>
          <div style={{ background: "#FBEBB0", border: "1.5px solid #1B2A8F", borderRadius: 6, padding: "1.25rem" }}>
            <h1 style={{ margin: 0, fontSize: "2rem", lineHeight: 1.1, color: "#1B2A8F" }}>Something went wrong</h1>
            <p style={{ margin: "0.75rem 0 0", lineHeight: 1.5 }}>Something did not go as planned. Please try again. If the problem continues, contact Coupersville support.</p>
            {error.digest && <p style={{ margin: "0.5rem 0 0", fontSize: 14 }}>Reference: {error.digest}</p>}
          </div>
          <button
            type="button"
            onClick={() => retry()}
            style={{ marginTop: "1.5rem", minHeight: 44, padding: "0 1.25rem", borderRadius: 4, border: "1.5px solid #1B2A8F", background: "#1B2A8F", color: "#FFFFFF", font: "inherit", fontWeight: 600, cursor: "pointer" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
