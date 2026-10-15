"use client";

import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { TabLinks } from "./tab-links";

export interface SubNavItem {
  href: string;
  label: string;
  icon?: LucideIcon;
  /** Matches only this exact path (for an index page whose children are other tabs). */
  exact?: boolean;
}

/** Section tabs under a page title (Settings, Admin, a profile…), current tab from the path. Same look as TabLinks. */
export function SubNav({ items, label }: { items: SubNavItem[]; label: string }) {
  const pathname = usePathname();
  return <TabLinks label={label} items={items.map(({ href, label: text, icon, exact }) => ({ href, label: text, icon, active: exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`) }))} />;
}
