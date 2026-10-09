import Form from "next/form";
import { Search } from "lucide-react";
import type { SearchQuery } from "@/lib/validation/search";
import { NearMeButton } from "@/components/consumer/near-me-button";

type ShopOption = { slug: string; shop_label: string };

export function SearchForm({
  query,
  shops,
  usingLocation,
}: {
  query: SearchQuery;
  shops: ShopOption[];
  usingLocation: boolean;
}) {
  return (
    <div className="panel grid gap-5 p-5 sm:p-6">
      <Form action="/search" className="grid gap-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="q" className="field-label">
              Search
            </label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={query.q ?? ""}
              placeholder="Coupon, shop, or product"
              className="field-input"
            />
          </div>
          <div>
            <label htmlFor="place" className="field-label">
              City or ZIP
            </label>
            <input id="place" name="place" defaultValue={query.place ?? ""} autoComplete="postal-code" className="field-input" />
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <div>
            <label htmlFor="category" className="field-label">
              Shop
            </label>
            <select id="category" name="category" defaultValue={query.category ?? ""} className="field-input">
              <option value="">All shops</option>
              {shops.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.shop_label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="type" className="field-label">
              Discount
            </label>
            <select id="type" name="type" defaultValue={query.type ?? ""} className="field-input">
              <option value="">Any discount</option>
              <option value="percent">Percent off</option>
              <option value="amount">Amount off</option>
            </select>
          </div>
          <div>
            <label htmlFor="sort" className="field-label">
              Sort by
            </label>
            <select id="sort" name="sort" defaultValue={query.sort} className="field-input">
              <option value="newest">Newest</option>
              <option value="ending_soon">Ending soon</option>
              <option value="nearest">Nearest</option>
            </select>
          </div>
        </div>

        <label className="flex min-h-11 cursor-pointer items-center gap-3">
          <input type="checkbox" name="ending" value="1" defaultChecked={query.ending === "1"} className="size-5 accent-ink" />
          Only coupons ending in the next 7 days
        </label>

        {usingLocation && (
          <>
            <input type="hidden" name="lat" value={query.lat} />
            <input type="hidden" name="lng" value={query.lng} />
          </>
        )}

        <button type="submit" className="btn w-full sm:w-auto sm:justify-self-start">
          <Search aria-hidden size={18} strokeWidth={1.5} />
          Search coupons
        </button>
      </Form>

      <NearMeButton placeInputId="place" keepParams />
    </div>
  );
}
