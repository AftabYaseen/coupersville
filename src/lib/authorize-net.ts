import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Authorize.net API client. The production endpoint is used only when AUTHORIZE_NET_ENV is
// exactly "production"; anything else goes to the sandbox. Card details never pass through here:
// checkout is Accept Hosted and card updates are the hosted profile page. Keys are never logged.
//
// The JSON API is the XML API underneath, so the order of keys in each request matters.

export function anetIsProduction(): boolean {
  return process.env.AUTHORIZE_NET_ENV === "production";
}

const API = () => (anetIsProduction() ? "https://api.authorize.net/xml/v1/request.api" : "https://apitest.authorize.net/xml/v1/request.api");
export const hostedPaymentUrl = () => (anetIsProduction() ? "https://accept.authorize.net/payment/payment" : "https://test.authorize.net/payment/payment");
export const hostedProfileUrl = () => (anetIsProduction() ? "https://accept.authorize.net/customer/manage" : "https://test.authorize.net/customer/manage");

// Payments need only the API login and transaction key. The signature key is for webhooks alone:
// without it the webhook refuses every notification, and payments are confirmed on return and by
// the sweep instead.
export function anetConfigured(): boolean {
  return Boolean(process.env.AUTHORIZE_NET_API_LOGIN_ID && process.env.AUTHORIZE_NET_TRANSACTION_KEY);
}

export function anetWebhooksEnabled(): boolean {
  return Boolean(process.env.AUTHORIZE_NET_SIGNATURE_KEY);
}

function auth() {
  const name = process.env.AUTHORIZE_NET_API_LOGIN_ID;
  const transactionKey = process.env.AUTHORIZE_NET_TRANSACTION_KEY;
  if (!name || !transactionKey) throw new AnetError("not_configured", "Authorize.net keys are not set");
  return { name, transactionKey };
}

export class AnetError extends Error {
  constructor(
    public code: string,
    message: string,
    // True when we cannot tell whether the request reached Authorize.net (timeout, network).
    public unknown = false,
  ) {
    super(message);
  }
}

type Message = { code: string; text: string };
type Envelope = { messages?: { resultCode: "Ok" | "Error"; message: Message[] } };

// Sends one request. Throws AnetError with unknown=true when the outcome cannot be known.
async function call<T extends Envelope>(name: string, body: Record<string, unknown>, timeoutMs = 25_000): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ [name]: { merchantAuthentication: auth(), ...body } }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new AnetError("network", `${name}: ${error instanceof Error ? error.name : "request failed"}`, true);
  }
  if (!res.ok) throw new AnetError(`http_${res.status}`, `${name}: HTTP ${res.status}`, res.status >= 500);
  // Responses start with a byte order mark.
  const text = (await res.text()).replace(/^﻿/, "");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AnetError("bad_json", `${name}: unreadable response`, true);
  }
}

function ok(envelope: Envelope): boolean {
  return envelope.messages?.resultCode === "Ok";
}
function firstMessage(envelope: Envelope): Message {
  return envelope.messages?.message?.[0] ?? { code: "unknown", text: "No message" };
}

const dollars = (cents: number) => (cents / 100).toFixed(2);

// ---------------------------------------------------------------- Connection check

// Asks Authorize.net whether the keys are valid. No payment, and only the result comes back.
export async function checkConnection(): Promise<{ connected: boolean; code: string; message: string }> {
  try {
    const r = await call<Envelope>("authenticateTestRequest", {});
    const m = firstMessage(r);
    return { connected: ok(r), code: m.code, message: m.text };
  } catch (e) {
    if (e instanceof AnetError) return { connected: false, code: e.code, message: e.message };
    return { connected: false, code: "unknown", message: "The check could not run." };
  }
}

// ---------------------------------------------------------------- Accept Hosted

