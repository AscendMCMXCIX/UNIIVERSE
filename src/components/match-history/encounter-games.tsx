"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { RELATIONS, encounterFocusParams, encounterListParams, recordFor, type EncounterFocus, type EncounterListChoice, type EncounterRelation, type EncounterSummary } from "@/domain/encounters";
import { statsQuery, type StatsFilter } from "@/domain/season-stats";
import { InfoTip } from "@/components/ui/info-tip";
import { segmentClass, segmentedGroupClass } from "@/components/ui/segmented";
import { formatCount, formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import { ENCOUNTERS_CAVEAT, REL, Rate, RelationTag, RiotId, gamesText, recordText, relationOf } from "./encounters-view";

/*
  One player met, opened from Encounters (a row or a highlight) or from a game's scoreboard: their
  games are Match History's own list (match-history-view), filtered to them, so every game looks,
  opens and links exactly as it does there. Above it, this panel: the way back to the list as it was,
  who they are (and their OP.GG profile), how often and when you last met, the record against them
  and the record alongside them (never added together), and which games to list: all of them, or
  the ones on one side. The choice lives in the address (`met`, `side`), as the list's own choices
  do, so Back, Forward and a copied link open the same view.
*/

export interface EncounterGamesFocus {
  focus: EncounterFocus;
  /** The Encounters list's choices, kept for the way back. */
  list: EncounterListChoice;
  /** Null when this player was not met in these filters' games. */
  summary: EncounterSummary | null;
  /** Their newer Riot ID, when the account was renamed after the last game here. */
  renamed: string | null;
  opgg: string | null;
}

const LABEL: Record<EncounterRelation, string> = { all: "All", against: "Against", alongside: "Alongside" };

export function EncounterGamesPanel({ basePath, filter, encounter, playerName }: { basePath: string; filter: Pick<StatsFilter, "season" | "mode" | "accountId">; encounter: EncounterGamesFocus; playerName: string }) {
  const { focus, list, summary: s, renamed, opgg } = encounter;
  const shared = { season: filter.season, mode: filter.mode, accountId: filter.accountId };
  const back = `${basePath}?${statsQuery(shared, { view: "encounters", ...encounterListParams(list) })}`;
  const sideHref = (side: EncounterRelation) => `${basePath}?${statsQuery(shared, { view: "encounters", ...encounterListParams(list), ...encounterFocusParams({ key: focus.key, side }) })}`;
  // Met one way only: their games are that side's, so there is nothing to choose.
  const both = !!s && s.ally.games > 0 && s.opponent.games > 0;
  // Arriving from the list (or a scoreboard), the reader is told where they are: the player's name takes the focus.
  const title = React.useRef<HTMLHeadingElement>(null);
  React.useEffect(() => {
    title.current?.focus({ preventScroll: true });
  }, [focus.key]);
  return (
    <section aria-labelledby="encounter-title" className="rounded-panel border border-border bg-surface px-3 py-3 sm:px-4" data-testid="encounter-games" data-key={focus.key} data-side={focus.side}>
      <Link href={back} className="-ml-1 inline-flex min-h-9 items-center gap-1 rounded-md px-1 text-sm font-medium text-fg-muted transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11" data-testid="encounter-back">
        <ChevronLeft className="h-4 w-4" aria-hidden />
        All encounters
      </Link>
      <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
        <h3 ref={title} id="encounter-title" tabIndex={-1} className="min-w-0 text-lg font-semibold tracking-tight outline-none">
          <RiotId name={s?.name ?? "This player"} />
        </h3>
        {opgg ? (
          <a href={opgg} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border-strong px-2.5 text-xs font-medium text-fg-muted transition-colors hover:border-fg-subtle hover:text-fg focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11" data-testid="encounter-opgg">
            OP.GG <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        ) : null}
        {renamed ? (
          <span className="text-xs text-fg-muted" data-testid="encounter-renamed">
            Now {renamed}
          </span>
        ) : null}
      </div>
      {s ? (
        <>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-fg-muted" data-testid="encounter-detail-summary">
            <span>
              {gamesText(s.games)} with {playerName} · last met {formatDate(new Date(s.lastPlayedAt))}
            </span>
            <InfoTip text={ENCOUNTERS_CAVEAT} label="How encounters are counted" />
          </p>
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
            {/* The two records, never added together: against them, then alongside them. */}
            <dl className="flex flex-wrap gap-x-6 gap-y-1.5" data-testid="encounter-detail-records">
              {(["opponent", "ally"] as const).map((relation) => {
                const wl = s[relation];
                return (
                  <div key={relation} className="flex min-w-0 items-baseline gap-2 text-sm" data-testid="encounter-detail-record" data-relation={relation} data-games={wl.games}>
                    <dt className="self-center">
                      <RelationTag relation={relation} />
                    </dt>
                    {wl.games ? (
                      <dd className="flex items-baseline gap-x-2 tabular-nums">
                        <Rate wl={wl} className="font-semibold" />
                        <span className="text-fg-muted">{recordText(wl)}</span>
                        <span className="text-xs text-fg-muted">· {gamesText(wl.games)}</span>
                      </dd>
                    ) : (
                      <dd className="text-fg-subtle">never</dd>
                    )}
                  </div>
                );
              })}
            </dl>
            {both ? (
              <nav aria-label="Which games" className={segmentedGroupClass()} data-testid="encounter-games-filter">
                {RELATIONS.map((r) => (
                  <Link key={r} href={sideHref(r)} replace scroll={false} aria-current={focus.side === r ? "page" : undefined} className={segmentClass(focus.side === r, { size: "md" })} data-testid={`encounter-games-${r}`}>
                    {r !== "all" ? <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", REL[relationOf(r)].dot)} aria-hidden /> : null}
                    {LABEL[r]}
                    <span className={cn("tabular-nums", focus.side === r ? "text-fg-muted" : "text-fg-subtle")}>{formatCount(recordFor(s, r).games)}</span>
                    <span className="sr-only"> games</span>
                  </Link>
                ))}
              </nav>
            ) : null}
          </div>
        </>
      ) : (
        <p className="mt-1 text-sm text-fg-muted" data-testid="encounter-detail-message">
          No recorded games with this player in these filters. Try another season or game mode, or go back to all encounters.
        </p>
      )}
    </section>
  );
}
