"use client";

import { Navigation } from "lucide-react";

// Opens the store address in the visitor's maps app. Nothing is loaded from a maps service until
// the link is tapped: Apple devices open Apple Maps, everything else Google Maps (which hands over
// to the Google Maps app where it is installed).
export function DirectionsLink({ address, label = "Get directions", variant = "link" }: { address: string; label?: string; variant?: "link" | "button" }) {
  const query = encodeURIComponent(address);
  const google = `https://www.google.com/maps/dir/?api=1&destination=${query}`;
  const apple = `https://maps.apple.com/?daddr=${query}`;

  return (
    <a
      href={google}
      target="_blank"
      rel="noopener noreferrer"
      className={
        variant === "button"
          ? "btn btn-secondary w-full"
          : "inline-flex min-h-11 items-center gap-2 font-medium text-ink underline underline-offset-4"
      }
      onClick={(e) => {
        if (/iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent)) {
          e.preventDefault();
          window.open(apple, "_blank", "noopener,noreferrer");
        }
      }}
    >
      <Navigation aria-hidden size={18} strokeWidth={1.5} />
      {label}
      <span className="sr-only"> (opens your maps app)</span>
    </a>
  );
}
