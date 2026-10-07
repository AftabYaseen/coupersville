import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <div className="panel px-5 py-7 sm:px-8">{children}</div>
    </div>
  );
}
