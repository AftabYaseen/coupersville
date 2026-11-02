import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { PRIVACY } from "@/lib/legal/privacy-text";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What Coupersville collects, why, who else handles it, and how to delete your account.",
};

export default function PrivacyPage() {
  return <LegalPage doc={PRIVACY} />;
}
