import Link from "next/link";
import {
  Blocks,
  Croissant,
  Footprints,
  Gem,
  Luggage,
  Pill,
  Ribbon,
  Shirt,
  ShoppingBasket,
  Sparkles,
  SprayCan,
  Store,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import type { Enums } from "@/lib/supabase/database.types";

const ICONS: Record<string, LucideIcon> = {
  restaurants: Utensils,
  grocery: ShoppingBasket,
  bakeries: Croissant,
  toys: Blocks,
  jewelry: Gem,
  clothes: Shirt,
  shoes: Footprints,
  "household-supplies": SprayCan,
  pharmacy: Pill,
  "luggage-bags-wallets": Luggage,
  millinery: Ribbon,
  beauty: Sparkles,
};

export const TINT_BG: Record<Enums<"stock_tint">, string> = {
  mint: "bg-mint-100",
  pink: "bg-brick-100",
  sky: "bg-sky-100",
  butter: "bg-marigold-100",
};

type Shop = { slug: string; name: string; description: string | null; stock_tint: Enums<"stock_tint">; liveCount: number };

export const dealCount = (n: number) => (n === 1 ? "1 available deal" : `${n} available deals`);

export function ShopCard({ shop }: { shop: Shop }) {
  const Icon = ICONS[shop.slug] ?? Store;
  return (
    <Link
      href={`/c/${shop.slug}`}
      className="card-lift flex h-full items-start gap-4 rounded-md border border-line bg-white p-4 shadow-sm hover:border-primary hover:shadow-md"
    >
      <span className={`flex size-12 shrink-0 items-center justify-center rounded-md ${TINT_BG[shop.stock_tint]}`}>
        <Icon aria-hidden size={24} strokeWidth={1.8} className="text-evergreen-900" />
      </span>
      <span className="min-w-0">
        <span className="block font-semibold leading-tight">{shop.name}</span>
        {shop.description && <span className="mt-1 block text-sm text-stone-600">{shop.description}</span>}
        <span className="mt-1 block text-sm font-semibold text-primary tabular">{dealCount(shop.liveCount)}</span>
      </span>
    </Link>
  );
}
