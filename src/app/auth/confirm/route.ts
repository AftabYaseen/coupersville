import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/roles";
import { notifyWelcome } from "@/lib/email/notices";

const OTP_TYPES: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

// Handles links from Supabase auth emails (PKCE code or token hash) and starts the session.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next")) ?? "/";
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const supabase = await createClient();
  let failed = true;
  let user: User | null = null;

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    failed = Boolean(error);
    user = data.user;
  } else if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    failed = Boolean(error);
    user = data.user;
  }

  // The first confirmed sign-in of a new account. Sent once, whichever link they used.
  if (!failed && user && type !== "recovery") await notifyWelcome(user);

  return NextResponse.redirect(new URL(failed ? "/login?error=link" : next, origin));
}
