import "server-only";
import { absoluteUrl } from "@/lib/site";
import { formatDay } from "@/lib/dates";
import { PAST_DUE_GRACE_DAYS } from "@/lib/billing";

// Brand-style emails: a white ticket on paper, ink outline, plain text wordmark, one ink button.
// Every template also has a plain text version. Inline styles only, since mail apps drop <style>.

const INK = "#1B2A8F";
const INK_DEEP = "#121A4D";
const PAPER = "#F2F4F8";
const BUTTER = "#FBEBB0";
const SIGNAL = "#D8342C";
const FONT = "Archivo, 'Helvetica Neue', Arial, sans-serif";

export type RenderedEmail = { subject: string; html: string; text: string };

export type PlanSource = "complimentary" | "authorize_net";

type Block =
  | { kind: "p"; text: string }
  | { kind: "button"; label: string; href: string }
  | { kind: "stub"; rows: [string, string][] }
  | { kind: "note"; text: string };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function renderBlock(block: Block): string {
  switch (block.kind) {
    case "p":
      return `<p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:${INK_DEEP};">${escapeHtml(block.text)}</p>`;
    case "note":
      return `<p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:${INK_DEEP};">${escapeHtml(block.text)}</p>`;
    case "button":
      return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;"><tr><td style="background:${INK};border-radius:4px;">
<a href="${escapeHtml(block.href)}" style="display:inline-block;padding:12px 20px;font-family:${FONT};font-size:16px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:4px;">${escapeHtml(block.label)}</a>
</td></tr></table>`;
    case "stub":
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background:${BUTTER};border:1.5px solid ${INK};border-top-style:dashed;border-radius:0 0 6px 6px;">
${block.rows
  .map(
    ([label, value]) =>
      `<tr><td style="padding:10px 16px 0;font-size:14px;color:${INK_DEEP};">${escapeHtml(label)}</td></tr><tr><td style="padding:2px 16px 10px;font-size:16px;font-weight:600;color:${INK_DEEP};">${escapeHtml(value)}</td></tr>`,
  )
  .join("")}
</table>`;
  }
}

function blockText(block: Block): string {
  switch (block.kind) {
    case "p":
    case "note":
      return block.text;
    case "button":
      return `${block.label}: ${block.href}`;
    case "stub":
      return block.rows.map(([label, value]) => `${label}: ${value}`).join("\n");
  }
}

