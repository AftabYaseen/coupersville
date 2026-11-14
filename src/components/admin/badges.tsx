import type { Enums } from "@/lib/supabase/database.types";

const BADGE = "inline-flex items-center rounded-sm border px-1.5 text-sm font-medium";

export function StatusBadge({ status }: { status: Enums<"business_status"> }) {
  if (status === "active") return <span className={`${BADGE} border-line bg-mint-100`}>Active</span>;
  if (status === "suspended") return <span className={`${BADGE} border-urgent bg-white text-urgent`}>Suspended</span>;
  return <span className={`${BADGE} border-line bg-cream-50`}>Setting up</span>;
}

export function PlanBadge({ source, active }: { source: Enums<"subscription_source"> | null; active: boolean }) {
  if (!source) return <span className={`${BADGE} border-line bg-white`}>No plan</span>;
  if (!active) return <span className={`${BADGE} border-urgent bg-white text-urgent`}>Plan ended</span>;
  return (
    <span className={`${BADGE} border-line bg-marigold-100`}>{source === "complimentary" ? "Complimentary" : "Paid plan"}</span>
  );
}
