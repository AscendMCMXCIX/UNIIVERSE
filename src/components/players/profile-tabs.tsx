"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { PROFILE_SECTIONS, activeHref } from "@/lib/nav";
import { Menu, MenuLink } from "@/components/ui/menu";
import { cn } from "@/lib/cn";

/** Sections that share the chosen season and game mode when you move between them. */
const KEEPS_SEASON = new Set(["overview", "champions", "matches"]);

/**
 * The profile's sections as a bar fixed under the profile card: Overview | All Champions |
 * Solo Queue Blocks (your own profile only; it is private) | Match History | Riot Accounts. The
 * same list as the sidebar's My Profile group (PROFILE_SECTIONS), and both read the address, so
 * they always agree. Every entry is a link: Back/Forward, new tabs and the keyboard work, and the
 * page changes without a full reload. Phones get one compact section picker instead of five
 * cramped tabs.
 */
export function ProfileTabs({ basePath, showBlocks }: { basePath: string; showBlocks: boolean }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const sections = PROFILE_SECTIONS.filter((s) => !s.own || showBlocks).map((s) => ({ ...s, href: `${basePath}${s.path}` }));
  const currentHref = activeHref(pathname, sections.map((s) => s.href)) ?? basePath;
  const current = sections.find((s) => s.href === currentHref) ?? sections[0]!;
  const carried = new URLSearchParams();
  if (KEEPS_SEASON.has(current.key)) for (const k of ["season", "mode"]) if (params.get(k)) carried.set(k, params.get(k)!);
  const hrefOf = (s: (typeof sections)[number]) => (KEEPS_SEASON.has(s.key) && carried.size && s.key !== current.key ? `${s.href}?${carried.toString()}` : s.href);
  const Icon = current.icon;
  return (
    <div data-testid="profile-tabs">
      {/* Tablets and desktops: the bar. */}
      <nav aria-label="Profile sections" className="hidden border-b border-border sm:block">
        <ul className="-mb-px flex gap-1 overflow-x-auto">
          {sections.map((s) => {
            const on = s.key === current.key;
            return (
              <li key={s.key}>
                <Link
                  href={hrefOf(s)}
                  aria-current={on ? "page" : undefined}
                  scroll={false}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors duration-150",
                    on ? "border-accent text-fg" : "border-transparent text-fg-muted hover:border-border-strong hover:text-fg",
                  )}
                  data-testid={`profile-tab-${s.key}`}
                >
                  <s.icon className={cn("h-4 w-4", on ? "text-accent" : "text-fg-subtle")} aria-hidden />
                  {s.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {/* Phones: one section picker. */}
      <div className="sm:hidden">
        <Menu
          label="Profile sections"
          align="start"
          className="w-64"
          testId="profile-section-menu"
          trigger={(p) => (
            <button {...p} type="button" className="group flex min-h-12 w-full items-center gap-2.5 rounded-panel border border-border bg-surface/70 px-3 text-left" data-testid="profile-section-button">
              <Icon className="h-[18px] w-[18px] text-accent" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-base font-semibold text-fg">{current.label}</span>
              <span className="sr-only">: change profile section</span>
              <ChevronDown className="h-4 w-4 text-fg-subtle transition-transform group-aria-expanded:rotate-180" aria-hidden />
            </button>
          )}
        >
          {sections.map((s) => (
            <MenuLink key={s.key} href={hrefOf(s)} icon={<s.icon className="h-4 w-4" />} active={s.key === current.key}>
              {s.label}
            </MenuLink>
          ))}
        </Menu>
      </div>
    </div>
  );
}
