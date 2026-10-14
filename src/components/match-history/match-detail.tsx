"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, NotebookPen, X } from "lucide-react";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import { getMatchBuildAction, getMatchDetailAction } from "@/server/actions/match-history";
import type { MatchBuildResult } from "@/server/accounts/match-timeline";
import { importRankedMatchAction } from "@/server/actions/ranked";
import type { ComparisonFigure, DetailParticipant, DetailTeam, MatchDetailResult, MatchDetailView, RunePage } from "@/server/players/match-history";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import { IconImg, ItemRow, fmtDuration, fmtInt, fmtNum } from "./match-history-view";

const OBJECTIVES: Array<[string, string, string]> = [
  ["tower", "tower", "towers"],
  ["dragon", "dragon", "dragons"],
  ["baron", "baron", "barons"],
  ["horde", "voidgrub", "voidgrubs"],
  ["riftHerald", "herald", "heralds"],
  ["inhibitor", "inhibitor", "inhibitors"],
];

/**
 * One match, over the page: a drawer from the right on wider screens, the full screen on a phone.
 * The rest of the history stays where it was; Escape, the close button or Back return to it.
 * The record loads when opened (and is fetched once from Riot if it was not collected yet).
 */
export function MatchDetailDrawer({ playerId, matchId, championsById, onClose }: { playerId: string; matchId: string; championsById: Record<string, PortraitChampion>; onClose: () => void }) {
  const [result, setResult] = React.useState<MatchDetailResult | null>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const closeRef = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    let live = true;
    void getMatchDetailAction(playerId, matchId).then((r) => live && setResult(r));
    return () => {
      live = false;
    };
  }, [playerId, matchId]);
  React.useEffect(() => {
    closeRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>('button, [href], input, select, [tabindex]:not([tabindex="-1"])');
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  const champ = (id: string | null): PortraitChampion => (id ? (championsById[id] ?? { id, name: id, portraitUrl: "" }) : { id: "unknown", name: "Unknown", portraitUrl: "" });
  const view = result?.status === "ok" ? result.view : null;
  return (
    <div className="fixed inset-0 z-50" role="presentation">
      <button type="button" className="absolute inset-0 bg-black/55 backdrop-blur-[2px] motion-safe:animate-[fade-in_150ms_ease-out]" aria-label="Close the match details" tabIndex={-1} onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="match-detail-title"
        className="absolute inset-y-0 right-0 flex w-full flex-col border-l border-border bg-bg shadow-2xl sm:max-w-3xl motion-safe:drawer-in"
        data-testid="match-detail"
      >
        <header className={cn("flex items-start justify-between gap-3 border-b border-border px-4 py-3", view ? (view.win ? "bg-blue/10" : "bg-red/10") : "bg-surface")}>
          {view ? (
            <div className="flex min-w-0 items-center gap-3">
              <ChampionPortrait champion={champ(view.championId)} size="md" />
              <div className="min-w-0">
                <h2 id="match-detail-title" className="flex flex-wrap items-baseline gap-2 text-lg font-semibold text-fg">
                  <span className={view.win ? "text-blue" : "text-red"}>
                    <span aria-hidden>{view.win ? "▲ " : "▼ "}</span>
                    {view.win ? "Victory" : "Defeat"}
                  </span>
                  <span className="truncate">{champ(view.championId).name}</span>
                </h2>
                <p className="text-xs text-fg-muted">
                  {view.queue} · {fmtDuration(view.durationS)} · {formatDate(new Date(view.playedAt))}
                  {view.patch ? ` · patch ${view.patch}` : ""}
                  {view.role && view.role !== "UNKNOWN" ? ` · ${ROLE_LABELS[view.role as Role] ?? view.role}` : ""}
                </p>
              </div>
              <Loadout player={view.player} className="ml-2 hidden md:flex" />
            </div>
          ) : (
            <h2 id="match-detail-title" className="text-lg font-semibold text-fg">
              Match details
            </h2>
          )}
          <button ref={closeRef} type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-fg-muted hover:bg-surface-2 hover:text-fg" aria-label="Close" data-testid="match-detail-close">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4" data-testid="match-detail-body">
          {!result ? <DetailSkeleton /> : result.status !== "ok" ? <p className="rounded-xl border border-dashed border-border p-4 text-sm text-fg-muted" data-testid="match-detail-message">{result.message}</p> : <DetailBody playerId={playerId} view={view!} champ={champ} />}
        </div>
      </div>
    </div>
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
        <div key={i} className="h-64 animate-pulse rounded-xl bg-surface-2" />
      ))}
    </div>
  );
}

