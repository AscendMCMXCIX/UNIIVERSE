"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, Gamepad2, LayoutDashboard, NotebookPen, ScrollText, Swords, type LucideIcon } from "lucide-react";
import { Menu, MenuLink } from "@/components/ui/menu";

interface Section {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  /** Keeps the season and game mode chosen on another statistics section. */
  keepsSeason?: boolean;
}

/**
 * The profile's sections as one compact switcher: "Overview ▾" names where you are and opens the
 * others (Overview, Champions & Roles, Solo Queue Blocks (your own profile only; it is private),
 * Match History, Riot Accounts). The same control on every screen size, so there is never a tab
 * bar and a picker competing. Each entry is a link: Back/Forward, new tabs and the keyboard work.
 * Overview and Match History share the chosen season and game mode.
 */
export function ProfileTabs({ basePath, showBlocks, actions }: { basePath: string; showBlocks: boolean; actions?: React.ReactNode }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const sections: Section[] = [
    { href: basePath, label: "Overview", icon: LayoutDashboard, exact: true, keepsSeason: true },
    { href: `${basePath}/champions`, label: "Champions & Roles", icon: Swords },
    ...(showBlocks ? [{ href: `${basePath}/blocks`, label: "Solo Queue Blocks", icon: NotebookPen }] : []),
    { href: `${basePath}/matches`, label: "Match History", icon: ScrollText, keepsSeason: true },
    { href: `${basePath}/accounts`, label: "Riot Accounts", icon: Gamepad2 },
  ];
  const isActive = (s: Section) => (s.exact ? pathname === s.href : pathname === s.href || pathname.startsWith(`${s.href}/`));
  const current = sections.find(isActive) ?? sections[0]!;
  const carried = new URLSearchParams();
  if (current.keepsSeason) for (const k of ["season", "mode"]) if (params.get(k)) carried.set(k, params.get(k)!);
  const hrefOf = (s: Section) => (s.keepsSeason && carried.size && s !== current ? `${s.href}?${carried.toString()}` : s.href);
  const Icon = current.icon;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2" data-testid="profile-tabs">
      <Menu
        label="Profile sections"
        align="start"
        className="w-64"
        testId="profile-section-menu"
        trigger={(p) => (
          <button {...p} type="button" className="group inline-flex min-h-11 items-center gap-2.5 rounded-xl border border-border bg-surface/70 py-1.5 pl-3 pr-2.5 text-left transition-colors hover:border-border-strong hover:bg-surface-2 md:min-h-10" data-testid="profile-section-button">
            <Icon className="h-[18px] w-[18px] text-accent" aria-hidden />
            <span className="text-base font-semibold text-fg">{current.label}</span>
            <span className="sr-only">: change profile section</span>
            <ChevronDown className="h-4 w-4 text-fg-subtle transition-transform group-aria-expanded:rotate-180" aria-hidden />
          </button>
        )}
      >
        {sections.map((s) => (
          <MenuLink key={s.href} href={hrefOf(s)} icon={<s.icon className="h-4 w-4" />} active={s === current}>
            {s.label}
          </MenuLink>
        ))}
      </Menu>
      {actions}
    </div>
  );
}
