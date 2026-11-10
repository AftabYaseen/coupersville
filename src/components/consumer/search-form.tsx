import Form from "next/form";
import { Search } from "lucide-react";
import type { SearchQuery } from "@/lib/validation/search";
import { NearMeButton } from "@/components/consumer/near-me-button";

type CategoryOption = { slug: string; name: string };

export function SearchForm({
  query,
  shops,
  usingLocation,
}: {
  query: SearchQuery;
  shops: CategoryOption[];
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
              placeholder="What are you looking for?"
              className="field-input"
            />
          </div>
          <div>
            <label htmlFor="place" className="field-label">
              Near
            </label>
            <input
              id="place"
              name="place"
              defaultValue={query.place ?? ""}
              placeholder="City or ZIP code"
              autoComplete="postal-code"
              className="field-input"
            />
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <div>
            <label htmlFor="category" className="field-label">
              Category
            </label>
            <select id="category" name="category" defaultValue={query.category ?? ""} className="field-input">
              <option value="">All categories</option>
              {shops.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="type" className="field-label">
              Discount type
            </label>
            <select id="type" name="type" defaultValue={query.type ?? ""} className="field-input">
              <option value="">Any discount</option>
              <option value="percent">Percentage off</option>
              <option value="amount">Dollar amount off</option>
              <option value="fixed_price">Fixed price</option>
              <option value="free">Free</option>
            </select>
          </div>
          <div>
            <label htmlFor="sort" className="field-label">
              Sort by
            </label>
            <select id="sort" name="sort" defaultValue={query.sort} className="field-input">
              <option value="newest">Newest offers</option>
              <option value="ending_soon">Ending soon</option>
              <option value="nearest">Nearest</option>
            </select>
          </div>
        </div>

        <label className="flex min-h-11 cursor-pointer items-center gap-3">
          <input type="checkbox" name="ending" value="1" defaultChecked={query.ending === "1"} className="size-5 accent-ink" />
          Ending soon: only deals ending in the next 7 days
        </label>

        {usingLocation && <input type="hidden" name="near" value="1" />}

        <button type="submit" className="btn w-full sm:w-auto sm:justify-self-start">
          <Search aria-hidden size={18} strokeWidth={1.5} />
          Search deals
        </button>
      </Form>

      <NearMeButton placeInputId="place" keepParams />
    </div>
  );
}
