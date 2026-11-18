"use client";

import type * as React from "react";
import { Swords, Users } from "lucide-react";
import { seasonModeInfo, statsQuery, type StatsFilter } from "@/domain/season-stats";
import { seasonLabel } from "@/domain/season";
import { SectionHeader } from "@/components/ui/section-header";
import { SubTabs } from "@/components/ui/sub-tabs";
import { FiltersControl, PageToolbar } from "@/components/ui/page-toolbar";

/*
  Match History's one header, shared by its two views (components/match-history: the games and
  Encounters), so switching between them moves nothing: Games | Encounters as secondary tabs
  directly under the profile's own tabs (ui/sub-tabs), in the place a section's title takes (the
  profile's Match History tab above already names the section, so the title is only read by screen
  readers), the filters and Refresh on the same row whenever they fit there (a phone's views,
  Filters and Refresh are one row: owner decision D8, 8 Nov 2026), then the line saying what is
  counted with the data status. On a phone the views share their track without their icons, so
  the row has room for Filters and Refresh; narrowed filters bring their chips, and the toolbar
  takes the next row when they do not fit beside the views; below xl an active refinement's chip
  (under the bar on a tablet) always brings it there, clear of the Refine panel (SectionHeader's
  `toolbarBesideNav` and `toolbarFills`).
  The season, game mode and account are one choice for both views: they carry over.
*/

/**
 * A phone's views without their icons and a little tighter (the labels say it all), so Filters and
 * Refresh share their row: about 168px of tabs, Filters (its icon alone under 360px: FilterBar's
 * `compactToggle`) and a 44px Refresh fit a 320px phone's 288px row, and a 360px one's with the word.
 * The track hugs its 44px tabs (2px around them), so the row is 48px.
 */
const PHONE_VIEWS = "max-sm:[&_a]:px-2 max-sm:[&_svg]:hidden max-sm:[&_ul]:p-0.5";

export type MatchHistoryViewKey = "games" | "encounters";

/** What the filters choose, in words: "Season 2026 · All supported games · All accounts" (the account only when several are linked). */
export function scopeText(filter: Pick<StatsFilter, "season" | "mode" | "accountId">, accounts: ReadonlyArray<{ id: string; riotId: string }>, accountsLinked: number): string {
  const account = filter.accountId ? accounts.find((a) => a.id === filter.accountId) : null;
  return [seasonLabel(filter.season), seasonModeInfo(filter.mode).label, account ? account.riotId : accountsLinked > 1 ? "All accounts" : null].filter(Boolean).join(" · ");
}

export function MatchHistoryHeader({ view, basePath, filter, description, status, statusAfterText = false, narrowed = false, refined = false, controls, refresh }: {
  view: MatchHistoryViewKey;
  basePath: string;
  filter: Pick<StatsFilter, "season" | "mode" | "accountId">;
  description?: React.ReactNode;
  status?: React.ReactNode;
  /** The status in the scope's text flow (a plain `<p>` scope: the games list's). */
  statusAfterText?: boolean;
  /** Some filter is narrowed (a phone shows its chips beside Filters): the filters then fill the toolbar's row from its start. */
  narrowed?: boolean;
  /** Some refinement is active (a tablet shows its chip under the filters): below xl the toolbar then takes a row of its own. */
  refined?: boolean;
  controls?: React.ReactNode;
  refresh?: React.ReactNode;
}) {
  const shared = { season: filter.season, mode: filter.mode, accountId: filter.accountId };
  const views = [
    { key: "games", label: "Games", icon: Swords, href: `${basePath}?${statsQuery(shared)}`, testId: "match-view-games" },
    { key: "encounters", label: "Encounters", icon: Users, href: `${basePath}?${statsQuery(shared, { view: "encounters" })}`, testId: "match-view-encounters" },
  ];
  return (
    <SectionHeader
      id="match-history"
      title="Match History"
      nav={
        <>
          <SubTabs label="Match History views" items={views} current={view} className={PHONE_VIEWS} testId="match-views" />
          {/* From md, once the header has scrolled away: the views and Filters at the pinned tabs' end (ui/page-toolbar.tsx; nothing here). */}
          <PageToolbar label="Match History controls" land="[data-testid=encounter-row], [data-testid=match-card]">
            <SubTabs size="compact" label="Match History views" items={views} current={view} testId="match-views" />
            <FiltersControl />
          </PageToolbar>
        </>
      }
      description={description}
      status={status}
      statusAfterText={statusAfterText}
      controls={controls}
      refresh={refresh}
      toolbarBesideNav
      toolbarFills={refined ? "below-xl" : narrowed}
    />
  );
}
