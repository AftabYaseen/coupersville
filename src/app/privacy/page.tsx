import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What Coupersville collects, why, who else handles it, and how to delete your account.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy notice" updated="28 October 2026">
      <p>
        Coupersville is run by [legal name of the operating company], [address]. This notice explains what we collect when you use
        coupersville.com and what we do with it. Questions or requests: [privacy contact email].
      </p>

      <h2>What we collect from shoppers</h2>
      <ul>
        <li>Your email address, to sign you in and to send you sign-in codes and account emails.</li>
        <li>Your name, only if you choose to add one in Account.</li>
        <li>A password, only if you set one. It is stored as a one-way hash, never as text.</li>
        <li>The coupons you save.</li>
        <li>
          Redemption codes you start. An unused code is deleted one day after it expires. A code that was used stays with its
          redemption.
        </li>
        <li>Your redemptions: which coupon, at which store, and when.</li>
      </ul>
      <p>
        If you tap Near me, your browser shares your approximate location for that search only. We round it and do not save it to
        your account.
      </p>

      <h2>What we collect from businesses</h2>
      <ul>
        <li>The account owner&apos;s name, email and password hash, and the emails of staff they invite.</li>
        <li>Business details, store addresses, coupons, logos and images. Most of this is shown publicly to shoppers.</li>
        <li>Plan details: whether a plan is active, when it renews or ends, and our payment processor&apos;s reference numbers for it.</li>
      </ul>

      <h2>What businesses can see about shoppers</h2>
      <p>
        Nothing that identifies you. When staff scan your code they see the coupon and its limits. Businesses see how many times
        their coupons were redeemed, never your name or email.
      </p>

      <h2>No ad trackers</h2>
      <p>
        Coupersville has no advertising, analytics or tracking scripts, and does not sell or share your details for marketing.
        We use cookies only to keep you signed in. Fonts are served from our own site.
      </p>

      <h2>Who else handles your data</h2>
      <ul>
        <li>
          Supabase hosts our database and sign-in. Its sign-in logs record the IP address and browser details of each sign-in,
          kept for [retention period].
        </li>
        <li>Vercel hosts the website and keeps short-lived request logs.</li>
        <li>Resend sends our emails.</li>
        <li>
          A payment processor will take card payments from businesses. Card details will go straight to the processor and
          never reach Coupersville. [Processor name to follow.]
        </li>
      </ul>
      <p>
        To stop people abusing sign-in codes, we keep a scrambled (hashed) form of the email address and IP address of each code
        request for two days.
      </p>

      <h2>Deleting your account</h2>
      <p>
        You can delete your account at any time from <Link href="/account">Account</Link>, or ask us at [privacy contact email].
        Deleting removes your sign-in, name, saved coupons and unused codes. Redemptions are kept for the business&apos;s counts,
        with nothing that links them to you. Deleting a business account takes the business off Coupersville and cancels its
        plan at the end of the period already paid for. Our payment processor keeps its own billing records as the law requires.
      </p>

      <h2>Your rights</h2>
      <p>[Rights that apply in the regions Coupersville serves, and how to exercise them. To be written by the lawyer.]</p>

      <h2>Changes</h2>
      <p>If we change this notice, we will update the date at the top and [how account holders are told].</p>
    </LegalPage>
  );
}
