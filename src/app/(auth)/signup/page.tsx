import type { Metadata } from "next";
import { Suspense } from "react";
import { listActiveCategories } from "@/lib/merchant";
import { SignupForm } from "@/components/auth/signup-form";
import { MerchantSignupForm } from "@/components/auth/merchant-signup-form";

export const metadata: Metadata = {
  title: "Join Coupersville",
  description: "Open your door in Coupersville. Create your business account to publish digital coupons for your stores.",
};

export default function SignupPage({ searchParams }: PageProps<"/signup">) {
  return (
    <Suspense fallback={<p>Loading</p>}>
      <SignupContent searchParams={searchParams} />
    </Suspense>
  );
}

async function SignupContent({ searchParams }: { searchParams: PageProps<"/signup">["searchParams"] }) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;

  if (params.type === "merchant") {
    const categories = await listActiveCategories();
    return (
      <>
        <h1 className="wordmark text-3xl text-ink">Open your door in Coupersville.</h1>
        <p className="mt-2 mb-8">
          Join a growing community of businesses giving customers more reasons to discover, visit and return. Start by creating your
          business account.
        </p>
        <MerchantSignupForm categories={categories.map((c) => ({ id: c.id, name: c.name }))} />
      </>
    );
  }

  return (
    <>
      <h1 className="wordmark text-3xl text-ink">Create an account</h1>
      <p className="mt-2 mb-6">Browse freely. An account lets you save and redeem coupons.</p>
      <SignupForm next={next} />
    </>
  );
}
