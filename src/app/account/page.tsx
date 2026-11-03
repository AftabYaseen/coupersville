import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { signOut } from "@/app/(auth)/actions";
import { PageLoading } from "@/components/page-loading";
import { AccountNameForm } from "@/components/account-name-form";
import { DeleteAccount } from "@/components/delete-account";
import { ownedBusinesses } from "@/lib/account-deletion";

export const metadata: Metadata = { title: "Account", robots: { index: false } };

const ROLE_LABELS = { consumer: "Shopper", merchant: "Business", admin: "Admin" } as const;

export default function AccountPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <AccountContent />
    </Suspense>
  );
}

async function AccountContent() {
  const user = await requireUser("/account");

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <h1 className="wordmark text-4xl text-ink">Your account</h1>
      <div className="panel mt-6 p-5">
        <AccountNameForm name={user.fullName} />
      </div>
      <dl className="panel mt-4 grid gap-3 p-5">
        <div>
          <dt className="text-sm font-medium">Email</dt>
          <dd className="break-all">{user.email}</dd>
        </div>
        <div>
          <dt className="text-sm font-medium">Account type</dt>
          <dd>{ROLE_LABELS[user.role]}</dd>
        </div>
      </dl>
      <ul className="panel mt-6 grid p-2">
        <li>
          <Link href="/saved" className="flex min-h-11 items-center px-3 font-medium text-ink">
            Saved coupons
          </Link>
        </li>
        <li>
          <Link href="/history" className="flex min-h-11 items-center px-3 font-medium text-ink">
            Redemption history
          </Link>
        </li>
      </ul>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/reset-password" className="btn btn-secondary">
          Change password
        </Link>
        <form action={signOut}>
          <button type="submit" className="btn">
            Sign out
          </button>
        </form>
      </div>
      {user.role !== "admin" && (
        <section className="mt-10 border-t-[1.5px] border-ink pt-6" aria-labelledby="delete-heading">
          <h2 id="delete-heading" className="text-xl font-semibold">
            Delete account
          </h2>
          <p className="mt-1 mb-4">Remove your account and the details we keep about you.</p>
          <DeleteAccount consequences={await deletionConsequences(user.id)} />
        </section>
      )}
    </div>
  );
}

async function deletionConsequences(userId: string): Promise<string[]> {
  const owned = await ownedBusinesses(userId);
  const lines = [
    "Your sign-in, your name and your saved coupons are deleted.",
    "Coupons you have redeemed stay in the shop's counts, with nothing that links them to you.",
  ];
  for (const business of owned) {
    lines.push(`${business.name} is taken off Coupersville: its coupons are hidden, its staff can no longer use the scanner, and its contact email, phone, website and staff invitations are removed.`);
    if (business.paidPlan) {
      lines.push(`The ${business.name} plan is cancelled. It is not renewed, and you are not charged again.`);
    }
  }
  return lines;
}
