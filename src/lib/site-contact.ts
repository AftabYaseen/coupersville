import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// The site's contact address and promised response time, from Admin > Settings.
export const DEFAULT_CONTACT = { email: "admin@opalqsm.com", responseTime: "within 2 business days" };

export async function siteContact(): Promise<{ email: string; responseTime: string }> {
  const { data } = await createAdminClient()
    .from("platform_settings")
    .select("enterprise_contact_email, contact_response_time")
    .eq("singleton", true)
    .maybeSingle();
  return {
    email: data?.enterprise_contact_email || DEFAULT_CONTACT.email,
    responseTime: data?.contact_response_time || DEFAULT_CONTACT.responseTime,
  };
}
