"use client";

import * as React from "react";
import { Info } from "lucide-react";
import type { OverviewCard } from "@/server/players/overview";
import type { MatchupsData } from "@/server/players/matchups";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import { seasonLabel } from "@/domain/season";
import { SEASON_MODES, seasonModeInfo, type SeasonMode } from "@/domain/season-stats";
import { MIN_PATTERN_GAMES } from "@/domain/matchups";
import { WIN_RATE_MIN_GAMES, WIN_RATE_TONE_CLASS, winRateSampleNote, winRateTone } from "@/domain/stats/win-rate";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { RoleIcon } from "@/components/role-icon";
import { AfterOpen, CLEAR_OF_CONTROLS, DetailModal } from "@/components/ui/detail-modal";
import { MultikillSummaryRow } from "./multikill-summary";
import { MatchDetailModal } from "@/components/match-history/match-detail";
import { CardArtLayer } from "./card-art";
import { LaneChart, LaneGameCard, LaneTable, timelineCoverage, type LaneMetric } from "./lane-parts";
import { OpponentPicker } from "./opponent-picker";
import { Select } from "@/components/ui/input";
import { FilterField, RefineButton } from "@/components/ui/filter-bar";
import { percent, formatCount } from "@/lib/format";
import { cn } from "@/lib/cn";
import { tabIndicatorClass } from "@/components/ui/tab-bar";
import { accountShortNames } from "@/domain/account-names";

/*
  The champion window, opened from All Champions (and from old Matchups links): one champion in one
  role, in the profile's current scope (season, game mode, accounts), in two views.

    Overview   the champion's figures in scope, its lane against every opponent at the checkpoints,
               the opponents faced most, and its latest games
    Matchups   one lane opponent at a time ("Riven vs Renekton", searchable): the record, the lane
               by minute in gold, experience or CS, and every game behind the figures

  Everything here is the player's own stored games. Each figure says how many games it rests on;
  a game without a timeline is counted as such, never as zero. A game opens the match window in
  place of this one (never two dimmed layers), with a way back to the same view.
*/

export type ChampionTab = "overview" | "matchups";

export interface ChampionSelection {
  championId: string;
  role: Role | null;
  tab: ChampionTab;
  vs: string | null;
}

export interface ChampionScope {
  season: number;
  seasons: number[];
  currentSeason: number;
  mode: SeasonMode;
  /** The chosen account, or null for every linked account. */
  accountId: string | null;
  accounts: Array<{ id: string; riotId: string; label: string }>;
}

export type RefineChange = Partial<{ season: number; mode: SeasonMode; account: string | null }>;

const plural = (n: number, word: string) => `${formatCount(n)} ${word}${n === 1 ? "" : "s"}`;

