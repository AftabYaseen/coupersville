import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageLoading } from "@/components/page-loading";
import { AcceptInviteButton } from "@/components/merchant/accept-invite-button";
import { signOut } from "@/app/(auth)/actions";

export const metadata: Metadata = { title: "Join a shop's team" };

export default function JoinPage({ params }: PageProps<"/join/[token]">) {
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <Suspense fallback={<PageLoading />}>
        <JoinContent params={params} />
      </Suspense>
    </div>
  );
}

async function JoinContent({ params }: { params: PageProps<"/join/[token]">["params"] }) {
  const { token } = await params;
  const supabase = await createClient();
  const [{ data }, user] = await Promise.all([
    /^[0-9a-f]{48}$/i.test(token) ? supabase.rpc("staff_invite_details", { p_token: token }) : Promise.resolve({ data: [] }),
    getSessionUser(),
  ]);
  const invite = data?.[0];

  if (!invite || invite.expired || invite.accepted) {
    return (
      <>
        <h1 className="wordmark text-4xl text-ink">Invite not available</h1>
        <p className="panel mt-6 p-5">
          {!invite
            ? "This invite link is not valid. Check you copied all of it, or ask the owner for a new one."
            : invite.accepted
              ? "This invite has already been used. If it was yours, open the scanner from the menu."
              : "This invite has expired. Ask the owner to send a new one."}
        </p>
        {invite?.accepted && user && (
          <Link href="/merchant/scan" className="btn mt-4">
            Open scanner
          </Link>
        )}
      </>
    );
  }

  const next = encodeURIComponent(`/join/${token}`);
  return (
    <>
      <h1 className="wordmark text-4xl text-ink">Join {invite.business_name}</h1>
      <p className="mt-3">
        {invite.business_name} invited {invite.masked_email} to their team on Coupersville. Staff use the store scanner to
        redeem shoppers&apos; coupons.
      </p>

      {user ? (
        <div className="mt-6 grid gap-4">
          <p className="text-sm">
            Signed in as <span className="font-medium break-all">{user.email}</span>.
          </p>
          <AcceptInviteButton token={token} businessName={invite.business_name} />
          <form action={signOut}>
            <button type="submit" className="btn btn-secondary w-full">
              Use a different account
            </button>
          </form>
        </div>
      ) : (
        <div className="mt-6 grid gap-3">
          <p>Sign in or create an account with the invited email to join.</p>
          <Link href={`/login?next=${next}`} className="btn">
            Sign in
          </Link>
          <Link href={`/signup?next=${next}`} className="btn btn-secondary">
            Create account
          </Link>
        </div>
      )}
    </>
  );
}
