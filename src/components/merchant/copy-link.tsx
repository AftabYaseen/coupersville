"use client";

import { useState } from "react";
import { Copy } from "lucide-react";

// The private link with a Copy link button. If the clipboard is blocked, the link stays selectable.
export function CopyLink({ url }: { url: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  return (
    <div className="grid gap-2">
      <label htmlFor="private-link" className="field-label">
        Private link
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id="private-link"
          readOnly
          value={url}
          className="field-input min-w-0 flex-1 tabular"
          onFocus={(e) => e.currentTarget.select()}
        />
        <button type="button" className="btn" onClick={() => void copy()}>
          <Copy aria-hidden size={18} strokeWidth={1.5} />
          Copy link
        </button>
      </div>
      <p className="text-sm" role="status">
        {state === "copied" ? "Link copied." : state === "failed" ? "Your browser blocked copying. Select the link and copy it." : ""}
      </p>
    </div>
  );
}
