import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { firstSeats, pioneerOffer, type PioneerOffer } from "@/lib/pioneer";
import { PioneerSeatsNote } from "@/components/pioneer-circle-content";

// The client's FAQ text (2026-11-11), in her words, grouped under her headings, with three answers
// corrected to match how the app works (shopper cost, accounts, redeeming) and fixed-price and free
// offers added to the coupon kinds. The Pioneer Circle name and seat count come from the offers
// table (cached for an hour), so the page stays static.

export const metadata: Metadata = {
  title: "Frequently asked questions",
  description: "Answers about Coupersville for shoppers and businesses: coupons, accounts, redeeming, membership and the Pioneer Circle.",
};

type Item = { q: string; a: ReactNode };
type Group = { id: string; title: string; items: Item[]; note?: ReactNode };

const A = ({ href, children }: { href: string; children: ReactNode }) => (
  <Link href={href} className="font-medium text-ink underline underline-offset-4">
    {children}
  </Link>
);

const List = ({ items }: { items: string[] }) => (
  <ul className="grid list-disc gap-1 pl-6">
    {items.map((i) => (
      <li key={i}>{i}</li>
    ))}
  </ul>
);

function groups(o: PioneerOffer): Group[] {
  const name = o.name;
  const first = firstSeats(o);
  return [
    {
      id: "about",
      title: "About Coupersville",
      items: [
        {
          q: "What is Coupersville?",
          a: (
            <>
              <p>Coupersville is a digital coupon community that connects shoppers with offers from participating businesses.</p>
              <p>
                Businesses can create and share coupons, promotions, and special offers, while shoppers get a convenient way to discover
                savings and businesses they may not have found before.
              </p>
            </>
          ),
        },
        {
          q: "Why was Coupersville created?",
          a: (
            <>
              <p>
                Coupersville was created around a simple idea: <strong>make it easier for businesses and shoppers to find each other.</strong>
              </p>
              <p>
                For merchants, that means another way to attract customers, promote products and services, and create offers that make
                sense for their business.
              </p>
              <p>For shoppers, it means discovering businesses, exploring offers, and finding more ways to save.</p>
            </>
          ),
        },
        {
          q: "Is Coupersville the same as Groupon?",
          a: (
            <>
              <p>No. Coupersville is designed as a merchant-to-shopper coupon platform rather than a traditional daily-deal model.</p>
              <p>Participating merchants create their own offers and use Coupersville as another way to reach and engage customers.</p>
            </>
          ),
        },
      ],
    },
    {
      id: "shoppers",
      title: "For shoppers",
      items: [
        { q: "Does it cost anything to use Coupersville as a shopper?", a: <p>No. Coupersville is free for shoppers.</p> },
        {
          q: "Do I need to create an account?",
          a: (
            <p>
              You can browse Coupersville without an account. To save or redeem a coupon, sign up with your email and a one-time code.
              No password needed.
            </p>
          ),
        },
        {
          q: "What kinds of coupons will I find?",
          a: (
            <>
              <p>Offers will vary by participating merchant and may include:</p>
              <List
                items={[
                  "Percentage discounts",
                  "Dollar-off offers",
                  "Fixed-price offers",
                  "Free items or services",
                  "Seasonal promotions",
                  "Product or service specials",
                  "Limited-time offers",
                  "New-customer promotions",
                  "Returning-customer offers",
                  "Other merchant-created specials",
                ]}
              />
              <p>
                Because merchants create their own coupons, <strong>new offers can appear regularly.</strong>
              </p>
            </>
          ),
        },
        {
          q: "Does Coupersville decide how much a business discounts?",
          a: <p>No. Participating businesses determine their own coupons, offers, terms, availability, and restrictions.</p>,
        },
        {
          q: "How do I redeem a coupon?",
          a: (
            <p>
              When you are at the business and ready, tap Get my coupon to create your one-time QR code, then show it to the staff to
              scan. Each coupon page lists its limits, locations and expiry date. <A href="/how-to-save">How to save</A> walks through
              each step.
            </p>
          ),
        },
        {
          q: "Can coupons expire?",
          a: (
            <>
              <p>
                Yes. Merchants may establish expiration dates, availability periods, exclusions, or other reasonable conditions for their
                offers.
              </p>
              <p>Always check the individual coupon before using it.</p>
            </>
          ),
        },
        {
          q: "Can I combine Coupersville coupons with other promotions?",
          a: <p>That depends on the participating business. Check the coupon terms or ask the merchant before purchase.</p>,
        },
        {
          q: "Who do I contact if I have a problem with a coupon?",
          a: (
            <>
              <p>
                If the issue concerns the merchant&apos;s product, service, availability, or application of the discount, the merchant
                should generally be your first point of contact.
              </p>
              <p>
                If you believe there is a problem with the Coupersville platform or the way a coupon is being displayed,{" "}
                <A href="/contact">let us know</A> so we can look into it.
              </p>
            </>
          ),
        },
      ],
    },
    {
      id: "businesses",
      title: "For businesses",
      items: [
        {
          q: "Who can become a Coupersville merchant?",
          a: (
            <>
              <p>Coupersville is designed for businesses interested in connecting with shoppers through coupons, promotions, and special offers.</p>
              <p>Different types and sizes of businesses may participate, subject to Coupersville&apos;s merchant requirements.</p>
            </>
          ),
        },
        {
          q: "Do I control my own coupons?",
          a: (
            <>
              <p>Yes. One of the guiding ideas behind Coupersville is giving merchants flexibility over their promotions.</p>
              <p>
                You decide what you&apos;re offering and can create promotions appropriate for your products, services, customers, and
                business goals.
              </p>
            </>
          ),
        },
        {
          q: "How often should I create new coupons?",
          a: (
            <>
              <p>Merchants are encouraged to keep their offers fresh.</p>
              <p>
                For businesses participating in the <A href="/pioneer-circle">{name}</A>, we ask for{" "}
                <strong>at least one new coupon each month during the introductory 12 months</strong>.
              </p>
            </>
          ),
        },
        {
          q: "Can I offer more than one coupon?",
          a: <p>Yes. Businesses can create additional offers when appropriate for their business and membership level.</p>,
        },
        {
          q: "Do my coupons have to run for an entire month?",
          a: (
            <>
              <p>No. Your promotions can reflect how your business actually operates.</p>
              <p>A coupon might be:</p>
              <List
                items={[
                  "A weekend special",
                  "A one-week promotion",
                  "A seasonal offer",
                  "A product-specific discount",
                  "A service promotion",
                  "A limited-time event offer",
                ]}
              />
              <p>The point is to create compelling reasons for shoppers to engage with your business.</p>
            </>
          ),
        },
        {
          q: "Am I required to offer a huge discount?",
          a: (
            <>
              <p>
                No. <strong>You know your business, margins, and customers better than anyone else.</strong>
              </p>
              <p>
                Coupersville is intended to give businesses a way to create meaningful promotions without requiring every merchant to use
                the same discount strategy.
              </p>
            </>
          ),
        },
        {
          q: "How much does it cost for businesses to join?",
          a: (
            <>
              <p>Coupersville offers merchant participation options, including special introductory opportunities associated with our launch.</p>
              <p>
                Current pricing and available plans will be displayed on the merchant registration and{" "}
                <A href="/business-membership">pricing pages</A> so businesses can see exactly what applies before joining.
              </p>
            </>
          ),
        },
      ],
    },
    {
      id: "pioneer-circle",
      title: `Coupersville ${name}`,
      note: <PioneerSeatsNote offer={o} />,
      items: [
        {
          q: `What is the Coupersville ${name}?`,
          a: (
            <>
              <p>
                The Coupersville {name} celebrates the <strong>{first} businesses</strong> that join us at the beginning and help shape
                what Coupersville will become.
              </p>
              <p>They&apos;re our early believers, early participants, and an important part of our story.</p>
              <p className="font-semibold">The {first}. The beginning of something bigger.</p>
              <p>
                <A href="/pioneer-circle">Read about the {name}</A>
              </p>
            </>
          ),
        },
        {
          q: "Why are Pioneers different from other Coupersville merchants?",
          a: (
            <>
              <p>Our Pioneers are helping us learn during Coupersville&apos;s introductory stage.</p>
              <p>
                We&apos;re asking them not only to participate as merchants, but also to tell us what works, what doesn&apos;t, and what
                we can do better.
              </p>
            </>
          ),
        },
        {
          q: "What do you ask Pioneer merchants to do?",
          a: (
            <>
              <p>During their introductory 12 months, we ask Pioneers to:</p>
              <ul className="grid list-disc gap-1 pl-6">
                <li>
                  Add at least <strong>one new coupon each month</strong>
                </li>
                <li>
                  Complete <strong>four brief surveys</strong>, approximately one per quarter
                </li>
                <li>Share honest, constructive feedback</li>
                <li>Let us know when something isn&apos;t working properly or could be improved</li>
                <li>Keep their basic merchant information reasonably current</li>
                <li>Allow us to recognize their business as part of the {name}</li>
              </ul>
              <p className="font-semibold">We want your perspective, not your labor.</p>
            </>
          ),
        },
        {
          q: "How long does the active Pioneer period last?",
          a: (
            <>
              <p>
                The introductory Pioneer experience lasts <strong>12 months</strong>.
              </p>
              <p>After completing that period, the monthly Pioneer coupon and survey expectations end.</p>
            </>
          ),
        },
        {
          q: "Will Pioneers have to attend meetings?",
          a: (
            <>
              <p>No regular meetings are required.</p>
              <p>
                We may occasionally invite Pioneers to preview a feature, answer a quick question, participate in a brief conversation, or
                share an idea, but those additional activities are voluntary.
              </p>
            </>
          ),
        },
        {
          q: "What happens if I miss a coupon or survey?",
          a: (
            <>
              <p>
                Life and business happen. <strong>One missed coupon or survey isn&apos;t a problem.</strong>
              </p>
              <p>If participation begins to slow down over time, we&apos;ll start with a conversation.</p>
              <p>Our goal is to understand what&apos;s happening and find a reasonable way forward together.</p>
            </>
          ),
        },
        {
          q: "Can I lose my Pioneer status?",
          a: (
            <>
              <p>We don&apos;t want participation to feel punitive.</p>
              <p>If active Pioneer participation no longer fits comfortably into your business, we&apos;ll talk about it first.</p>
              <p>
                If stepping back makes the most sense, you may transition to a special place in our Pioneer community as a{" "}
                <strong>Coupersville Honorary Pioneer</strong>.
              </p>
            </>
          ),
        },
        {
          q: "What is an Honorary Pioneer?",
          a: (
            <>
              <p>
                An <strong>Honorary Pioneer</strong> is a business that joined Coupersville in its earliest days but is no longer expected
                to maintain the active Pioneer coupon and survey schedule.
              </p>
              <p>You still matter to us.</p>
              <p>You were there at the beginning, and your business remains part of the Coupersville story.</p>
              <p className="font-semibold">Once a Pioneer, always part of the story.</p>
            </>
          ),
        },
        {
          q: "What happens to the open Active Pioneer opportunity?",
          a: (
            <>
              <p>Coupersville may welcome another business into an active Pioneer role.</p>
              <p>
                That doesn&apos;t replace or erase the Honorary Pioneer. It helps us maintain a group of actively participating businesses
                while continuing to honor those who were part of our beginning.
              </p>
            </>
          ),
        },
        {
          q: "What happens after I complete my 12-month Pioneer year?",
          a: (
            <>
              <p>Pioneers who remain actively engaged through their introductory year become members of the:</p>
              <p className="grid font-semibold text-ink">
                <span>Original Coupersville {name}</span>
                <span>One of the original {o.seats ?? "Pioneers"}</span>
              </p>
              <p>Your introductory commitments end, but your recognition doesn&apos;t.</p>
              <p className="font-semibold">You were here. You participated. You helped us learn. And you helped Coupersville begin.</p>
            </>
          ),
        },
      ],
    },
    {
      id: "privacy",
      title: "Privacy and marketing",
      items: [
        {
          q: "Will Coupersville use my business information in its marketing?",
          a: (
            <p>
              Coupersville may recognize participating Pioneer businesses using information such as the business name, logo, approved
              business profile, and business representative in connection with Coupersville and {name} promotions.
            </p>
          ),
        },
        {
          q: "Will you use my photograph or testimonial without asking?",
          a: (
            <p>
              Our Pioneer approach is to ask before using personal photographs, direct quotations, testimonials, or personal stories as
              endorsements.
            </p>
          ),
        },
        {
          q: "How does Coupersville handle personal information?",
          a: (
            <>
              <p>
                Coupersville maintains a <A href="/privacy">Privacy Notice</A> explaining the types of information collected, how that
                information is used, service providers involved in operating the platform, and the choices available to users.
              </p>
              <p>Because Coupersville is launching in phases, the Privacy Notice may be updated as the platform, features, and services evolve.</p>
            </>
          ),
        },
      ],
    },
  ];
}

