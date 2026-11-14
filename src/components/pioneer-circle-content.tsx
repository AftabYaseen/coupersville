import type { ReactNode } from "react";
import Link from "next/link";
import { Info } from "lucide-react";
import { firstSeats, seatsNote, type PioneerOffer } from "@/lib/pioneer";

// The client's Pioneer Circle text (2026-11-11), in her words, with headings in sentence case. The
// level name and the number of seats come from the offers table. Expectations, not an agreement:
// nothing to sign and nothing to tick. Shared by /pioneer-circle and the welcome step after setup.

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="mt-10" aria-labelledby={id}>
      <h2 id={id} className="wordmark text-3xl text-primary">
        {title}
      </h2>
      <div className="mt-3 grid gap-3">{children}</div>
    </section>
  );
}

function Sub({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="panel grid gap-3 p-5">
      <h3 className="text-xl font-semibold">{title}</h3>
      {children}
    </div>
  );
}

const Motto = ({ children }: { children: ReactNode }) => <p className="text-lg font-semibold text-primary">{children}</p>;

const List = ({ items }: { items: string[] }) => (
  <ul className="grid list-disc gap-1 pl-6">
    {items.map((i) => (
      <li key={i}>{i}</li>
    ))}
  </ul>
);

// Our factual note, kept apart from the client's text: how the places and the complimentary year fit
// together, with numbers from the offers table. Used on /pioneer-circle and in the FAQ.
export function PioneerSeatsNote({ offer }: { offer: PioneerOffer }) {
  const note = seatsNote(offer);
  if (!note) return null;
  return (
    <aside aria-label={`${offer.name} places`} className="flex gap-3 rounded-sm border border-line bg-sky-100 p-4">
      <Info aria-hidden size={20} strokeWidth={1.5} className="mt-0.5 shrink-0 text-primary" />
      <p>
        {note}{" "}
        <Link href="/business-membership" className="font-medium text-primary underline underline-offset-4">
          See membership and pricing
        </Link>
      </p>
    </aside>
  );
}

