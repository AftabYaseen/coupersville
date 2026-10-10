import type { Metadata } from "next";
import { Suspense } from "react";
import { headers } from "next/headers";
import { requireManagedBusiness } from "@/lib/merchant";
import { formatDay } from "@/lib/dates";
import { PageLoading } from "@/components/page-loading";
import { CancelInviteButton, CopyLinkButton, InviteStaffForm, RemoveStaffButton } from "@/components/merchant/staff-controls";

export const metadata: Metadata = { title: "Staff" };

export default function StaffPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <StaffContent />
    </Suspense>
  );
}

async function siteOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

function isPending(invite: { expires_at: string }, now: number) {
  return new Date(invite.expires_at).getTime() > now;
}

function clockNow() {
  return Date.now();
}

async function StaffContent() {
  const { business, role, supabase } = await requireManagedBusiness("/merchant/staff");

  if (role !== "owner") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="wordmark text-4xl text-ink">Staff</h1>
        <p className="panel mt-6 p-5">Only the business owner can invite or remove staff.</p>
      </div>
    );
  }

  const [{ data: team }, { data: invites }, origin] = await Promise.all([
    supabase.rpc("business_team", { p_business_id: business.id }),
    supabase
      .from("staff_invites")
      .select("id, email, token, created_at, expires_at")
      .eq("business_id", business.id)
      .is("accepted_at", null)
      .order("created_at", { ascending: false }),
    siteOrigin(),
  ]);
  const now = clockNow();
  const tz = business.timezone;
  const members = team ?? [];
  const waiting = invites ?? [];

  return (
    <div className="mx-auto grid max-w-3xl gap-8 px-4 py-10">
      <div>
        <h1 className="wordmark text-4xl text-ink">Staff</h1>
        <p className="mt-2">Staff can open the scanner to redeem coupons. They cannot see or change anything else.</p>
      </div>

      <section className="panel p-5" aria-labelledby="invite-heading">
        <h2 id="invite-heading" className="text-xl font-semibold">
          Invite staff
        </h2>
        <p className="mt-1 text-sm">
          You get a link to send them. They sign in or create an account with this email, then open the link to join.
        </p>
        <div className="mt-4">
          <InviteStaffForm />
        </div>
      </section>

      <section aria-labelledby="pending-heading">
        <h2 id="pending-heading" className="text-xl font-semibold">
          Waiting to join
        </h2>
        {waiting.length === 0 ? (
          <p className="mt-2">No invites waiting.</p>
        ) : (
          <ul className="mt-3 grid gap-3">
            {waiting.map((inv) => {
              const pending = isPending(inv, now);
              return (
                <li key={inv.id} className="panel grid gap-3 p-4 sm:flex sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold break-all">{inv.email}</p>
                    <p className={`text-sm tabular ${pending ? "" : "text-signal"}`}>
                      {pending
                        ? `Invited ${formatDay(inv.created_at, tz)}, link works until ${formatDay(inv.expires_at, tz)}`
                        : `Link expired ${formatDay(inv.expires_at, tz)}. Cancel it and invite again.`}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {pending && <CopyLinkButton url={`${origin}/join/${inv.token}`} />}
                    <CancelInviteButton inviteId={inv.id} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="team-heading">
        <h2 id="team-heading" className="text-xl font-semibold">
          Your team
        </h2>
        <ul className="mt-3 grid gap-3">
          {members.map((m) => (
            <li key={m.member_id} className="panel grid gap-3 p-4 sm:flex sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-semibold">
                  {m.full_name ?? m.email}
                  <span className="ml-2 text-sm font-medium">
                    {m.role === "owner" ? "Owner" : m.role === "manager" ? "Manager" : "Staff"}
                  </span>
                </p>
                <p className="text-sm break-all">{m.email}</p>
                <p className="text-sm tabular">Joined {formatDay(m.joined_at, tz)}</p>
              </div>
              {m.role === "staff" && <RemoveStaffButton memberId={m.member_id} name={m.full_name ?? m.email} />}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
