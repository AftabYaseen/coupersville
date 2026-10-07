import Link from "next/link";
import { Ticket } from "@/components/ticket";

export default function Home() {
  return (
    <div className="mx-auto grid max-w-5xl gap-8 px-4 py-10 md:grid-cols-2 md:items-center">
      <div>
        <h1 className="wordmark text-4xl text-ink sm:text-5xl">Welcome to Coupersville</h1>
        <p className="mt-4 max-w-md text-lg">
          Coupons from the shops in your town. Save the ones you like, then show them at the counter.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/signup" className="btn">
            Create an account
          </Link>
          <Link href="/styleguide" className="btn btn-secondary">
            See the ticket style
          </Link>
        </div>
      </div>
      <Ticket
        tint="butter"
        merchant="Main Street Bakery"
        offer="20% OFF"
        title="Any loaf of sourdough"
        expiresAt="2026-12-31T23:59:00Z"
        limits="One per customer"
        store="12 Main Street"
      />
    </div>
  );
}
