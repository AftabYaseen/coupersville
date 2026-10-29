import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Account deleted", robots: { index: false } };

export default function AccountDeletedPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="wordmark text-4xl text-ink">Your account is deleted</h1>
      <p className="mt-4 text-lg">Thanks for shopping on Main Street. You are signed out, and your account is gone.</p>
      <p className="mt-2">You can still browse coupons, and sign up again any time.</p>
      <Link href="/" className="btn mt-6">
        Browse coupons
      </Link>
    </div>
  );
}
