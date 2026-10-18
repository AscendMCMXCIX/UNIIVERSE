import Link from "next/link";
import { Info, Search } from "lucide-react";
import { seasonLabel } from "@/domain/season";
import type { EncounterSort, EncounterSummary, EncounterView } from "@/domain/encounters";
import type { EncounterMember } from "@/server/matches/encounters";
import type { PortraitChampion } from "@/components/champion-portrait";
import { CardAvatar } from "@/components/players/card-look";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar, FilterField } from "@/components/ui/filter-bar";
import { InfoTip } from "@/components/ui/info-tip";
import { chipClass, segmentClass, segmentedGroupClass } from "@/components/ui/segmented";
import { cn } from "@/lib/cn";
import { TOGETHER_QUEUES } from "./played-together";
import { EncounterBrowser, type EncounterFilterArgs, type EncounterInsightView } from "./encounter-browser";

/*
  Team → Matches → Encounters: the people team members keep meeting in their recorded games.
  Three lists (allies, opponents, players met by several members), one member or all of them,
  and the secondary filters behind the shared Refine bar. Filters are links, so every view has
  its own address and Back works.
*/

export interface EncounterFilters {
  view: EncounterView;
  member: string | null;
  account: string | null;
  season: number | "all";
  queue: string;
  min: number;
  sort: EncounterSort;
  q: string;
  limit: number;
}

export const ENCOUNTER_VIEWS: Record<EncounterView, string> = { allies: "Frequent allies", opponents: "Frequent opponents", shared: "Met by several members" };
const SORTS: Record<EncounterSort, (view: EncounterView) => string> = {
  games: () => "Most games",
  best: (v) => (v === "opponents" ? "Best record against" : "Best record with"),
  worst: (v) => (v === "opponents" ? "Toughest record against" : "Weakest record with"),
};

const summaryOf = (f: EncounterFilters, members: Record<string, EncounterMember>) =>
  [f.season === "all" ? "All seasons" : seasonLabel(f.season), TOGETHER_QUEUES[f.queue]?.label ?? "All supported games", `${f.min}+ games`, SORTS[f.sort](f.view), f.account ? (members[f.member ?? ""]?.accounts.find((a) => a.id === f.account)?.label ?? null) : null].filter(Boolean).join(" · ");

