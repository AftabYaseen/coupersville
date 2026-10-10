import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import QRCode from "qrcode";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { describeLimits } from "@/lib/coupons";
import { TicketSkeleton } from "@/components/consumer/ticket-skeleton";
import { RedeemScreen } from "@/components/consumer/redeem-screen";

export const metadata: Metadata = { title: "Redeem coupon" };

export default function RedeemPage({ params }: PageProps<"/redeem/[tokenId]">) {
  return (
    <div className="mx-auto max-w-md px-4 py-6 sm:py-10">
      <Suspense fallback={<TicketSkeleton />}>
        <RedeemContent params={params} />
      </Suspense>
    </div>
  );
}

// The phone counts down from this, so its own clock being off does not matter.
function serverClock() {
  return Date.now();
}

async function RedeemContent({ params }: { params: PageProps<"/redeem/[tokenId]">["params"] }) {
  const { tokenId } = await params;
  await requireUser(`/redeem/${tokenId}`);
  if (!z.uuid().safeParse(tokenId).success) notFound();

  const supabase = await createClient();
  const { data } = await supabase.rpc("my_redemption_token", { p_token_id: tokenId });
  const row = data?.[0];
  if (!row) notFound();

  const serverNow = serverClock();
  const waiting = !row.used_at && new Date(row.expires_at).getTime() > serverNow;
  // Deep ink on white keeps contrast high for the staff phone's camera.
  const qrSvg = waiting
    ? await QRCode.toString(row.token, {
        type: "svg",
        errorCorrectionLevel: "M",
        margin: 2,
        color: { dark: "#121A4D", light: "#FFFFFF" },
      })
    : null;

  const storeCount = Number(row.store_count);
  return (
    <>
      <Link
        href={`/coupon/${row.coupon_id}`}
        className="mb-4 inline-flex min-h-11 items-center gap-2 font-medium text-ink"
      >
        <ArrowLeft aria-hidden size={18} strokeWidth={1.5} />
        Back to coupon
      </Link>
      <RedeemScreen
        key={row.token_id}
        tokenId={row.token_id}
        couponId={row.coupon_id}
        shortCode={row.short_code}
        qrSvg={qrSvg}
        expiresAt={row.expires_at}
        serverNow={serverNow}
        initialRedemption={
          row.used_at ? { redeemedAt: row.redeemed_at ?? row.used_at, store: row.redeemed_store ?? null } : null
        }
        ticket={{
          tint: row.stock_tint,
          merchant: row.business_name,
          discountType: row.discount_type,
          discountValue: Number(row.discount_value),
          title: row.title,
          includedProducts: row.included_products,
          couponExpiresAt: row.coupon_expires_at,
          timeZone: row.business_timezone,
          limits: describeLimits(row),
          store: storeCount === 1 && row.only_store ? row.only_store : `${storeCount} stores`,
        }}
      />
    </>
  );
}
