"use client";

import type * as React from "react";
import { Swords, Users } from "lucide-react";
import { seasonModeInfo, statsQuery, type StatsFilter } from "@/domain/season-stats";
import { seasonLabel } from "@/domain/season";
import { SectionHeader } from "@/components/ui/section-header";
import { SubTabs } from "@/components/ui/sub-tabs";

/*
  Match History's one header, shared by its two views (components/match-history: the games and
  Encounters), so switching between them moves nothing: Games | Encounters as secondary tabs
  directly under the profile's own tabs (ui/sub-tabs), in the place a section's title takes (the
  profile's Match History tab above already names the section, so the title is only read by screen
  readers), the line saying what is counted with the data status, then the filters and Refresh.
  The season, game mode and account are one choice for both views: they carry over.
*/

export type MatchHistoryViewKey = "games" | "encounters";

/** What the filters choose, in words: "Season 2026 · All supported games · All accounts" (the account only when several are linked). */
export function scopeText(filter: Pick<StatsFilter, "season" | "mode" | "accountId">, accounts: ReadonlyArray<{ id: string; riotId: string }>, accountsLinked: number): string {
  const account = filter.accountId ? accounts.find((a) => a.id === filter.accountId) : null;
  return [seasonLabel(filter.season), seasonModeInfo(filter.mode).label, account ? account.riotId : accountsLinked > 1 ? "All accounts" : null].filter(Boolean).join(" · ");
}

export function MatchHistoryHeader({ view, basePath, filter, description, status, controls, refresh }: {
  view: MatchHistoryViewKey;
  basePath: string;
  filter: Pick<StatsFilter, "season" | "mode" | "accountId">;
  description?: React.ReactNode;
  status?: React.ReactNode;
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
      nav={<SubTabs label="Match History views" items={views} current={view} testId="match-views" />}
      description={description}
      status={status}
      controls={controls}
      refresh={refresh}
    />
  );
}
