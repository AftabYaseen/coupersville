import type { Metadata } from "next";
import { Suspense } from "react";
import { getSessionUser } from "@/lib/auth";
import { NewPasswordForm } from "@/components/auth/new-password-form";
import { ResetRequestForm } from "@/components/auth/reset-request-form";

export const metadata: Metadata = { title: "Reset password" };

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<p>Loading</p>}>
      <ResetPasswordContent />
    </Suspense>
  );
}

// Arriving from a reset email signs the user in, so a session means "choose a new password".
async function ResetPasswordContent() {
  const user = await getSessionUser();

  if (user) {
    return (
      <>
        <h1 className="wordmark text-3xl text-ink">Choose a new password</h1>
        <p className="mt-2 mb-6">You will use it the next time you sign in.</p>
        <NewPasswordForm />
      </>
    );
  }

  return (
    <>
      <h1 className="wordmark text-3xl text-ink">Reset your password</h1>
      <p className="mt-2 mb-6">
        Enter the email address connected to your business account. We will send instructions for creating a new password.
      </p>
      <ResetRequestForm />
    </>
  );
}