export async function hostedPaymentToken(input: {
  amountCents: number;
  invoiceNumber: string;
  description: string;
  // Reuse a saved customer profile, or create one from this payment.
  customerProfileId: string | null;
  merchantCustomerId: string;
  email: string | null;
  returnUrl: string;
  cancelUrl: string;
}): Promise<string> {
  const profile = input.customerProfileId ? { customerProfileId: input.customerProfileId } : { createProfile: true };
  const settings = [
    { settingName: "hostedPaymentReturnOptions", settingValue: JSON.stringify({ showReceipt: false, url: input.returnUrl, urlText: "Continue", cancelUrl: input.cancelUrl, cancelUrlText: "Cancel" }) },
    { settingName: "hostedPaymentButtonOptions", settingValue: JSON.stringify({ text: "Pay" }) },
    { settingName: "hostedPaymentPaymentOptions", settingValue: JSON.stringify({ cardCodeRequired: true, showCreditCard: true, showBankAccount: false }) },
    { settingName: "hostedPaymentSecurityOptions", settingValue: JSON.stringify({ captcha: false }) },
    { settingName: "hostedPaymentBillingAddressOptions", settingValue: JSON.stringify({ show: true, required: false }) },
    { settingName: "hostedPaymentCustomerOptions", settingValue: JSON.stringify({ showEmail: false, requiredEmail: false, addPaymentProfile: true }) },
    { settingName: "hostedPaymentOrderOptions", settingValue: JSON.stringify({ show: true, merchantName: "Coupersville" }) },
  ];
  const r = await call<Envelope & { token?: string }>("getHostedPaymentPageRequest", {
    transactionRequest: {
      // Authorise only. The payment is captured after the seat is confirmed, or voided.
      transactionType: "authOnlyTransaction",
      amount: dollars(input.amountCents),
      profile,
      order: { invoiceNumber: input.invoiceNumber, description: input.description.slice(0, 255) },
      customer: { id: input.merchantCustomerId.slice(0, 20), ...(input.email ? { email: input.email } : {}) },
    },
    hostedPaymentSettings: { setting: settings },
  });
  if (!ok(r) || !r.token) throw new AnetError(firstMessage(r).code, `hosted payment page: ${firstMessage(r).text}`);
  return r.token;
}

export async function hostedProfileToken(customerProfileId: string, returnUrl: string): Promise<string> {
  const r = await call<Envelope & { token?: string }>("getHostedProfilePageRequest", {
    customerProfileId,
    hostedProfileSettings: {
      setting: [
        { settingName: "hostedProfileReturnUrl", settingValue: returnUrl },
        { settingName: "hostedProfileReturnUrlText", settingValue: "Back to Coupersville" },
        { settingName: "hostedProfilePageBorderVisible", settingValue: "false" },
        { settingName: "hostedProfileManageOptions", settingValue: "showPayment" },
      ],
    },
  });
  if (!ok(r) || !r.token) throw new AnetError(firstMessage(r).code, `hosted profile page: ${firstMessage(r).text}`);
  return r.token;
}

// ---------------------------------------------------------------- Customer profiles

// Creates an empty customer profile, or returns the existing one for this merchant customer id.
export async function ensureCustomerProfile(merchantCustomerId: string, email: string | null, description: string): Promise<string> {
  const r = await call<Envelope & { customerProfileId?: string }>("createCustomerProfileRequest", {
    profile: { merchantCustomerId: merchantCustomerId.slice(0, 20), description: description.slice(0, 255), ...(email ? { email } : {}) },
  });
  if (ok(r) && r.customerProfileId) return r.customerProfileId;
  const m = firstMessage(r);
  // E00039: "A duplicate record with ID 1234 already exists."
  const existing = m.code === "E00039" ? m.text.match(/ID (\d+)/)?.[1] : undefined;
  if (existing) return existing;
  throw new AnetError(m.code, `create customer profile: ${m.text}`);
}

export type SavedCard = { paymentProfileId: string; last4: string | null; isDefault: boolean };

