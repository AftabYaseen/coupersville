import type { ReactNode } from "react";
import { CalendarClock, MapPin, ReceiptText } from "lucide-react";
import type { Enums } from "@/lib/supabase/database.types";

export type StockTint = Enums<"stock_tint">;

export type TicketProps = {
  tint: StockTint;
  offer: string;
  title: string;
  merchant?: string;
  description?: string;
  expiresAt?: Date | string;
  expiringSoon?: boolean;
  limits?: string;
  store?: string;
  children?: ReactNode;
  stubActions?: ReactNode;
  className?: string;
};

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

export function formatOffer(type: Enums<"discount_type">, value: number): string {
  if (type === "percent") return `${Number(value)}% OFF`;
  const amount = Number.isInteger(Number(value)) ? Number(value).toFixed(0) : Number(value).toFixed(2);
  return `$${amount} OFF`;
}

export function Ticket({
  tint,
  offer,
  title,
  merchant,
  description,
  expiresAt,
  expiringSoon = false,
  limits,
  store,
  children,
  stubActions,
  className,
}: TicketProps) {
  const expires = expiresAt ? new Date(expiresAt) : null;

  return (
    <article className={`ticket ${className ?? ""}`} data-tint={tint}>
      <div className="ticket-main px-5 pt-5 pb-6">
        {merchant && <p className="text-sm font-medium">{merchant}</p>}
        <p className="mt-2">
          <span className="offer-text inline-block bg-marigold px-2 pt-1.5 pb-1 text-[3rem] text-ink-deep tabular">
            {offer}
          </span>
        </p>
        <h3 className="mt-3 text-lg font-semibold leading-snug">{title}</h3>
        {description && <p className="mt-1 text-sm leading-relaxed">{description}</p>}
        {children}
      </div>

      <div className="ticket-stub px-5 pt-4 pb-4 text-sm">
        <dl className="grid gap-1.5">
          {expires && (
            <div className={`flex items-center gap-2 ${expiringSoon ? "font-semibold text-signal" : ""}`}>
              <CalendarClock aria-hidden size={16} strokeWidth={1.5} className={expiringSoon ? "text-signal" : "text-ink"} />
              <dt className="sr-only">Expires</dt>
              <dd className="tabular">
                {expiringSoon ? "Expiring soon, " : "Expires "}
                <time dateTime={expires.toISOString()}>{dateFormat.format(expires)}</time>
              </dd>
            </div>
          )}
          {limits && (
            <div className="flex items-start gap-2">
              <ReceiptText aria-hidden size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-ink" />
              <dt className="sr-only">Limits</dt>
              <dd>{limits}</dd>
            </div>
          )}
          {store && (
            <div className="flex items-start gap-2">
              <MapPin aria-hidden size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-ink" />
              <dt className="sr-only">Store</dt>
              <dd>{store}</dd>
            </div>
          )}
        </dl>
        {stubActions && <div className="mt-4">{stubActions}</div>}
      </div>
    </article>
  );
}
