"use client";

import { useEffect } from "react";

// Registers /sw.js, which shows the offline page when a page cannot load. Production only, so
// development reloads are never served from it.
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
  }, []);
  return null;
}
