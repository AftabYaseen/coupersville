export type NavLink = { href: string; label: string };

export const MANAGER_LINKS: NavLink[] = [
  { href: "/merchant", label: "Dashboard" },
  { href: "/merchant/coupons", label: "Coupons" },
  { href: "/merchant/scan", label: "Scanner" },
  { href: "/merchant/locations", label: "Stores" },
  { href: "/merchant/business", label: "Business" },
];
export const OWNER_LINKS: NavLink[] = [...MANAGER_LINKS, { href: "/merchant/staff", label: "Staff" }];
export const STAFF_LINKS: NavLink[] = [{ href: "/merchant/scan", label: "Scanner" }];

export const ADMIN_LINKS: NavLink[] = [
  { href: "/admin", label: "Stats" },
  { href: "/admin/merchants", label: "Merchants" },
  { href: "/admin/coupons", label: "Coupons" },
  { href: "/admin/subscriptions", label: "Subscriptions" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/settings", label: "Settings" },
];
