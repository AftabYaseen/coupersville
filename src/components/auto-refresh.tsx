"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Re-renders the page from the server after a few seconds, for a result that is still on its way
// (a payment Authorize.net has not listed yet). Renders nothing.
export function AutoRefresh({ seconds = 5 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setTimeout(() => router.refresh(), seconds * 1000);
    return () => clearTimeout(timer);
  }, [router, seconds]);
  return null;
}
