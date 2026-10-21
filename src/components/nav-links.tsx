"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { ADMIN_ENTRIES, ADMIN_LINKS, NAV_ENTRIES, NAV_LINKS, activeHref, isNavHub, type NavEntry, type NavLink } from "@/lib/nav";

export { ADMIN_LINKS, NAV_LINKS, isActivePath, canOpen, type NavLink } from "@/lib/nav";

/** Labels fade while the desktop sidebar is collapsed to its icon column (the icons never move). */
const FADE = "transition-opacity duration-150 group-data-[collapsed=true]/sidebar:opacity-0 group-data-[collapsed=true]/sidebar:duration-75";

function NavItem({ link, active, large, onNavigate, testId }: { link: NavLink; active: boolean; large: boolean; onNavigate?: () => void; testId?: string }) {
  const Icon = link.icon;
  return (
    <Link
      href={link.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      data-testid={testId}
      title={link.label}
      className={cn(
        "group relative flex items-center gap-3 rounded-lg pl-[15px] pr-3 text-sm font-semibold transition-colors duration-150",
        large ? "min-h-11 py-1.5" : "min-h-10 py-2",
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