export async function savedCards(customerProfileId: string): Promise<SavedCard[]> {
  type PP = { customerPaymentProfileId: string; defaultPaymentProfile?: boolean; payment?: { creditCard?: { cardNumber?: string } } };
  const r = await call<Envelope & { profile?: { paymentProfiles?: PP[] } }>("getCustomerProfileRequest", { customerProfileId, unmaskExpirationDate: false });
  if (!ok(r)) throw new AnetError(firstMessage(r).code, `get customer profile: ${firstMessage(r).text}`);
  return (r.profile?.paymentProfiles ?? []).map((p) => ({
    paymentProfileId: p.customerPaymentProfileId,
    last4: last4Of(p.payment?.creditCard?.cardNumber),
    isDefault: Boolean(p.defaultPaymentProfile),
  }));
}

export function last4Of(masked: string | undefined | null): string | null {
  const digits = masked?.match(/(\d{4})$/)?.[1];
  return digits ?? null;
}

// The card renewals should use: the default one, else the most recently added.
export function chooseCard(cards: SavedCard[]): SavedCard | null {
  return cards.find((c) => c.isDefault) ?? cards.at(-1) ?? null;
}

export async function profileFromTransaction(transId: string): Promise<{ customerProfileId: string; paymentProfileId: string | null } | null> {
  const r = await call<Envelope & { customerProfileId?: string; customerPaymentProfileIdList?: string[] }>(
    "createCustomerProfileFromTransactionRequest",
    { transId },
  );
  if (ok(r) && r.customerProfileId) return { customerProfileId: r.customerProfileId, paymentProfileId: r.customerPaymentProfileIdList?.[0] ?? null };
  return null;
}

// ---------------------------------------------------------------- Transactions

export type TransactionDetails = {
  transId: string;
  status: string;
  invoiceNumber: string | null;
  authAmountCents: number;
  settleAmountCents: number;
  last4: string | null;
  customerProfileId: string | null;
  paymentProfileId: string | null;
  responseCode: number | null;
};

export async function transactionDetails(transId: string): Promise<TransactionDetails> {
  type T = {
    transId: string;
    transactionStatus: string;
    responseCode?: number;
    order?: { invoiceNumber?: string };
    authAmount?: number;
    settleAmount?: number;
    payment?: { creditCard?: { cardNumber?: string } };
    profile?: { customerProfileId?: string; customerPaymentProfileId?: string };
  };
  const r = await call<Envelope & { transaction?: T }>("getTransactionDetailsRequest", { transId });
  if (!ok(r) || !r.transaction) throw new AnetError(firstMessage(r).code, `transaction details: ${firstMessage(r).text}`);
  const t = r.transaction;
  return {
    transId: String(t.transId),
    status: t.transactionStatus,
    invoiceNumber: t.order?.invoiceNumber ?? null,
    authAmountCents: Math.round((t.authAmount ?? 0) * 100),
    settleAmountCents: Math.round((t.settleAmount ?? 0) * 100),
    last4: last4Of(t.payment?.creditCard?.cardNumber),
    customerProfileId: t.profile?.customerProfileId ?? null,
    paymentProfileId: t.profile?.customerPaymentProfileId ?? null,
    responseCode: t.responseCode ?? null,
  };
}

export type TransactionSummary = { transId: string; status: string; invoiceNumber: string | null; submittedAt: string; amountCents: number };

type ListItem = { transId: string; transactionStatus: string; invoiceNumber?: string; submitTimeUTC: string; settleAmount?: number };
const toSummary = (t: ListItem): TransactionSummary => ({
  transId: String(t.transId),
  status: t.transactionStatus,
  invoiceNumber: t.invoiceNumber ?? null,
  submittedAt: t.submitTimeUTC,
  amountCents: Math.round((t.settleAmount ?? 0) * 100),
});

// Transactions not yet settled, newest first. Authorised payments stay here until captured.
export async function unsettledTransactions(): Promise<TransactionSummary[]> {
  const all: TransactionSummary[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const r = await call<Envelope & { transactions?: ListItem[]; totalNumInResultSet?: number }>("getUnsettledTransactionListRequest", {
      sorting: { orderBy: "submitTimeUTC", orderDescending: true },
      paging: { limit: 1000, offset: page },
    });
    if (!ok(r)) {
      // I00004: no records found.
      if (firstMessage(r).code === "I00004") break;
      throw new AnetError(firstMessage(r).code, `unsettled list: ${firstMessage(r).text}`);
    }
    const items = r.transactions ?? [];
    all.push(...items.map(toSummary));
    if (items.length < 1000) break;
  }
  return all;
}

