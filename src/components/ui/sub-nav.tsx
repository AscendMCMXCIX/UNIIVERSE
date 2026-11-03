"use client";

import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { SubTabs } from "./sub-tabs";

export interface SubNavItem {
  href: string;
  label: string;
  icon?: LucideIcon;
  /** Matches only this exact path (for an index page whose children are other tabs). */
  exact?: boolean;
}

/**
 * Secondary tabs between related pages (Admin's Users & Permissions), the current one from the
 * path: the same look and behaviour as a section's views (SubTabs), each page starting at the top.
 */
export function SubNav({ items, label, testId }: { items: SubNavItem[]; label: string; testId?: string }) {
  const pathname = usePathname();
  const active = items.find(({ href, exact }) => (exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)));
  return <SubTabs label={label} current={active?.href ?? ""} keepScroll={false} testId={testId} items={items.map(({ href, label: text, icon }) => ({ key: href, href, label: text, icon }))} />;
}
