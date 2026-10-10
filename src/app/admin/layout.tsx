import { Suspense, type ReactNode } from "react";
import { ADMIN_LINKS } from "@/lib/merchant-links";
import { MerchantNav, MerchantNavLinks } from "@/components/merchant/merchant-nav";

// Every admin page checks the admin role itself; the proxy checks it too.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Suspense fallback={<MerchantNavLinks pathname={null} links={ADMIN_LINKS} label="Admin" />}>
        <MerchantNav links={ADMIN_LINKS} label="Admin" />
      </Suspense>
      {children}
    </>
  );
}
