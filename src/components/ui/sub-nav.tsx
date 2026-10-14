"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export interface SubNavItem {
  href: string;
  label: string;
  icon?: LucideIcon;
  /** Matches only this exact path (for an index page whose children are other tabs). */
  exact?: boolean;
}

/** Section tabs under a page title (Settings, Admin, a profile…). Scrolls sideways on narrow screens instead of wrapping. */
export function SubNav({ items, label }: { items: SubNavItem[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1 border-b border-border">
        {items.map(({ href, label: text, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn("relative flex min-h-11 items-center gap-1.5 px-3 text-sm transition-colors md:min-h-10", active ? "text-fg" : "text-fg-muted hover:text-fg")}
              >
                {Icon ? <Icon className={cn("h-4 w-4", active ? "text-accent" : "text-fg-subtle")} aria-hidden /> : null}
                {text}
                <span className={cn("absolute inset-x-2 -bottom-px h-0.5 rounded-full transition-colors", active ? "bg-accent" : "bg-transparent")} aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
