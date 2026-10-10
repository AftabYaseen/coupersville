"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type ReactNode,
} from "react";
import { CameraOff, CheckCircle2, Store, XCircle } from "lucide-react";
import { confirmRedemption, previewRedemption } from "@/app/merchant/scan/actions";
import { VERIFY_FAILURES, type Offer, type VerifyResponse } from "@/lib/redemption";
import { formatOffer } from "@/components/ticket";
import { FormMessage } from "@/components/field";

export type ScanStore = { id: string; label: string; detail: string };

type Phase =
  | { kind: "scan" }
  | { kind: "checking" }
  | { kind: "confirm"; input: string; response: VerifyResponse & { offer: Offer } }
  | { kind: "result"; response: VerifyResponse };

type Camera = "starting" | "on" | "denied" | "none" | "unavailable";

const READER_ID = "coupon-reader";
const STORE_KEY = "coupersville:scan-store";
const STORE_EVENT = "coupersville:scan-store";

const TINT_BG = { mint: "bg-stock-mint", pink: "bg-stock-pink", sky: "bg-stock-sky", butter: "bg-stock-butter" } as const;

// The chosen store lives on this device so staff pick it once.
function readSavedStore(): string | null {
  try {
    return window.localStorage.getItem(STORE_KEY);
  } catch {
    return null;
  }
}
function saveStore(id: string) {
  try {
    window.localStorage.setItem(STORE_KEY, id);
  } catch {
    // Private browsing can block storage; the choice still holds for this visit.
  }
  window.dispatchEvent(new Event(STORE_EVENT));
}
function subscribeStore(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(STORE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(STORE_EVENT, onChange);
  };
}

function cameraProblem(error: unknown): Camera {
  const text = String(error instanceof Error ? `${error.name} ${error.message}` : error);
  if (/NotAllowed|Permission|denied/i.test(text)) return "denied";
  if (/NotFound|Requested device not found|Overconstrained|no camera/i.test(text)) return "none";
  return "unavailable";
}

const CAMERA_NOTES: Record<Exclude<Camera, "starting" | "on">, string> = {
  denied: "Camera access is off for this site, so type the customer's 6-digit code below. To scan QR codes, allow the camera in your browser settings and reload.",
  none: "This device has no camera we can use. Type the customer's 6-digit code below.",
  unavailable: "The camera is not available here. Type the customer's 6-digit code below.",
};

function money(value: number) {
  return Number.isInteger(value) ? `$${value}` : `$${value.toFixed(2)}`;
}

function clock(iso: string) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

