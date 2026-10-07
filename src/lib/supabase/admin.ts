import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Bypasses RLS. Only for trusted server code that has already authorised the caller.
export function createAdminClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("SUPABASE_SECRET_KEY is not set");
  }
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
