import type { Metadata } from "next";
import Link from "next/link";
import { ErrorTicket } from "@/components/error-ticket";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <ErrorTicket
      code="404"
      title="This page is not in town"
      actions={
        <>
          <Link href="/" className="btn">
            Go to the home page
          </Link>
          <Link href="/search" className="btn btn-secondary">
            Find a deal
          </Link>
        </>
      }
    >
      <p>The link may be old, or the address may have a typo. The deals are all still here.</p>
    </ErrorTicket>
  );
}
