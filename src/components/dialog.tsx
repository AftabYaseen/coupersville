"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

// A modal sheet from the bottom on phones, centred on wider screens. Escape or the backdrop closes
// it unless busy. Rendered into <body> so no parent's overflow or mask can clip it.
export function Dialog({
  title,
  onClose,
  busy = false,
  wide = false,
  children,
}: {
  title: string;
  onClose: () => void;
  busy?: boolean;
  wide?: boolean;
  children: ReactNode;
}) {
  const headingId = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const first = panel.current?.querySelector<HTMLElement>("[data-autofocus]");
    if (first) first.focus();
    else panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      before?.focus();
    };
  }, [onClose, busy]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-evergreen-900/40 sm:items-center sm:p-4"
      onClick={busy ? undefined : onClose}
    >
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className={`grid max-h-[92vh] w-full gap-4 overflow-y-auto rounded-t-sm border border-line bg-white p-5 pb-8 sm:rounded-sm ${
          wide ? "max-w-3xl" : "max-w-md"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={headingId} className="text-xl font-semibold">
            {title}
          </h2>
          <button
            type="button"
            className="-m-2 inline-flex size-11 shrink-0 items-center justify-center text-primary"
            onClick={onClose}
            disabled={busy}
          >
            <X aria-hidden size={22} strokeWidth={1.5} />
            <span className="sr-only">Close</span>
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
