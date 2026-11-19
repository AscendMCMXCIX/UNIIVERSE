"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { stayOnCurrentPage } from "@/lib/back-to-top";
import { cn } from "@/lib/cn";
import { currentDestination, destinations, prefetchOf, type Destination } from "@/lib/nav";
import { RAIL_CURRENT, RAIL_FADE, RAIL_HIGHLIGHT, RAIL_HOVER, RAIL_ICON, RAIL_ICON_IDLE, RAIL_ROW } from "@/lib/sidebar";

export { ADMIN_LINKS, NAV_LINKS, isActivePath, canOpen, type NavLink } from "@/lib/nav";

function NavItem({ destination, active, here, large, onNavigate }: { destination: Destination; active: boolean; /** The link is to the page already shown. */ here: boolean; large: boolean; onNavigate?: () => void }) {
  const { href, label, icon: Icon } = destination;
  return (
    <Link
      href={href}
      // My Profile is never fetched ahead (its layout starts the account's Riot refresh: docs/HOSTING_USAGE.md).
      prefetch={prefetchOf(href)}
      onClick={(e) => {
        // The page already shown stays as it is (its view and filters) and goes back to the top.
        stayOnCurrentPage(e, here);
        onNavigate?.();
      }}
      aria-current={active ? "page" : undefined}
      data-testid={`nav-${destination.hub ?? href.slice(1).replaceAll("/", "-")}`}
      title={label}
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
      <span className={cn("truncate", RAIL_FADE)}>{label}</span>
    </Link>
  );
}

/**
 * Vertical navigation: the desktop sidebar's destinations, the mode's entries in order (a tablet
 * and a phone show the same ones in their bars: MobileNav), each to the first page of it this account
 * may open and marked on all of them. The server decides which pages this account may open and
 * passes their paths (`allowed`); icons stay here.
 */
export function NavLinks({ allowed, admin = false, onNavigate, large = false }: { allowed: string[]; admin?: boolean; onNavigate?: () => void; large?: boolean }) {
  const pathname = usePathname();
  const list = destinations(allowed, admin);
  const current = currentDestination(pathname, list);
  return (
    <nav className="flex flex-col gap-0.5 px-3" aria-label="Main">
      {list.map((d) => (
        <NavItem key={d.key} destination={d} active={d.key === current?.key} here={d.href === pathname} large={large} onNavigate={onNavigate} />
      ))}
    </nav>
  );
}
