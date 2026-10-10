import { z } from "zod";

const statsSchema = z.object({
  today: z.number(),
  week: z.number(),
  total: z.number(),
  by_coupon: z.record(z.string(), z.number()),
});

export type RedemptionStats = { today: number; week: number; total: number; byCoupon: Record<string, number> };

// Reads the jsonb from business_redemption_stats. Anything unexpected counts as zero.
export function parseStats(raw: unknown): RedemptionStats {
  const parsed = statsSchema.safeParse(raw);
  if (!parsed.success) return { today: 0, week: 0, total: 0, byCoupon: {} };
  const { today, week, total, by_coupon } = parsed.data;
  return { today, week, total, byCoupon: by_coupon };
}
