"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_TEAM_SECTIONS, TEAM_SECTIONS } from "@/lib/nav";
import { BrandMark } from "@/components/brand-mark";
import { cn } from "@/lib/cn";

/**
 * Team's sections as tabs at the top of each of its pages: Overview | Players | Leaderboards |
 * Draft | Matches (TEAM_SECTIONS, the ones this account may open). They are the one list of Team's
 * pages: the sidebar has a single Team entry, marked on all of them. Every tab is a link with its
 * own address, so deep links, Back/Forward and new tabs work as before. The bar sits in the same
 * place on every section; the sections other than Overview (the team's home page, whose header
 * already shows it) name the team at its right end. Phones scroll the bar sideways (its right edge fades
 * to show there is more), with the current tab kept in view. Pages inside a section (a profile, a draft room, a match) have their
 * own headers and no bar.
 */
export function TeamTabs({ allowed, admin, team }: { allowed: string[]; admin: boolean; team: { name: string; logo: string | null; logoStill: string | null } }) {
  const pathname = usePathname();
  const sections = (admin ? ADMIN_TEAM_SECTIONS : TEAM_SECTIONS).filter((s) => allowed.includes(s.href));
  const current = sections.find((s) => s.href === pathname);
  const listRef = React.useRef<HTMLUListElement>(null);
  const currentRef = React.useRef<HTMLAnchorElement>(null);
  // Phones: the current tab in view (only the bar scrolls, never the page).
  React.useEffect(() => {
    const list = listRef.current;
    const tab = currentRef.current;
    if (!list || !tab || list.scrollWidth <= list.clientWidth) return;
    const left = tab.offsetLeft - list.offsetLeft;
    if (left < list.scrollLeft || left + tab.offsetWidth > list.scrollLeft + list.clientWidth) list.scrollLeft = Math.max(0, left - 16);
  }, [pathname]);
  if (!current) return null;
  return (
    <nav aria-label="Team sections" className="mb-4 flex items-end gap-4 border-b border-border sm:mb-5 lg:mb-6" data-testid="team-tabs">
      <ul ref={listRef} className="-mb-px flex min-w-0 flex-1 snap-x gap-1 overflow-x-auto [scrollbar-width:none] max-sm:pr-8 max-sm:[mask-image:linear-gradient(to_right,#000_calc(100%-2.5rem),transparent)] [&::-webkit-scrollbar]:hidden">
        {sections.map((s) => {
          const on = s.href === current.href;
          return (
            <li key={s.href} className="snap-start">
              <Link
                ref={on ? currentRef : undefined}
                href={s.href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors duration-150",
                  on ? "border-accent text-fg" : "border-transparent text-fg-muted hover:border-border-strong hover:text-fg",
                )}
                data-testid={`team-tab-${s.href.slice(1)}`}
              >
                <s.icon className={cn("hidden h-4 w-4 sm:block", on ? "text-accent" : "text-fg-subtle")} aria-hidden />
                {s.label}
              </Link>
            </li>
          );
        })}
      </ul>
      {current.href !== "/team" ? (
        <Link href="/team" className="mb-2 hidden min-w-0 max-w-[16rem] shrink items-center gap-2 text-sm font-semibold text-fg-muted hover:text-fg md:flex" title={`${team.name}: Team Overview`} data-testid="team-tabs-identity">
          <BrandMark src={team.logo} still={team.logoStill} name={team.name} className="h-7 w-7 shrink-0 rounded-md text-xs" />
          <span className="truncate">{team.name}</span>
        </Link>
      ) : null}
    </nav>
  );
}
