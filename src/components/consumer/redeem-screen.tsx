"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { startRedemption } from "@/app/redeem/actions";
import { formatShortCode } from "@/lib/redemption";
import { Ticket, formatOffer, type StockTint } from "@/components/ticket";
import { FormMessage } from "@/components/field";
import type { Enums } from "@/lib/supabase/database.types";

type Redemption = { redeemedAt: string; store: string | null };

type Props = {
  tokenId: string;
  couponId: string;
  shortCode: string;
  qrSvg: string | null;
  expiresAt: string;
  serverNow: number;
  initialRedemption: Redemption | null;
  ticket: {
    tint: StockTint;
    merchant: string;
    discountType: Enums<"discount_type">;
    discountValue: number;
    title: string;
    includedProducts: string | null;
    couponExpiresAt: string;
    timeZone: string;
    limits: string;
    store: string;
  };
};

const POLL_MS = 4000;
// Keep listening briefly after the timer ends, in case staff confirmed in the last second.
const GRACE_MS = 20_000;

function formatStampDate(iso: string, tz: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric", year: "numeric" }).format(new Date(iso));
}

function formatTime(iso: string, tz: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

export function RedeemScreen({ tokenId, couponId, shortCode, qrSvg, expiresAt, serverNow, initialRedemption, ticket }: Props) {
  // The phone's clock can drift from the server's; count down against server time.
  const [skew] = useState(() => serverNow - Date.now());
  const expiresMs = new Date(expiresAt).getTime();
  const [now, setNow] = useState(serverNow);
  const [redemption, setRedemption] = useState<Redemption | null>(initialRedemption);
  const [animate, setAnimate] = useState(false);
  const [torn, setTorn] = useState(Boolean(initialRedemption));
  const [renewError, setRenewError] = useState<string | null>(null);
  const [renewing, startRenew] = useTransition();
  const announced = useRef(false);

  const remainingMs = Math.max(0, expiresMs - now);
  const expired = !redemption && remainingMs === 0;

  const markRedeemed = useCallback((r: Redemption) => {
    if (announced.current) return;
    announced.current = true;
    setRedemption(r);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setTorn(true);
    } else {
      setAnimate(true);
      window.setTimeout(() => setTorn(true), 1500);
    }
    navigator.vibrate?.(60);
  }, []);

  // Countdown.
  useEffect(() => {
    if (redemption) return;
    const tick = () => setNow(Date.now() + skew);
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [redemption, skew]);

  // Listen for the redemption: Realtime first, polling underneath in case the socket is slow or blocked.
  useEffect(() => {
    if (initialRedemption) return;
    const supabase = createClient();
    let stopped = false;

    const check = async () => {
      const { data } = await supabase.rpc("my_redemption_token", { p_token_id: tokenId });
      const row = data?.[0];
      if (!stopped && row?.used_at) {
        markRedeemed({ redeemedAt: row.redeemed_at ?? row.used_at, store: row.redeemed_store ?? null });
      }
    };

    const channel = supabase
      .channel(`redeem-${tokenId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "redemptions", filter: `token_id=eq.${tokenId}` },
        () => void check(),
      )
      .subscribe();

    const poll = window.setInterval(() => {
      if (Date.now() + skew > expiresMs + GRACE_MS) {
        window.clearInterval(poll);
        return;
      }
      if (document.visibilityState === "visible") void check();
    }, POLL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stopped = true;
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [tokenId, initialRedemption, expiresMs, skew, markRedeemed]);

  // Keep the screen awake while the code is showing.
  useEffect(() => {
    if (redemption || expired || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let released = false;
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request("screen");
        if (released) void lock.release();
      } catch {
        // Not allowed right now (battery saver, or the tab is hidden). The code still works.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && !released) void acquire();
    };
    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, [redemption, expired]);

  function renew() {
    setRenewError(null);
    startRenew(async () => {
      const result = await startRedemption(couponId);
      if (!result.ok) setRenewError(result.error);
    });
  }

  const minutes = Math.floor(remainingMs / 60_000);
  const seconds = Math.floor((remainingMs % 60_000) / 1000);
  const tz = ticket.timeZone;

  const codePanel = (
    <div className="grid gap-3 rounded-sm border-[1.5px] border-ink bg-white p-4 text-center">
      {qrSvg && (
        <div
          role="img"
          aria-label="QR code for staff to scan"
          className="mx-auto w-full max-w-[17rem] [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />
      )}
      <div>
        <p className="text-sm font-medium">Or tell staff this code</p>
        <p className="offer-text mt-1 text-5xl tracking-wide tabular" aria-label={`Code ${shortCode.split("").join(" ")}`}>
          {formatShortCode(shortCode)}
        </p>
      </div>
      {!redemption && (
        <p className="tabular font-medium" role="timer" aria-live="off">
          Expires in {minutes}:{String(seconds).padStart(2, "0")}
        </p>
      )}
    </div>
  );

  let stub: ReactNode;
  if (redemption) {
    // The code stays on the stub while it tears away, then the stub is gone.
    stub = torn ? null : codePanel;
  } else if (expired) {
    stub = (
      <div className="grid gap-3 rounded-sm border-[1.5px] border-ink bg-white p-4 text-center">
        <p className="text-lg font-semibold">This code has expired</p>
        <p className="text-sm">Codes last 5 minutes. Get a new one when you are at the counter.</p>
        <button type="button" className="btn w-full" disabled={renewing} onClick={renew}>
          <RefreshCw aria-hidden size={18} strokeWidth={1.5} />
          {renewing ? "Getting your code" : "Get a new code"}
        </button>
        {renewError && <FormMessage tone="error">{renewError}</FormMessage>}
      </div>
    );
  } else {
    stub = codePanel;
  }

  return (
    <div className="grid gap-5">
      <h1 className="wordmark text-3xl text-ink">
        {redemption ? "Enjoy your savings" : expired ? "Code expired" : "Show this at the counter"}
      </h1>
      {!redemption && !expired && (
        <p className="-mt-3">Staff scan the QR code or type the 6 digits. Keep this screen open until they confirm.</p>
      )}

      <Ticket
        tint={ticket.tint}
        merchant={ticket.merchant}
        offer={formatOffer(ticket.discountType, ticket.discountValue)}
        title={ticket.title}
        expiresAt={ticket.couponExpiresAt}
        timeZone={tz}
        limits={ticket.limits || undefined}
        store={ticket.store}
        stubActions={stub}
        className={`redeem-ticket ${animate ? "is-tearing" : ""} ${torn ? "is-torn" : ""}`}
      >
        {ticket.includedProducts && <p className="mt-2 text-sm">Applies to: {ticket.includedProducts}</p>}
        {redemption && (
          <div className={`stamp ${animate ? "stamp-press" : ""}`} aria-hidden>
            <span className="offer-text block text-4xl">Redeemed</span>
            <span className="block text-sm font-semibold tabular">{formatStampDate(redemption.redeemedAt, tz)}</span>
          </div>
        )}
      </Ticket>

      <p role="status" aria-live="polite" className={redemption ? "panel p-4" : "sr-only"}>
        {redemption &&
          `Redeemed${redemption.store ? ` at ${redemption.store}` : ""} on ${formatStampDate(redemption.redeemedAt, tz)} at ${formatTime(redemption.redeemedAt, tz)}.`}
      </p>

      {redemption && (
        <div className="flex flex-wrap gap-3">
          <Link href="/history" className="btn">
            See your history
          </Link>
          <Link href="/search" className="btn btn-secondary">
            Find more coupons
          </Link>
        </div>
      )}
    </div>
  );
}
