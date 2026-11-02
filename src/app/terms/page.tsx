import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { TERMS } from "@/lib/legal/terms-text";

export const metadata: Metadata = {
  title: "Terms",
  description: "The terms for using Coupersville as a shopper or a business.",
};

export default function TermsPage() {
  return <LegalPage doc={TERMS} linkPrivacy />;
}
