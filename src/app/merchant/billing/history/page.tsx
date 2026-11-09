import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireManagedBusiness } from "@/lib/merchant";
import { formatDay } from "@/lib/dates";
import { formatPrice } from "@/lib/offers";
import { PageLoading } from "@/components/page-loading";
import { ContactForMore } from "@/components/merchant/usage";

export const metadata: Metadata = { title: "Billing history" };

export default function BillingHistoryPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <HistoryContent />
    </Suspense>
  );
}

const STATUS: Record<string, string> = { paid: "Paid", declined: "Declined", voided: "Not charged" };

async function HistoryContent() {
  const { business, supabase } = await requireManagedBusiness("/merchant/billing/history");
  const [{ data: payments }, { data: settings }] = await Promise.all([
    supabase
      .from("payments")
      .select("id, created_at, amount_cents, card_last4, status, kind")
      .eq("business_id", business.id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("platform_settings").select("enterprise_contact_email").limit(1).maybeSingle(),
  ]);

  return (
    <div className="mx-auto grid max-w-2xl gap-6 px-4 py-10">
      <div>
        <h1 className="wordmark text-4xl text-ink">Billing history</h1>
        <p className="mt-2">
          Every payment for {business.name}. <Link href="/merchant/billing" className="font-medium text-ink underline underline-offset-4">Back to billing</Link>
        </p>
      </div>
      {!payments?.length ? (
        <p className="panel p-5">No payments yet. They appear here once you start a paid plan.</p>
      ) : (
        <div className="panel overflow-x-auto p-0">
          <table className="w-full text-left tabular">
            <thead>
              <tr className="border-b-[1.5px] border-ink">
                <th scope="col" className="p-3 font-semibold">Date</th>
                <th scope="col" className="p-3 font-semibold">Amount</th>
                <th scope="col" className="p-3 font-semibold">Card</th>
                <th scope="col" className="p-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-b border-ink/30 last:border-0">
                  <td className="p-3">{formatDay(p.created_at, business.timezone)}</td>
                  <td className="p-3">{formatPrice(p.amount_cents)}</td>
                  <td className="p-3">{p.card_last4 ? `Ending in ${p.card_last4}` : "Card"}</td>
                  <td className={`p-3 ${p.status === "paid" ? "" : "text-signal"}`}>
                    {STATUS[p.status] ?? p.status}
                    {p.kind === "renewal" ? ", renewal" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ContactForMore email={settings?.enterprise_contact_email ?? "admin@opalqsm.com"} />
    </div>
  );
}
