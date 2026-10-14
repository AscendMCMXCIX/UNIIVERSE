"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { ADMIN_LINKS, NAV_ENTRIES, isActivePath, isNavGroup, type NavGroup, type NavLink } from "@/lib/nav";

export { ADMIN_LINKS, NAV_LINKS, isActivePath, canOpen, firstAdminPath, type NavLink } from "@/lib/nav";

/** Labels and headings fade while the desktop sidebar is collapsed to its icon column (the icons never move). */
const FADE = "transition-opacity duration-150 group-data-[collapsed=true]/sidebar:opacity-0";

function NavItem({ link, active, large, onNavigate }: { link: NavLink; active: boolean; large: boolean; onNavigate?: () => void }) {
  const Icon = link.icon;
  return (
    <Link
      href={link.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={link.label}
      className={cn(
        "group relative flex items-center gap-3 rounded-lg pl-[15px] pr-3 text-sm font-medium transition-colors duration-150",
        large ? "min-h-12 py-2" : "min-h-10 py-2",
        active ? "bg-accent/10 text-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg",
      )}
    >
      <span className={cn("absolute inset-y-2 left-0 w-0.5 rounded-full transition-colors", active ? "bg-accent" : "bg-transparent")} aria-hidden />
      <Icon className={cn("h-[18px] w-[18px] shrink-0 transition-colors", active ? "text-accent" : "text-fg-subtle group-hover:text-fg-muted")} aria-hidden />
      {/* Collapsed sidebar: icon only; the label stays for screen readers and as the tooltip (title). */}
      <span className={cn("truncate", FADE)}>{link.label}</span>
    </Link>
  );
}

/**
 * A titled section (TEAM: Overview, Players, Draft, Matches). A heading rather than a fold-out
 * group: four pages are quicker to reach when always visible, and the layout stays the same in
 * the collapsed sidebar (where a short rule replaces the heading).
 */
function NavSection({ group, links, pathname, large, onNavigate }: { group: NavGroup; links: NavLink[]; pathname: string; large: boolean; onNavigate?: () => void }) {
  const id = React.useId();
  return (
    <div role="group" aria-labelledby={id} className="mb-2" data-testid={`nav-group-${group.key}`}>
      <div className="relative flex h-7 items-center pl-[15px]">
        <span id={id} className={cn("text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-subtle", FADE)}>
          {group.label}
        </span>
        <span className="absolute left-[18px] h-px w-6 bg-border opacity-0 transition-opacity duration-150 group-data-[collapsed=true]/sidebar:opacity-100" aria-hidden />
      </div>
      <div className="flex flex-col gap-0.5">
        {links.map((l) => (
          <NavItem key={l.href} link={l} active={isActivePath(pathname, l.href)} large={large} onNavigate={onNavigate} />
        ))}
      </div>
    </div>
  );
}

/**
 * Vertical navigation: the desktop sidebar and the phone/tablet drawer share it. The server
 * decides which pages this account may open and passes their paths (`allowed`); icons stay here.
 */
export function NavLinks({ allowed, admin = false, onNavigate, large = false }: { allowed: string[]; admin?: boolean; onNavigate?: () => void; large?: boolean }) {
  const pathname = usePathname();
  const may = (l: NavLink) => allowed.includes(l.href);
  return (
    <nav className="flex flex-col gap-0.5 px-3" aria-label="Main">
      {admin
        ? ADMIN_LINKS.filter(may).map((l) => <NavItem key={l.href} link={l} active={isActivePath(pathname, l.href)} large={large} onNavigate={onNavigate} />)
        : NAV_ENTRIES.map((entry) => {
            if (!isNavGroup(entry)) return may(entry) ? <NavItem key={entry.href} link={entry} active={isActivePath(pathname, entry.href)} large={large} onNavigate={onNavigate} /> : null;
            const links = entry.links.filter(may);
            if (links.length === 0) return null;
            return <NavSection key={entry.key} group={entry} links={links} pathname={pathname} large={large} onNavigate={onNavigate} />;
          })}
    </nav>
  );
}
