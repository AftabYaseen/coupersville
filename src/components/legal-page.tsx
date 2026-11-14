import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import type { LegalDoc } from "@/lib/legal/types";

// Email addresses become mail links, and a mention of the Privacy Notice links to it.
function linkify(text: string, linkPrivacy: boolean): ReactNode {
  const pattern = linkPrivacy ? /([\w.+-]+@[\w-]+\.[\w.]+\w|Coupersville Privacy Notice)/g : /([\w.+-]+@[\w-]+\.[\w.]+\w)/g;
  return text.split(pattern).map((part, i) => {
    if (i % 2 === 0) return <Fragment key={i}>{part}</Fragment>;
    if (part === "Coupersville Privacy Notice") return <Link key={i} href="/privacy">{part}</Link>;
    return <a key={i} href={`mailto:${part}`}>{part}</a>;
  });
}

// The privacy notice and terms, rendered from the client's text.
export function LegalPage({ doc, linkPrivacy = false }: { doc: LegalDoc; linkPrivacy?: boolean }) {
  const text = (s: string) => linkify(s, linkPrivacy);
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="wordmark text-4xl text-primary">{doc.title}</h1>
      <p className="mt-2 text-sm tabular">Last updated: {doc.updated}</p>
      <p role="note" className="mt-4 rounded-sm border border-line bg-white px-4 py-3 text-sm">
        <strong className="font-semibold">Phase 1 Launch Notice:</strong> {doc.notice}
      </p>
      <div className="legal mt-6 grid gap-4">
        {doc.blocks.map((b, i) => {
          if (b.t === "ul") {
            return (
              <ul key={i}>
                {b.items.map((item, j) => (
                  <li key={j}>{text(item)}</li>
                ))}
              </ul>
            );
          }
          if (b.t === "address") {
            return (
              <address key={i} className="not-italic">
                {b.lines.map((line, j) => (
                  <Fragment key={j}>
                    {j > 0 && <br />}
                    {text(line)}
                  </Fragment>
                ))}
              </address>
            );
          }
          if (b.t === "h2") return <h2 key={i}>{b.text}</h2>;
          if (b.t === "h3") return <h3 key={i}>{b.text}</h3>;
          return <p key={i}>{text(b.text)}</p>;
        })}
      </div>
    </div>
  );
}