export function EncountersView({ filters, href, members, seasons, currentSeason, list, total, insights, memberGames, champions, filterArgs }: { filters: EncounterFilters; href: (change: Partial<EncounterFilters>) => string; members: Record<string, EncounterMember>; seasons: number[]; currentSeason: number; list: EncounterSummary[]; total: number; insights: EncounterInsightView[]; memberGames: number; champions: Record<string, PortraitChampion>; filterArgs: EncounterFilterArgs }) {
  const member = filters.member ? members[filters.member] : null;
  const moreHref = list.length < total ? href({ limit: filters.limit + 30 }) : null;
  return (
    <div className="space-y-4" data-testid="encounters">
      <p className="text-xs leading-5 text-fg-muted" data-testid="encounters-note">
        <Info className="mr-1.5 inline h-3.5 w-3.5 align-[-0.2em] text-accent" aria-hidden />
        Players met in team members&apos; recorded games ({memberGames.toLocaleString("en")} games). Historical encounters only: not parties, friendships or every game they played.
        <InfoTip
          label="How encounters are counted"
          text="From the stored records of team members' synced Riot games (no extra Riot requests). An ally was on the member's team, an opponent on the other team. A player is recognised by their Riot account, not their name (the latest Riot ID is shown). Team totals count each game once, however many members were in it; each member's figures count their own games, across all their linked accounts. Games UNIIVERSE did not record are not included, so a missing game is not proof two players never met."
        />
      </p>

      <div className="space-y-2.5" data-testid="encounter-filters">
        <nav aria-label="Encounters" className={segmentedGroupClass("max-md:w-full max-md:overflow-x-auto max-md:[scrollbar-width:none]")} data-testid="encounter-views">
          {(Object.keys(ENCOUNTER_VIEWS) as EncounterView[]).map((v) => (
            <Link key={v} href={href({ view: v, limit: 30, sort: v === "shared" ? "games" : filters.sort })} aria-current={filters.view === v ? "page" : undefined} className={segmentClass(filters.view === v, { className: "shrink-0" })} data-testid={`encounter-view-${v}`}>
              {ENCOUNTER_VIEWS[v]}
            </Link>
          ))}
        </nav>
        <div className="flex flex-col gap-1.5 md:flex-row md:items-center">
          <span className="shrink-0 text-xs font-medium text-fg-subtle md:w-24">Team member</span>
          <nav aria-label="Team member" className="flex gap-1.5 max-md:overflow-x-auto max-md:pb-1 max-md:[scrollbar-width:none] max-md:[&>*]:shrink-0 md:flex-wrap" data-testid="encounter-members">
            <Link href={href({ member: null, account: null, limit: 30 })} className={chipClass(!filters.member)} aria-current={!filters.member ? "page" : undefined} data-testid="encounter-member-all">
              All members
            </Link>
            {Object.values(members)
              .filter((m) => m.accounts.length > 0)
              .map((m) => (
              <Link key={m.id} href={href({ member: m.id, account: null, limit: 30, view: filters.view === "shared" ? "allies" : filters.view })} className={chipClass(filters.member === m.id)} aria-current={filters.member === m.id ? "page" : undefined} data-testid="encounter-member-filter" data-player-id={m.id}>
                <CardAvatar look={m.look} name={m.name} src={m.avatarUrl} size="xs" />
                {m.name}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex flex-col gap-1.5 md:flex-row md:items-center">
          <span className="hidden shrink-0 text-xs font-medium text-fg-subtle md:block md:w-24">Filters</span>
          <FilterBar
            className="flex-1"
            testId="encounter-filter-bar"
            toggleTestId="encounter-filters-toggle"
            summary={summaryOf(filters, members)}
            activeCount={(filters.season !== currentSeason ? 1 : 0) + (filters.queue !== "all" ? 1 : 0) + (filters.min !== 2 ? 1 : 0) + (filters.sort !== "games" ? 1 : 0) + (filters.account ? 1 : 0)}
            resetHref={href({ season: currentSeason, queue: "all", min: 2, sort: "games", account: null, q: "", limit: 30 })}
          >
            {seasons.length > 1 ? (
              <FilterField label="Season" labelId="encounter-season-label">
                <nav aria-labelledby="encounter-season-label" className={segmentedGroupClass("max-md:flex-wrap")}>
                  {[...seasons, "all" as const].map((s) => (
                    <Link key={s} href={href({ season: s, limit: 30 })} aria-current={filters.season === s ? "page" : undefined} className={segmentClass(filters.season === s)} data-testid={`encounter-season-${s}`}>
                      {s === "all" ? "All seasons" : seasonLabel(s)}
                    </Link>
                  ))}
                </nav>
              </FilterField>
            ) : null}
            <FilterField label="Game mode" labelId="encounter-queue-label">
              <nav aria-labelledby="encounter-queue-label" className={segmentedGroupClass("max-md:flex-wrap")}>
                {Object.entries(TOGETHER_QUEUES).map(([k, q]) => (
                  <Link key={k} href={href({ queue: k, limit: 30 })} aria-current={filters.queue === k ? "page" : undefined} className={segmentClass(filters.queue === k)} data-testid={`encounter-queue-${k}`}>
                    {q.label}
                  </Link>
                ))}
              </nav>
            </FilterField>
            <FilterField label="At least" labelId="encounter-min-label">
              <nav aria-labelledby="encounter-min-label" className={segmentedGroupClass()}>
                {[2, 3, 5].map((n) => (
                  <Link key={n} href={href({ min: n, limit: 30 })} aria-current={filters.min === n ? "page" : undefined} className={segmentClass(filters.min === n)} data-testid={`encounter-min-${n}`}>
                    {n} games
                  </Link>
                ))}
              </nav>
            </FilterField>
            {filters.view !== "shared" ? (
              <FilterField label="Order" labelId="encounter-sort-label">
                <nav aria-labelledby="encounter-sort-label" className={segmentedGroupClass("max-md:flex-wrap")}>
                  {(Object.keys(SORTS) as EncounterSort[]).map((k) => (
                    <Link key={k} href={href({ sort: k, limit: 30 })} aria-current={filters.sort === k ? "page" : undefined} className={segmentClass(filters.sort === k)} data-testid={`encounter-sort-${k}`}>
                      {SORTS[k](filters.view)}
                    </Link>
                  ))}
                </nav>
              </FilterField>
            ) : null}
            {member && member.accounts.length > 1 ? (
              <FilterField label="Riot account" labelId="encounter-account-label">
                <nav aria-labelledby="encounter-account-label" className={segmentedGroupClass("max-md:flex-wrap")}>
                  {[{ id: null, label: "All accounts" }, ...member.accounts].map((a) => (
                    <Link key={a.id ?? "all"} href={href({ account: a.id, limit: 30 })} aria-current={filters.account === a.id ? "page" : undefined} className={segmentClass(filters.account === a.id)} data-testid="encounter-account">
                      {a.label}
                    </Link>
                  ))}
                </nav>
              </FilterField>
            ) : null}
          </FilterBar>
        </div>
        {/* Search by Riot ID: a plain GET form, so it keeps the other filters through hidden fields. */}
        <form action="/matches" className="flex max-w-md items-center gap-2" role="search" data-testid="encounter-search">
          {Object.entries({ view: "encounters", rel: filters.view, member: filters.member ?? "", account: filters.account ?? "", season: filters.season === currentSeason ? "" : String(filters.season), queue: filters.queue === "all" ? "" : filters.queue, min: filters.min === 2 ? "" : String(filters.min), sort: filters.sort === "games" ? "" : filters.sort })
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
          <label className="relative flex-1">
            <span className="sr-only">Find a player by Riot ID</span>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" aria-hidden />
            <input type="search" name="q" defaultValue={filters.q} placeholder="Find a player by Riot ID" className="h-9 w-full rounded-md border border-border bg-bg/60 pl-8 pr-2 text-sm text-fg placeholder:text-fg-subtle focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11" data-testid="encounter-search-input" />
          </label>
          {filters.q ? (
            <Link href={href({ q: "", limit: 30 })} className="shrink-0 text-xs font-medium text-accent hover:underline">
              Clear
            </Link>
          ) : null}
        </form>
      </div>

      {total === 0 ? (
        <EmptyState title={filters.q ? `No recorded player matches "${filters.q}"` : filters.view === "shared" ? "No player met by two or more members here yet" : `No ${filters.view === "allies" ? "ally" : "opponent"} met ${filters.min}+ times here yet`} testId="encounters-empty">
          <p className="max-w-lg text-sm text-fg-muted">
            {member ? `${member.name}'s` : "Team members'"} recorded games in {filters.season === "all" ? "all seasons" : seasonLabel(filters.season)}
            {filters.queue !== "all" ? ` (${TOGETHER_QUEUES[filters.queue]?.label})` : ""} have no such player. Try another season, a lower minimum or all game modes; games UNIIVERSE did not record are not counted.
          </p>
        </EmptyState>
      ) : (
        <div className={cn(filters.view === "shared" && "space-y-2")}>
          <EncounterBrowser view={filters.view} list={list} total={total} moreHref={moreHref} insights={insights} members={members} champions={champions} filterArgs={filterArgs} />
        </div>
      )}
    </div>
  );
}
