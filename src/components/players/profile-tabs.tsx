"use client";

import { usePathname, useRouter } from "next/navigation";
import { Gamepad2, LayoutDashboard, NotebookPen, ScrollText, Swords } from "lucide-react";
import { SubNav, type SubNavItem } from "@/components/ui/sub-nav";

/**
 * The profile's sections: Overview, Champions & Roles, Solo Queue Blocks (your own profile only;
 * it is private), Match History and Riot Accounts. Tabs on wider screens; on a phone a compact section picker
 * instead of a row that scrolls sideways.
 */
export function ProfileTabs({ basePath, showBlocks }: { basePath: string; showBlocks: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const items: SubNavItem[] = [
    { href: basePath, label: "Overview", icon: LayoutDashboard, exact: true },
    { href: `${basePath}/champions`, label: "Champions & Roles", icon: Swords },
    ...(showBlocks ? [{ href: `${basePath}/blocks`, label: "Solo Queue Blocks", icon: NotebookPen }] : []),
    { href: `${basePath}/matches`, label: "Match History", icon: ScrollText },
    { href: `${basePath}/accounts`, label: "Riot Accounts", icon: Gamepad2 },
  ];
  const active = items.find((i) => (i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(`${i.href}/`))) ?? items[0]!;
  return (
    <>
      <div className="max-sm:hidden" data-testid="profile-tabs">
        <SubNav label="Profile" items={items} />
      </div>
      <label className="flex items-center gap-2 sm:hidden" data-testid="profile-section-select">
        <span className="shrink-0 text-xs font-medium uppercase tracking-[0.14em] text-fg-subtle">Section</span>
        <select
          value={active.href}
          onChange={(e) => router.push(e.target.value)}
          className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-base font-medium text-fg focus-visible:outline-2 focus-visible:outline-accent"
          aria-label="Profile section"
        >
          {items.map((i) => (
            <option key={i.href} value={i.href}>
              {i.label}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
