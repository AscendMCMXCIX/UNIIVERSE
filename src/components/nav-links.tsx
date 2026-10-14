"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { ADMIN_LINKS, NAV_ENTRIES, isActivePath, isNavGroup, type NavGroup, type NavLink } from "@/lib/nav";
import { NAV_GROUPS_COOKIE } from "@/lib/sidebar";
import { SidebarCollapsedContext } from "./collapsible-sidebar";

export { ADMIN_LINKS, NAV_LINKS, isActivePath, canOpen, firstAdminPath, type NavLink } from "@/lib/nav";

function NavItem({ link, active, large, nested, onNavigate }: { link: NavLink; active: boolean; large: boolean; nested?: boolean; onNavigate?: () => void }) {
  const Icon = link.icon;
  return (
    <Link
      href={link.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={link.label}
      className={cn(
        "group relative flex items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-150",
        large ? "min-h-12 py-2" : "min-h-10 py-2",
        nested && "pl-5 group-data-[collapsed=true]/sidebar:pl-3",
        active ? "bg-accent/10 text-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg",
      )}
    >
      <span className={cn("absolute inset-y-2 left-0 w-0.5 rounded-full transition-colors", active ? "bg-accent" : "bg-transparent")} aria-hidden />
      <Icon className={cn("shrink-0 transition-colors", nested ? "h-4 w-4" : "h-[18px] w-[18px]", active ? "text-accent" : "text-fg-subtle group-hover:text-fg-muted")} aria-hidden />
      {/* Collapsed sidebar: icon only; the label stays for screen readers and as the tooltip (title). */}
      <span className="truncate group-data-[collapsed=true]/sidebar:sr-only">{link.label}</span>
    </Link>
  );
}

/**
 * A group of related pages (Team: Overview, Draft, Matches). The header opens and closes it; the
 * choice is remembered in a cookie so every page renders it the same way. The group holding the
 * current page is always open. In the collapsed sidebar the header disappears and its pages show
 * as icons like any other link.
 */
function NavGroupSection({ group, links, pathname, large, initiallyOpen, onNavigate }: { group: NavGroup; links: NavLink[]; pathname: string; large: boolean; initiallyOpen: boolean; onNavigate?: () => void }) {
  const [open, setOpen] = React.useState(initiallyOpen);
  const collapsedSidebar = React.useContext(SidebarCollapsedContext);
  const containsActive = links.some((l) => isActivePath(pathname, l.href));
  const shown = open || containsActive || collapsedSidebar;
  const id = React.useId();
  const toggle = () => {
    const next = !open;
    setOpen(next);
    const closed = new Set(document.cookie.split("; ").find((c) => c.startsWith(`${NAV_GROUPS_COOKIE}=`))?.split("=")[1]?.split(",").filter(Boolean) ?? []);
    if (next) closed.delete(group.key);
    else closed.add(group.key);
    document.cookie = `${NAV_GROUPS_COOKIE}=${[...closed].join(",")}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  };
  const Icon = group.icon;
  return (
    <div data-testid={`nav-group-${group.key}`}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={shown}
        aria-controls={id}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium transition-colors group-data-[collapsed=true]/sidebar:hidden",
          large ? "min-h-12" : "min-h-10",
          containsActive ? "text-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg",
        )}
      >
        <Icon className={cn("h-[18px] w-[18px] shrink-0", containsActive ? "text-accent" : "text-fg-subtle")} aria-hidden />
        <span className="flex-1 truncate">{group.label}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-fg-subtle transition-transform duration-200 motion-reduce:transition-none", shown ? "rotate-0" : "-rotate-90")} aria-hidden />
      </button>
      {/* Collapsed sidebar: a thin rule marks the group instead of its header. */}
      <div className="mx-3 my-1 hidden h-px bg-border group-data-[collapsed=true]/sidebar:block" aria-hidden />
      <div id={id} className={cn("grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none", shown ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="min-h-0 overflow-hidden">
          <div className="ml-3 flex flex-col gap-0.5 border-l border-border pl-1 group-data-[collapsed=true]/sidebar:ml-0 group-data-[collapsed=true]/sidebar:border-l-0 group-data-[collapsed=true]/sidebar:pl-0" inert={!shown ? true : undefined}>
            {links.map((l) => (
              <NavItem key={l.href} link={l} active={isActivePath(pathname, l.href)} large={large} nested onNavigate={onNavigate} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Vertical navigation: the desktop sidebar and the phone/tablet drawer share it. The server
 * decides which pages this account may open and passes their paths (`allowed`); icons stay here.
 */
export function NavLinks({ allowed, admin = false, onNavigate, large = false, closedGroups = [] }: { allowed: string[]; admin?: boolean; onNavigate?: () => void; large?: boolean; closedGroups?: string[] }) {
  const pathname = usePathname();
  const may = (l: NavLink) => allowed.includes(l.href);
  return (
    <nav className="flex flex-col gap-0.5 px-3 group-data-[collapsed=true]/sidebar:px-2" aria-label="Main">
      {admin
        ? ADMIN_LINKS.filter(may).map((l) => <NavItem key={l.href} link={l} active={isActivePath(pathname, l.href)} large={large} onNavigate={onNavigate} />)
        : NAV_ENTRIES.map((entry) => {
            if (!isNavGroup(entry)) return may(entry) ? <NavItem key={entry.href} link={entry} active={activeFor(pathname, entry.href)} large={large} onNavigate={onNavigate} /> : null;
            const links = entry.links.filter(may);
            if (links.length === 0) return null;
            return <NavGroupSection key={entry.key} group={entry} links={links} pathname={pathname} large={large} initiallyOpen={!closedGroups.includes(entry.key)} onNavigate={onNavigate} />;
          })}
    </nav>
  );
}

/** My Profile stays highlighted on its own tabs, but not on the account pages reached from the avatar menu. */
function activeFor(pathname: string, href: string): boolean {
  if (href === "/overview" && pathname.startsWith("/overview/accounts")) return false;
  return isActivePath(pathname, href);
}
