"use client";

import Link from "next/link";
import { ErrorTicket } from "@/components/error-ticket";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <ErrorTicket
      code="Oops"
      title="Something went wrong"
      actions={
        <>
          <button type="button" className="btn" onClick={() => retry()}>
            Try again
          </button>
          <Link href="/" className="btn btn-secondary">
            Go to the home page
          </Link>
        </>
      }
    >
      <p>This page did not load. It is usually a short hiccup, so try again in a moment.</p>
      {error.digest && <p className="text-sm tabular">If it keeps happening, tell us this reference: {error.digest}</p>}
    </ErrorTicket>
  );
}
