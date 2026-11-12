import { campaignsResetText, campaignsText, privateOffersText, type BusinessUsage } from "@/lib/limits";

export function CampaignUsage({ usage, className = "" }: { usage: BusinessUsage | null; className?: string }) {
  if (!usage) return null;
  const privateLine = privateOffersText(usage);
  return (
    <p className={className}>
      <span className="font-semibold tabular">{campaignsText(usage)}</span>
      <span className="mt-1 block text-sm">{campaignsResetText(usage)}</span>
      {privateLine && <span className="mt-1 block text-sm tabular">{privateLine}</span>}
    </p>
  );
}

export function ContactForMore({ email }: { email: string }) {
  return (
    <p className="text-sm">
      More than 3 locations?{" "}
      <a href={`mailto:${email}`} className="font-medium text-ink underline underline-offset-4">
        Contact us at {email}
      </a>
    </p>
  );
}
