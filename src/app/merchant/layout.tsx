import { Suspense, type ReactNode } from "react";
import { MerchantNav, MerchantNavLinks } from "@/components/merchant/merchant-nav";

export default function MerchantLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Suspense fallback={<MerchantNavLinks pathname={null} />}>
        <MerchantNav />
      </Suspense>
      {children}
    </>
  );
}