// Every transaction for one customer profile, settled or not.
export async function customerTransactions(customerProfileId: string): Promise<TransactionSummary[]> {
  const r = await call<Envelope & { transactions?: ListItem[] }>("getTransactionListForCustomerRequest", {
    customerProfileId,
    sorting: { orderBy: "submitTimeUTC", orderDescending: true },
    paging: { limit: 1000, offset: 1 },
  });
  if (!ok(r)) {
    if (firstMessage(r).code === "I00004") return [];
    throw new AnetError(firstMessage(r).code, `customer transactions: ${firstMessage(r).text}`);
  }
  return (r.transactions ?? []).map(toSummary);
}

export type ChargeResult =
  | { outcome: "approved"; transId: string; last4: string | null }
  | { outcome: "declined"; transId: string | null; reason: string }
  // Held by a fraud filter for review in the Authorize.net account: not approved, not declined yet.
  | { outcome: "held"; transId: string; reason: string }
  | { outcome: "error"; transId: string | null; reason: string };

type TxResponse = Envelope & {
  transactionResponse?: {
    responseCode?: string;
    transId?: string;
    accountNumber?: string;
    errors?: { errorCode: string; errorText: string }[];
    messages?: { code: string; description: string }[];
  };
};

function chargeResult(r: TxResponse): ChargeResult {
  const t = r.transactionResponse;
  const transId = t?.transId && t.transId !== "0" ? t.transId : null;
  const reason = t?.errors?.[0]?.errorText ?? t?.messages?.[0]?.description ?? firstMessage(r).text;
  if (t?.responseCode === "1" && transId) return { outcome: "approved", transId, last4: last4Of(t.accountNumber) };
  if (t?.responseCode === "2") return { outcome: "declined", transId, reason };
  if (t?.responseCode === "4" && transId) return { outcome: "held", transId, reason };
  return { outcome: "error", transId, reason };
}

// Charges a saved card. The invoice number is the idempotency key for this attempt.
export async function chargeProfile(input: {
  customerProfileId: string;
  paymentProfileId: string;
  amountCents: number;
  invoiceNumber: string;
  description: string;
}): Promise<ChargeResult> {
  const r = await call<TxResponse>("createTransactionRequest", {
    refId: input.invoiceNumber,
    transactionRequest: {
      transactionType: "authCaptureTransaction",
      amount: dollars(input.amountCents),
      profile: { customerProfileId: input.customerProfileId, paymentProfile: { paymentProfileId: input.paymentProfileId } },
      order: { invoiceNumber: input.invoiceNumber, description: input.description.slice(0, 255) },
    },
  });
  return chargeResult(r);
}

export async function captureAuthorization(transId: string, amountCents: number): Promise<ChargeResult> {
  const r = await call<TxResponse>("createTransactionRequest", {
    transactionRequest: { transactionType: "priorAuthCaptureTransaction", amount: dollars(amountCents), refTransId: transId },
  });
  return chargeResult(r);
}

export async function voidTransaction(transId: string): Promise<ChargeResult> {
  const r = await call<TxResponse>("createTransactionRequest", {
    transactionRequest: { transactionType: "voidTransaction", refTransId: transId },
  });
  return chargeResult(r);
}

// ---------------------------------------------------------------- Webhooks

// X-ANET-Signature is "sha512=" + HMAC-SHA512 of the raw body, keyed with the Signature Key.
export function webhookSignatureValid(rawBody: string, header: string | null): boolean {
  const key = process.env.AUTHORIZE_NET_SIGNATURE_KEY;
  if (!key || !header) return false;
  const given = header.replace(/^sha512=/i, "").trim().toUpperCase();
  if (!/^[0-9A-F]{128}$/.test(given)) return false;
  const expected = createHmac("sha512", key).update(rawBody, "utf8").digest("hex").toUpperCase();
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}