export default async function FaqPage() {
  const offer = await pioneerOffer();
  const all = groups(offer);
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="wordmark text-4xl text-ink sm:text-5xl">Coupersville frequently asked questions</h1>

      <nav aria-label="Questions by topic" className="mt-6">
        <ul className="flex flex-wrap gap-2">
          {all.map((g) => (
            <li key={g.id}>
              <a
                href={`#${g.id}`}
                className="inline-flex min-h-11 items-center rounded-sm border-[1.5px] border-ink bg-white px-3 font-medium text-ink"
              >
                {g.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {all.map((g) => (
        <section key={g.id} id={g.id} className="mt-10 scroll-mt-6" aria-labelledby={`${g.id}-heading`}>
          <h2 id={`${g.id}-heading`} className="wordmark text-3xl text-ink">
            {g.title}
          </h2>
          {g.note && <div className="mt-4">{g.note}</div>}
          <div className="mt-4 grid gap-3">
            {g.items.map(({ q, a }) => (
              <details key={q} className="group panel">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 p-4 font-semibold [&::-webkit-details-marker]:hidden">
                  {q}
                  <ChevronDown aria-hidden size={20} strokeWidth={1.5} className="shrink-0 text-ink group-open:rotate-180" />
                </summary>
                <div className="grid gap-3 px-4 pb-4">{a}</div>
              </details>
            ))}
          </div>
        </section>
      ))}

      <section className="panel mt-12 grid gap-3 p-5 sm:p-6" aria-labelledby="still-heading">
        <h2 id="still-heading" className="wordmark text-3xl text-ink">
          Still have questions?
        </h2>
        <p>
          We&apos;re building Coupersville to be <strong>easy for shoppers, useful for merchants, and responsive to the people who use it.</strong>
        </p>
        <p>If something isn&apos;t clear, ask us.</p>
        <p>If something isn&apos;t working, tell us.</p>
        <p>
          If you have an idea, <strong>we&apos;d like to hear it.</strong>
        </p>
        <Link href="/contact" className="btn justify-self-start">
          Contact us
        </Link>
        <p className="mt-2 text-lg font-semibold text-ink">Welcome to Coupersville.</p>
        <p className="font-semibold">Discover more. Save more. Support more.</p>
      </section>
    </div>
  );
}