export function Scanner({ stores }: { stores: ScanStore[] }) {
  const saved = useSyncExternalStore(subscribeStore, readSavedStore, () => null);
  const [picked, setPicked] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const validSaved = stores.some((s) => s.id === saved) ? saved : null;
  const storeId = changing ? null : (picked ?? validSaved ?? (stores.length === 1 ? stores[0].id : null));
  const store = stores.find((s) => s.id === storeId) ?? null;

  const [phase, setPhase] = useState<Phase>({ kind: "scan" });
  const [camera, setCamera] = useState<Camera>("starting");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const busy = useRef(false);

  const check = useCallback(
    async (input: string) => {
      if (!store || busy.current) return;
      busy.current = true;
      setError(null);
      setPhase({ kind: "checking" });
      const res = await previewRedemption(input, store.id);
      if (!res.ok) {
        setError(res.error);
        setPhase({ kind: "scan" });
        busy.current = false;
        return;
      }
      const { response } = res;
      if (response.result === "ok" && response.offer) {
        setPhase({ kind: "confirm", input, response: { ...response, offer: response.offer } });
      } else {
        setPhase({ kind: "result", response });
      }
    },
    [store],
  );

  const onDecoded = useRef(check);
  useEffect(() => {
    onDecoded.current = check;
  }, [check]);

  // The camera runs only while the scan view is showing.
  const scanning = phase.kind === "scan" && store !== null;
  // Once the camera is refused or missing, stop asking until the page reloads.
  const cameraBlocked = camera === "denied" || camera === "none" || camera === "unavailable";
  useEffect(() => {
    if (!scanning || cameraBlocked) return;
    let cancelled = false;
    let reader: import("html5-qrcode").Html5Qrcode | null = null;
    let started: Promise<unknown> = Promise.resolve();

    (async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setCamera("unavailable");
        return;
      }
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
      if (cancelled) return;
      reader = new Html5Qrcode(READER_ID, {
        verbose: false,
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        useBarCodeDetectorIfSupported: true,
      });
      started = reader.start(
        { facingMode: "environment" },
        {
          fps: 10,
          aspectRatio: 1,
          qrbox: (w, h) => {
            const side = Math.max(160, Math.floor(Math.min(w, h) * 0.7));
            return { width: side, height: side };
          },
        },
        (text) => {
          if (!cancelled) void onDecoded.current(text);
        },
        () => {},
      );
      try {
        await started;
        if (!cancelled) setCamera("on");
      } catch (e) {
        if (!cancelled) setCamera(cameraProblem(e));
      }
    })();

    return () => {
      cancelled = true;
      const r = reader;
      void (async () => {
        try {
          await started;
        } catch {
          return;
        }
        try {
          if (r?.isScanning) await r.stop();
          r?.clear();
        } catch {
          // Already stopped.
        }
      })();
    };
  }, [scanning, cameraBlocked]);

  function backToScan() {
    busy.current = false;
    setCode("");
    setError(null);
    setPhase({ kind: "scan" });
  }

  function confirm(input: string) {
    if (!store) return;
    startSaving(async () => {
      const res = await confirmRedemption(input, store.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setPhase({ kind: "result", response: res.response });
    });
  }

  function submitCode() {
    const digits = code.replace(/\D/g, "");
    if (digits.length !== 6) {
      setError("Enter all 6 digits of the customer's code.");
      return;
    }
    void check(digits);
  }

  if (!store) {
    return (
      <div className="mx-auto max-w-md px-4 py-8">
        <h1 className="wordmark text-4xl text-ink">Which store are you at?</h1>
        <p className="mt-2">Pick it once. This phone remembers it.</p>
        <ul className="mt-6 grid gap-3">
          {stores.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className="panel flex min-h-14 w-full items-center gap-3 p-4 text-left"
                onClick={() => {
                  saveStore(s.id);
                  setPicked(s.id);
                  setChanging(false);
                }}
              >
                <Store aria-hidden size={22} strokeWidth={1.5} className="shrink-0 text-ink" />
                <span>
                  <span className="block font-semibold">{s.label}</span>
                  <span className="block text-sm">{s.detail}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (phase.kind === "confirm") {
    const { offer } = phase.response;
    const conditions = [
      offer.min_spend ? `Minimum spend ${money(offer.min_spend)}` : null,
      offer.min_qty && offer.min_qty > 1 ? `Buy at least ${offer.min_qty}` : null,
      offer.max_people ? (offer.max_people === 1 ? "For 1 person" : `Up to ${offer.max_people} people`) : null,
      offer.limits_text,
    ].filter((c): c is string => Boolean(c));

    return (
      <FullScreen label="Check before you confirm">
        <div className="mx-auto grid w-full max-w-md gap-5 px-4 py-6">
          <p className="font-medium">Check the order, then confirm. Nothing is recorded until you do.</p>
          <section className={`rounded-sm border-[1.5px] border-ink p-5 ${TINT_BG[offer.stock_tint]}`}>
            <p className="offer-text inline-block bg-marigold px-2 pt-1.5 pb-1 text-5xl tabular">
              {formatOffer(offer.discount_type, offer.discount_value)}
            </p>
            <h2 className="mt-3 text-xl font-semibold">{offer.title}</h2>
            {offer.included_products && (
              <p className="mt-2">
                <span className="font-semibold">Applies to:</span> {offer.included_products}
              </p>
            )}
          </section>
          <section className="panel p-5" aria-labelledby="conditions-heading">
            <h3 id="conditions-heading" className="font-semibold">
              Check by eye
            </h3>
            {conditions.length ? (
              <ul className="mt-2 grid list-disc gap-1.5 pl-5 text-lg">
                {conditions.map((c) => (
                  <li key={c} className="tabular">
                    {c}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2">No minimum spend, quantity or party size.</p>
            )}
          </section>
          <p className="text-sm">Redeeming at {store.label}</p>
          {error && <FormMessage tone="error">{error}</FormMessage>}
          <div className="grid gap-3">
            <button type="button" className="btn min-h-14 text-lg" disabled={saving} onClick={() => confirm(phase.input)}>
              {saving ? "Confirming" : "Confirm redemption"}
            </button>
            <button type="button" className="btn btn-secondary min-h-14 text-lg" disabled={saving} onClick={backToScan}>
              Cancel
            </button>
          </div>
        </div>
      </FullScreen>
    );
  }

  if (phase.kind === "result") {
    const { response } = phase;
    if (response.result === "ok") {
      return (
        <FullScreen label="Redeemed" tone="success">
          <div className="mx-auto grid w-full max-w-md justify-items-center gap-4 px-4 py-10 text-center">
            <CheckCircle2 aria-hidden size={96} strokeWidth={1.5} className="text-ink" />
            <h2 className="wordmark text-5xl text-ink">Redeemed</h2>
            {response.offer && (
              <p className="text-xl">
                <span className="font-semibold tabular">{formatOffer(response.offer.discount_type, response.offer.discount_value)}</span>
                , {response.offer.title}
              </p>
            )}
            <p className="tabular">
              {store.label}
              {response.redeemed_at ? `, ${clock(response.redeemed_at)}` : ""}
            </p>
            <p>Apply the discount at the till.</p>
            <button type="button" className="btn mt-4 min-h-14 w-full text-lg" onClick={backToScan}>
              Scan next customer
            </button>
          </div>
        </FullScreen>
      );
    }
    const failure = VERIFY_FAILURES[response.result];
    return (
      <FullScreen label={failure.title} tone="failure">
        <div className="mx-auto grid w-full max-w-md justify-items-center gap-4 px-4 py-10 text-center">
          <XCircle aria-hidden size={96} strokeWidth={1.5} className="text-signal" />
          <h2 className="wordmark text-4xl text-signal">{failure.title}</h2>
          <p className="text-lg">
            {failure.body}
            {response.result === "already_used" && response.used_at ? ` It was redeemed at ${clock(response.used_at)}.` : ""}
          </p>
          {response.offer && (
            <p>
              Coupon: <span className="font-semibold tabular">{formatOffer(response.offer.discount_type, response.offer.discount_value)}</span>
              , {response.offer.title}
            </p>
          )}
          <p className="font-medium">Do not apply the discount.</p>
          <button type="button" className="btn mt-4 min-h-14 w-full text-lg" onClick={backToScan}>
            Scan again
          </button>
          {response.result === "location_not_found" && stores.length > 1 && (
            <button
              type="button"
              className="btn btn-secondary min-h-14 w-full text-lg"
              onClick={() => {
                backToScan();
                setChanging(true);
              }}
            >
              Change store
            </button>
          )}
        </div>
      </FullScreen>
    );
  }

  const cameraNote = camera === "starting" || camera === "on" ? null : CAMERA_NOTES[camera];
  const checking = phase.kind === "checking";

  return (
    <div className="mx-auto grid max-w-md gap-5 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="wordmark text-3xl text-ink">Scanner</h1>
          <p className="text-sm">At {store.label}</p>
        </div>
        {stores.length > 1 && (
          <button type="button" className="btn btn-secondary" onClick={() => setChanging(true)}>
            Change store
          </button>
        )}
      </div>

      {cameraNote && (
        <div className="panel flex gap-3 p-4">
          <CameraOff aria-hidden size={22} strokeWidth={1.5} className="mt-0.5 shrink-0 text-ink" />
          <p>{cameraNote}</p>
        </div>
      )}
      {/* Always in the page: the QR library attaches the camera to this element by id. */}
      <div className={cameraNote ? "hidden" : "grid gap-2"}>
        <div
          id={READER_ID}
          className="aspect-square w-full overflow-hidden rounded-sm border-[1.5px] border-ink bg-ink-deep [&_video]:h-full [&_video]:w-full [&_video]:object-cover"
        />
        <p className="text-sm" role="status">
          {checking ? "Checking the code" : camera === "on" ? "Point the camera at the customer's QR code." : "Starting the camera"}
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submitCode();
        }}
        noValidate className="panel grid gap-3 p-4">
        <label htmlFor="short-code" className="font-semibold">
          {cameraNote ? "Customer's 6-digit code" : "Or type the 6-digit code"}
        </label>
        <input
          id="short-code"
          inputMode="numeric"
          autoComplete="off"
          enterKeyHint="go"
          maxLength={7}
          placeholder="000 000"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="field-input offer-text min-h-14 text-center text-4xl tracking-widest tabular"
        />
        <button type="submit" className="btn min-h-12" disabled={checking}>
          {checking ? "Checking" : "Check code"}
        </button>
      </form>
      {error && <FormMessage tone="error">{error}</FormMessage>}
    </div>
  );
}

function FullScreen({
  label,
  tone = "neutral",
  children,
}: {
  label: string;
  tone?: "neutral" | "success" | "failure";
  children: ReactNode;
}) {
  const heading = useRef<HTMLDivElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const bg = tone === "success" ? "bg-stock-mint" : tone === "failure" ? "bg-white border-t-[10px] border-signal" : "bg-paper";
  return (
    <div
      ref={heading}
      tabIndex={-1}
      role={tone === "neutral" ? "dialog" : "alert"}
      aria-label={label}
      aria-modal={tone === "neutral" ? true : undefined}
      className={`fixed inset-0 z-50 overflow-y-auto outline-none ${bg}`}
    >
      {tone === "neutral" && (
        <div className="border-b-[1.5px] border-ink bg-white">
          <p className="mx-auto max-w-md px-4 py-4 text-xl font-semibold">{label}</p>
        </div>
      )}
      {children}
    </div>
  );
}