// `seatsNote` adds our note under the tagline (the public page); the welcome step leaves it out.
export function PioneerCircleContent({ offer, seatsNote: withNote = false }: { offer: PioneerOffer; seatsNote?: boolean }) {
  const name = offer.name;
  const first = firstSeats(offer);
  const tagline = `The ${first}. The beginning of something bigger.`;
  return (
    <>
      <h1 className="wordmark text-4xl text-primary sm:text-5xl">Coupersville {name}</h1>
      <p className="mt-2 text-xl font-semibold text-primary">{tagline}</p>
      {withNote && (
        <div className="mt-5">
          <PioneerSeatsNote offer={offer} />
        </div>
      )}

      <Section id="pioneer-welcome" title={`Welcome to the ${name}`}>
        <p>
          The <strong>Coupersville {name}</strong> celebrates the {first} businesses that join us at the beginning and help shape what
          Coupersville will become.
        </p>
        <p>
          Our Pioneers are early believers, early participants, and an important part of the Coupersville story. During their
          introductory 12 months, we ask them to help us keep Coupersville active, useful, and growing.
        </p>
        <p>
          There is <strong>nothing to sign</strong>. We simply want every business joining the {name} to understand what being an
          active Pioneer looks like.
        </p>
        <p className="rounded-sm border border-line bg-marigold-100 p-4 font-semibold">
          We don&apos;t expect perfection. We ask for participation, honest feedback, and communication.
        </p>
      </Section>

      <Section id="pioneer-asks" title="What we ask of our Pioneers">
        <Sub title="Be an active Coupersville business">
          <p>Complete your merchant profile and keep your basic business and contact information reasonably current.</p>
        </Sub>
        <Sub title="Keep the coupons coming">
          <p>
            Add <strong>at least one new coupon each month</strong> during your introductory 12 months.
          </p>
          <p>
            Your offers can be as creative and flexible as your business. They might be seasonal, short-term, weekend-only,
            product-specific, service-specific, or something entirely new.
          </p>
          <p>
            The goal is simple: <strong>keep Coupersville fresh, active, and interesting for shoppers.</strong>
          </p>
        </Sub>
        <Sub title="Share your experience">
          <p>
            Complete <strong>four brief Pioneer surveys</strong> during your introductory 12 months, approximately one each quarter.
          </p>
          <p>We&apos;ll keep them short and focused.</p>
          <Motto>We want your perspective, not paperwork.</Motto>
        </Sub>
        <Sub title="Tell us what you really think">
          <p>We want honest, helpful feedback about your Coupersville experience, including:</p>
          <List
            items={[
              "How Coupersville looks and feels",
              "Ease of use and navigation",
              "Features and functionality",
              "The merchant experience",
              "The shopper experience",
              "Things you enjoy",
              "Things you don't find particularly useful",
              "Anything confusing or frustrating",
              "Ideas that could make Coupersville better",
            ]}
          />
          <p>
            Positive feedback is always appreciated, but <strong>constructive criticism is just as valuable.</strong>
          </p>
        </Sub>
        <Sub title="Help us catch what we miss">
          <p>
            If you notice a significant glitch, confusing process, inaccurate information, or something that simply isn&apos;t working
            as expected, let us know when it&apos;s convenient.
          </p>
          <p>There are no formal reports required.</p>
          <Motto>See something? Tell us.</Motto>
        </Sub>
        <Sub title="Let us celebrate our Pioneers">
          <p>We want people to know about the businesses that believed in Coupersville from the beginning.</p>
          <p>
            Coupersville may recognize Pioneer businesses using their{" "}
            <strong>business name, logo, approved business profile, and the name of the business representative</strong> in
            connection with the {name} and Coupersville promotional activities.
          </p>
          <p>
            We&apos;ll ask before using personal photographs, direct quotations, testimonials, or personal stories as endorsements.
          </p>
        </Sub>
        <Sub title="Sometimes we'll ask, but you can always say no">
          <p>From time to time, we may invite our Pioneers to:</p>
          <List
            items={[
              "Take an early look at a new feature",
              "Give us a quick opinion",
              "Join a brief conversation",
              "Share an idea",
              "Tell us what they think about something we're considering",
            ]}
          />
          <p>
            These additional opportunities are <strong>completely voluntary</strong>.
          </p>
          <p>
            Pioneers aren&apos;t expected to attend regular meetings, participate in focus groups, recruit other merchants, promote
            Coupersville through their personal social media, or take on work for Coupersville.
          </p>
          <Motto>We want your perspective, not your labor.</Motto>
        </Sub>
      </Section>

      <Section id="pioneer-from-us" title="What you can expect from us">
        <p>Being a Pioneer is a two-way relationship.</p>
        <p>Coupersville will make reasonable efforts to:</p>
        <List
          items={[
            "Keep surveys and feedback requests brief and meaningful.",
            "Listen carefully to what our Pioneers tell us.",
            "Respect the time it takes to run a business.",
            "Communicate openly as Coupersville grows.",
            "Give Pioneers opportunities to help influence the early Coupersville experience.",
            "Recognize the special role our Pioneers played in helping us begin.",
          ]}
        />
        <p>
          And, most importantly, we&apos;ll remember that <strong>you&apos;re running your business, not ours.</strong>
        </p>
      </Section>

      <Section id="pioneer-life" title="When life and business happen">
        <p>We understand.</p>
        <p>A busy month happens. A survey gets overlooked. Staffing changes. Someone gets sick. Priorities shift.</p>
        <Motto>One missed coupon or survey isn&apos;t a problem.</Motto>
        <p>If we notice that participation has slowed down or that several Pioneer activities have been missed, we&apos;ll reach out.</p>
        <p>
          The first step is simply <strong>a conversation</strong>.
        </p>
        <p>Maybe you need a little extra time.</p>
        <p>Maybe circumstances have temporarily changed.</p>
        <p>Maybe there&apos;s an easier way for you to participate.</p>
        <p>We&apos;ll talk about it before making any changes.</p>
      </Section>

      <Section id="pioneer-honorary" title={`A special place in the ${name}`}>
        <p>
          Sometimes businesses change, priorities shift, and the time available to participate simply isn&apos;t what it was at the
          beginning.
        </p>
        <p>
          If an active Pioneer finds that monthly coupons, surveys, or other Pioneer activities no longer fit comfortably into the
          business, <strong>that&apos;s okay.</strong>
        </p>
        <p>We&apos;ll start with a conversation and see what makes sense.</p>
        <p>If stepping back is the best choice, the business can transition to a special place in our Pioneer community as a:</p>
        <div className="grid gap-3 rounded-sm border border-line bg-sky-100 p-5">
          <h3 className="text-2xl font-semibold text-primary">Coupersville Honorary Pioneer</h3>
          <p className="font-semibold">Always part of our beginning</p>
          <p>
            An Honorary Pioneer is a business that joined Coupersville in its earliest days and will always be recognized as part of
            the community that helped us get started.
          </p>
          <p>
            Honorary Pioneers are no longer asked to keep up with the monthly coupon or survey schedule, but{" "}
            <strong>their place in the Coupersville story remains.</strong>
          </p>
          <p>
            This also gives Coupersville the opportunity to welcome another business into an active Pioneer role, helping us keep the
            Pioneer community engaged, growing, and full of new energy and ideas.
          </p>
          <p>Becoming an Honorary Pioneer isn&apos;t losing your place in the Circle.</p>
          <p className="font-semibold">It&apos;s simply a different way of being part of it.</p>
          <p>We&apos;re grateful you were here at the beginning, and we&apos;re happy to keep you as part of the Coupersville Pioneer community.</p>
        </div>
        <Motto>Once a Pioneer, always part of the story.</Motto>
      </Section>

      <Section id="pioneer-new-active" title="Welcoming a new active Pioneer">
        <p>
          When an active Pioneer transitions to Honorary Pioneer status, Coupersville may invite another business to join as a{" "}
          <strong>new Active Pioneer</strong>.
        </p>
        <p>The purpose isn&apos;t to replace or erase anyone.</p>
        <p>It&apos;s to keep an active group of businesses participating, sharing coupons, offering feedback, and helping Coupersville grow.</p>
        <p>
          The original Pioneer keeps their place in our history as an <strong>Honorary Pioneer</strong>, while another business gets
          the opportunity to contribute actively to the next stage of Coupersville&apos;s journey.
        </p>
        <p>This gives us the best of both worlds:</p>
        <Motto>We honor the businesses that helped us begin while continuing to welcome businesses that are ready to help us grow.</Motto>
      </Section>

      <Section id="pioneer-year" title="Completing your Pioneer year">
        <p>Pioneers who remain actively engaged through their introductory 12 months become part of the:</p>
        <div className="grid gap-1 rounded-sm border border-line bg-marigold-100 p-5">
          <p className="text-2xl font-semibold text-primary">Original Coupersville {name}</p>
          <p className="font-semibold">One of the original {offer.seats ?? "Pioneers"}</p>
        </div>
        <p>At that point, the introductory monthly coupon and survey expectations come to an end.</p>
        <p>But the recognition doesn&apos;t.</p>
        <p className="grid text-lg font-semibold text-primary">
          <span>You were here.</span>
          <span>You participated.</span>
          <span>You shared your voice.</span>
          <span>You helped us learn.</span>
          <span>And you helped Coupersville begin.</span>
        </p>
        <p>We think that&apos;s worth remembering.</p>
      </Section>

      <Section id="pioneer-spirit" title="The Pioneer spirit">
        <p>Being a Coupersville Pioneer isn&apos;t about being perfect.</p>
        <p>
          It&apos;s about <strong>showing up, participating, communicating, and helping us build something worth coming back to.</strong>
        </p>
        <p>We&apos;ll do our part to listen.</p>
        <p>We&apos;ll keep the asks reasonable.</p>
        <p>We&apos;ll respect your time.</p>
        <p>And we&apos;ll remember the businesses that believed in Coupersville when it was just getting started.</p>
      </Section>

      <div className="panel mt-10 grid gap-1 p-5">
        <p className="wordmark text-2xl text-primary">Coupersville {name}</p>
        <p className="font-semibold">{tagline}</p>
        <p className="font-semibold">Once a Pioneer, always part of the story.</p>
      </div>
    </>
  );
}