function layout({ subject, heading, blocks, alert }: { subject: string; heading: string; blocks: Block[]; alert?: boolean }): RenderedEmail {
  const home = absoluteUrl("/");
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${PAPER};font-family:${FONT};color:${INK_DEEP};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1.5px solid ${INK};border-radius:6px;">
<tr><td style="padding:20px 24px;border-bottom:1.5px solid ${INK};">
<a href="${home}" style="font-family:${FONT};font-size:24px;font-weight:800;color:${INK};text-decoration:none;">Coupersville</a>
</td></tr>
<tr><td style="padding:24px 24px 8px;">
<h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;font-weight:700;color:${alert ? SIGNAL : INK};">${escapeHtml(heading)}</h1>
${blocks.map(renderBlock).join("\n")}
</td></tr>
</table>
<p style="max-width:560px;margin:16px auto 0;font-size:13px;line-height:1.5;color:${INK_DEEP};">You are getting this email because you have an account on <a href="${home}" style="color:${INK};">Coupersville</a>.</p>
</td></tr></table>
</body></html>`;

  const text = [`Coupersville`, ``, heading, ``, ...blocks.map(blockText).flatMap((t) => [t, ""]), `Coupersville: ${home}`].join("\n");
  return { subject, html, text };
}

const day = (iso: string, tz: string) => formatDay(iso, tz);

export function welcomeEmail({ role, name }: { role: "consumer" | "merchant"; name: string | null }): RenderedEmail {
  const hello = name ? `Hi ${name},` : "Hi,";
  if (role === "merchant") {
    return layout({
      subject: "Welcome to Coupersville",
      heading: "Welcome to Coupersville",
      blocks: [
        { kind: "p", text: hello },
        { kind: "p", text: "Your business account is ready. Add your business and your first store, then publish your first coupon. It goes live straight away." },
        { kind: "button", label: "Set up your business", href: absoluteUrl("/merchant/onboarding") },
        { kind: "note", text: "Shoppers see your coupons once your plan is active. Your dashboard shows where you are." },
      ],
    });
  }
  return layout({
    subject: "Welcome to Coupersville",
    heading: "Welcome to Coupersville",
    blocks: [
      { kind: "p", text: hello },
      { kind: "p", text: "Your shopper account is ready. Save deals from businesses near you, then show the QR code at the business to redeem them." },
      { kind: "button", label: "Browse coupons", href: absoluteUrl("/") },
      { kind: "note", text: "Next time, sign in with a code we email you. No password needed." },
    ],
  });
}

export function staffInviteEmail({ businessName, link, expiresAt, timeZone }: { businessName: string; link: string; expiresAt: string; timeZone: string }): RenderedEmail {
  return layout({
    subject: `Join ${businessName} on Coupersville`,
    heading: `${businessName} added you to their team`,
    blocks: [
      { kind: "p", text: `You are invited to scan and check coupons for ${businessName} on Coupersville. Accept with this email address and you get the scanner page, nothing else.` },
      { kind: "button", label: "Accept invite", href: link },
      { kind: "stub", rows: [["Invite expires", day(expiresAt, timeZone)]] },
      { kind: "note", text: "Not expecting this? Ignore the email and nothing happens." },
    ],
  });
}

export function planStartedEmail({
  businessName,
  source,
  endsAt,
  timeZone,
  foundingSeat = false,
  offerName = null,
  renewalTerms = null,
}: {
  businessName: string;
  source: PlanSource;
  endsAt: string | null;
  timeZone: string;
  foundingSeat?: boolean;
  // The offer name from the offers table, for example "Pioneer Circle". Shown for paid plans and free seats.
  offerName?: string | null;
  // Paid plans: the automatic renewal terms the merchant agreed to, word for word.
  renewalTerms?: string | null;
}): RenderedEmail {
  const paid = source !== "complimentary";
  const rows: [string, string][] = [["Business", businessName]];
  const seat = foundingSeat ? (offerName ?? "Coupersville") : null;
  if (seat) rows.push(["Plan", `${seat}, free seat`]);
  if (paid && offerName) rows.push(["Plan", offerName]);
  if (endsAt) rows.push([paid ? "Renews on" : "Active until", day(endsAt, timeZone)]);
  let text = "Coupersville gave your business a complimentary plan. Your published coupons are live for shoppers.";
  if (paid) text = "Thanks for your payment. Your plan is active and your published coupons are live for shoppers.";
  if (seat) text = `Welcome to ${seat}. You have one of the free ${seat} seats: your first 12 months are on us, and your coupon is live for shoppers.`;
  return layout({
    subject: seat ? `Your ${seat} seat is confirmed` : "Your Coupersville plan is active",
    heading: seat ? `Welcome to ${seat}` : "Your plan is active",
    blocks: [
      { kind: "p", text },
      { kind: "stub", rows },
      ...(seat ? [{ kind: "p" as const, text: `Read what being part of the ${seat} looks like: ${absoluteUrl("/pioneer-circle")}` }] : []),
      ...renewalTermsBlocks(renewalTerms),
      { kind: "button", label: "Open your dashboard", href: absoluteUrl("/merchant") },
    ],
  });
}

// The automatic renewal terms as agreed, and where to cancel (New York General Business Law 527-a).
function renewalTermsBlocks(terms: string | null): Block[] {
  if (!terms) return [];
  return [
    { kind: "p", text: "Your automatic renewal terms, as you agreed to them:" },
    { kind: "note", text: terms },
    { kind: "p", text: `To cancel, open Billing and choose Cancel renewal: ${absoluteUrl("/merchant/billing")}` },
  ];
}

// After a free founding seat (Pioneer Circle) adds a card: confirms the plan will continue automatically.
export function renewalTermsEmail({
  businessName,
  terms,
  last4,
  freeName,
}: {
  businessName: string;
  terms: string;
  last4: string | null;
  // The founding offer's name from the offers table.
  freeName: string;
}): RenderedEmail {
  return layout({
    subject: "Your card is saved: your automatic renewal terms",
    heading: "Your card is saved",
    blocks: [
      { kind: "p", text: `Thanks. Your card${last4 ? ` ending in ${last4}` : ""} is saved for ${businessName}, so your plan continues when your free ${freeName} year ends.` },
      ...renewalTermsBlocks(terms),
      { kind: "button", label: "Open Billing", href: absoluteUrl("/merchant/billing") },
    ],
  });
}

export function paymentFailedEmail({ businessName, graceEndsAt, timeZone }: { businessName: string; graceEndsAt: string; timeZone: string }): RenderedEmail {
  // Renewals are retried 1, 3 and 7 days after the renewal date.
  return layout({
    subject: "Your Coupersville payment failed",
    heading: "Your payment failed",
    alert: true,
    blocks: [
      { kind: "p", text: `We could not charge your card for the ${businessName} plan. Your coupons stay live for ${PAST_DUE_GRACE_DAYS} days while you update your card.` },
      { kind: "stub", rows: [["Coupons stay live until", day(graceEndsAt, timeZone)]] },
      { kind: "button", label: "Update card", href: absoluteUrl("/merchant/billing") },
      { kind: "note", text: "We will try the card again 1, 3 and 7 days after the renewal date. If a payment goes through, you do not need to do anything." },
    ],
  });
}

export function planEndingEmail({
  businessName,
  source,
  endsAt,
  timeZone,
}: {
  businessName: string;
  source: PlanSource;
  endsAt: string;
  timeZone: string;
}): RenderedEmail {
  const paid = source !== "complimentary";
  return layout({
    subject: "Your Coupersville plan ends in 7 days",
    heading: "Your plan ends soon",
    blocks: [
      {
        kind: "p",
        text:
          paid
            ? `Your plan for ${businessName} is cancelled and ends soon. After that, your coupons are hidden from shoppers.`
            : `The complimentary plan for ${businessName} ends soon. After that, your coupons are hidden from shoppers.`,
      },
      { kind: "stub", rows: [["Plan ends on", day(endsAt, timeZone)]] },
      { kind: "button", label: paid ? "Renew your plan" : "See your plan", href: absoluteUrl("/merchant/billing") },
    ],
  });
}

export function planEndedEmail({ businessName }: { businessName: string }): RenderedEmail {
  return layout({
    subject: "Your Coupersville plan has ended",
    heading: "Your plan has ended",
    alert: true,
    blocks: [
      { kind: "p", text: `The plan for ${businessName} has ended, so your coupons are hidden from shoppers. They are all still there: start a plan and they go live again.` },
      { kind: "button", label: "See your plan", href: absoluteUrl("/merchant/billing") },
    ],
  });
}

export function couponRemovedEmail({ businessName, couponTitle, reason }: { businessName: string; couponTitle: string; reason: string | null }): RenderedEmail {
  const rows: [string, string][] = [
    ["Coupon", couponTitle],
    ["Reason", reason ?? "No reason given"],
  ];
  return layout({
    subject: "A coupon was removed by Coupersville",
    heading: "A coupon was removed by Coupersville",
    alert: true,
    blocks: [
      { kind: "p", text: `We took one of the ${businessName} coupons off Coupersville. Shoppers can no longer see or redeem it.` },
      { kind: "stub", rows },
      { kind: "p", text: "You can still edit the coupon, or delete it if nobody has redeemed it." },
      { kind: "button", label: "See your coupons", href: absoluteUrl("/merchant/coupons") },
    ],
  });
}

// 60 and 30 days before a paid plan renews.
export function renewalReminderEmail({
  businessName,
  renewsOn,
  priceText,
  offerName,
  timeZone,
}: {
  businessName: string;
  renewsOn: string;
  priceText: string;
  offerName: string;
  timeZone: string;
}): RenderedEmail {
  return layout({
    subject: `Your Coupersville plan renews on ${day(renewsOn, timeZone)}`,
    heading: "Your plan renews soon",
    blocks: [
      { kind: "p", text: `The plan for ${businessName} renews on its own, using the card on file.` },
      { kind: "stub", rows: [["Renews on", day(renewsOn, timeZone)], ["Plan", offerName], ["Price", priceText]] },
      { kind: "button", label: "See your plan", href: absoluteUrl("/merchant/billing") },
      { kind: "note", text: "To stop it renewing, open Billing and cancel before that date. Your plan stays active until then." },
    ],
  });
}

// 60 and 30 days before a free founding seat (Pioneer Circle) ends. Names come from the offers table.
export function addCardReminderEmail({
  businessName,
  endsOn,
  freeName,
  nextName,
  nextPrices,
  hasCard,
  timeZone,
}: {
  businessName: string;
  endsOn: string;
  freeName: string;
  nextName: string;
  nextPrices: string;
  hasCard: boolean;
  timeZone: string;
}): RenderedEmail {
  return layout({
    subject: hasCard ? `Your ${freeName} seat continues on ${nextName} soon` : `Your free ${freeName} seat ends soon`,
    heading: hasCard ? "Your plan continues soon" : "Your free year ends soon",
    blocks: [
      {
        kind: "p",
        text: hasCard
          ? `The free ${freeName} seat for ${businessName} ends soon. Your card is on file, so the plan continues on ${nextName}.`
          : `The free ${freeName} seat for ${businessName} ends soon. Add a card to continue on ${nextName}, or the plan ends and your coupons are hidden from shoppers.`,
      },
      { kind: "stub", rows: [["Free seat ends on", day(endsOn, timeZone)], [nextName, nextPrices]] },
      { kind: "button", label: hasCard ? "See your plan" : "Add card", href: absoluteUrl("/merchant/billing") },
    ],
  });
}

// To Coupersville admins when a payment needs a person to look at it.
// A message from the Contact page, to the site's contact address. Reply goes to the sender.
export function contactMessageEmail({
  name,
  email,
  role,
  topic,
  message,
}: {
  name: string;
  email: string;
  role: string;
  topic: string;
  message: string;
}): RenderedEmail {
  return layout({
    subject: `Contact: ${topic} from ${name}`,
    heading: "New message from the Contact page",
    blocks: [
      { kind: "stub", rows: [["From", `${name} (${email})`], ["I am a", role], ["Topic", topic]] },
      ...message.split(/\n{2,}/).map((text) => ({ kind: "p" as const, text })),
      { kind: "note", text: "Reply to this email to answer them directly." },
    ],
  });
}

export function adminBillingAlertEmail({ subject, lines }: { subject: string; lines: string[] }): RenderedEmail {
  return layout({
    subject: `Billing needs a look: ${subject}`,
    heading: "Billing needs a look",
    alert: true,
    blocks: [
      ...lines.map((text) => ({ kind: "p" as const, text })),
      { kind: "button", label: "Open subscriptions", href: absoluteUrl("/admin/subscriptions") },
    ],
  });
}
