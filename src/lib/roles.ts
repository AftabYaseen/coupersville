import type { Enums } from "@/lib/supabase/database.types";

export type UserRole = Enums<"user_role">;

export function homePathFor(role: UserRole): string {
  if (role === "admin") return "/admin";
  if (role === "merchant") return "/merchant";
  return "/";
}

// Only same-origin relative paths are allowed as post-login destinations.
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return null;
  }
  return next;
}
