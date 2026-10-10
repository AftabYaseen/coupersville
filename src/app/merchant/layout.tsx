import { Suspense, type ReactNode } from "react";
import { getMemberships, getSessionUser } from "@/lib/auth";
import { MANAGER_LINKS, OWNER_LINKS, STAFF_LINKS } from "@/lib/merchant-links";
import { MerchantNav, MerchantNavLinks } from "@/components/merchant/merchant-nav";

export default function MerchantLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Suspense fallback={<MerchantNavLinks pathname={null} links={[]} />}>
        <RoleNav />
      </Suspense>
      {children}
    </>
  );
}

// Pages enforce access themselves; this only decides which links to show.
async function RoleNav() {
  const user = await getSessionUser();
  if (!user) return <MerchantNavLinks pathname={null} links={[]} />;
  const memberships = await getMemberships(user.id);
  const links = memberships.some((m) => m.role === "owner")
    ? OWNER_LINKS
    : memberships.some((m) => m.role === "manager") || user.role === "admin"
      ? MANAGER_LINKS
      : memberships.length > 0
        ? STAFF_LINKS
        : MANAGER_LINKS;
  return <MerchantNav links={links} />;
}
