"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, ExternalLink } from "lucide-react";
import { ENCOUNTER_MINIMUMS, ENCOUNTER_PAGE, ESTABLISHED_GAMES, INSIGHT_LABELS, defaultMinimum, encounterListParams, recordFor, type EncounterListChoice, type EncounterRelation, type EncounterSort, type EncounterSummary, type Relation, type WinLoss } from "@/domain/encounters";
import { statsQuery, type SeasonMode, type StatsFilter } from "@/domain/season-stats";
import { seasonLabel } from "@/domain/season";
import type { EncounterPage } from "@/server/players/encounters";
import { getEncounterDetailAction, type EncounterDetailResult } from "@/server/actions/encounters";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { CLEAR_OF_CONTROLS, DetailModal } from "@/components/ui/detail-modal";
import { InfoTip } from "@/components/ui/info-tip";
import { DataRefresh, type DataRefreshTarget } from "@/components/ui/data-status";
import { SectionHeader } from "@/components/ui/section-header";
import type { DataStatus } from "@/domain/data-status";
import { Select } from "@/components/ui/input";
import { SearchInput } from "@/components/ui/search-input";
import { segmentClass, segmentedGroupClass } from "@/components/ui/segmented";
import { ModeElsewhere, OverviewFilters } from "@/components/players/overview-filters";
import { formatCount, formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import { MatchDetailModal } from "./match-detail";

/*
  Match History → Encounters: the players this profile's player keeps meeting in their recorded
  games, as opponents or allies, with the player's own results against and alongside them. The
  same season, game mode and account filters as the games list (one choice for both views); every
  count, highlight and window follows them. Counted in the database for this player only (server/
  players/encounters), a page of players at a time. A player opens their window (records and the
  games), and a game opens the shared match window, with Back to the player. Records read as plain
  counts ("Faced 6 times · 2W 4L"); a percentage appears only once ESTABLISHED_GAMES decided games
  stand behind it.
*/

export interface EncountersData {
  filter: StatsFilter;
  seasons: number[];
  currentSeason: number;
  accountOptions: Array<{ id: string; riotId: string; label: string }>;
  accountsLinked: number;
  modes: { counts: Record<SeasonMode, number>; elsewhere: Array<{ season: number; games: number }> };
  choice: EncounterListChoice;
  page: EncounterPage;
}

const CAVEAT =
  "From this player's stored Riot games (no extra Riot requests). An ally was on the player's team, an opponent on the other team, and Mixed means both; the results are the player's own. A player is recognised by their Riot account, not their name (the latest Riot ID is shown), and teammates with a profile here are left out. Historical encounters only: not parties, friendships or every game they played. Games that were not recorded are not counted, so a missing game is not proof two players never met.";

const RELATIONS: Record<EncounterRelation, string> = { opponents: "Opponents", allies: "Allies", everyone: "Everyone" };
const SORTS: Record<EncounterSort, (r: EncounterRelation) => string> = {
  games: () => "Most games",
  best: (r) => (r === "opponents" ? "Best record against" : r === "allies" ? "Best record alongside" : "Best record"),
  worst: (r) => (r === "opponents" ? "Toughest record against" : r === "allies" ? "Weakest record alongside" : "Worst record"),
};

const decided = (wl: WinLoss) => wl.wins + wl.losses;
const pct = (wl: WinLoss) => (decided(wl) >= ESTABLISHED_GAMES ? ` · ${Math.round((wl.wins / decided(wl)) * 100)}%` : "");
const recordText = (wl: WinLoss) => `${wl.wins}W ${wl.losses}L${pct(wl)}`;
const times = (n: number) => (n === 1 ? "once" : `${formatCount(n)} times`);
const headline = (relation: EncounterRelation | "ally" | "opponent", games: number) => (relation === "allies" || relation === "ally" ? `Alongside ${times(games)}` : relation === "opponents" || relation === "opponent" ? `Faced ${times(games)}` : `Met ${times(games)}`);
const tone = (relation: EncounterRelation | "ally" | "opponent") => (relation === "allies" || relation === "ally" ? "text-blue" : relation === "opponents" || relation === "opponent" ? "text-red" : "text-fg-muted");

/** "Name#TAG" with the tag quieter. */
function RiotId({ name, className }: { name: string; className?: string }) {
  const i = name.lastIndexOf("#");
  return (
    <span className={cn("min-w-0 truncate", className)} title={name}>
      <span className="font-semibold text-fg">{i > 0 ? name.slice(0, i) : name}</span>
      {i > 0 ? <span className="text-fg-subtle">{name.slice(i)}</span> : null}
    </span>
  );
}

/** What a player was in the games in view: on the other team (Opponent), on the player's (Ally), or both (Mixed). */
type Kind = Relation | "mixed";
const kindOf = (s: Pick<EncounterSummary, "ally" | "opponent">): Kind => (s.ally.games && s.opponent.games ? "mixed" : s.ally.games ? "ally" : "opponent");

/** Each kind's word and colours: an opponent warm (red), an ally cool (blue), Mixed split between the two. */
const KIND: Record<Kind, { label: string; badge: string; dot: string; rail: string }> = {
  opponent: { label: "Opponent", badge: "border-red/35 bg-red/10 text-red", dot: "bg-red", rail: "bg-red" },
  ally: { label: "Ally", badge: "border-blue/35 bg-blue/10 text-blue", dot: "bg-blue", rail: "bg-blue" },
  mixed: { label: "Mixed", badge: "border-border-strong bg-gradient-to-r from-red/10 to-blue/10 text-fg", dot: "bg-gradient-to-r from-red from-50% to-blue to-50%", rail: "bg-gradient-to-b from-red from-50% to-blue to-50%" },
};
const RELATION_KIND: Record<EncounterRelation, Kind> = { opponents: "opponent", allies: "ally", everyone: "mixed" };

/** Opponent, Ally or Mixed, after the player's name. */
function KindBadge({ kind }: { kind: Kind }) {
  return (
    <span className={cn("mr-1 inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 text-2xs font-medium leading-4", KIND[kind].badge)} data-testid="encounter-kind" data-kind={kind}>
      <span className={cn("h-1.5 w-1.5 rounded-full", KIND[kind].dot)} aria-hidden />
      {KIND[kind].label}
    </span>
  );
}

/** "Against 7" or "Alongside 2" in the relation's colour; quieter when the list is about the other relation. */
function CountChip({ relation, games, quiet = false }: { relation: Relation; games: number; quiet?: boolean }) {
  const against = relation === "opponent";
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded px-1.5 text-2xs font-medium leading-5 tabular-nums", quiet ? (against ? "text-red/80 ring-1 ring-inset ring-red/25" : "text-blue/80 ring-1 ring-inset ring-blue/25") : against ? "bg-red/15 text-red" : "bg-blue/15 text-blue")} data-testid={`encounter-count-${relation}`} data-games={games}>
      {against ? "Against" : "Alongside"} {formatCount(games)}
    </span>
  );
}

