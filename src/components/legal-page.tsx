import type { ReactNode } from "react";

// Shared frame for the privacy notice and terms. Both are drafts until the client's lawyer
// replaces them; the banner says so on the page, and [brackets] mark what they must fill in.
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p role="note" className="rounded-sm border-[1.5px] border-dashed border-signal bg-white px-4 py-3 text-sm">
        <strong className="font-semibold text-signal">Draft for legal review.</strong> This page describes how Coupersville works
        today. It is placeholder text until Coupersville&apos;s lawyer reviews it. Parts in [brackets] are still to be filled in.
      </p>
      <h1 className="wordmark mt-6 text-4xl text-ink">{title}</h1>
      <p className="mt-2 text-sm tabular">Last updated {updated}</p>
      <div className="legal mt-6 grid gap-4">{children}</div>
    </div>
  );
}
