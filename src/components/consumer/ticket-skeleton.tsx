// Static, ticket-shaped placeholders. No shimmer: the only animation on the site is the redeem stamp.
export function TicketSkeleton() {
  return (
    <div className="ticket" aria-hidden>
      <div className="ticket-main px-5 pt-5 pb-6">
        <div className="h-4 w-28 rounded-sm bg-paper" />
        <div className="mt-3 h-12 w-40 rounded-sm bg-paper" />
        <div className="mt-4 h-5 w-3/4 rounded-sm bg-paper" />
      </div>
      <div className="ticket-stub grid gap-2 px-5 pt-4 pb-4">
        <div className="h-4 w-36 rounded-sm bg-paper" />
        <div className="h-4 w-24 rounded-sm bg-paper" />
      </div>
    </div>
  );
}

export function TicketGridSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div role="status">
      <span className="sr-only">Loading coupons</span>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: count }, (_, i) => (
          <TicketSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
