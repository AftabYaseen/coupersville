import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { signOut } from "@/app/(auth)/actions";
import { PageLoading } from "@/components/page-loading";

export const metadata: Metadata = { title: "Account" };

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
      <dl className="panel mt-6 grid gap-3 p-5">
        <div>
          <dt className="text-sm font-medium">Name</dt>
          <dd>{user.fullName ?? "Not set"}</dd>
        </div>
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
    </div>
  );
}
