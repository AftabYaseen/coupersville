"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Mail, X } from "lucide-react";
import { requestSignInCode, verifySignInCode } from "@/app/(auth)/code-actions";

type Props = {
  open: boolean;
  // Shown at the top, for example "Sign in to save this coupon".
  title: string;
  // Where the password option should come back to.
  returnPath: string;
  onClose: () => void;
  // Runs straight after a successful sign-in, so the save or redeem carries on.
  onSignedIn: () => void;
};

// A sheet from the bottom of the screen: email, then the code from that email.
export function SignInSheet({ open, title, returnPath, onClose, onSignedIn }: Props) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [usePassword, setUsePassword] = useState(false);
  const [pending, startTransition] = useTransition();
  const headingId = useId();
  const firstField = useRef<HTMLInputElement>(null);
  const codeField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) (step === "email" ? firstField : codeField).current?.focus();
  }, [open, step]);

  if (!open) return null;

  function sendCode() {
    setError(null);
    setUsePassword(false);
    startTransition(async () => {
      const result = await requestSignInCode({ email });
      if (!result.ok) {
        setError(result.error);
        setUsePassword(Boolean(result.usePassword));
        return;
      }
      setCode("");
      setStep("code");
    });
  }

  function checkCode() {
    setError(null);
    startTransition(async () => {
      const result = await verifySignInCode({ email, code });
      if (!result.ok) {
        setError(result.error);
        setUsePassword(Boolean(result.usePassword));
        return;
      }
      onSignedIn();
    });
  }

  const passwordHref = `/login?next=${encodeURIComponent(returnPath)}`;

  // Rendered into <body>: the buttons that open it sit inside the ticket stub, whose CSS mask
  // (the notches) would otherwise clip the sheet.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-evergreen-900/40 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="w-full max-w-md rounded-t-sm border border-line bg-white p-5 pb-8 sm:rounded-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={headingId} className="text-xl font-semibold">
            {title}
          </h2>
          <button type="button" className="-m-2 inline-flex size-11 items-center justify-center text-primary" onClick={onClose}>
            <X aria-hidden size={22} strokeWidth={1.5} />
            <span className="sr-only">Close</span>
          </button>
        </div>

        {step === "email" ? (
          <form
            className="mt-4 grid gap-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              sendCode();
            }}
          >
            <p>We will email you a sign-in code. No password needed.</p>
            <div>
              <label htmlFor={`${headingId}-email`} className="field-label">
                Email
              </label>
              <input
                ref={firstField}
                id={`${headingId}-email`}
                type="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="field-input"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? `${headingId}-error` : undefined}
              />
              {error && (
                <p id={`${headingId}-error`} className="field-error" role="alert">
                  {error}
                </p>
              )}
            </div>
            <button type="submit" className="btn w-full" disabled={pending || !email}>
              <Mail aria-hidden size={18} strokeWidth={1.5} />
              {pending ? "Sending code" : "Email me a code"}
            </button>
          </form>
        ) : (
          <form
            className="mt-4 grid gap-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              checkCode();
            }}
          >
            <p>
              We sent a code to <span className="font-medium break-all">{email}</span>. It may take a minute to arrive.
            </p>
            <div>
              <label htmlFor={`${headingId}-code`} className="field-label">
                Code from the email
              </label>
              <input
                ref={codeField}
                id={`${headingId}-code`}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={12}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="field-input offer-text text-center text-3xl tracking-widest tabular"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? `${headingId}-error` : undefined}
              />
              {error && (
                <p id={`${headingId}-error`} className="field-error" role="alert">
                  {error}
                </p>
              )}
            </div>
            <button type="submit" className="btn w-full" disabled={pending || !/^\d{6,10}$/.test(code.replace(/\s/g, ""))}>
              {pending ? "Checking" : "Continue"}
            </button>
            <div className="flex flex-wrap justify-between gap-2 text-sm">
              <button type="button" className="min-h-11 font-medium text-primary underline underline-offset-4" onClick={sendCode} disabled={pending}>
                Send a new code
              </button>
              <button
                type="button"
                className="min-h-11 font-medium text-primary underline underline-offset-4"
                onClick={() => {
                  setStep("email");
                  setError(null);
                }}
              >
                Use a different email
              </button>
            </div>
          </form>
        )}

        <p className="mt-4 text-sm">
          {usePassword ? "" : "Have a password? "}
          <Link href={passwordHref} className="font-medium text-primary underline underline-offset-4">
            Sign in with your password
          </Link>
        </p>
        <p className="mt-3 text-sm">
          New here? Signing in makes a free shopper account. See our{" "}
          <Link href="/terms" target="_blank" className="font-medium text-primary underline underline-offset-4">
            terms<span className="sr-only"> (opens in a new tab)</span>
          </Link>{" "}
          and{" "}
          <Link href="/privacy" target="_blank" className="font-medium text-primary underline underline-offset-4">
            privacy notice<span className="sr-only"> (opens in a new tab)</span>
          </Link>
          .
        </p>
      </div>
    </div>,
    document.body,
  );
}
