import type { Metadata } from "next";
import { Suspense } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { requireAdminPage } from "@/lib/admin";
import { PageLoading } from "@/components/page-loading";
import { ActionButton } from "@/components/admin/action-button";
import { CategoryForm, EditCategory } from "@/components/admin/category-form";
import { deleteCategory, moveCategory, setCategoryActive } from "@/app/admin/categories/actions";

export const metadata: Metadata = { title: "Categories" };

const TINT_BG = { mint: "bg-stock-mint", pink: "bg-stock-pink", sky: "bg-stock-sky", butter: "bg-stock-butter" } as const;

export default function CategoriesPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <CategoriesContent />
    </Suspense>
  );
}

async function CategoriesContent() {
  const { supabase } = await requireAdminPage("/admin/categories");
  const [{ data: categories }, { data: coupons }] = await Promise.all([
    supabase.from("categories").select("id, name, slug, shop_label, stock_tint, sort_order, active").order("sort_order").order("name"),
    supabase.from("coupons").select("category_id"),
  ]);
  const counts = new Map<string, number>();
  for (const c of coupons ?? []) counts.set(c.category_id, (counts.get(c.category_id) ?? 0) + 1);
  const list = categories ?? [];

  return (
    <div className="mx-auto grid max-w-4xl gap-8 px-4 py-10">
      <div>
        <h1 className="wordmark text-4xl text-ink">Categories</h1>
        <p className="mt-2">
          Each category is a shop on Main Street, in this order. Deactivating one hides it and its coupons from shoppers. A
          category with coupons cannot be deleted.
        </p>
      </div>

      <section className="panel p-5" aria-labelledby="add-heading">
        <h2 id="add-heading" className="mb-4 text-xl font-semibold">
          Add a category
        </h2>
        <CategoryForm />
      </section>

      <section aria-labelledby="list-heading">
        <h2 id="list-heading" className="text-xl font-semibold">
          Main Street order
        </h2>
        <ol className="mt-3 grid gap-3">
          {list.map((c, i) => {
            const used = counts.get(c.id) ?? 0;
            return (
              <li key={c.id} className={`panel overflow-hidden ${c.active ? "" : "bg-paper"}`}>
                <div className="flex items-stretch">
                  <span aria-hidden className={`w-3 shrink-0 border-r-[1.5px] border-dashed border-ink ${TINT_BG[c.stock_tint]}`} />
                  <div className="flex flex-1 flex-wrap items-start justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        <span className="tabular">{i + 1}.</span> {c.name}
                        {!c.active && <span className="ml-2 text-sm font-medium text-signal">Inactive</span>}
                      </p>
                      <p className="text-sm">
                        {c.shop_label}, /c/{c.slug}
                      </p>
                      <p className="text-sm tabular">
                        {used} {used === 1 ? "coupon" : "coupons"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-start gap-2">
                      <ActionButton action={moveCategory.bind(null, c.id, "up")} showSuccess={false}>
                        <ArrowUp aria-hidden size={18} strokeWidth={1.5} />
                        <span className="sr-only">Move {c.name} up</span>
                      </ActionButton>
                      <ActionButton action={moveCategory.bind(null, c.id, "down")} showSuccess={false}>
                        <ArrowDown aria-hidden size={18} strokeWidth={1.5} />
                        <span className="sr-only">Move {c.name} down</span>
                      </ActionButton>
                      <ActionButton action={setCategoryActive.bind(null, c.id, !c.active)} showSuccess={false}>
                        {c.active ? "Deactivate" : "Activate"}
                      </ActionButton>
                      {used === 0 && (
                        <ActionButton
                          action={deleteCategory.bind(null, c.id)}
                          confirm={{ question: `Delete ${c.name}? This cannot be undone.`, yes: "Yes, delete", no: "Keep" }}
                        >
                          Delete
                        </ActionButton>
                      )}
                      <EditCategory
                        categoryId={c.id}
                        defaults={{ name: c.name, slug: c.slug, shopLabel: c.shop_label, tint: c.stock_tint }}
                      />
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
