"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, ChevronRight, NotebookPen, UserX } from "lucide-react";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import { getMatchBuildAction, getMatchDetailAction, getMatchGroupsAction, getMatchRanksAction } from "@/server/actions/match-history";
import type { MatchGroupsResult, MatchGroupsTeam, MatchGroupView } from "@/server/matches/possible-groups";
import { groupEvidenceText } from "@/domain/possible-groups";
import { BookmarkButton } from "@/components/matches/bookmark-button";
import type { MatchBuildResult } from "@/server/accounts/match-timeline";
import { importRankedMatchAction } from "@/server/actions/ranked";
import type { ComparisonFigure, DetailParticipant, DetailTeam, MatchDetailResult, MatchDetailView, MatchRanksResult, RunePage } from "@/server/players/match-history";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { formatDate, formatCount } from "@/lib/format";
import { cn } from "@/lib/cn";
import { BELOW_CONTROLS_ON_PHONES, CLEAR_OF_CONTROLS, DetailModal } from "@/components/ui/detail-modal";
import { MatchDetailCacheContext } from "./match-detail-cache";
import { fmtDuration, fmtInt, fmtNum } from "./match-history-view";
import { PlayerLink } from "./player-link";
import { OpggHistoryLink } from "./opgg-history-link";
import { IconImg, ItemRow } from "./icon-img";
import { matchRankQueue, rankBadgeLabel, rankChecksWhen, type ParticipantRank } from "@/domain/known-rank";
import { RankEmblem } from "@/components/players/rank-emblem";

const OBJECTIVES: Array<[string, string, string]> = [
  ["tower", "tower", "towers"],
  ["dragon", "dragon", "dragons"],
  ["baron", "baron", "barons"],
  ["horde", "voidgrub", "voidgrubs"],
  ["riftHerald", "herald", "heralds"],
  ["inhibitor", "inhibitor", "inhibitors"],
];

/**
 * One match in the site's shared detail window (wide, centred over the page; the whole screen on
 * phones), the same from Match History, Team Matches and Matchups. The list behind stays where it
 * was; Escape, the close button or Back return to it, and focus goes back to the game that opened
 * it. The record loads when opened (and is fetched once from Riot if it was not collected yet).
 */
/**
 * `back` is for a match opened from another window (a champion's matchup): that window gives way to
 * this one, and Back returns to it; Close and Escape close both.
 */
export function MatchDetailModal({ playerId, matchId, championsById, onClose, back }: { playerId: string; matchId: string; championsById: Record<string, PortraitChampion>; onClose: () => void; back?: { label: string; onBack: () => void } }) {
  const cache = React.useContext(MatchDetailCacheContext);
  const [loaded, setLoaded] = React.useState<{ matchId: string; result: MatchDetailResult } | null>(null);
  // The record starts loading as the window opens, but is shown only once the window has finished
  // opening (onSettled): its first frames hold the shell and a light skeleton, and rendering the
  // scoreboard never lands in the middle of the motion.
  const [settled, setSettled] = React.useState(false);
  React.useEffect(() => {
    let live = true;
    void (cache ? cache.load(playerId, matchId) : getMatchDetailAction(playerId, matchId)).then((r) => {
      if (live) React.startTransition(() => setLoaded({ matchId, result: r }));
    });
    return () => {
      live = false;
    };
  }, [cache, playerId, matchId]);
  const champ = (id: string | null): PortraitChampion => (id ? (championsById[id] ?? { id, name: id, portraitUrl: "" }) : { id: "unknown", name: "Unknown", portraitUrl: "" });
  const result = settled && loaded?.matchId === matchId ? loaded.result : null;
  const view = result?.status === "ok" ? result.view : null;
  // The match at a glance: the result large, then the champion, the game's context as labelled
  // chips, and the loadout; the close button (top right, as on every panel) never crowds it.
  const header = view ? (
    <div className={cn("flex flex-col gap-4 pb-4 pl-4 pt-4 sm:pl-6 sm:pt-5 lg:flex-row lg:items-end lg:justify-between", back ? BELOW_CONTROLS_ON_PHONES : CLEAR_OF_CONTROLS)}>
      <div className="flex min-w-0 items-center gap-4">
        <ChampionPortrait champion={champ(view.championId)} size="lg" className={cn("ring-2", view.win ? "ring-blue/60" : "ring-red/60")} />
        <div className="min-w-0 space-y-1.5">
          <h2 id="match-detail-title" className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <span className={cn("text-2xl font-bold tracking-tight sm:text-3xl", view.win ? "text-blue" : "text-red")} data-testid="match-result">
              {view.win ? "Victory" : "Defeat"}
            </span>
            <span className="truncate text-lg font-semibold text-fg">{champ(view.championId).name}</span>
          </h2>
          <ul className="flex flex-wrap gap-1.5 text-xs text-fg-muted" aria-label="Game">
            <li className="rounded-full border border-border bg-bg/50 px-2 py-0.5 text-fg">{view.queue}</li>
            {view.role && view.role !== "UNKNOWN" ? <li className="rounded-full border border-border bg-bg/50 px-2 py-0.5">{ROLE_LABELS[view.role as Role] ?? view.role}</li> : null}
            <li className="rounded-full border border-border bg-bg/50 px-2 py-0.5 tabular-nums">{fmtDuration(view.durationS)}</li>
            <li className="rounded-full border border-border bg-bg/50 px-2 py-0.5">{formatDate(new Date(view.playedAt))}</li>
            {view.patch ? <li className="rounded-full border border-border bg-bg/50 px-2 py-0.5">Patch {view.patch}</li> : null}
          </ul>
        </div>
      </div>
      <Loadout player={view.player} className="shrink-0" />
    </div>
  ) : (
    <h2 id="match-detail-title" className={cn("py-4 pl-4 text-lg font-semibold text-fg sm:pl-6", back ? BELOW_CONTROLS_ON_PHONES : CLEAR_OF_CONTROLS)}>
      Match details
    </h2>
  );
  return (
    <DetailModal
      open
      onClose={onClose}
      size="wide"
      title="Match details"
      titleId="match-detail-title"
      header={header}
      headerClassName={view ? (view.win ? "bg-gradient-to-r from-blue/15 via-blue/5 to-transparent" : "bg-gradient-to-r from-red/15 via-red/5 to-transparent") : "bg-surface"}
      testId="match-detail"
      headerExtra={
        back ? (
          <button type="button" onClick={back.onBack} className="inline-flex h-9 max-w-[min(16rem,50vw)] items-center gap-1.5 rounded-md border border-border-strong bg-bg/60 px-2.5 text-xs font-medium text-fg-muted transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11" data-testid="match-detail-back">
            <ArrowLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">
              <span className="sr-only">Back to </span>
              {back.label}
            </span>
          </button>
        ) : undefined
      }
      headerTestId="match-detail-header"
      closeTestId="match-detail-close"
      bodyTestId="match-detail-body"
      onSettled={() => setSettled(true)}
    >
      {!result ? (
        <DetailSkeleton />
      ) : (
        <div className="motion-safe:fade-in">{result.status !== "ok" ? <p className="rounded-panel border border-dashed border-border p-4 text-sm text-fg-muted" data-testid="match-detail-message">{result.message}</p> : <DetailBody playerId={playerId} view={view!} champ={champ} />}</div>
      )}
    </DetailModal>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading the match">
      <div className="grid grid-cols-4 gap-2">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-lg bg-surface-2" />
        ))}
      </div>
      {Array.from({ length: 2 }, (_, i) => (
        <div key={i} className="h-64 animate-pulse rounded-panel bg-surface-2" />
      ))}
    </div>
  );
}