export function ChampionDetail({
  playerId,
  sel,
  card,
  data,
  scope,
  championsById,
  pending,
  onTab,
  onVs,
  onRefine,
  onClose,
}: {
  playerId: string;
  sel: ChampionSelection;
  /** The champion's row in All Champions (null when it has no games in this scope). */
  card: OverviewCard | null;
  /** The lane data for exactly this selection, or null while it loads. */
  data: MatchupsData | null;
  scope: ChampionScope;
  championsById: Record<string, PortraitChampion>;
  pending: boolean;
  onTab: (tab: ChampionTab) => void;
  onVs: (vs: string) => void;
  onRefine: (change: RefineChange) => void;
  onClose: () => void;
}) {
  const champ = React.useCallback((id: string): PortraitChampion => championsById[id] ?? { id, name: id, portraitUrl: "" }, [championsById]);
  const me = champ(sel.championId);
  const [match, setMatch] = React.useState<string | null>(null);
  const [refine, setRefine] = React.useState(false);
  const [metric, setMetric] = React.useState<LaneMetric>("gold");
  const role = sel.role ?? card?.role ?? null;
  const accountLabel = scope.accountId ? (scope.accounts.find((a) => a.id === scope.accountId)?.riotId ?? "One account") : scope.accounts.length > 1 ? "All linked accounts" : (scope.accounts[0]?.riotId ?? "No linked account");
  const scopeText = [seasonLabel(scope.season), seasonModeInfo(scope.mode).label, accountLabel].join(" · ");
  // Narrowed from the window's defaults (current season, every supported game, every account), as the profile's filters count them.
  const narrowed = (scope.season !== scope.currentSeason ? 1 : 0) + (scope.mode !== "all" ? 1 : 0) + (scope.accountId ? 1 : 0);
  const opponents = data?.opponents ?? [];
  const vsName = data?.vs ? champ(data.vs).name : null;
  const tabs: Array<[ChampionTab, string]> = [
    ["overview", "Overview"],
    ["matchups", opponents.length ? `Matchups · ${opponents.length}` : "Matchups"],
  ];

  const header = (
    <div className="relative isolate overflow-hidden">
      <CardArtLayer art={{ championId: sel.championId, skinNum: 0 }} accent="var(--color-accent)" kind="splash" position="center 22%" strength="strong" testId="champion-detail-art" />
      <div className={cn("relative pl-4 pt-4 sm:pl-6 sm:pt-5", CLEAR_OF_CONTROLS)}>
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <ChampionPortrait champion={me} size="lg" className="shrink-0 rounded-panel ring-2 ring-accent/50 shadow-lg shadow-black/40" />
          <div className="min-w-0 space-y-1">
            <h2 id="champion-detail-title" className="truncate text-2xl font-bold tracking-tight text-fg sm:text-3xl" data-testid="champion-detail-name">
              {me.name}
            </h2>
            <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-fg-muted">
              {role ? (
                <span className="inline-flex items-center gap-1 text-fg">
                  <RoleIcon role={role} className="h-4 w-4" /> {ROLE_LABELS[role]}
                </span>
              ) : (
                <span>Every role</span>
              )}
              {card?.inPool ? <span className="rounded-full border border-accent/40 bg-accent/10 px-2 text-xs font-medium leading-5 text-accent">{card.inPool === "primary" ? "Primary pool" : card.inPool === "secondary" ? "Secondary pool" : "In pool"}</span> : null}
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="min-w-0 truncate text-fg-muted" data-testid="champion-detail-scope">
            {scopeText}
          </span>
          <RefineButton open={refine} count={narrowed} controls="champion-refine" onClick={() => setRefine((r) => !r)} className="bg-bg/40" testId="champion-detail-refine" />
          {pending ? <span className="text-fg-subtle" aria-live="polite">Updating…</span> : null}
        </div>
        {refine ? <RefinePanel scope={scope} onRefine={onRefine} /> : null}
        <div role="tablist" aria-label={`${me.name} views`} className="mt-3 flex gap-1">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              id={`champion-tab-${key}`}
              aria-selected={sel.tab === key}
              aria-controls={`champion-panel-${key}`}
              tabIndex={sel.tab === key ? 0 : -1}
              onClick={() => onTab(key)}
              onKeyDown={(e) => {
                if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                const next = key === "overview" ? "matchups" : "overview";
                onTab(next);
                document.getElementById(`champion-tab-${next}`)?.focus();
              }}
              className={cn("-mb-px h-10 px-3 text-sm font-medium transition-colors", tabIndicatorClass(sel.tab === key))}
              data-testid={`champion-tab-${key}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <DetailModal open={!match} onClose={onClose} size="wide" title={`${me.name}`} titleId="champion-detail-title" header={header} headerClassName="bg-surface" testId="champion-detail" closeTestId="champion-detail-close" bodyTestId="champion-detail-body" bodyClassName={cn("transition-opacity", pending && "opacity-70")}>
        {sel.tab === "overview" ? (
          <div id="champion-panel-overview" role="tabpanel" aria-labelledby="champion-tab-overview">
            <AfterOpen fallback={<PanelSkeleton />}>
              <OverviewPanel me={me} card={card} data={data} champ={champ} multiAccount={!scope.accountId && scope.accounts.length > 1} onOpponent={(id) => onVs(id)} onMatch={setMatch} />
            </AfterOpen>
          </div>
        ) : (
          <div id="champion-panel-matchups" role="tabpanel" aria-labelledby="champion-tab-matchups">
            <AfterOpen fallback={<PanelSkeleton />}>
              <MatchupsPanel me={me} championGames={card?.selected.games ?? 0} pending={pending} data={data} vs={sel.vs} champ={champ} multiAccount={!scope.accountId && scope.accounts.length > 1} metric={metric} onMetric={setMetric} onVs={onVs} onMatch={setMatch} />
            </AfterOpen>
          </div>
        )}
      </DetailModal>
      {match ? (
        <MatchDetailModal
          playerId={playerId}
          matchId={match}
          championsById={championsById}
          onClose={() => {
            setMatch(null);
            onClose();
          }}
          back={{ label: sel.tab === "matchups" && vsName ? `${me.name} vs ${vsName}` : me.name, onBack: () => setMatch(null) }}
        />
      ) : null}
    </>
  );
}

/** What the window shows while it opens (its panels render once the motion is over). */
function PanelSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-surface-2" />
        ))}
      </div>
      <div className="h-56 animate-pulse rounded-panel bg-surface-2" />
    </div>
  );
}

/**
 * Season, game mode and account for the window and the list behind it (one shared scope): the same
 * labelled fields as the profile's filters (FilterField, Select).
 */
function RefinePanel({ scope, onRefine }: { scope: ChampionScope; onRefine: (c: RefineChange) => void }) {
  const accountNames = accountShortNames(scope.accounts);
  return (
    <div id="champion-refine" role="group" aria-label="Refine this champion's figures" className="mt-2 grid gap-3 rounded-panel border border-border bg-bg/70 p-3 backdrop-blur sm:grid-cols-[repeat(auto-fit,minmax(11rem,1fr))]" data-testid="champion-refine">
      <FilterField label="Season" htmlFor="champion-refine-season" alwaysLabel>
        <Select id="champion-refine-season" value={scope.season} onChange={(e) => onRefine({ season: Number(e.target.value) })} data-testid="champion-refine-season">
          {scope.seasons.map((s) => (
            <option key={s} value={s}>
              {seasonLabel(s)}
              {s === scope.currentSeason ? " (current)" : ""}
            </option>
          ))}
        </Select>
      </FilterField>
      <FilterField label="Game mode" htmlFor="champion-refine-mode" alwaysLabel>
        <Select id="champion-refine-mode" value={scope.mode} onChange={(e) => onRefine({ mode: e.target.value as SeasonMode })} data-testid="champion-refine-mode">
          {SEASON_MODES.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </Select>
      </FilterField>
      {scope.accounts.length > 1 ? (
        <FilterField label="Riot account" htmlFor="champion-refine-account" alwaysLabel>
          <Select id="champion-refine-account" value={scope.accountId ?? ""} onChange={(e) => onRefine({ account: e.target.value || null })} data-testid="champion-refine-account">
            <option value="">All linked accounts</option>
            {scope.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {accountNames.get(a.id)}
                {a.label === "main" ? " · Primary" : ""}
              </option>
            ))}
          </Select>
        </FilterField>
      ) : null}
    </div>
  );
}

function Tile({ label, value, sub, className, testId }: { label: string; value: React.ReactNode; sub?: React.ReactNode; className?: string; testId?: string }) {
  return (
    <div className="min-w-0 rounded-panel border border-border/70 bg-bg-elevated/60 px-3 py-2" data-testid={testId}>
      <dt className="truncate text-xs text-fg-subtle">{label}</dt>
      <dd className={cn("text-xl font-semibold tabular-nums text-fg", className)}>{value}</dd>
      {sub ? <dd className="text-2xs leading-tight text-fg-subtle">{sub}</dd> : null}
    </div>
  );
}

function Panel({ title, aside, children, className, testId }: { title: React.ReactNode; aside?: React.ReactNode; children: React.ReactNode; className?: string; testId?: string }) {
  const id = React.useId();
  return (
    <section className={cn("min-w-0 rounded-card border border-border bg-surface p-3 sm:p-4", className)} aria-labelledby={id} data-testid={testId}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h3 id={id} className="text-sm font-semibold text-fg">
          {title}
        </h3>
        {aside ? <span className="text-xs text-fg-subtle">{aside}</span> : null}
      </div>
      {children}
    </section>
  );
}

function Note({ children, testId }: { children: React.ReactNode; testId?: string }) {
  return (
    <p className="rounded-panel border border-dashed border-border px-3 py-4 text-center text-sm text-fg-muted" data-testid={testId}>
      {children}
    </p>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label={label} data-testid="champion-detail-loading">
      <div className="h-24 animate-pulse rounded-panel bg-surface-2" />
      <div className="h-40 animate-pulse rounded-panel bg-surface-2" />
    </div>
  );
}

function OverviewPanel({ me, card, data, champ, multiAccount, onOpponent, onMatch }: { me: PortraitChampion; card: OverviewCard | null; data: MatchupsData | null; champ: (id: string) => PortraitChampion; multiAccount: boolean; onOpponent: (id: string) => void; onMatch: (id: string) => void }) {
  const r = card?.selected ?? null;
  const p = card?.performance ?? null;
  const lane = data?.lane ?? null;
  return (
    <div className="space-y-3" data-testid="champion-overview">
      {!card || !r || r.games === 0 ? (
        <Note testId="champion-overview-empty">No games on {me.name} in this scope. Refine the season, game mode or account to look further back.</Note>
      ) : (
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" data-testid="champion-stats">
          <Tile label="Games" value={r.games} sub={`${r.wins}W ${r.losses}L`} testId="champion-stat-games" />
          <Tile label="Win rate" value={r.winRate === null ? "—" : percent(r.winRate, 0)} className={WIN_RATE_TONE_CLASS[winRateTone(r.winRate, r.games, WIN_RATE_MIN_GAMES.champion)]} sub={winRateSampleNote(r.winRate, r.games, WIN_RATE_MIN_GAMES.champion) ?? undefined} testId="champion-stat-winrate" />
          <Tile label="KDA" value={p?.perfectKda ? "Perfect" : p?.kdaRatio == null ? "—" : p.kdaRatio.toFixed(2)} sub={p?.kills == null ? undefined : `${p.kills.toFixed(1)} / ${p.deaths!.toFixed(1)} / ${p.assists!.toFixed(1)}`} testId="champion-stat-kda" />
          <Tile label="CS per minute" value={p?.csPerMinute == null ? "—" : p.csPerMinute.toFixed(1)} sub={p?.csMinuteGames ? plural(p.csMinuteGames, "game") : "No CS recorded"} />
          <Tile label="Damage per minute" value={p?.damagePerMinute == null ? "—" : formatCount(p.damagePerMinute)} sub={p?.damageMinuteGames ? plural(p.damageMinuteGames, "game") : "Not in the stored details"} />
          <Tile label="Mastery points" value={card.mastery?.points ? formatCount(card.mastery.points) : "—"} sub={card.mastery ? "All linked accounts" : "No mastery recorded"} />
        </dl>
      )}
      {/* The champion's multikills in the same games, with how many of them have counts. */}
      {card?.multikills && r && r.games > 0 ? <MultikillSummaryRow m={card.multikills} className="rounded-panel border border-border/70 bg-bg-elevated/60 px-3 py-2" testId="champion-multikills-summary" /> : null}
      {!r || r.games === 0 ? null : !data ? (
        <Loading label={`Loading ${me.name}'s lanes`} />
      ) : !lane || lane.games === 0 ? (
        <Note testId="champion-lane-empty">None of the {plural(r.games, "game")} on {me.name} in this scope names a lane opponent (the enemy Riot placed in the same position) in a Summoner&apos;s Rift game of 5 minutes or more, so there is no lane to show.</Note>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <Panel title="The lane against every opponent" aside={plural(lane.games, "game")} testId="champion-lane">
            <p className="mb-2 text-xs text-fg-muted" data-testid="champion-lane-coverage">
              {timelineCoverage(lane.timelines, lane.games)}
            </p>
            {lane.timelines.frames ? (
              <>
                <LaneTable checkpoints={lane.checkpoints} testId="champion-lane-checkpoints" />
                <Observations notes={lane.notes} />
              </>
            ) : null}
          </Panel>
          <Panel title="Opponents faced most" aside={`${data.opponents.length} in all`} testId="champion-opponents">
            <ul className="space-y-1">
              {data.opponents.slice(0, 5).map((o) => (
                <li key={o.championId}>
                  <button type="button" onClick={() => onOpponent(o.championId)} className="flex min-h-11 w-full items-center gap-2.5 rounded-md px-2 py-1 text-left text-sm transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent" data-testid="champion-opponent" data-champion={o.championId}>
                    <ChampionPortrait champion={champ(o.championId)} size="xs" />
                    <span className="min-w-0 flex-1 truncate font-medium text-fg">{champ(o.championId).name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-fg-subtle">
                      <span className="text-fg">{o.games}</span> · {o.wins}W {o.games - o.wins}L
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-2xs text-fg-subtle">Open one to see the lane, minute by minute, and every game.</p>
          </Panel>
        </div>
      )}
      {lane && lane.recent.length ? (
        <section aria-labelledby="champion-recent-title" className="space-y-1.5" data-testid="champion-recent">
          <h3 id="champion-recent-title" className="text-sm font-semibold text-fg">
            Latest games <span className="font-normal text-fg-subtle">· with a lane opponent, newest first</span>
          </h3>
          <ol className="space-y-1.5">
            {lane.recent.map((g) => (
              <LaneGameCard key={g.matchId} g={g} showAccount={multiAccount} onOpen={() => onMatch(g.matchId)} opponent={g.opponentId ? champ(g.opponentId) : null} />
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}

function Observations({ notes }: { notes: string[] }) {
  return (
    <div className="mt-3 space-y-1 text-sm text-fg" data-testid="lane-notes">
      {notes.length ? notes.map((n) => <p key={n}>{n}</p>) : <p className="text-xs text-fg-muted">Fewer than {MIN_PATTERN_GAMES} games with a timeline at the moments compared: too few to describe a pattern.</p>}
      <p className="flex items-start gap-1.5 text-xs text-fg-subtle">
        <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden /> What happened in these games, not why: the draft, the jungle and the rest of the map all play a part.
      </p>
    </div>
  );
}

function MatchupsPanel({ me, championGames, pending, data, vs, champ, multiAccount, metric, onMetric, onVs, onMatch }: { me: PortraitChampion; championGames: number; pending: boolean; data: MatchupsData | null; vs: string | null; champ: (id: string) => PortraitChampion; multiAccount: boolean; metric: LaneMetric; onMetric: (m: LaneMetric) => void; onVs: (id: string) => void; onMatch: (id: string) => void }) {
  if (!data) return <Loading label={`Loading ${me.name}'s matchups`} />;
  if (!data.opponents.length) return <Note testId="matchups-empty">{championGames ? `None of the ${plural(championGames, "game")} on ${me.name} in this scope names a lane opponent (a Summoner's Rift game of 5 minutes or more with one enemy in the same position).` : `No games on ${me.name} in this scope, so no matchups.`}</Note>;
  const d = data.detail;
  // The detail on screen belongs to the opponent chosen; a new choice shows its loading state
  // (an opponent not in this scope falls back to the most played one).
  const loading = !d || (pending && vs !== null && data.vs !== vs);
  const shortcuts = data.opponents.filter((o) => o.championId !== data.vs).slice(0, 3);
  const winRate = d && d.games ? d.wins / d.games : null;
  const statuses = new Set(d?.matches.map((g) => g.timeline));
  const stated = statuses.size === 1 ? [...statuses][0]! : null;
  return (
    <div className="space-y-3" data-testid="matchup-detail">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <OpponentPicker me={me} options={data.opponents} current={vs && data.opponents.some((o) => o.championId === vs) ? vs : data.vs} champ={champ} onChoose={onVs} />
        {shortcuts.length ? (
          <div className="flex flex-wrap items-center gap-1.5" aria-label="Frequent opponents" role="group">
            <span className="text-xs text-fg-subtle">Often:</span>
            {shortcuts.map((o) => (
              <button key={o.championId} type="button" onClick={() => onVs(o.championId)} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border py-0.5 pl-0.5 pr-2.5 text-xs text-fg-muted transition-colors hover:border-border-strong hover:text-fg pointer-coarse:min-h-11" data-testid="opponent-shortcut" data-champion={o.championId}>
                <ChampionPortrait champion={champ(o.championId)} size="xs" className="rounded-full" />
                <span className="font-medium">{champ(o.championId).name}</span>
                <span className="tabular-nums text-fg-subtle">{o.games}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {loading ? (
        <Loading label="Loading the matchup" />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="matchup-summary">
            <Tile label="Games" value={d.games} testId="matchup-games" />
            <Tile label="Record" value={`${d.wins}W ${d.games - d.wins}L`} testId="matchup-record" />
            <Tile label="Win rate" value={winRate === null ? "—" : percent(winRate, 0)} className={WIN_RATE_TONE_CLASS[winRateTone(winRate, d.games, WIN_RATE_MIN_GAMES.champion)]} sub={winRateSampleNote(winRate, d.games, WIN_RATE_MIN_GAMES.champion) ?? undefined} testId="matchup-winrate" />
            <Tile label="With a timeline" value={`${d.timelines.frames} of ${d.games}`} sub={d.timelines.pending ? `${d.timelines.pending} still to collect` : undefined} testId="matchup-timeline-count" />
          </dl>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted" data-testid="matchup-sources">
            {d.byQueue.map((q) => (
              <span key={q.label}>
                {q.label} <span className="tabular-nums text-fg">{q.games}</span> ({q.wins}W {q.games - q.wins}L)
              </span>
            ))}
            {multiAccount
              ? d.byAccount.map((a) => (
                  <span key={a.label}>
                    {a.label} <span className="tabular-nums text-fg">{a.games}</span> ({a.wins}W {a.games - a.wins}L)
                  </span>
                ))
              : null}
          </p>
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
            <Panel title="The lane, from match timelines" testId="matchup-lane">
              <p className="mb-2 text-xs text-fg-muted" data-testid="matchup-timelines">
                {timelineCoverage(d.timelines, d.games)}
              </p>
              {d.timelines.frames ? (
                <div className="space-y-3">
                  <LaneChart curve={d.curve} games={d.matches} metric={metric} onMetric={onMetric} testId="matchup-chart" />
                  <LaneTable checkpoints={d.checkpoints} testId="matchup-checkpoints" />
                  <Observations notes={d.notes} />
                </div>
              ) : null}
              <details className="mt-3 text-xs text-fg-muted">
                <summary className="cursor-pointer text-fg-subtle hover:text-fg">How these figures are made</summary>
                <p className="mt-1">
                  The lane opponent is the enemy Riot assigned to your position in that game; a game where the match details do not make that clear is left out of the lane figures. Riot&apos;s match timeline records each player&apos;s gold, experience and CS about once a minute. Each figure is yours minus your lane opponent&apos;s at that exact minute, read between the two recorded moments around it. A game that had ended before a minute is not counted there. Remakes are left out.
                </p>
                <p className="mt-1">
                  Comparing these lanes with other players of a given rank would need their match timelines, which are not collected, so no comparison is shown.
                </p>
              </details>
            </Panel>
            <section aria-labelledby="matchup-games-title" className="min-w-0 space-y-1.5" data-testid="matchup-games-list">
              <h3 id="matchup-games-title" className="text-sm font-semibold text-fg">
                The games <span className="font-normal text-fg-subtle">· newest first</span>
              </h3>
              <ol className="space-y-1.5">
                {d.matches.map((g) => (
                  <LaneGameCard key={g.matchId} g={g} showAccount={multiAccount} onOpen={() => onMatch(g.matchId)} stated={stated} />
                ))}
              </ol>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

