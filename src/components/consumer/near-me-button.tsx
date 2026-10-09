"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LocateFixed } from "lucide-react";

// Declining location is a normal choice, not an error: point people to the city or ZIP field.
export function NearMeButton({ placeInputId, keepParams = false }: { placeInputId: string; keepParams?: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "locating" | "declined">("idle");

  function fallBackToPlace() {
    setState("declined");
    document.getElementById(placeInputId)?.focus();
  }

  function locate() {
    if (!("geolocation" in navigator)) {
      fallBackToPlace();
      return;
    }
    setState("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const params = new URLSearchParams(keepParams ? window.location.search : "");
        params.delete("place");
        params.delete("page");
        params.set("lat", pos.coords.latitude.toFixed(3));
        params.set("lng", pos.coords.longitude.toFixed(3));
        params.set("sort", "nearest");
        router.push(`/search?${params.toString()}`);
      },
      fallBackToPlace,
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }

  return (
    <div>
      <button type="button" className="btn btn-secondary" onClick={locate} disabled={state === "locating"}>
        <LocateFixed aria-hidden size={18} strokeWidth={1.5} />
        {state === "locating" ? "Finding you" : "Near me"}
      </button>
      <p role="status" className="mt-2 text-sm">
        {state === "declined" ? "Location is off, so search by city or ZIP instead." : ""}
      </p>
    </div>
  );
}