/** Summoner spells, runes and final items (in the drawer header on wide screens). */
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
      <div className="truncate text-[11px] text-fg-subtle">{label}</div>
      <div className="text-base font-semibold tabular-nums leading-tight text-fg">{value}</div>
      {sub ? <div className="truncate text-[11px] tabular-nums text-fg-muted">{sub}</div> : null}
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
  const p = view.player;
  const [tab, setTab] = React.useState<Tab>("scoreboard");
  const tabs: Array<[Tab, string]> = [
    ["scoreboard", "Scoreboard"],
    ["build", "Build"],
    ["comparison", "Comparison"],
  ];
  return (
    <div className="space-y-3">
      <section aria-label="Your performance" className="space-y-2">
        <Loadout player={p} className="md:hidden" />
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6" data-testid="match-detail-figures">
          <Figure label="KDA" value={`${p.kills}/${p.deaths}/${p.assists}`} sub={p.deaths === 0 ? "Perfect" : `${p.kda.toFixed(2)} ratio`} />
          <Figure label="Kill participation" value={pct(p.killParticipation)} />
          <Figure label="CS" value={fmtInt(p.cs)} sub={`${fmtNum(p.csPerMin)} per min`} />
          <Figure label="Damage to champions" value={fmtInt(p.damage)} sub={`${fmtInt(p.damagePerMin)} per min`} />
          <Figure label="Damage taken" value={fmtInt(p.damageTaken)} />
          <Figure label="Gold · vision" value={fmtInt(p.gold)} sub={`${fmtInt(p.vision)} vision score`} />
        </div>
        {view.journal.eligible ? <JournalButton matchId={view.matchId} inJournal={view.journal.inJournal} /> : null}
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
            <TeamTable key={t.teamId} team={t} champ={champ} maxDamage={view.maxDamage} />
          ))}
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
          <p className="rounded-xl border border-dashed border-border p-3 text-sm text-fg-muted" data-testid="build-message">
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
                        {it.count > 1 ? <span className="absolute -bottom-1 -right-1 rounded bg-bg px-0.5 text-[10px] font-semibold tabular-nums text-fg">{it.count}</span> : null}
                      </span>
                    ))}
                  </span>
                  <span className="text-[11px] tabular-nums text-fg-subtle">{step.minute} min</span>
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
                <span className="text-[10px] tabular-nums text-fg-subtle">{i + 1}</span>
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
              <tr className="text-left text-[11px] text-fg-subtle">
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
          {!c.opponent ? <p className="mt-1 text-[11px] text-fg-subtle">Riot did not record positions clearly enough to pair a lane opponent in this game.</p> : null}
        </section>
      </div>
      <section aria-labelledby="teams-title" className="space-y-2.5">
        <h3 id="teams-title" className="flex items-baseline justify-between text-sm font-semibold text-fg">
          Team totals
          <span className="text-[11px] font-normal text-fg-subtle">your team · enemy team</span>
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

