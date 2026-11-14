import type { Metadata } from "next";
import { Suspense } from "react";
import { siteContact } from "@/lib/site-contact";
import { ContactForm } from "@/components/contact-form";

export const metadata: Metadata = {
  title: "Contact",
  description: "Questions about a deal, a business account or a Coupersville membership? Send us a message.",
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="wordmark text-4xl text-primary sm:text-5xl">How can we help?</h1>
      <p className="mt-3 text-lg">
        Whether you are looking for a deal, managing a business account or considering a Coupersville membership, send us a message
        and choose the topic that best matches your question.
      </p>
      <div className="mt-6">
        <ContactForm />
      </div>
      <Suspense fallback={null}>
        <DirectEmail />
      </Suspense>
    </div>
  );
}

async function DirectEmail() {
  const { email } = await siteContact();
  return (
    <p className="mt-6 text-sm">
      You can also email us at{" "}
      <a href={`mailto:${email}`} className="font-medium text-primary underline underline-offset-4">
        {email}
      </a>
      .
    </p>
  );
}
