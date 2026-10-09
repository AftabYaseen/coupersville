import { z } from "zod";

export const SORTS = ["newest", "ending_soon", "nearest"] as const;
export type Sort = (typeof SORTS)[number];

const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const blank = (v: unknown) => {
  const value = first(v);
  return typeof value === "string" && value.trim() === "" ? undefined : value;
};

export const searchParamsSchema = z.object({
  q: z.preprocess(blank, z.string().trim().max(100).optional()).catch(undefined),
  category: z.preprocess(blank, z.string().regex(/^[a-z0-9-]{1,60}$/).optional()).catch(undefined),
  type: z.preprocess(blank, z.enum(["percent", "amount"]).optional()).catch(undefined),
  ending: z.preprocess(first, z.literal("1").optional()).catch(undefined),
  sort: z.preprocess(blank, z.enum(SORTS).default("newest")).catch("newest"),
  lat: z.preprocess(blank, z.coerce.number().min(-90).max(90).optional()).catch(undefined),
  lng: z.preprocess(blank, z.coerce.number().min(-180).max(180).optional()).catch(undefined),
  place: z.preprocess(blank, z.string().trim().max(60).optional()).catch(undefined),
  page: z.preprocess(blank, z.coerce.number().int().min(1).max(50).default(1)).catch(1),
});
export type SearchQuery = z.output<typeof searchParamsSchema>;

export const NEAR_ME_RADIUS_M = 40_234; // 25 miles
export const PAGE_SIZE = 24;
