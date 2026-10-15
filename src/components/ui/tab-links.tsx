import * as React from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export interface TabLink {
  href: string;
  label: React.ReactNode;
  active: boolean;
  icon?: LucideIcon;
  /** A small count after the label. */
  count?: number;
  testId?: string;
}

/**
 * Section tabs: switching between views of one page (Matches, a profile, Settings, Admin). One
 * underlined row that scrolls sideways on narrow screens instead of wrapping. The caller decides
 * which tab is current (a path or a query parameter); SubNav derives it from the path.
 */
export function TabLinks({ items, label, className, testId }: { items: TabLink[]; label: string; className?: string; testId?: string }) {
  return (
    <nav aria-label={label} className={cn("-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden", className)} data-testid={testId}>
      <ul className="flex min-w-max gap-1 border-b border-border">
        {items.map(({ href, label: text, icon: Icon, active, count, testId: itemTestId }) => (
          <li key={href}>
            <Link href={href} aria-current={active ? "page" : undefined} className={cn("relative flex min-h-11 items-center gap-1.5 px-3 text-sm transition-colors md:min-h-10", active ? "text-fg" : "text-fg-muted hover:text-fg")} data-testid={itemTestId}>
              {Icon ? <Icon className={cn("h-4 w-4", active ? "text-accent" : "text-fg-subtle")} aria-hidden /> : null}
              {text}
              {count !== undefined ? <span className="rounded bg-surface-3 px-1.5 text-xs tabular-nums text-fg-muted">{count}</span> : null}
              <span className={cn("absolute inset-x-2 -bottom-px h-0.5 rounded-full transition-colors", active ? "bg-accent" : "bg-transparent")} aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
