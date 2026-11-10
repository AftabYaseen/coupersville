"use server";

import { registerCodeRequest } from "@/lib/auth-codes";
import { sendEmail, isTestAddress } from "@/lib/email/send";
import { contactMessageEmail } from "@/lib/email/templates";
import { siteContact } from "@/lib/site-contact";
import { contactSchema } from "@/lib/validation/contact";
import type { ActionResult } from "@/lib/validation/auth";

// Sends a Contact page message to the site's contact address, with Reply-To set to the sender.
// The message itself is never stored. Spam protection: a hidden field people never fill in, and
// per email and per IP limits (register_auth_code_request, kind "contact").
export async function sendContactMessage(input: unknown): Promise<ActionResult> {
  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  const v = parsed.data;
  const contact = await siteContact();
  const thanks: ActionResult = {
    ok: true,
    message: `Thanks for contacting Coupersville. We received your message and will respond ${contact.responseTime}.`,
  };

  // A bot filled in the hidden field: look successful, send nothing.
  if (v.website) return thanks;

  let limit;
  try {
    limit = await registerCodeRequest("contact", v.email);
  } catch {
    return { ok: false, error: "We could not send your message just now. Try again in a moment." };
  }
  if (limit !== "ok") {
    return { ok: false, error: "You have sent several messages in a short time. Please wait a few minutes, then try again." };
  }

  // Reserved test addresses (example.com and the like) send nothing, so tests never email the team.
  if (isTestAddress(v.email)) return thanks;

  const email = contactMessageEmail({ name: v.name, email: v.email, role: v.role, topic: v.topic, message: v.message });
  const sent = await sendEmail({ ...email, to: contact.email, tag: "contact_message", replyTo: v.email });
  if (!sent.ok) {
    return { ok: false, error: `We could not send your message just now. Try again in a moment, or email us at ${contact.email}.` };
  }
  return thanks;
}
