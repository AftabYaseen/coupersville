import Image from "next/image";
import Link from "next/link";
import { Ticket } from "@/components/ticket";
import welcomeSign from "../../public/Img-1.jpeg";

export default function Home() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-10">
      <figure className="mx-auto w-full max-w-[827px] rounded-sm border-[1.5px] border-ink bg-white p-2 sm:p-3">
        <Image
          src={welcomeSign}
          alt="A wooden sign reading Welcome to Coupersville, Find Your Joy, Population: Growing Every Day, beside a tree-lined main street of shops."
          sizes="(max-width: 859px) calc(100vw - 3.5rem), 800px"
          className="h-auto w-full max-w-[800px]"
          preload
        />
      </figure>

      <div className="mt-10 grid gap-8 md:grid-cols-2 md:items-center">
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
          expiresAt="2026-12-31T12:00:00Z"
          limits="One per customer"
          store="12 Main Street"
        />
      </div>
    </div>
  );
}
