import { notFound } from "next/navigation";
import { brandIcon } from "@/lib/brand-icon";

// The home screen icons listed in the web app manifest.
const ICONS = {
  "icon-192.png": { size: 192, variant: "word" },
  "icon-512.png": { size: 512, variant: "word" },
  "maskable-512.png": { size: 512, variant: "maskable" },
} as const;

export function generateStaticParams() {
  return Object.keys(ICONS).map((name) => ({ name }));
}

export async function GET(_request: Request, { params }: RouteContext<"/icons/[name]">) {
  const { name } = await params;
  const icon = ICONS[name as keyof typeof ICONS];
  if (!icon) notFound();
  return brandIcon(icon.size, icon.variant);
}