/** The switch between the games and the players met in them; the season, game mode and account carry over. */
export function MatchViewSwitch({ view, basePath, filter }: { view: "games" | "encounters"; basePath: string; filter: Pick<StatsFilter, "season" | "mode" | "accountId"> }) {
  const shared = { season: filter.season, mode: filter.mode, accountId: filter.accountId };
  const items = [
    { key: "games", label: "Games", href: `${basePath}?${statsQuery(shared)}` },
    { key: "encounters", label: "Encounters", href: `${basePath}?${statsQuery(shared, { view: "encounters" })}` },
  ] as const;
  return (
    <nav aria-label="Match History views" className={segmentedGroupClass()} data-testid="match-views">
      {items.map((v) => (
        <Link key={v.key} href={v.href} scroll={false} aria-current={view === v.key ? "page" : undefined} className={segmentClass(view === v.key)} data-testid={`match-view-${v.key}`}>
          {v.label}
        </Link>
      ))}
    </nav>
  );
}

const noopSubscribe = () => () => {};

export function EncountersView({ data, basePath, playerId, playerName, championsById, status, refresh }: { data: EncountersData; basePath: string; playerId: string; playerName: string; championsById: Record<string, PortraitChampion>; /** The page's data status (domain/data-status), as on the games list. */ status?: DataStatus | null; /** Offered to the player and to those who manage Riot accounts, where Riot can be asked. */ refresh?: DataRefreshTarget | null }) {
  const router = useRouter();
  // The list's controls work once the page is interactive: it says so (data-ready) and browser tests wait for it.
  const interactive = React.useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [pending, startTransition] = React.useTransition();
  const { filter: f, choice: c, page } = data;
  const [open, setOpen] = React.useState<{ key: string; name: string } | null>(null);
  const [query, setQuery] = React.useState(c.q);
  // The search the box last asked for: the box follows the address only when something else
  // changed it (Back, a link), never mid-typing when its own request comes back.
  const requested = React.useRef(c.q);
  React.useEffect(() => {
    if (pending || c.q === requested.current) return;
    requested.current = c.q;
    setQuery(c.q);
  }, [c.q, pending]);

  /** The address with these list choices (a new choice starts again from the first page of players). */
  const href = React.useCallback(
    (change: Partial<EncounterListChoice>) => {
      const next = { ...c, limit: ENCOUNTER_PAGE, ...change };
      // A minimum left at its default follows the search's default (once while searching, else twice).
      if (change.q !== undefined && change.min === undefined && c.min === defaultMinimum(c.q)) next.min = defaultMinimum(next.q);
      return `${basePath}?${statsQuery({ season: f.season, mode: f.mode, accountId: f.accountId }, { view: "encounters", ...encounterListParams(next) })}`;
    },
    [basePath, c, f.season, f.mode, f.accountId],
  );
  const go = (change: Partial<EncounterListChoice>) => startTransition(() => router.replace(href(change), { scroll: false }));

  // The search applies a moment after typing stops.
  React.useEffect(() => {
    const q = query.trim().slice(0, 32);
    if (q === c.q) return;
    const t = window.setTimeout(() => {
      requested.current = q;
      startTransition(() => router.replace(href({ q }), { scroll: false }));
    }, 350);
    return () => window.clearTimeout(t);
  }, [query, c.q, href, router]);

  const keep = { view: "encounters", ...encounterListParams({ ...c, limit: ENCOUNTER_PAGE }) };
  const narrowed = f.accountId || f.mode !== "all" || f.season !== data.currentSeason;
  const noun = c.relation === "allies" ? "ally" : c.relation === "opponents" ? "opponent" : "player";
  return (
    <section className="space-y-3" aria-labelledby="match-history" data-testid="encounters" data-ready={interactive ? "true" : undefined}>
      {/* The games list's heading, Refresh included, so switching views moves nothing. */}
      <SectionHeader
        id="match-history"
        title="Match History"
        aside={<MatchViewSwitch view="encounters" basePath={basePath} filter={f} />}
        status={status ? <DataRefresh status={status} refresh={refresh} /> : null}
        controls={
          <div aria-busy={pending} className="min-w-0">
            <OverviewFilters basePath={basePath} filter={f} seasons={data.seasons} currentSeason={data.currentSeason} champions={[]} accounts={data.accountOptions} keep={keep} resetQuery={new URLSearchParams(keep).toString()} modeCounts={data.modes.counts} showChampions={false} showRole={false} testId="encounter-filters" />
          </div>
        }
      />

      {/* The list's own choices: which players, the search, the minimum and the order. */}
      <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-1.5">
          <nav aria-label="Encounters" className={segmentedGroupClass("max-md:flex-1")} data-testid="encounter-relations">
            {(Object.keys(RELATIONS) as EncounterRelation[]).map((r) => (
              <Link key={r} href={href({ relation: r })} replace scroll={false} aria-current={c.relation === r ? "page" : undefined} className={segmentClass(c.relation === r, { className: "max-md:flex-1" })} data-testid={`encounter-relation-${r}`}>
                <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", KIND[RELATION_KIND[r]].dot)} aria-hidden />
                {RELATIONS[r]}
              </Link>
            ))}
          </nav>
          <InfoTip text={CAVEAT} label="How encounters are counted" testId="encounters-caveat" />
        </div>
        <div className="grid min-w-0 grid-cols-2 gap-2 md:flex md:items-center">
          <SearchInput value={query} onChange={setQuery} label="Find a player by Riot ID" placeholder="Find a player by Riot ID" className="col-span-2 md:w-60" maxLength={32} testId="encounter-search" />
          <Select aria-label="At least" value={String(c.min)} disabled={pending} onChange={(e) => go({ min: Number(e.target.value) })} className="md:w-36" data-testid="encounter-min">
            {ENCOUNTER_MINIMUMS.map((n) => (
              <option key={n} value={n}>
                {n === 1 ? "Met once or more" : `${n}+ games`}
              </option>
            ))}
          </Select>
          <Select aria-label="Order" value={c.sort} disabled={pending} onChange={(e) => go({ sort: e.target.value as EncounterSort })} className="md:w-52" data-testid="encounter-sort">
            {(Object.keys(SORTS) as EncounterSort[]).map((k) => (
              <option key={k} value={k}>
                {SORTS[k](c.relation)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className={cn("space-y-3 transition-opacity", pending && "opacity-60")} aria-busy={pending}>
        {page.games === 0 ? (
          <p className="rounded-panel border border-dashed border-border px-4 py-6 text-center text-sm text-fg-muted" data-testid="encounters-empty">
            {data.accountsLinked === 0 ? "No Riot account is linked yet: encounters appear once one is linked and synced." : narrowed ? "No stored game matches these filters." : `No games stored for ${seasonLabel(f.season)}.`}
            <ModeElsewhere basePath={basePath} filter={f} elsewhere={data.modes.elsewhere} keep={keep} />
          </p>
        ) : (
          <>
            {page.insights.length && !c.q ? (
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4" data-testid="encounter-insights">
                {page.insights.map((i) => {
                  const relation = i.kind.endsWith("ally") ? "ally" : "opponent";
                  return (
                    <li key={i.kind}>
                      <button type="button" onClick={() => setOpen({ key: i.summary.key, name: i.summary.name })} className="flex w-full min-w-0 flex-col items-start gap-0.5 rounded-panel border border-border bg-surface px-3 py-2 text-left transition-colors hover:border-border-strong" data-testid="encounter-insight" data-kind={i.kind}>
                        <span className="text-2xs font-medium uppercase tracking-label text-fg-subtle">{INSIGHT_LABELS[i.kind]}</span>
                        <RiotId name={i.summary.name} className="block w-full text-sm" />
                        <span className={cn("text-xs tabular-nums", tone(relation))}>
                          {headline(relation, i.record.games)} · {recordText(i.record)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {page.total === 0 ? (
              <p className="rounded-panel border border-dashed border-border px-4 py-6 text-center text-sm text-fg-muted" data-testid="encounters-none">
                {c.q ? `No ${noun} matching "${c.q}" ${c.min > 1 ? `met ${c.min}+ times ` : ""}in these games.` : `No ${noun} met ${c.min}+ times in these games yet.`}
                {c.min > 1 || c.relation !== "everyone" ? <span className="mt-1 block text-xs">Try a lower minimum or Everyone.</span> : null}
              </p>
            ) : (
              <ul className="divide-y divide-border/70 overflow-hidden rounded-panel border border-border bg-surface" data-testid="encounter-list">
                {page.list.map((s) => (
                  <EncounterRow key={s.key} s={s} relation={c.relation} onOpen={() => setOpen({ key: s.key, name: s.name })} />
                ))}
              </ul>
            )}
            <p className="flex flex-wrap items-center justify-between gap-2 text-xs text-fg-subtle">
              <span data-testid="encounter-count">
                {page.total ? `${formatCount(page.list.length)} of ${formatCount(page.total)} shown · ` : ""}
                {page.withPlayers === page.games ? `From ${formatCount(page.games)} recorded game${page.games === 1 ? "" : "s"}` : `From ${formatCount(page.withPlayers)} of ${formatCount(page.games)} games (the others have no recorded players yet)`}
              </span>
              {page.list.length < page.total ? (
                <Link href={href({ limit: c.limit + ENCOUNTER_PAGE })} replace scroll={false} className="inline-flex min-h-11 items-center font-medium text-accent hover:underline md:pointer-fine:min-h-0" data-testid="encounter-more">
                  Show more
                </Link>
              ) : null}
            </p>
          </>
        )}
      </div>
      {open ? <EncounterWindow target={open} playerId={playerId} playerName={playerName} filters={{ season: f.season, mode: f.mode, accountId: f.accountId }} championsById={championsById} onClose={() => setOpen(null)} /> : null}
    </section>
  );
}

function EncounterRow({ s, relation, onOpen }: { s: EncounterSummary; relation: EncounterRelation; onOpen: () => void }) {
  const rec = recordFor(s, relation);
  const kind = kindOf(s);
  const lastMet = formatDate(new Date(s.lastPlayedAt));
  // Who they were, then the games on each side, then the record: the side the list is about comes
  // first with its record right after it, the other side after that, quieter. Everyone: both sides,
  // then the record over all the games.
  const lead: Relation | null = relation === "allies" ? "ally" : relation === "opponents" ? "opponent" : null;
  const sides = (lead === "ally" ? (["ally", "opponent"] as const) : (["opponent", "ally"] as const)).filter((r) => s[r].games > 0);
  const record = (
    <span className="tabular-nums text-fg-muted" data-testid="encounter-record" data-games={rec.games}>
      {recordText(rec)}
    </span>
  );
  return (
    <li>
      <button type="button" onClick={onOpen} className="relative grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3 py-2.5 pl-4 text-left transition-colors hover:bg-surface-2/60 max-sm:grid-cols-1" data-testid="encounter-row" data-key={s.key} data-kind={kind}>
        <span className={cn("absolute inset-y-2 left-0 w-[3px] rounded-r-full", KIND[kind].rail)} aria-hidden />
        {/* The name, then what they were and the games: one line where there is room, the name on a
            line of its own where there is not, so it is never cut short for the badge. Phones put the
            date at the end of the name's line, leaving the line under it the row's whole width. */}
        <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex min-w-0 items-center gap-2 max-sm:w-full">
            <RiotId name={s.name} className="text-sm" />
            <span className="ml-auto flex shrink-0 items-center gap-1 text-2xs text-fg-subtle sm:hidden">
              {lastMet}
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </span>
          </span>
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
            <KindBadge kind={kind} />
            {sides.map((r) => (
              <React.Fragment key={r}>
                <CountChip relation={r} games={s[r].games} quiet={lead !== null && r !== lead} />
                {r === lead ? record : null}
              </React.Fragment>
            ))}
            {lead ? null : record}
            {rec.games < ESTABLISHED_GAMES ? (
              <span className="shrink-0 rounded border border-border px-1 text-3xs font-medium leading-4 text-fg-subtle" title={`Fewer than ${ESTABLISHED_GAMES} games: a small sample`} data-testid="encounter-small-sample">
                small sample
              </span>
            ) : null}
          </span>
        </span>
        <span className="flex items-center gap-1 text-2xs text-fg-subtle max-sm:hidden">
          Last met {lastMet}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </span>
      </button>
    </li>
  );
}

function EncounterWindow({ target, playerId, playerName, filters, championsById, onClose }: { target: { key: string; name: string }; playerId: string; playerName: string; filters: { season: number; mode: SeasonMode; accountId: string | null }; championsById: Record<string, PortraitChampion>; onClose: () => void }) {
  const [result, setResult] = React.useState<EncounterDetailResult | null>(null);
  const [match, setMatch] = React.useState<string | null>(null);
  const { season, mode, accountId } = filters;
  React.useEffect(() => {
    let live = true;
    void getEncounterDetailAction(playerId, target.key, { season, mode, accountId })
      .catch((): EncounterDetailResult => ({ status: "not-found", message: "Couldn't load this player right now." }))
      .then((r) => live && setResult(r));
    return () => {
      live = false;
    };
  }, [playerId, target.key, season, mode, accountId]);
  const champ = (id: string | null): PortraitChampion => (id ? (championsById[id] ?? { id, name: id, portraitUrl: "" }) : { id: "unknown", name: "Unknown", portraitUrl: "" });
  // A game opens the shared match window in place of this one; Back returns here.
  if (match) return <MatchDetailModal playerId={playerId} matchId={match} championsById={championsById} onClose={onClose} back={{ label: target.name, onBack: () => setMatch(null) }} />;
  const ok = result?.status === "ok" ? result : null;
  const s = ok?.summary ?? null;
  return (
    <DetailModal
      open
      onClose={onClose}
      size="standard"
      title={target.name}
      titleId="encounter-title"
      testId="encounter-detail"
      header={
        // The player's OP.GG profile is under their name, the close button's corner left to itself.
        <div className={cn("min-w-0 py-4 pl-4 sm:pl-6", CLEAR_OF_CONTROLS)}>
          <p className="text-xs font-semibold uppercase tracking-label text-accent">Recorded encounters</p>
          <h2 id="encounter-title" className="text-xl font-bold">
            <RiotId name={s?.name ?? target.name} />
          </h2>
          {ok?.renamed ? (
            <p className="text-xs text-fg-muted" data-testid="encounter-renamed">
              Now {ok.renamed}
            </p>
          ) : null}
          {s ? (
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <KindBadge kind={kindOf(s)} />
              <span className="text-sm text-fg-muted" data-testid="encounter-detail-summary">
                {formatCount(s.games)} recorded game{s.games === 1 ? "" : "s"} with {playerName}
              </span>
            </p>
          ) : null}
          {ok?.opgg ? (
            <a href={ok.opgg} target="_blank" rel="noopener noreferrer" className="mt-2.5 flex h-9 w-fit items-center gap-1.5 rounded-md border border-border-strong px-2.5 text-xs font-medium text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11" data-testid="encounter-opgg">
              OP.GG <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          ) : null}
        </div>
      }
    >
      {!result ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-surface-2 motion-reduce:animate-none" />
          ))}
        </div>
      ) : !ok ? (
        <p className="rounded-panel border border-dashed border-border p-4 text-sm text-fg-muted" data-testid="encounter-detail-message">
          {result.status === "not-found" ? result.message : null}
        </p>
      ) : (
        <div className="space-y-5">
          <dl className="grid grid-cols-2 gap-2" data-testid="encounter-detail-records">
            {(
              [
                ["Against", ok.summary.opponent, "text-red"],
                ["Alongside", ok.summary.ally, "text-blue"],
              ] as const
            ).map(([label, wl, color]) => (
              <div key={label} className="rounded-lg border border-border bg-bg/40 px-3 py-2">
                <dt className={cn("text-2xs font-medium uppercase tracking-label", color)}>{label}</dt>
                <dd className="text-lg font-semibold tabular-nums">{wl.games ? (wl.games === 1 ? "Once" : `${formatCount(wl.games)} times`) : "—"}</dd>
                <dd className="text-xs tabular-nums text-fg-muted">{wl.games ? `${playerName}: ${recordText(wl)}` : "No recorded games"}</dd>
              </div>
            ))}
          </dl>
          {/* The games against them, then the games alongside them, each under its own heading. */}
          {(["opponent", "ally"] as const).map((relation) => {
            const total = ok.summary[relation].games;
            if (!total) return null;
            const games = ok.games.filter((g) => g.relation === relation);
            // The window lists the newest games: the rest of this side's are older.
            const earlier = Math.max(0, total - games.length);
            return (
              <section key={relation} aria-labelledby={`encounter-games-${relation}`} data-testid="encounter-games-section" data-relation={relation} data-games={total}>
                <h3 id={`encounter-games-${relation}`} className={cn("mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-label", tone(relation))}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", KIND[relation].dot)} aria-hidden />
                  {relation === "opponent" ? "Against them" : "Alongside them"}
                  <span className="font-medium tabular-nums text-fg-subtle">{formatCount(total)}</span>
                </h3>
                {games.length ? (
                  <ul className="space-y-1.5" data-testid="encounter-games">
                    {games.map((g) => (
                      <li key={g.matchId}>
                        <button type="button" onClick={() => setMatch(g.matchId)} className={cn("grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-bg/30 px-3 py-2 text-left text-xs transition-colors hover:border-border-strong", g.relation === "ally" ? "border-l-2 border-l-blue/70" : "border-l-2 border-l-red/70")} data-testid="encounter-game" data-relation={g.relation}>
                          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="tabular-nums text-fg-muted">{formatDate(new Date(g.playedAt))}</span>
                            <span className="text-fg-subtle">{g.queue}</span>
                            <span className="inline-flex items-center gap-1">
                              <ChampionPortrait champion={champ(g.memberChampion)} size="xs" className="h-6 w-6 text-4xs" />
                              <span className={tone(g.relation)}>{g.relation === "ally" ? "with" : "vs"}</span>
                              <ChampionPortrait champion={champ(g.otherChampion)} size="xs" className="h-6 w-6 text-4xs" />
                            </span>
                          </span>
                          <span className={cn("font-semibold", g.win === true ? "text-blue" : g.win === false ? "text-red" : "text-fg-muted")}>{g.win === true ? "Won" : g.win === false ? "Lost" : "—"}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {earlier ? (
                  <p className="mt-1.5 text-xs text-fg-subtle" data-testid="encounter-games-earlier">
                    {games.length ? `and ${formatCount(earlier)} earlier game${earlier === 1 ? "" : "s"}` : `${formatCount(earlier)} game${earlier === 1 ? "" : "s"}, older than the ones listed`}
                  </p>
                ) : null}
              </section>
            );
          })}
          <p className="text-2xs leading-snug text-fg-subtle" data-testid="encounter-detail-note">
            Only {playerName}&apos;s recorded games in this view&apos;s season, game mode and account. They describe games played together or against each other, not parties or anything else about the player, and a missing game is not proof they never met.
          </p>
        </div>
      )}
    </DetailModal>
  );
}
