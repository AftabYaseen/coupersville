import { z } from "zod";

const count = z.union([z.number(), z.string()]).transform(Number);

export const platformStatsSchema = z.object({
  businesses_active: count,
  businesses_suspended: count,
  businesses_draft: count,
  live_coupons: count,
  shoppers: count,
  redemptions_7d: count,
  redemptions_30d: count,
  redemptions_total: count,
  top_coupons: z.array(z.object({ id: z.uuid(), title: z.string(), business_name: z.string(), redemptions: count })),
  top_businesses: z.array(z.object({ id: z.uuid(), name: z.string(), redemptions: count })),
});
export type PlatformStats = z.infer<typeof platformStatsSchema>;
