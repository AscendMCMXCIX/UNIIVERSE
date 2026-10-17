"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { ChevronDown } from "lucide-react";
import { ADMIN_ENTRIES, ADMIN_LINKS, NAV_ENTRIES, NAV_LINKS, activeHref, isNavGroup, isNavHub, type NavEntry, type NavGroup, type NavLink } from "@/lib/nav";

export { ADMIN_LINKS, NAV_LINKS, isActivePath, canOpen, firstAdminPath, type NavLink } from "@/lib/nav";

/** Labels and headings fade while the desktop sidebar is collapsed to its icon column (the icons never move). */
const FADE = "transition-opacity duration-150 group-data-[collapsed=true]/sidebar:opacity-0";

function NavItem({ link, active, large, onNavigate, nested = false, testId }: { link: NavLink; active: boolean; large: boolean; onNavigate?: () => void; nested?: boolean; testId?: string }) {
  const Icon = link.icon;
  return (
    <Link
      href={link.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      data-testid={testId}
      title={link.label}
      className={cn(
        // A top-level link (My Profile) reads like the group headings beside it.
        "group relative flex items-center gap-3 rounded-lg pr-3 text-sm transition-colors duration-150",
        nested ? "font-medium" : "font-semibold",
        // Links in a group sit one step in, beside the group's guide line (also in the icon rail).
        nested ? "pl-[33px]" : "pl-[15px]",
        large ? "min-h-11 py-1.5" : nested ? "min-h-9 py-1.5" : "min-h-10 py-2",
        active ? "bg-accent/10 text-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg",
      )}
    >
      <span className={cn("absolute inset-y-2 left-0 w-0.5 rounded-full transition-colors", active ? "bg-accent" : "bg-transparent")} aria-hidden />
      <Icon className={cn("shrink-0 transition-colors", nested ? "h-4 w-4" : "h-[18px] w-[18px]", active ? "text-accent" : "text-fg-subtle group-hover:text-fg-muted")} aria-hidden />
      {/* Collapsed sidebar: icon only; the label stays for screen readers and as the tooltip (title). */}
      <span className={cn("truncate", FADE)}>{link.label}</span>
    </Link>
  );
}

/**
 * A collapsible group (Meta & Trends; the Admin groups). The heading toggles it,
 * including the group of the current page: closing it hides the links and leaves the page open,
 * and the heading keeps a small marker so you still know where you are. Opening and closing
 * animate the height through a grid row (0fr → 1fr), so nothing jumps. Closed groups are
 * remembered in a cookie (read on the server for the first render) and stay closed until opened
 * again. The collapsed sidebar is a rail of group icons only: every group folds (the same
 * animation), the group of the current page keeps its accent marker, and pointing at the rail
 * opens the full sidebar with each group as the person left it (their open/closed choice is
 * untouched).
 */
function NavSection({ group, links, current, large, open, onToggle, onNavigate }: { group: NavGroup; links: NavLink[]; current: string | null; large: boolean; open: boolean; onToggle: () => void; onNavigate?: () => void }) {
  const id = React.useId();
  const Icon = group.icon;
  const holdsCurrent = links.some((l) => l.href === current);
  return (
    <div className="mb-1" data-testid={`nav-group-${group.key}`} data-open={open} data-current={holdsCurrent || undefined}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={id}
        className={cn(
          "group/head relative flex w-full items-center gap-3 rounded-lg pl-[15px] pr-2 text-left text-sm font-semibold transition-colors",
          large ? "min-h-12" : "min-h-10",
          holdsCurrent ? "text-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg",
          holdsCurrent && (open ? "group-data-[collapsed=true]/sidebar:bg-accent/10" : "bg-accent/10"),
        )}
        data-testid={`nav-group-${group.key}-toggle`}
      >
        {/* Closed over the current page (or folded into the rail): the accent bar stays on the heading. */}
        <span className={cn("absolute inset-y-2 left-0 w-0.5 rounded-full transition-colors", holdsCurrent ? (open ? "bg-transparent group-data-[collapsed=true]/sidebar:bg-accent" : "bg-accent") : "bg-transparent")} aria-hidden data-testid="nav-group-marker" />
        <Icon className={cn("h-[18px] w-[18px] shrink-0", holdsCurrent ? "text-accent" : "text-fg-subtle")} aria-hidden />
        <span className={cn("min-w-0 flex-1 truncate", FADE)}>
          {group.label}
          {holdsCurrent && !open ? <span className="sr-only"> (current section)</span> : null}
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-fg-subtle transition-transform duration-200 motion-reduce:transition-none", !open && "-rotate-90", FADE)} aria-hidden />
      </button>
      <div id={id} role="group" aria-label={group.label} className={cn("grid transition-[grid-template-rows] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none", open ? "grid-rows-[1fr] group-data-[collapsed=true]/sidebar:grid-rows-[0fr]" : "grid-rows-[0fr]")}>
        <div className="min-h-0 overflow-hidden">
          <div className="relative flex flex-col gap-0.5 pb-1 pt-0.5" inert={!open || undefined}>
            {/* The guide line that ties the links to their heading. */}
            <span className={cn("absolute bottom-2 left-[23px] top-1 w-px bg-border", FADE)} aria-hidden />
            {links.map((l) => (
              <NavItem key={l.href} link={l} active={l.href === current} large={large} onNavigate={onNavigate} nested />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const CLOSED_COOKIE = "uniiverse_nav_closed";

/** Remembers the closed groups for the next page load (read by the server: no flash). */
function rememberClosed(keys: string[]) {
  document.cookie = `${CLOSED_COOKIE}=${keys.join(",")}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

/**
 * Vertical navigation: the desktop sidebar and the phone/tablet drawer share it. The server
 * decides which pages this account may open and passes their paths (`allowed`); icons stay here.
 */
export function NavLinks({ allowed, admin = false, onNavigate, large = false, initialClosed = [] }: { allowed: string[]; admin?: boolean; onNavigate?: () => void; large?: boolean; initialClosed?: string[] }) {
  const pathname = usePathname();
  const may = (l: NavLink) => allowed.includes(l.href);
  const [closed, setClosed] = React.useState<string[]>(initialClosed);
  const current = activeHref(pathname, admin ? ADMIN_LINKS.map((l) => l.href) : NAV_LINKS.map((l) => l.href));
  const toggle = (key: string, open: boolean) => {
    const next = open ? [...closed.filter((k) => k !== key), key] : closed.filter((k) => k !== key);
    setClosed(next);
    rememberClosed(next);
  };
  const entries: NavEntry[] = admin ? ADMIN_ENTRIES : NAV_ENTRIES;
  return (
    <nav className="flex flex-col gap-0.5 px-3" aria-label="Main">
      {entries.map((entry) => {
        if (isNavHub(entry)) {
          // Team: one entry, to the first section this account may open, marked on all of them.
          const sections = entry.sections.filter(may);
          if (sections.length === 0) return null;
          return <NavItem key={entry.key} link={{ href: sections[0]!.href, label: entry.label, icon: entry.icon }} active={sections.some((l) => l.href === current)} large={large} onNavigate={onNavigate} testId={`nav-${entry.key}`} />;
        }
        if (!isNavGroup(entry)) return may(entry) ? <NavItem key={entry.href} link={entry} active={entry.href === current} large={large} onNavigate={onNavigate} /> : null;
        const links = entry.links.filter(may);
        if (links.length === 0) return null;
        // Open unless the person closed it (the current page's group too: their choice wins).
        const open = !closed.includes(entry.key);
        return <NavSection key={entry.key} group={entry} links={links} current={current} large={large} open={open} onToggle={() => toggle(entry.key, open)} onNavigate={onNavigate} />;
      })}
    </nav>
  );
}
