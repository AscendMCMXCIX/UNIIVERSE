"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { ADMIN_ENTRIES, ADMIN_LINKS, NAV_ENTRIES, NAV_LINKS, activeHref, isNavHub, type NavEntry, type NavLink } from "@/lib/nav";
import { RAIL_CURRENT, RAIL_FADE, RAIL_HIGHLIGHT, RAIL_HOVER, RAIL_ICON, RAIL_ICON_IDLE, RAIL_ROW } from "@/lib/sidebar";

export { ADMIN_LINKS, NAV_LINKS, isActivePath, canOpen, type NavLink } from "@/lib/nav";

function NavItem({ link, active, large, onNavigate, testId }: { link: NavLink; active: boolean; large: boolean; onNavigate?: () => void; testId?: string }) {
  const Icon = link.icon;
  return (
    <Link
      href={link.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      data-testid={testId}
      title={link.label}
      // The shared sidebar row (src/lib/sidebar.ts): its icon sits on the collapsed rail's centre line.
      className={cn(RAIL_ROW, large && "min-h-11 py-1.5", active ? "text-fg" : "text-fg-muted hover:text-fg")}
    >
      {/* The current page: a neutral lift with a hairline of light on top, the brand gradient as a
          short bar at the row's edge and the icon in the brand blue. The frame stays neutral; colour
          marks only where you are. The bar grows in from its centre when the page becomes current. */}
      <span className={cn(RAIL_HIGHLIGHT, active ? RAIL_CURRENT : RAIL_HOVER)} aria-hidden data-testid="nav-highlight" />
      <span className={cn("absolute inset-y-2.5 left-0 w-0.5 rounded-full bg-gradient-to-b from-accent to-accent-2 transition-[opacity,scale] duration-200 ease-emphasized", active ? "scale-y-100 opacity-100" : "scale-y-50 opacity-0")} aria-hidden />
      <Icon className={cn(RAIL_ICON, active ? "text-accent" : RAIL_ICON_IDLE)} aria-hidden />
      {/* Collapsed sidebar: icon only; the label stays for screen readers and as the tooltip (title). */}
      <span className={cn("truncate", RAIL_FADE)}>{link.label}</span>
    </Link>
  );
}

/**
 * Vertical navigation: the desktop sidebar and the phone/tablet drawer share it. The server
 * decides which pages this account may open and passes their paths (`allowed`); icons stay here.
 */
export function NavLinks({ allowed, admin = false, onNavigate, large = false }: { allowed: string[]; admin?: boolean; onNavigate?: () => void; large?: boolean }) {
  const pathname = usePathname();
  const may = (l: NavLink) => allowed.includes(l.href);
  const current = activeHref(pathname, admin ? ADMIN_LINKS.map((l) => l.href) : NAV_LINKS.map((l) => l.href));
  const entries: NavEntry[] = admin ? ADMIN_ENTRIES : NAV_ENTRIES;
  return (
    <nav className="flex flex-col gap-0.5 px-3" aria-label="Main">
      {entries.map((entry) => {
        if (isNavHub(entry)) {
          // Team (or an Admin Mode section with tabs): one entry, to the first section this account may open, marked on all of them.
          const sections = entry.sections.filter(may);
          if (sections.length === 0) return null;
          return <NavItem key={entry.key} link={{ href: sections[0]!.href, label: entry.label, icon: entry.icon }} active={sections.some((l) => l.href === current)} large={large} onNavigate={onNavigate} testId={`nav-${entry.key}`} />;
        }
        return may(entry) ? <NavItem key={entry.href} link={entry} active={entry.href === current} large={large} onNavigate={onNavigate} testId={`nav-${entry.href.slice(1).replaceAll("/", "-")}`} /> : null;
      })}
    </nav>
  );
}
