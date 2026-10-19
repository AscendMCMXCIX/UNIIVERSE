import Link from "next/link";
import { Search } from "lucide-react";
import { seasonLabel } from "@/domain/season";
import type { EncounterSort, EncounterSummary, EncounterView } from "@/domain/encounters";
import type { EncounterMember } from "@/server/matches/encounters";
import type { PortraitChampion } from "@/components/champion-portrait";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar, FilterField } from "@/components/ui/filter-bar";
import { segmentClass, segmentedGroupClass } from "@/components/ui/segmented";
import { cn } from "@/lib/cn";
import { TOGETHER_QUEUES } from "./played-together";
import { EncounterBrowser, type EncounterFilterArgs, type EncounterInsightView } from "./encounter-browser";
import { LinkSelect, MemberPicker } from "./match-filters";

/*
  Team → Matches → Encounters: the people team members keep meeting in their recorded games.
  Three lists (allies, opponents, players met by several members) as one switch, then the same
  toolbar as Played together with the filters that apply here: search, season (when there is a
  choice), game mode, one member or everyone, a minimum of games and the order, and the member's
  Riot account when they have several. Every choice is a link, so each view has its own address
  and Back works. What encounters prove is behind the (i) in the page header.
*/

export interface EncounterFilters {
  view: EncounterView;
  member: string | null;
  account: string | null;
  /** A season (game-version major) from 2026 on; the current season by default. */
  season: number;
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
  [seasonLabel(f.season), TOGETHER_QUEUES[f.queue]?.label ?? "All supported games", f.member ? members[f.member]?.name : null, `${f.min}+ games`, f.view === "shared" ? null : SORTS[f.sort](f.view), f.account ? (members[f.member ?? ""]?.accounts.find((a) => a.id === f.account)?.label ?? null) : null].filter(Boolean).join(" · ");

export function EncountersView({ filters, href, members, seasons, currentSeason, list, total, insights, champions, filterArgs }: { filters: EncounterFilters; href: (change: Partial<EncounterFilters>) => string; members: Record<string, EncounterMember>; seasons: number[]; currentSeason: number; list: EncounterSummary[]; total: number; insights: EncounterInsightView[]; champions: Record<string, PortraitChampion>; filterArgs: EncounterFilterArgs }) {
  const member = filters.member ? members[filters.member] : null;
  const moreHref = list.length < total ? href({ limit: filters.limit + 30 }) : null;
  const narrowed = (filters.season !== currentSeason ? 1 : 0) + (filters.queue !== "all" ? 1 : 0) + (filters.member ? 1 : 0) + (filters.min !== 2 ? 1 : 0) + (filters.view !== "shared" && filters.sort !== "games" ? 1 : 0) + (filters.account ? 1 : 0);
  // Search by Riot ID: a plain GET form, so it keeps the other filters through hidden fields.
  const search = (
    <form action="/matches" className="flex w-full items-center gap-2" role="search" data-testid="encounter-search">
      {Object.entries({ view: "encounters", rel: filters.view, member: filters.member ?? "", account: filters.account ?? "", season: filters.season === currentSeason ? "" : String(filters.season), queue: filters.queue === "all" ? "" : filters.queue, min: filters.min === 2 ? "" : String(filters.min), sort: filters.sort === "games" ? "" : filters.sort })
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
      <label className="relative flex-1">
        <span className="sr-only">Find a player by Riot ID</span>
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" aria-hidden />
        <input type="search" name="q" defaultValue={filters.q} placeholder="Find a player by Riot ID" className="h-11 w-full rounded-md border border-border bg-bg-elevated pl-8 pr-2 text-sm text-fg placeholder:text-fg-subtle focus-visible:outline-2 focus-visible:outline-accent md:pointer-fine:h-9" data-testid="encounter-search-input" />
      </label>
      {filters.q ? (
        <Link href={href({ q: "", limit: 30 })} className="inline-flex min-h-11 shrink-0 items-center px-1 text-xs font-medium text-accent hover:underline md:pointer-fine:min-h-9">
          Clear
        </Link>
      ) : null}
    </form>
  );
  return (
    <div className="space-y-4" data-testid="encounters">
      <nav aria-label="Encounters" className={segmentedGroupClass("max-md:w-full max-md:overflow-x-auto max-md:[scrollbar-width:none]")} data-testid="encounter-views">
        {(Object.keys(ENCOUNTER_VIEWS) as EncounterView[]).map((v) => (
          <Link key={v} href={href({ view: v, limit: 30, sort: v === "shared" ? "games" : filters.sort, ...(v === "shared" ? { member: null, account: null } : {}) })} aria-current={filters.view === v ? "page" : undefined} className={segmentClass(filters.view === v, { className: "shrink-0" })} data-testid={`encounter-view-${v}`}>
            {ENCOUNTER_VIEWS[v]}
          </Link>
        ))}
      </nav>

      <FilterBar
        testId="encounter-filters"
        toggleTestId="encounter-filters-toggle"
        summary={summaryOf(filters, members)}
        activeCount={narrowed}
        resetHref={href({ season: currentSeason, queue: "all", member: null, account: null, min: 2, sort: "games", q: "", limit: 30 })}
        resetLabel="Clear filters"
        search={search}
      >
        {seasons.length > 1 ? (
          <FilterField label="Season" htmlFor="encounter-season">
            <LinkSelect id="encounter-season" label="Season" value={String(filters.season)} options={seasons.map((s) => ({ value: String(s), label: `${seasonLabel(s)}${s === currentSeason ? " (current)" : ""}`, href: href({ season: s, limit: 30 }) }))} testId="encounter-season" />
          </FilterField>
        ) : null}
        <FilterField label="Game mode" htmlFor="encounter-queue">
          <LinkSelect id="encounter-queue" label="Game mode" value={filters.queue} options={Object.entries(TOGETHER_QUEUES).map(([k, q]) => ({ value: k, label: q.label, href: href({ queue: k, limit: 30 }) }))} testId="encounter-queue" />
        </FilterField>
        {filters.view !== "shared" ? (
          <FilterField label="Team member" labelId="encounter-member-label">
            <MemberPicker
              label="Team member"
              emptyLabel="All members"
              clearHref={href({ member: null, account: null, limit: 30 })}
              members={Object.values(members)
                .filter((m) => m.accounts.length > 0)
                .map((m) => ({ id: m.id, name: m.name, avatarUrl: m.avatarUrl, look: m.look, selected: filters.member === m.id, href: href({ member: m.id, account: null, limit: 30 }) }))}
              testId="encounter-member-picker"
            />
          </FilterField>
        ) : null}
        <FilterField label="At least" htmlFor="encounter-min">
          <LinkSelect id="encounter-min" label="At least" value={String(filters.min)} options={[2, 3, 5].map((n) => ({ value: String(n), label: `${n}+ games`, href: href({ min: n, limit: 30 }) }))} testId="encounter-min" />
        </FilterField>
        {filters.view !== "shared" ? (
          <FilterField label="Order" htmlFor="encounter-sort">
            <LinkSelect id="encounter-sort" label="Order" value={filters.sort} options={(Object.keys(SORTS) as EncounterSort[]).map((k) => ({ value: k, label: SORTS[k](filters.view), href: href({ sort: k, limit: 30 }) }))} testId="encounter-sort" />
          </FilterField>
        ) : null}
        {member && member.accounts.length > 1 ? (
          <FilterField label="Riot account" htmlFor="encounter-account">
            <LinkSelect id="encounter-account" label="Riot account" value={filters.account ?? ""} options={[{ id: "", label: "All accounts" }, ...member.accounts].map((a) => ({ value: a.id ?? "", label: a.label, href: href({ account: a.id || null, limit: 30 }) }))} testId="encounter-account" />
          </FilterField>
        ) : null}
      </FilterBar>

      {total === 0 ? (
        <EmptyState title={filters.q ? `No recorded player matches "${filters.q}"` : filters.view === "shared" ? "No player met by two or more members here yet" : `No ${filters.view === "allies" ? "ally" : "opponent"} met ${filters.min}+ times here yet`} testId="encounters-empty">
          <p className="max-w-lg text-sm text-fg-muted">
            {member ? `${member.name}'s` : "Team members'"} recorded games in {seasonLabel(filters.season)}
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
