"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SECTION_HUBS } from "@/lib/nav";
import { BrandMark } from "@/components/brand-mark";
import { cn } from "@/lib/cn";
import { useScrollEdges } from "@/components/ui/scroll-row";

/**
 * The sections of a sidebar entry that stands for several pages (SECTION_HUBS), as tabs at the top
 * of each of those pages, limited to the ones this account may open:
 *   Team           Overview | Players | Leaderboards | Matches (Clash Scout is its own entry).
 * They are the one list of those pages: the sidebar has a single entry, marked on all of them.
 * Every tab is a link with its own address, so deep links, Back/Forward and new tabs work as
 * before. The bar sits in the same place on every section. Team's sections other than Overview
 * (the team's home page, whose header already shows it) name the team at the bar's right end.
 * On desktop the bar is compact (40 px tabs level with the sidebar's brand row). On phones the tabs
 * share the width when they fit; when they do not, the bar scrolls sideways, an edge fades where
 * more tabs are hidden, and the current tab is kept in view. Pages inside a section (a profile, a
 * match) have their own headers and no bar.
 */
export function SectionTabs({ allowed, admin, team }: { allowed: string[]; admin: boolean; team: { name: string; logo: string | null; logoStill: string | null } }) {
  const pathname = usePathname();
  const hub = SECTION_HUBS.find((h) => h.sections.some((s) => s.href === pathname));
  const sections = ((admin && hub?.adminSections) || hub?.sections || []).filter((s) => allowed.includes(s.href));
  const current = sections.find((s) => s.href === pathname);
  const listRef = React.useRef<HTMLUListElement>(null);
  useScrollEdges(listRef, { keepCurrentInView: true, current: pathname });
  if (!hub || !current) return null;
  return (
    <nav aria-label={hub.label} className="mb-4 flex items-end gap-4 border-b border-border sm:mb-5 lg:mb-4 lg:first:-mt-2" data-testid={`${hub.key}-tabs`}>
      <ul ref={listRef} className="scroll-fade-x -mb-px flex min-w-0 flex-1 snap-x gap-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {sections.map((s) => {
          const on = s.href === current.href;
          return (
            <li key={s.href} className="shrink-0 snap-start max-sm:grow">
              <Link
                href={s.href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center gap-2 lg:min-h-10 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors duration-150 max-sm:w-full max-sm:justify-center max-sm:px-2",
                  on ? "border-accent text-fg" : "border-transparent text-fg-muted hover:border-border-strong hover:text-fg",
                )}
                data-testid={`${hub.key}-tab-${s.href.split("/").pop()}`}
              >
                <s.icon className={cn("hidden h-4 w-4 sm:block", on ? "text-accent" : "text-fg-subtle")} aria-hidden />
                {s.label}
              </Link>
            </li>
          );
        })}
      </ul>
      {hub.key === "team" && current.href !== "/team" ? (
        <Link href="/team" className="mb-2 hidden min-w-0 max-w-[16rem] shrink items-center gap-2 text-sm font-semibold text-fg-muted hover:text-fg md:flex" title={`${team.name}: Team Overview`} data-testid="team-tabs-identity">
          <BrandMark src={team.logo} still={team.logoStill} name={team.name} className="h-7 w-7 shrink-0 rounded-md text-xs" />
          <span className="truncate">{team.name}</span>
        </Link>
      ) : null}
    </nav>
  );
}
