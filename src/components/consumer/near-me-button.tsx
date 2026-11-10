"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LocateFixed } from "lucide-react";
import { setNearMe } from "@/app/search/actions";

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
      async (pos) => {
        // The rounded location goes into a short-lived cookie, never into the address.
        const saved = await setNearMe({ lat: pos.coords.latitude, lng: pos.coords.longitude }).catch(() => ({ ok: false }));
        if (!saved.ok) {
          fallBackToPlace();
          return;
        }
        const params = new URLSearchParams(keepParams ? window.location.search : "");
        for (const key of ["place", "page", "lat", "lng"]) params.delete(key);
        params.set("near", "1");
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
        {state === "locating" ? "Finding you" : "Use my location"}
      </button>
      <p role="status" className="mt-2 text-sm">
        {state === "declined"
          ? "Location is off, so search by city or ZIP code instead."
          : "Allow location access to see deals closest to you. Coupersville uses your location only to improve nearby search results."}
      </p>
    </div>
  );
}
