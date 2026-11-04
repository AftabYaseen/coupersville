import "server-only";

// Sends one email through Resend's HTTP API. Never throws: email is a side effect, so a failed
// send must not undo the action that triggered it. Logs carry the template name and outcome only,
// never the address or the content.

export type Email = {
  to: string;
  subject: string;
  html: string;
  text: string;
  // Template name, for logs.
  tag: string;
};

export type SendResult = { ok: true; skipped?: boolean } | { ok: false; reason: string };

// Addresses that can never receive mail (RFC 2606 and 6761). Test accounts use them, so tests
// exercise every path without sending real email.
const UNDELIVERABLE = /@(?:[^@]+\.)?(?:example\.(?:com|net|org)|[^@]+\.(?:test|invalid|example|localhost))$/i;

// Addresses on reserved test domains: nothing is ever sent to them.
export const isTestAddress = (address: string) => UNDELIVERABLE.test(address);

export async function sendEmail(email: Email): Promise<SendResult> {
  if (UNDELIVERABLE.test(email.to)) return { ok: true, skipped: true };

  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) {
    console.error(`email ${email.tag}: RESEND_API_KEY or EMAIL_FROM is not set`);
    return { ok: false, reason: "not_configured" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [email.to], subject: email.subject, html: email.html, text: email.text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.error(`email ${email.tag}: Resend answered ${response.status}`);
      return { ok: false, reason: `status_${response.status}` };
    }
    return { ok: true };
  } catch (error) {
    console.error(`email ${email.tag}: ${error instanceof Error ? error.name : "send failed"}`);
    return { ok: false, reason: "network" };
  }
}
