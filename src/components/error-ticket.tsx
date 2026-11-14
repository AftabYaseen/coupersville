import type { ReactNode } from "react";

// A ticket for the 404 and error pages: a big code on the offer side, what to do on the stub.
export function ErrorTicket({ code, title, children, actions }: { code: string; title: string; children: ReactNode; actions: ReactNode }) {
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="ticket" data-tint="butter">
        <div className="ticket-main px-5 pt-5 pb-6">
          <p aria-hidden className="offer-text text-[3.5rem] text-evergreen-900 tabular">
            {code}
          </p>
          <h1 className="wordmark mt-3 text-3xl text-primary">{title}</h1>
        </div>
        <div className="ticket-stub grid gap-4 px-5 pt-4 pb-5">
          <div className="grid gap-2">{children}</div>
          <div className="flex flex-wrap gap-3">{actions}</div>
        </div>
      </div>
    </div>
  );
}
