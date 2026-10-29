import Link from "next/link";

const LINKS = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/for-businesses", label: "For businesses" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t-[1.5px] border-ink bg-white">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href="/" className="wordmark text-xl text-ink">
            Coupersville
          </Link>
          <p className="mt-1 text-sm">Coupons from the shops in your town.</p>
        </div>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-2">
            {LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="inline-flex min-h-11 items-center px-2 font-medium text-ink underline-offset-4 hover:underline">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
