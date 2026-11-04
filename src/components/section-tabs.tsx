"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SECTION_HUBS } from "@/lib/nav";
import { BrandMark } from "@/components/brand-mark";
import { TabBar } from "@/components/ui/tab-bar";
import { cn } from "@/lib/cn";

/**
 * The sections of a sidebar entry that stands for several pages (SECTION_HUBS), as tabs at the top
 * of each of those pages, limited to the ones this account may open:
 *   Team                 Overview | Players | Leaderboards | Matches;
 *   Platform Settings    Branding | Previews (Admin Mode).
 * They are the one list of those pages: the sidebar has a single entry, marked on all of them.
 * Every tab is a link with its own address, so deep links, Back/Forward and new tabs work as
 * before. The bar sits in the same place on every section. Team's sections other than Overview
 * (the team's home page, whose header already shows it) name the team at the bar's right end.
 * On desktop the bar is compact (40 px tabs level with the sidebar's brand row). The bar is the
 * shared TabBar (ui/tab-bar.tsx), as on a profile: on phones the tabs share the width when they
 * fit, and otherwise scroll sideways with the current one in view. Pages inside a section (a
 * profile, a match) have their own headers and no Team bar.
 */
export function SectionTabs({ allowed, team }: { allowed: string[]; team: { name: string; logo: string | null; logoStill: string | null } }) {
  const pathname = usePathname();
  const hub = SECTION_HUBS.find((h) => h.sections.some((s) => s.href === pathname));
  const sections = (hub?.sections ?? []).filter((s) => allowed.includes(s.href));
  const current = sections.find((s) => s.href === pathname);
  if (!hub || !current) return null;
  return (
    <TabBar
      label={hub.label}
      items={sections.map((s) => ({ key: s.href, href: s.href, label: s.label, icon: s.icon, testId: `${hub.key}-tab-${s.href.split("/").pop()}` }))}
      current={current.href}
      dense
      // Phones reach Team's sections from the bottom tab bar (MobileNav), so the bar is not repeated in the page there.
      className={cn("mb-4 sm:mb-5 lg:mb-4 lg:first:-mt-2", hub.key === "team" && "max-md:hidden")}
      testId={`${hub.key}-tabs`}
      end={
        hub.key === "team" && current.href !== "/team" ? (
          <Link href="/team" className="mb-2 hidden min-w-0 max-w-[16rem] shrink items-center gap-2 text-sm font-semibold text-fg-muted hover:text-fg md:flex" title={`${team.name}: Team Overview`} data-testid="team-tabs-identity">
            <BrandMark src={team.logo} still={team.logoStill} name={team.name} className="h-7 w-7 shrink-0 rounded-md text-xs" />
            <span className="truncate">{team.name}</span>
          </Link>
        ) : null
      }
    />
  );
}
