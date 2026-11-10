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
  mint: "bg-stock-mint",
  pink: "bg-stock-pink",
  sky: "bg-stock-sky",
  butter: "bg-stock-butter",
};

type Shop = { slug: string; name: string; description: string | null; stock_tint: Enums<"stock_tint">; liveCount: number };

export const dealCount = (n: number) => (n === 1 ? "1 available deal" : `${n} available deals`);

export function ShopCard({ shop }: { shop: Shop }) {
  const Icon = ICONS[shop.slug] ?? Store;
  return (
    <Link href={`/c/${shop.slug}`} className="block h-full overflow-hidden rounded-sm border-[1.5px] border-ink bg-white">
      {/* Awning: alternating ink and stock stripes, drawn flat. */}
      <span aria-hidden className="flex h-3 border-b-[1.5px] border-ink">
        {Array.from({ length: 8 }, (_, i) => (
          <span key={i} className={`flex-1 ${i % 2 === 0 ? "bg-ink" : TINT_BG[shop.stock_tint]}`} />
        ))}
      </span>
      <span className={`flex h-full items-start gap-3 p-4 ${TINT_BG[shop.stock_tint]}`}>
        <span className="flex size-11 shrink-0 items-center justify-center rounded-sm border-[1.5px] border-ink bg-white">
          <Icon aria-hidden size={22} strokeWidth={1.5} className="text-ink" />
        </span>
        <span className="min-w-0">
          <span className="block font-semibold leading-tight">{shop.name}</span>
          {shop.description && <span className="mt-1 block text-sm">{shop.description}</span>}
          <span className="mt-1 block text-sm font-medium tabular">{dealCount(shop.liveCount)}</span>
        </span>
      </span>
    </Link>
  );
}
