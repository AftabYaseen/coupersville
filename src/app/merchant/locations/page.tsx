import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { MapPin, Plus } from "lucide-react";
import { requireManagedBusiness } from "@/lib/merchant";
import { PageLoading } from "@/components/page-loading";
import { LocationActiveToggle } from "@/components/merchant/location-form";

export const metadata: Metadata = { title: "Stores" };

export default function LocationsPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <LocationsContent />
    </Suspense>
  );
}

async function LocationsContent() {
  const { business, supabase } = await requireManagedBusiness("/merchant/locations");
  const { data: locations } = await supabase
    .from("locations")
    .select("id, store_name, store_number, address_line1, address_line2, city, state, postal_code, active, lat, lng")
    .eq("business_id", business.id)
    .order("active", { ascending: false })
    .order("store_name");

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="wordmark text-4xl text-ink">Stores</h1>
        <Link href="/merchant/locations/new" className="btn">
          <Plus aria-hidden size={18} strokeWidth={1.5} />
          Add store
        </Link>
      </div>

      {!locations?.length ? (
        <p className="panel mt-6 p-5">You have no stores yet. Add one so shoppers know where to use your coupons.</p>
      ) : (
        <ul className="mt-6 grid gap-3">
          {locations.map((loc) => (
            <li key={loc.id} className={`panel p-5 ${loc.active ? "" : "bg-paper"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">
                    {loc.store_name}
                    {loc.store_number && <span className="font-normal tabular"> #{loc.store_number}</span>}
                    {!loc.active && <span className="ml-2 text-sm font-medium text-signal">Closed</span>}
                  </h2>
                  <p className="mt-1">
                    {[loc.address_line1, loc.address_line2].filter(Boolean).join(", ")}
                    <br />
                    {[loc.city, loc.state, loc.postal_code].filter(Boolean).join(", ")}
                  </p>
                  <p className="mt-2 flex items-center gap-1.5 text-sm">
                    <MapPin aria-hidden size={16} strokeWidth={1.5} className="text-ink" />
                    {loc.lat !== null ? "Map pin set" : "No map pin yet"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/merchant/locations/${loc.id}`} className="btn btn-secondary">
                    Edit store
                  </Link>
                  <LocationActiveToggle locationId={loc.id} active={loc.active} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
