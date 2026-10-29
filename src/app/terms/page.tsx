import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Terms",
  description: "The terms for using Coupersville as a shopper or a business.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use" updated="28 October 2026">
      <p>
        These terms cover your use of coupersville.com, run by [legal name of the operating company] (&quot;Coupersville&quot;,
        &quot;we&quot;). By creating an account you agree to them. How we handle personal details is in our{" "}
        <Link href="/privacy">privacy notice</Link>.
      </p>

      <h2>Shoppers</h2>
      <ul>
        <li>Browsing is open to everyone. Saving and redeeming coupons needs a free shopper account.</li>
        <li>
          Each coupon is offered by the business that published it, on the rules it shows: dates, days and hours, limits per
          customer, minimum spend and stores. The business decides at its counter whether a purchase qualifies.
        </li>
        <li>Redemption codes work once, for a few minutes, and only for the account that started them. Do not share or copy them.</li>
        <li>Coupons have no cash value unless the business says otherwise. [Further consumer terms from the lawyer.]</li>
      </ul>

      <h2>Businesses</h2>
      <ul>
        <li>You must be allowed to act for the business you add, and keep its details accurate.</li>
        <li>
          You are responsible for your coupons and for honouring them on the terms you publish, while they are live and for
          codes your staff accept.
        </li>
        <li>
          Coupons go live without approval. Coupersville can remove a coupon or suspend a business that breaks these terms or
          misleads shoppers. A removed coupon can be edited but not republished by you.
        </li>
        <li>
          Publishing needs an active plan. Paid plans renew each year until cancelled and are billed by Stripe. If a plan ends,
          your coupons are hidden until you start a plan again. [Pricing, refunds and cancellation terms to follow once pricing
          is confirmed.]
        </li>
        <li>Staff you invite can use your scanner only. You are responsible for who you invite.</li>
      </ul>

      <h2>Accounts</h2>
      <ul>
        <li>Keep your sign-in details to yourself. Tell us at [support contact email] if you think someone else is using your account.</li>
        <li>You can delete your account at any time from Account. We may suspend accounts that abuse the service.</li>
      </ul>

      <h2>The service</h2>
      <p>
        [Availability, liability, disclaimers, governing law and dispute terms. To be written by the lawyer.]
      </p>

      <h2>Changes</h2>
      <p>If we change these terms, we will update the date at the top and [how account holders are told].</p>
    </LegalPage>
  );
}
