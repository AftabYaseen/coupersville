"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { NEAR_COOKIE, NEAR_MAX_AGE_S, nearCookieValue } from "@/lib/near-me";

const locationSchema = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });

// Keeps the rounded Near me location for 30 minutes, for the search page to read.
export async function setNearMe(input: unknown): Promise<{ ok: boolean }> {
  const location = locationSchema.safeParse(input);
  if (!location.success) return { ok: false };
  (await cookies()).set(NEAR_COOKIE, nearCookieValue(location.data), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: NEAR_MAX_AGE_S,
  });
  return { ok: true };
}