/** Summoner spells, runes and final items (in the window header on wide screens). */
function Loadout({ player: p, className }: { player: DetailParticipant; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      <span className="flex gap-0.5">{p.spells?.map((s, i) => <IconImg key={i} icon={s} size={26} />)}</span>
      <span className="flex items-center gap-0.5">
        <IconImg icon={p.keystone} size={28} rounded="rounded-full" />
        <IconImg icon={p.secondary} size={20} rounded="rounded-full" />
      </span>
      <ItemRow items={p.items} size={28} />
    </div>
  );
}

function Figure({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-surface px-2.5 py-1.5">
      <div className="truncate text-2xs text-fg-subtle">{label}</div>
      <div className="text-base font-semibold tabular-nums leading-tight text-fg">{value}</div>
      {sub ? <div className="truncate text-2xs tabular-nums text-fg-muted">{sub}</div> : null}
    </div>
  );
}

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

/**
 * The player's figures always on top; below, either the scoreboard (both teams) or the comparison
 * (shares of the team, the lane opponent, team totals), so each view fits on one screen.
 */
type Tab = "scoreboard" | "build" | "comparison";

function DetailBody({ playerId, view, champ }: { playerId: string; view: MatchDetailView; champ: (id: string | null) => PortraitChampion }) {
  const cache = React.useContext(MatchDetailCacheContext);
  const p = view.player;
  const [tab, setTab] = React.useState<Tab>("scoreboard");
  // Possible groups load after the scoreboard is on screen (a second, separate request), so they
  // never delay the match window itself.
  const [groups, setGroups] = React.useState<MatchGroupsResult | null>(null);
  React.useEffect(() => {
    let live = true;
    void (cache ? cache.groups(playerId, view.matchId) : getMatchGroupsAction(playerId, view.matchId))
      .catch((): MatchGroupsResult => ({ status: "unavailable", message: "" }))
      .then((r) => {
        if (live) React.startTransition(() => setGroups(r));
      });
    return () => {
      live = false;
    };
  }, [cache, playerId, view.matchId]);
  // Ranks missing or older than three days are checked with Riot once the window is open (a third
  // request, only when the server says some need it); the stored ones show meanwhile.
  const [ranks, setRanks] = React.useState<MatchRanksResult | null>(null);
  React.useEffect(() => {
    if (!view.rankCheck) return;
    let live = true;
    void (cache ? cache.ranks(playerId, view.matchId) : getMatchRanksAction(playerId, view.matchId))
      .catch((): MatchRanksResult => ({ status: "not-found", message: "" }))
      .then((r) => {
        if (live) React.startTransition(() => setRanks(r));
      });
    return () => {
      live = false;
    };
  }, [cache, playerId, view.matchId, view.rankCheck]);
  const checked = React.useMemo(() => new Map(ranks?.status === "ok" ? ranks.ranks.map((r) => [r.slot, r.rank]) : []), [ranks]);
  const rankOf = React.useCallback((x: DetailParticipant) => checked.get(x.slot) ?? x.rank, [checked]);
  const checking = view.rankCheck && !ranks;
  const tabs: Array<[Tab, string]> = [
    ["scoreboard", "Scoreboard"],
    ["build", "Build"],
    ["comparison", "Comparison"],
  ];
  return (
    <div className="space-y-3">
      <section aria-label="Your performance" className="space-y-2">
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6" data-testid="match-detail-figures">
          <Figure label="KDA" value={`${p.kills}/${p.deaths}/${p.assists}`} sub={p.deaths === 0 ? "Perfect" : `${p.kda.toFixed(2)} ratio`} />
          <Figure label="Kill participation" value={pct(p.killParticipation)} />
          <Figure label="CS" value={fmtInt(p.cs)} sub={`${fmtNum(p.csPerMin)} per min`} />
          <Figure label="Damage to champions" value={fmtInt(p.damage)} sub={`${fmtInt(p.damagePerMin)} per min`} />
          <Figure label="Damage taken" value={fmtInt(p.damageTaken)} />
          <Figure label="Gold · vision" value={fmtInt(p.gold)} sub={`${fmtInt(p.vision)} vision score`} />
        </div>
        {view.journal.eligible || view.share.eligible || p.opgg ? (
          <div className="flex flex-wrap items-center gap-2">
            {view.journal.eligible ? <JournalButton matchId={view.matchId} inJournal={view.journal.inJournal} /> : null}
            {view.share.eligible ? <BookmarkButton matchId={view.matchId} bookmarked={view.share.shared} share /> : null}
            {p.opgg ? <OpggHistoryLink href={p.opgg} account={p.name?.split("#")[0]?.trim() || null} /> : null}
          </div>
        ) : null}
      </section>
      <div role="tablist" aria-label="Match details" className="flex gap-1 border-b border-border">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`match-tab-${key}`}
            aria-selected={tab === key}
            aria-controls={`match-panel-${key}`}
            onClick={() => setTab(key)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                const i = tabs.findIndex(([k]) => k === tab);
                const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length]![0];
                setTab(next);
                document.getElementById(`match-tab-${next}`)?.focus();
              }
            }}
            tabIndex={tab === key ? 0 : -1}
            className={cn("-mb-px h-10 border-b-2 px-3 text-sm font-medium md:h-9", tab === key ? "border-accent text-fg" : "border-transparent text-fg-muted hover:text-fg")}
            data-testid={`match-tab-${key}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "scoreboard" ? (
        <div id="match-panel-scoreboard" role="tabpanel" aria-labelledby="match-tab-scoreboard" className="space-y-3">
          {view.teams.map((t) => (
            <TeamTable key={t.teamId} team={t} champ={champ} maxDamage={view.maxDamage} groups={groups?.status === "ok" ? (groups.teams.find((g) => g.teamId === t.teamId) ?? null) : null} rankOf={rankOf} queueId={view.queueId} checking={checking} />
          ))}
          <RanksNote ranks={view.teams.flatMap((t) => t.participants.filter((x) => !x.removed).map(rankOf))} queueId={view.queueId} checking={checking} result={ranks} />
          <GroupsNote result={groups} teams={view.teams} />
        </div>
      ) : tab === "build" ? (
        <div id="match-panel-build" role="tabpanel" aria-labelledby="match-tab-build">
          <BuildPanel playerId={playerId} matchId={view.matchId} runePage={p.runePage} player={p} />
        </div>
      ) : (
        <div id="match-panel-comparison" role="tabpanel" aria-labelledby="match-tab-comparison">
          <Comparison view={view} champ={champ} />
        </div>
      )}
    </div>
  );
}

function ShareBar({ label, value, help }: { label: string; value: number | null; help: string }) {
  return (
    <div title={help}>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-fg-muted">{label}</span>
        <span className="font-semibold tabular-nums text-fg">{pct(value)}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-3" aria-hidden>
        <div className="h-full rounded-full bg-accent/80" style={{ width: `${Math.round(Math.min(1, value ?? 0) * 100)}%` }} />
      </div>
    </div>
  );
}

const fmtFigure = (key: ComparisonFigure["key"], v: number | null) => (key === "csPerMin" ? fmtNum(v) : fmtInt(v));

const SKILL_TONE: Record<string, string> = { Q: "bg-blue/20 text-blue", W: "bg-good/20 text-good", E: "bg-warn/20 text-warn", R: "bg-red/20 text-red" };

/**
 * Build order (items bought, minute by minute), skill order and the full rune page. The build comes
 * from Riot's match timeline, requested once per match the first time this tab is opened and then
 * kept; without a timeline it says so rather than guessing from the final items.
 */
function BuildPanel({ playerId, matchId, runePage, player }: { playerId: string; matchId: string; runePage: RunePage | null; player: DetailParticipant }) {
  const [result, setResult] = React.useState<MatchBuildResult | null>(null);
  React.useEffect(() => {
    let live = true;
    void getMatchBuildAction(playerId, matchId).then((r) => live && setResult(r));
    return () => {
      live = false;
    };
  }, [playerId, matchId]);
  const build = result?.status === "ok" ? result.build : null;
  return (
    <div className="space-y-4" data-testid="match-build">
      <section aria-labelledby="build-order-title" className="space-y-2">
        <h3 id="build-order-title" className="text-sm font-semibold text-fg">
          Build order
        </h3>
        {!result ? (
          <div className="h-16 animate-pulse rounded-lg bg-surface-2" aria-busy="true" aria-label="Loading the build order" />
        ) : !build ? (
          <p className="rounded-panel border border-dashed border-border p-3 text-sm text-fg-muted" data-testid="build-message">
            {result.status === "ok" ? "" : result.message}
          </p>
        ) : build.steps.length === 0 ? (
          <p className="text-sm text-fg-muted">No purchases recorded.</p>
        ) : (
          <ol className="flex flex-wrap items-start gap-x-1 gap-y-3" data-testid="build-steps">
            {build.steps.map((step, i) => (
              <li key={i} className="flex items-start gap-1">
                <span className="flex flex-col items-center gap-1">
                  <span className="flex gap-0.5 rounded-lg bg-surface p-1">
                    {step.items.map((it) => (
                      <span key={it.id} className="relative">
                        <IconImg icon={it.url ? { url: it.url, name: it.name } : null} size={28} />
                        {it.count > 1 ? <span className="absolute -bottom-1 -right-1 rounded bg-bg px-0.5 text-3xs font-semibold tabular-nums text-fg">{it.count}</span> : null}
                      </span>
                    ))}
                  </span>
                  <span className="text-2xs tabular-nums text-fg-subtle">{step.minute} min</span>
                </span>
                {i < build.steps.length - 1 ? <ChevronRight className="mt-2.5 h-3.5 w-3.5 shrink-0 text-fg-subtle" aria-hidden /> : null}
              </li>
            ))}
          </ol>
        )}
      </section>
      {build && build.skills.length ? (
        <section aria-labelledby="skill-order-title" className="space-y-2">
          <h3 id="skill-order-title" className="flex flex-wrap items-baseline gap-2 text-sm font-semibold text-fg">
            Skill order
            {build.maxOrder.length ? <span className="text-xs font-normal text-fg-muted">Max {build.maxOrder.join(" → ")}</span> : null}
          </h3>
          <ol className="flex flex-wrap gap-1" data-testid="skill-order">
            {build.skills.map((k, i) => (
              <li key={i} className="flex w-7 flex-col items-center gap-0.5" title={`Level ${i + 1}: ${k}`}>
                <span className={cn("grid h-7 w-7 place-items-center rounded-md text-xs font-bold", SKILL_TONE[k])}>{k}</span>
                <span className="text-3xs tabular-nums text-fg-subtle">{i + 1}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      <section aria-labelledby="runes-title" className="space-y-2">
        <h3 id="runes-title" className="text-sm font-semibold text-fg">
          Runes and summoner spells
        </h3>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3" data-testid="rune-page">
          {runePage ? (
            <>
              <RuneLine tree={runePage.primaryTree} runes={runePage.primary} />
              <RuneLine tree={runePage.secondaryTree} runes={runePage.secondary} />
            </>
          ) : (
            <span className="flex items-center gap-2 text-sm text-fg-muted">
              <IconImg icon={player.keystone} size={28} rounded="rounded-full" />
              <IconImg icon={player.secondary} size={20} rounded="rounded-full" />
              <span className="text-xs text-fg-subtle">Keystone and secondary path (the full page is kept for games stored from now on).</span>
            </span>
          )}
          <span className="flex items-center gap-1">
            {player.spells?.map((s, i) => (
              <span key={i} className="flex items-center gap-1.5 text-xs text-fg-muted">
                <IconImg icon={s} size={24} />
                <span className="pr-2">{s.name}</span>
              </span>
            ))}
          </span>
        </div>
      </section>
    </div>
  );
}

function RuneLine({ tree, runes }: { tree: { url: string; name: string } | null; runes: Array<{ url: string; name: string }> }) {
  return (
    <span className="flex items-center gap-1.5">
      <IconImg icon={tree} size={20} rounded="rounded-full" className="opacity-80" />
      {runes.map((r, i) => (
        <IconImg key={i} icon={r} size={i === 0 && runes.length === 4 ? 32 : 24} rounded="rounded-full" />
      ))}
    </span>
  );
}

/** Plain comparisons from the game's own record: no grades, no scores, nothing inferred. */
function Comparison({ view, champ }: { view: MatchDetailView; champ: (id: string | null) => PortraitChampion }) {
  const c = view.comparison;
  const own = view.teams[0];
  const ownTone = own?.side === "red" ? "bg-red/70" : "bg-blue/70";
  const enemyTone = own?.side === "red" ? "bg-blue/70" : "bg-red/70";
  const opponent = c.opponent ? champ(c.opponent.championId) : null;
  return (
    <div className="grid gap-4 md:grid-cols-2" data-testid="match-comparison">
      <div className="space-y-4">
        <section aria-labelledby="share-title" className="space-y-2">
          <h3 id="share-title" className="text-sm font-semibold text-fg">
            Share of your team
          </h3>
          <ShareBar label="Champion damage" value={c.damageShare} help="Your damage to champions as a share of your team's" />
          <ShareBar label="Gold" value={c.goldShare} help="Your gold earned as a share of your team's" />
          <ShareBar label="Kill participation" value={c.killParticipation} help="Kills and assists as a share of your team's kills" />
        </section>
        <section aria-labelledby="lane-title">
          <h3 id="lane-title" className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-fg">
            Against your lane opponent
            {opponent ? <ChampionPortrait champion={opponent} size="xs" title={opponent.name} /> : null}
          </h3>
          <table className="w-full text-sm" data-testid="lane-comparison">
            <thead>
              <tr className="text-left text-2xs text-fg-subtle">
                <th className="py-1 font-normal" scope="col">
                  <span className="sr-only">Figure</span>
                </th>
                <th className="py-1 text-right font-normal" scope="col">
                  You
                </th>
                <th className="py-1 text-right font-normal" scope="col">
                  {opponent ? opponent.name : "Opponent"}
                </th>
                <th className="py-1 text-right font-normal" scope="col">
                  Team average
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {c.figures.map((f) => (
                <tr key={f.key}>
                  <th scope="row" className="py-1.5 text-left text-xs font-normal text-fg-muted">
                    {f.label}
                  </th>
                  <td className="py-1.5 text-right font-semibold tabular-nums text-fg">{fmtFigure(f.key, f.you)}</td>
                  <td className="py-1.5 text-right tabular-nums text-fg-muted">{c.opponent ? fmtFigure(f.key, f.opponent) : "—"}</td>
                  <td className="py-1.5 text-right tabular-nums text-fg-muted">{fmtFigure(f.key, f.teamAverage)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!c.opponent ? <p className="mt-1 text-2xs text-fg-subtle">Riot did not record positions clearly enough to pair a lane opponent in this game.</p> : null}
        </section>
      </div>
      <section aria-labelledby="teams-title" className="space-y-2.5">
        <h3 id="teams-title" className="flex items-baseline justify-between text-sm font-semibold text-fg">
          Team totals
          <span className="text-2xs font-normal text-fg-subtle">your team · enemy team</span>
        </h3>
        {c.teams
          .filter((t) => t.own !== null || t.enemy !== null)
          .map((t) => {
            const a = t.own ?? 0;
            const b = t.enemy ?? 0;
            const share = a + b > 0 ? a / (a + b) : 0.5;
            const show = (v: number | null) => (v === null ? "—" : t.key === "gold" || t.key === "damage" ? `${(v / 1000).toFixed(1)}k` : String(v));
            return (
              <div key={t.key} data-testid={`team-total-${t.key}`}>
                <div className="flex items-baseline justify-between text-xs">
                  <span className="font-semibold tabular-nums text-fg">{show(t.own)}</span>
                  <span className="text-fg-muted">{t.label}</span>
                  <span className="tabular-nums text-fg-muted">{show(t.enemy)}</span>
                </div>
                <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                  <div className={ownTone} style={{ width: `${Math.round(share * 100)}%` }} />
                  <div className={cn("flex-1", enemyTone)} />
                </div>
              </div>
            );
          })}
      </section>
    </div>
  );
}

/** The two possible groups a team can hold at most (5 players), told apart by colour. */
const GROUP_MARK = ["bg-accent", "bg-warn"];

interface RankProps {
  rankOf: (x: DetailParticipant) => ParticipantRank;
  queueId: number | null;
  /** The window's rank check is still answering. */
  checking: boolean;
}

function TeamTable({ team, champ, maxDamage, groups, rankOf, queueId, checking }: { team: DetailTeam; champ: (id: string | null) => PortraitChampion; maxDamage: number; groups: MatchGroupsTeam | null } & RankProps) {
  const objectives = OBJECTIVES.filter(([k]) => team.objectives[k] !== undefined);
  const found = groups?.groups ?? [];
  const groupOf = new Map(found.flatMap((g, i) => g.slots.map((s) => [s, { index: i, label: g.label }] as const)));
  const nameOf = (slot: number) => {
    const x = team.participants.find((p) => p.slot === slot);
    if (x?.removed) return "Removed player";
    return x ? (x.teamMember ?? x.name?.split("#")[0] ?? champ(x.championId).name) : "Player";
  };
  return (
    <section className={cn("overflow-hidden rounded-panel border", team.win ? "border-blue/30" : "border-red/30")} data-testid={`team-${team.side}`} aria-label={`${team.side === "blue" ? "Blue" : "Red"} team, ${team.win ? "victory" : "defeat"}`}>
      <header className={cn("flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-3 py-1.5 text-xs", team.win ? "bg-blue/10" : "bg-red/10")}>
        <span className="font-semibold uppercase tracking-label">
          <span className={team.side === "blue" ? "text-blue" : "text-red"}>{team.side === "blue" ? "Blue side" : "Red side"}</span> · {team.win ? "Victory" : "Defeat"}
        </span>
        <span className="flex flex-wrap gap-x-3 text-fg-muted">
          <span>{team.kills} kills</span>
          {team.gold !== null ? <span>{(team.gold / 1000).toFixed(1)}k gold</span> : null}
          {objectives.map(([k, one, many]) => (
            <span key={k}>
              {team.objectives[k]} {team.objectives[k] === 1 ? one : many}
            </span>
          ))}
          {team.bans.length ? (
            <span className="flex items-center gap-1" data-testid="team-bans">
              Bans
              {team.bans.map((b) => (
                <ChampionPortrait key={b} champion={champ(b)} size="xs" dimmed title={`Banned: ${champ(b).name}`} className="h-5 w-5 rounded text-4xs" />
              ))}
            </span>
          ) : null}
        </span>
      </header>
      {found.length ? (
        <div className="space-y-1 border-b border-border/70 px-3 py-1.5" data-testid="possible-groups">
          {found.map((g, i) => (
            <GroupLine key={g.slots.join()} group={g} mark={GROUP_MARK[i] ?? GROUP_MARK[0]!} names={g.slots.map(nameOf)} />
          ))}
        </div>
      ) : null}
      <ul className="divide-y divide-border/70">
        {team.participants.map((x, i) => (
          <ParticipantRow key={i} x={x} champ={champ} maxDamage={maxDamage} group={groupOf.get(x.slot) ?? null} rank={rankOf(x)} queueId={queueId} checking={checking} />
        ))}
      </ul>
    </section>
  );
}

/**
 * A player's current or last-checked rank, compact (domain/known-rank.ts): the tier's crest and
 * "Gold 2" (a rank in the match's other ranked queue is marked "Flex" or "Solo"; one read over a
 * month ago carries its month), "Unranked" when a check found no ranked entry, and "—" when
 * nothing is known. One being checked pulses until the answer arrives.
 */
function RankBadge({ rank, queueId, checking }: { rank: ParticipantRank; queueId: number | null; checking: boolean }) {
  const base = "inline-flex h-4 shrink-0 items-center gap-1 rounded border px-1 text-3xs font-medium leading-4";
  if (checking && rank.state === "unknown")
    return (
      <span className={cn(base, "w-10 animate-pulse border-dashed border-border motion-reduce:animate-none")} data-testid="participant-rank" data-state="checking">
        <span className="sr-only">Checking rank</span>
      </span>
    );
  const { text, queueMark, spoken, title } = rankBadgeLabel(rank, queueId);
  return (
    <span className={cn(base, rank.state === "ranked" ? "border-border text-fg-muted" : rank.state === "unranked" ? "border-border text-fg-subtle" : "border-dashed border-border text-fg-subtle")} title={title} data-testid="participant-rank" data-state={rank.state} data-queue={rank.queue ?? undefined}>
      {rank.state === "ranked" ? <RankEmblem tier={rank.tier} className="-ml-px h-3 w-3" /> : null}
      <span aria-hidden className="whitespace-nowrap" data-testid="participant-rank-text">
        {queueMark ? <span className="text-fg-subtle">{queueMark} </span> : null}
        {text}
      </span>
      <span className="sr-only">{spoken}</span>
    </span>
  );
}

/**
 * Under the scoreboard: what the badges are (current or last-known ranks, never the rank in the
 * game, which Riot's match records do not hold), when they were checked, and what a missing one
 * means; plus the state of the window's own check when it could not ask for every player.
 */
function RanksNote({ ranks, queueId, checking, result }: { ranks: ParticipantRank[]; queueId: number | null; checking: boolean; result: MatchRanksResult | null }) {
  const queue = matchRankQueue(queueId);
  const when = rankChecksWhen(ranks);
  // "Current" only while every rank shown was checked in the last three days.
  const lead = ranks.some((r) => r.state !== "unknown" && r.stale) ? "Last-known" : "Current";
  const unranked = ranks.some((r) => r.state === "unranked");
  // A rank still being checked shows the pulse, not "—".
  const unknown = ranks.some((r) => r.state === "unknown" && !(checking && r.stale));
  const check = result?.status === "ok" ? result.check : null;
  const status = checking
    ? "Checking ranks with Riot…"
    : check?.reason === "budget"
      ? "Today's rank checks are used up, so some ranks are older or missing."
      : check?.reason === "busy"
        ? "Riot was busy, so some ranks were not checked; they are checked when this match is next opened."
        : check?.failed
          ? `Riot did not answer for ${check.failed === 1 ? "one player" : `${check.failed} players`}; they are checked again later.`
          : null;
  return (
    <p className="text-2xs text-fg-subtle" data-testid="ranks-note" data-state={checking ? "checking" : (check?.reason ?? (check?.failed ? "failed" : "done"))}>
      {lead} {queue === "flex" ? "Ranked Flex ranks (Solo/Duo where marked)" : "Ranked Solo/Duo ranks (Flex where marked)"}
      {when ? `, checked ${when}` : ""}: not the ranks players had in this game, which Riot&apos;s match records do not include.
      {unranked || unknown ? ` ${[unranked ? "Unranked: no ranked entry." : null, unknown ? "—: not available." : null].filter(Boolean).join(" ")}` : ""}
      {status ? <span className="text-fg-muted"> {status}</span> : null}
    </p>
  );
}

/**
 * One possible group above its team's rows: who, and how many earlier stored games back it (the
 * games themselves open from the line: date, queue and the group's result, newest first).
 */
function GroupLine({ group: g, mark, names }: { group: MatchGroupView; mark: string; names: string[] }) {
  const more = g.games - g.evidence.length;
  return (
    <details className="group/ev text-xs" data-testid="possible-group" data-size={g.slots.length}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
        <span className={cn("h-3 w-[3px] shrink-0 rounded-full", mark)} aria-hidden />
        <span className="font-semibold text-fg">{g.label}</span>
        <span className="text-fg-muted">{names.join(", ")}</span>
        <span className="basis-full pl-[9px] text-fg-subtle sm:basis-auto sm:pl-0" data-testid="possible-group-games">
          {groupEvidenceText(g.slots.length, g.games, g.opposed)}
        </span>
        <ChevronRight className="h-3 w-3 shrink-0 text-fg-subtle transition-transform group-open/ev:rotate-90" aria-hidden />
        <span className="sr-only">Show the games</span>
      </summary>
      <ul className="mt-1 space-y-0.5 pb-0.5 pl-3 text-2xs tabular-nums text-fg-muted" data-testid="possible-group-evidence">
        {g.evidence.map((e, i) => (
          <li key={i}>
            {formatDate(new Date(e.playedAt))} · {e.queue} · <span className={e.win ? "text-blue" : "text-red"}>{e.win ? "Won" : "Lost"}</span>
          </li>
        ))}
        {more > 0 ? <li className="text-fg-subtle">and {more} earlier</li> : null}
      </ul>
    </details>
  );
}

/**
 * What the possible groups are based on, under the scoreboard: an inference from stored games, the
 * window searched, and which sides could not be assessed. Absence of a group is never presented as
 * "no premade": most players appear in stored games only when they shared a game with a member.
 */
function GroupsNote({ result, teams }: { result: MatchGroupsResult | null; teams: DetailTeam[] }) {
  if (!result) return <p className="text-2xs text-fg-subtle" data-testid="possible-groups-note" data-state="loading">Checking stored games for players who may have queued together…</p>;
  if (result.status !== "ok") return null;
  const side = (teamId: number) => (teams.find((t) => t.teamId === teamId)?.side === "blue" ? "Blue side" : "Red side");
  if (result.teams.some((t) => t.note === "clash")) return <p className="text-2xs text-fg-subtle" data-testid="possible-groups-note" data-state="clash">Clash: each side is a registered team of five, so no groups are inferred.</p>;
  if (result.teams.every((t) => t.note === "not-assessed")) return <p className="text-2xs text-fg-subtle" data-testid="possible-groups-note" data-state="not-assessed">Possible groups are only assessed for matchmade queues.</p>;
  const open = result.teams.filter((t) => t.groups.length === 0);
  // A side made up of UNIIVERSE members (or with one other player) has nobody to group.
  const nobody = (t: MatchGroupsTeam) => t.assessed < 2;
  const sides = (list: MatchGroupsTeam[]) => list.map((t) => side(t.teamId)).join(" and ");
  const members = open.filter(nobody);
  const thin = open.filter((t) => !nobody(t));
  return (
    <p className="text-2xs text-fg-subtle" data-testid="possible-groups-note" data-state="ok">
      {thin.length ? (
        <span className="text-fg-muted" data-testid="possible-groups-insufficient">
          {thin.length === result.teams.length ? "Possible groups: not enough recorded history to assess." : `${sides(thin)}: not enough recorded history to assess possible groups.`}{" "}
        </span>
      ) : null}
      {members.length ? <span className="text-fg-muted">{sides(members)}: no other players to assess. </span> : null}
      Possible groups only cover players who are not members: the same players all on one team in at least three of the {formatCount(result.gamesSearched)} earlier recorded {result.gamesSearched === 1 ? "game" : "games"} found for them (the {result.windowDays} days before this match), and far more often as teammates than as opponents. They are an inference, not confirmed parties; members are never labelled, and players who rarely share a game with a member cannot be assessed.
    </p>
  );
}

/** A player whose personal data was erased: their place in the game, and nothing about them. */
function RemovedRow() {
  return (
    <li className="flex items-center gap-2 px-3 py-1.5 xl:py-2" data-testid="participant" data-removed>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-3 text-fg-subtle" aria-hidden>
        <UserX className="h-4 w-4" />
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-sm text-fg-muted" data-testid="participant-name">
          Removed player
        </span>
        <span className="block text-2xs text-fg-subtle">Their personal data was erased; nothing about them is kept.</span>
      </span>
    </li>
  );
}

function ParticipantRow({ x, champ, maxDamage, group, rank, queueId, checking }: { x: DetailParticipant; champ: (id: string | null) => PortraitChampion; maxDamage: number; group: { index: number; label: string } | null; rank: ParticipantRank; queueId: number | null; checking: boolean }) {
  if (x.removed) return <RemovedRow />;
  const c = champ(x.championId);
  return (
    <li className={cn("relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3 py-1.5 sm:grid-cols-[minmax(0,1.4fr)_5rem_8.75rem_minmax(0,1fr)] xl:grid-cols-[minmax(0,1.6fr)_6rem_11rem_minmax(0,1fr)] xl:py-2", x.isPlayer && "bg-accent/10")} data-testid="participant" data-player={x.isPlayer || undefined} data-group={group ? group.index : undefined}>
      {group ? <span className={cn("absolute inset-y-1.5 left-0 w-[3px] rounded-r-full", GROUP_MARK[group.index] ?? GROUP_MARK[0])} aria-hidden /> : null}
      <span className="flex min-w-0 items-center gap-2">
        <span className="relative shrink-0">
          <ChampionPortrait champion={c} size="sm" />
          {x.champLevel !== null ? <span className="absolute -bottom-1 -right-1 rounded bg-bg px-0.5 text-3xs font-semibold tabular-nums text-fg-muted">{x.champLevel}</span> : null}
        </span>
        <span className="hidden flex-col gap-0.5 sm:flex">
          <span className="flex gap-0.5">{x.spells?.map((s, i) => <IconImg key={i} icon={s} size={14} />)}</span>
          <IconImg icon={x.keystone} size={14} rounded="rounded-full" />
        </span>
        <span className="min-w-0 leading-tight">
          <span className={cn("block truncate text-sm", x.isPlayer ? "font-semibold text-fg" : "text-fg")} title={x.name ?? undefined} data-testid="participant-name">
            <PlayerLink memberId={x.memberId} opgg={x.opgg} label={x.teamMember ?? x.name?.split("#")[0] ?? c.name}>
              {x.name ? x.name.split("#")[0] : c.name}
            </PlayerLink>
            {group ? <span className="sr-only"> ({group.label.toLowerCase()})</span> : null}
          </span>
          <span className="flex min-w-0 items-center gap-1 text-2xs text-fg-subtle">
            <span className="truncate">
              {c.name}
              {x.teamMember && !x.isPlayer ? <span className="text-accent"> · {x.teamMember}</span> : null}
            </span>
            <RankBadge rank={rank} queueId={queueId} checking={checking && rank.stale} />
          </span>
        </span>
      </span>
      <span className="text-right leading-tight sm:text-left" data-testid="participant-kda">
        <span className="block text-sm font-semibold tabular-nums xl:text-base">
          {x.kills}/{x.deaths}/{x.assists}
        </span>
        <span className="block text-2xs tabular-nums text-fg-subtle">{x.deaths === 0 ? "Perfect" : `${x.kda.toFixed(2)} KDA`}</span>
      </span>
      <span className="leading-tight max-sm:col-span-2" title={x.damage !== null ? `${formatCount(x.damage)} damage to champions` : undefined}>
        <span className="flex items-center gap-1.5 text-2xs tabular-nums text-fg-muted">
          {fmtInt(x.damage)} dmg
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
            <span className="block h-full rounded-full bg-accent/70" style={{ width: `${Math.round(((x.damage ?? 0) / maxDamage) * 100)}%` }} />
          </span>
        </span>
        <span className="block whitespace-nowrap text-2xs tabular-nums text-fg-subtle">
          {fmtNum(x.csPerMin)} CS/min · {fmtInt(x.vision)} vision
        </span>
      </span>
      <span className="max-sm:col-span-2">
        <span className="xl:hidden">
          <ItemRow items={x.items} size={20} />
        </span>
        <span className="hidden xl:block">
          <ItemRow items={x.items} size={26} />
        </span>
      </span>
    </li>
  );
}

/**
 * Adds this Ranked Solo/Duo game to Solo Queue Blocks through the journal's own import (never
 * twice). With no block in progress, the game simply starts one (0 Games → 1 Game).
 */
function JournalButton({ matchId, inJournal }: { matchId: string; inJournal: boolean }) {
  const router = useRouter();
  const [done, setDone] = React.useState(inJournal);
  const [busy, setBusy] = React.useState(false);
  if (done)
    return (
      <p className="inline-flex items-center gap-1.5 rounded-lg bg-good/10 px-3 py-2 text-sm text-good" data-testid="journal-added">
        <Check className="h-4 w-4" aria-hidden /> In your Solo Queue Blocks
      </p>
    );
  const add = async () => {
    setBusy(true);
    const r = await importRankedMatchAction(matchId);
    setBusy(false);
    if (!r.ok) {
      if (/already in your journal/i.test(r.error)) return setDone(true);
      return void toast.error("Not added", { description: r.error });
    }
    setDone(true);
    toast.success(`Added to ${r.data.block.label}.`, { description: "Add the main mistake and a note in Solo Queue Blocks." });
    router.refresh();
  };
  return (
    <div className="flex flex-wrap items-end gap-2" data-testid="journal-add">
      <Button variant="outline" disabled={busy} onClick={() => void add()} data-testid="journal-add-button">
        <NotebookPen className="h-4 w-4" /> {busy ? "Adding…" : "Add to Solo Queue Block"}
      </Button>
    </div>
  );
}