function TeamTable({ team, champ, maxDamage }: { team: DetailTeam; champ: (id: string | null) => PortraitChampion; maxDamage: number }) {
  const objectives = OBJECTIVES.filter(([k]) => team.objectives[k] !== undefined);
  return (
    <section className={cn("overflow-hidden rounded-xl border", team.win ? "border-blue/30" : "border-red/30")} data-testid={`team-${team.side}`} aria-label={`${team.side === "blue" ? "Blue" : "Red"} team, ${team.win ? "victory" : "defeat"}`}>
      <header className={cn("flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-3 py-1.5 text-xs", team.win ? "bg-blue/10" : "bg-red/10")}>
        <span className="font-semibold uppercase tracking-wide">
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
                <ChampionPortrait key={b} champion={champ(b)} size="xs" dimmed title={`Banned: ${champ(b).name}`} className="h-5 w-5 rounded text-[8px]" />
              ))}
            </span>
          ) : null}
        </span>
      </header>
      <ul className="divide-y divide-border/70">
        {team.participants.map((x, i) => (
          <ParticipantRow key={i} x={x} champ={champ} maxDamage={maxDamage} />
        ))}
      </ul>
    </section>
  );
}

function ParticipantRow({ x, champ, maxDamage }: { x: DetailParticipant; champ: (id: string | null) => PortraitChampion; maxDamage: number }) {
  const c = champ(x.championId);
  return (
    <li className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3 py-1.5 sm:py-1 sm:grid-cols-[minmax(0,1.4fr)_5rem_8.75rem_minmax(0,1fr)]", x.isPlayer && "bg-accent/10")} data-testid="participant" data-player={x.isPlayer || undefined}>
      <span className="flex min-w-0 items-center gap-2">
        <span className="relative shrink-0">
          <ChampionPortrait champion={c} size="sm" />
          {x.champLevel !== null ? <span className="absolute -bottom-1 -right-1 rounded bg-bg px-0.5 text-[10px] font-semibold tabular-nums text-fg-muted">{x.champLevel}</span> : null}
        </span>
        <span className="hidden flex-col gap-0.5 sm:flex">
          <span className="flex gap-0.5">{x.spells?.map((s, i) => <IconImg key={i} icon={s} size={14} />)}</span>
          <IconImg icon={x.keystone} size={14} rounded="rounded-full" />
        </span>
        <span className="min-w-0 leading-tight">
          <span className={cn("block truncate text-sm", x.isPlayer ? "font-semibold text-fg" : "text-fg")} title={x.name ?? undefined}>{x.name ? x.name.split("#")[0] : c.name}</span>
          <span className="block truncate text-[11px] text-fg-subtle">
            {c.name}
            {x.teamMember && !x.isPlayer ? <span className="text-accent"> · {x.teamMember}</span> : null}
          </span>
        </span>
      </span>
      <span className="text-right leading-tight sm:text-left">
        <span className="block text-sm font-semibold tabular-nums">
          {x.kills}/{x.deaths}/{x.assists}
        </span>
        <span className="block text-[11px] tabular-nums text-fg-subtle">{x.deaths === 0 ? "Perfect" : `${x.kda.toFixed(2)} KDA`}</span>
      </span>
      <span className="leading-tight max-sm:col-span-2" title={x.damage !== null ? `${x.damage.toLocaleString("en")} damage to champions` : undefined}>
        <span className="flex items-center gap-1.5 text-[11px] tabular-nums text-fg-muted">
          {fmtInt(x.damage)} dmg
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
            <span className="block h-full rounded-full bg-accent/70" style={{ width: `${Math.round(((x.damage ?? 0) / maxDamage) * 100)}%` }} />
          </span>
        </span>
        <span className="block whitespace-nowrap text-[11px] tabular-nums text-fg-subtle">
          {fmtNum(x.csPerMin)} CS/min · {fmtInt(x.vision)} vision
        </span>
      </span>
      <span className="max-sm:col-span-2">
        <ItemRow items={x.items} size={20} />
      </span>
    </li>
  );
}

/**
 * Adds this Ranked Solo/Duo game to Solo Queue Blocks through the journal's own import (never
 * twice). With no block in progress, the game simply starts one (0 / 1 → 1 game logged).
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
