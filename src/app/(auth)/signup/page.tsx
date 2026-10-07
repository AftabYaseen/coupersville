import type { Metadata } from "next";
import { Suspense } from "react";
import { SignupForm } from "@/components/auth/signup-form";

export const metadata: Metadata = { title: "Create an account" };

export default function SignupPage({ searchParams }: PageProps<"/signup">) {
  return (
    <>
      <h1 className="wordmark text-3xl text-ink">Create an account</h1>
      <p className="mt-2 mb-6">Browse freely. An account lets you save and redeem coupons.</p>
      <Suspense fallback={<SignupForm />}>
        <SignupFormWithParams searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function SignupFormWithParams({ searchParams }: { searchParams: PageProps<"/signup">["searchParams"] }) {
  const params = await searchParams;
  return <SignupForm defaultType={params.type === "merchant" ? "merchant" : "consumer"} />;
}
