import type { Enums } from "@/lib/supabase/database.types";

const BADGE = "inline-flex items-center rounded-sm border-[1.5px] px-1.5 text-sm font-medium";

export function StatusBadge({ status }: { status: Enums<"business_status"> }) {
  if (status === "active") return <span className={`${BADGE} border-ink bg-stock-mint`}>Active</span>;
  if (status === "suspended") return <span className={`${BADGE} border-signal bg-white text-signal`}>Suspended</span>;
  return <span className={`${BADGE} border-ink bg-paper`}>Setting up</span>;
}

export function PlanBadge({ source, active }: { source: Enums<"subscription_source"> | null; active: boolean }) {
  if (!source) return <span className={`${BADGE} border-ink bg-white`}>No plan</span>;
  if (!active) return <span className={`${BADGE} border-signal bg-white text-signal`}>Plan ended</span>;
  return (
    <span className={`${BADGE} border-ink bg-stock-butter`}>{source === "complimentary" ? "Complimentary" : "Paid plan"}</span>
  );
}
