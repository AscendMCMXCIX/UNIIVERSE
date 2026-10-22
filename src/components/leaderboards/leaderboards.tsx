import type { ReactNode } from "react";
import Link from "next/link";
import { Castle, ChevronLeft, ChevronRight, Crown, Eye, Flame, Info, LayoutDashboard, Medal, Sparkles, Swords, Target, TrendingUp, Trophy, Wheat, type LucideIcon } from "lucide-react";
import { readableColour, type CardLook } from "@/domain/card-style";
import type { LeaderboardCategory } from "@/domain/leaderboards";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { CardAvatar } from "@/components/players/card-look";
import { CardArtLayer } from "@/components/players/card-art";
import { RoleIcon } from "@/components/role-icon";
import { ROLE_LABELS } from "@/domain/roles";
import { RankInline } from "@/components/players/rank-emblem";
import { Badge } from "@/components/ui/badge";
import { TabLinks } from "@/components/ui/tab-links";
import { ScrollRow } from "@/components/ui/scroll-row";
import { cn } from "@/lib/cn";
import { leaderboardHref, type LeaderboardView, type ViewEntry, type ViewPlayer } from "@/server/leaderboards/view";
import { LeaderboardFilterBar, ScrollCurrentIntoView } from "./filter-bar";
import { formatCount, formatDateTime } from "@/lib/format";
import { DataRefresh } from "@/components/ui/data-status";
import type { DataStatus } from "@/domain/data-status";

/*
  TEAM LEADERBOARDS: one category and one statistic at a time, in a clear order: what you are
  looking at (title, scope, last update), the competition (the top three, then everyone with a
  bar against the leader), and where you stand (your place and the gap to first). The metric
  rail lists every statistic of the category with its leader and your place, so you can spot
  the boards you could win. Values are Riot game data only; nothing from private journals.
*/

const KIND_LABEL = { total: "Total", average: "Average", rate: "Rate", record: "Record" } as const;
const KIND_HINT = {
  total: "Adds up over the games in scope: more games, more chances.",
  average: "Per game or per minute over the games with the figure: fair between players with different game counts.",
  rate: "A share of the games played.",
  record: "One game or one run: the best ever recorded in scope.",
} as const;
const CATEGORY_ICON: Record<LeaderboardCategory, LucideIcon> = { overview: LayoutDashboard, combat: Swords, multikills: Flame, farming: Wheat, vision: Eye, objectives: Castle, champions: Sparkles, records: Trophy };
const PLACE = [
  { ring: "ring-warn/70", text: "text-warn", plinth: "h-16 sm:h-20 border-warn/50 bg-gradient-to-b from-warn/25 to-warn/5" },
  { ring: "ring-fg-subtle/60", text: "text-fg-muted", plinth: "h-11 sm:h-14 border-fg-subtle/40 bg-gradient-to-b from-fg-subtle/20 to-transparent" },
  { ring: "ring-bronze/70", text: "text-bronze-fg", plinth: "h-8 sm:h-10 border-bronze/45 bg-gradient-to-b from-bronze/20 to-transparent" },
] as const;

const accentOf = (look: CardLook) => (look.style.colours.primary === "#1fc3ff" ? "var(--color-accent)" : readableColour(look.style.colours.primary));

export function Leaderboards({ view, champions, status }: { view: LeaderboardView; champions: Record<string, PortraitChampion>; /** The members' page: the team's data status (no Refresh: the boards follow each player's account syncs). */ status?: DataStatus | null }) {
  const f = view.filters;
  const b = view.board;
  const player = (id: string) => view.players[id]!;
  const champ = (id: string | null) => (id ? (champions[id] ?? { id, name: id, portraitUrl: "" }) : null);
  const updated = view.lastUpdated ? formatDateTime(view.lastUpdated) : null;
  const viewer = view.you?.playerId ?? null;
  return (
    <div className="mx-auto flex w-full max-w-[var(--content-wide)] flex-col gap-4" data-testid="leaderboards">
      {/* What you are looking at: title, scope and freshness; the filters beside them. */}
      <header className="flex flex-col gap-3 2xl:flex-row 2xl:items-end 2xl:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-fg">
            <Trophy className="h-6 w-6 text-warn" aria-hidden /> Team Leaderboards
          </h1>
          <p className="mt-1 text-sm text-fg-muted">
            <span className="font-medium text-fg" data-testid="scope-label">
              {view.scopeLabel}
            </span>{" "}
            · {formatCount(view.gamesInScope)} games · {view.playerCount} player{view.playerCount === 1 ? "" : "s"}
          </p>
          {/* How fresh the boards are: the same ⓘ, in the same place, as on a profile (there is no
              Refresh here: the boards follow each player's account syncs and their own Refresh). */}
          {status ? (
            <DataRefresh status={status} className="mt-2" testId="leaderboards-status" />
          ) : (
            <p className="mt-0.5 text-xs text-fg-subtle" data-testid="last-updated" title="Leaderboards follow the account syncs: new games appear after the next sync, not live.">
              {updated ? `Updated from the last account sync: ${updated}` : "No account sync yet"}
            </p>
          )}
        </div>
        <LeaderboardFilterBar filters={f} seasons={view.seasons} currentSeason={view.currentSeason} basePath={view.basePath} />
      </header>

      {/* Categories are sections of the page: the same underlined tabs as Matches and a profile. */}
      <TabLinks label="Leaderboard categories" testId="leaderboard-categories" items={view.categories.map((c) => ({ href: leaderboardHref(f, { category: c.key }, view.basePath), label: c.label, icon: CATEGORY_ICON[c.key], active: c.key === f.category, testId: `category-${c.key}` }))} />

      {view.playerCount === 0 ? (
        <p className="rounded-panel border border-border bg-surface p-6 text-sm text-fg-muted">No team members to compare yet. Members appear here once their account setup is finished.</p>
      ) : f.highlights ? (
        <HighlightsGrid view={view} player={player} />
      ) : (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[16rem_minmax(0,1fr)] 2xl:grid-cols-[17rem_minmax(0,1fr)_20rem]">
          <MetricRail view={view} player={player} />

          <div className="flex min-w-0 flex-col gap-4">
            <section aria-labelledby="board-title" className="min-w-0 overflow-hidden rounded-card border border-border bg-surface" data-testid="board" data-metric={b.id}>
              {/* The statistic: name, what it measures, and quick stepping to its neighbours. */}
              <div className="border-b border-border/70 bg-gradient-to-b from-surface-2/60 to-transparent px-4 py-3 sm:px-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 id="board-title" className="text-lg font-semibold text-fg sm:text-xl">
                        {b.label}
                      </h2>
                      <Badge tone={b.kind === "record" ? "accent" : b.kind === "total" ? "neutral" : "info"} title={KIND_HINT[b.kind]}>
                        <span data-testid="metric-kind">{KIND_LABEL[b.kind]}</span>
                      </Badge>
                      {b.lowerIsBetter ? <Badge tone="neutral">Lower is better</Badge> : null}
                    </div>
                    <p className="mt-1 text-sm text-fg-muted">{b.definition}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1" data-testid="metric-stepper">
                    <StepLink href={view.neighbours.previous ? leaderboardHref(f, { metricId: view.neighbours.previous.id }, view.basePath) : null} label={view.neighbours.previous ? `Previous: ${view.neighbours.previous.label}` : "First statistic"} direction="previous" />
                    <span className="w-10 text-center text-xs tabular-nums text-fg-subtle">
                      {view.neighbours.position}/{view.neighbours.count}
                    </span>
                    <StepLink href={view.neighbours.next ? leaderboardHref(f, { metricId: view.neighbours.next.id }, view.basePath) : null} label={view.neighbours.next ? `Next: ${view.neighbours.next.label}` : "Last statistic"} direction="next" />
                  </div>
                </div>
                {b.dataNote ? (
                  <p className="mt-2 flex items-start gap-1.5 text-xs text-fg-subtle" data-testid="data-note">
                    <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden /> {b.dataNote}
                  </p>
                ) : null}
              </div>

              <div className="px-4 pb-4 pt-3 sm:px-5">
                {b.ranked.length === 0 ? (
                  <p className="my-4 rounded-panel border border-dashed border-border p-6 text-center text-sm text-fg-muted" data-testid="board-empty">
                    Nobody qualifies yet in this scope.{b.kind === "average" || b.kind === "rate" ? ` Players need ${b.minGames} games with this figure to be ranked.` : ""}
                  </p>
                ) : (
                  <>
                    <Podium entries={b.ranked.slice(0, 3)} player={player} champ={champ} viewer={viewer} />
                    <LeaderSpotlight e={b.ranked[0]!} p={player(b.ranked[0]!.playerId)} champ={champ(b.ranked[0]!.championId)} you={b.ranked[0]!.playerId === viewer} />
                    {view.you ? <YouStrip view={view} player={player} /> : null}
                    {/* The podium shows the top three from tablets up: the list continues from fourth there (phones list everyone). */}
                    <ol className={cn("mt-3 space-y-1.5", b.ranked.length <= 3 && "sm:hidden")} data-testid="board-rows" aria-label="Full ranking">
                      {b.ranked.map((e, i) => (
                        <Row key={e.playerId} e={e} p={player(e.playerId)} champ={champ(e.championId)} you={e.playerId === viewer} onPodium={i < 3} />
                      ))}
                    </ol>
                  </>
                )}

                {b.unranked.length || b.noData.length ? (
                  <div className="mt-3 space-y-1.5 border-t border-border/60 pt-3 text-xs text-fg-subtle" data-testid="board-unranked">
                    {b.unranked.length ? (
                      <p>
                        <span className="font-medium text-fg-muted">Not ranked yet</span> (needs {b.minGames} games{f.role ? " in this role" : ""}):{" "}
                        {b.unranked.map((u, i) => (
                          <span key={u.playerId}>
                            {i ? ", " : ""}
                            {player(u.playerId).name} ({u.progress})
                          </span>
                        ))}
                      </p>
                    ) : null}
                    {b.noData.length ? (
                      <p>
                        <span className="font-medium text-fg-muted">No games with this figure</span>: {b.noData.map((id) => player(id).name).join(", ")}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </section>
            <p className="px-1 text-xs text-fg-subtle" data-testid="scope-footnote">
              {view.gamesInScope} games from {view.playerCount} team member{view.playerCount === 1 ? "" : "s"} in this scope. A game seen from two linked accounts counts once. Averages and rates need {b.minGames} games{f.role ? " in the role" : ""} to be ranked.
            </p>
          </div>

          <aside aria-label="Your standing and records" className="flex min-w-0 flex-col gap-4 lg:col-start-2 2xl:col-start-auto">
            {view.you ? <YouPanel view={view} player={player} /> : null}
            {f.category === "records" && view.personalBests.length ? (
              <section className="rounded-card border border-border bg-surface p-4" data-testid="personal-bests">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold text-fg">
                  <Medal className="h-4 w-4 text-warn" aria-hidden /> Your personal bests
                </h3>
                <ul className="mt-2 divide-y divide-border/60">
                  {view.personalBests.map((pb) => (
                    <li key={pb.metricId} className="py-1.5 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-fg-muted">{pb.label}</span>
                        <span className="shrink-0 font-semibold tabular-nums text-fg">{pb.yoursText ?? "—"}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-xs text-fg-subtle">
                        <span className="truncate">{pb.when ? `${pb.when}${pb.championId ? ` · ${champ(pb.championId)?.name}` : ""}` : pb.yoursText ? "" : "No game recorded"}</span>
                        <span className="shrink-0">{pb.teamText && pb.holderId ? `Team: ${pb.teamText} (${player(pb.holderId).name})` : ""}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {!view.you && view.recordHolders.length ? (
              <section className="rounded-card border border-border bg-surface p-4" data-testid="record-holders">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold text-fg">
                  <Trophy className="h-4 w-4 text-warn" aria-hidden /> Record holders
                </h3>
                <ul className="mt-2 space-y-1">
                  {view.recordHolders.map((r) => {
                    const p = player(r.playerId);
                    return (
                      <li key={r.metricId}>
                        <Link href={leaderboardHref(f, { category: r.category, metricId: r.metricId }, view.basePath)} className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 hover:bg-surface-2">
                          <CardAvatar look={p.look} name={p.name} src={p.avatarUrl} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs text-fg-subtle">{r.label}</span>
                            <span className="block truncate text-sm font-medium text-fg">{p.name}</span>
                          </span>
                          <span className="shrink-0 text-sm font-semibold tabular-nums" style={{ color: accentOf(p.look) }}>
                            {r.valueText}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}
          </aside>
        </div>
      )}
    </div>
  );
}

/**
 * The Highlights landing: ten headline statistics from every category, each with its leader and
 * the runner-up. A tile opens that statistic's full board; every other statistic stays one
 * category away.
 *
 * Readability first: every tile reads in the same order, in rows of its own that line up across
 * the grid (CSS subgrid), so nothing overlaps whatever the lengths: (1) the statistic, in full;
 * (2) the leader, on a narrow band of their own card artwork, darkened and faded towards the
 * text; (3) the winning value and its sample; (4) your place and the runner-up. The grid fits as
 * many 16.5rem tiles as the width allows (one on phones, five on wide screens), instead of
 * assuming five columns.
 */
function HighlightsGrid({ view, player }: { view: LeaderboardView; player: (id: string) => ViewPlayer }) {
  const f = view.filters;
  const viewerIsPlayer = !!view.you;
  return (
    <section aria-labelledby="highlights-title" className="space-y-3" data-testid="highlights">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="highlights-title" className="text-lg font-semibold text-fg">
          Highlights
        </h2>
        <Link href={leaderboardHref(f, { category: "overview", metricId: view.metrics[0]?.id ?? "win-rate", highlights: false }, view.basePath)} className="touch-target text-sm text-accent hover:underline" data-testid="highlights-all">
          Every Highlights statistic
        </Link>
      </div>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,16.5rem),1fr))] gap-3" data-testid="highlight-tiles">
        {view.highlights.map((t) => {
          const lead = t.leader ? player(t.leader.playerId) : null;
          const second = t.runnerUp ? player(t.runnerUp.playerId) : null;
          return (
            <li key={t.metricId} className="row-span-4 grid min-w-0 grid-rows-subgrid">
              <Link
                href={leaderboardHref(f, { category: t.category, metricId: t.metricId, highlights: false }, view.basePath)}
                className="group relative row-span-4 grid min-w-0 grid-rows-subgrid gap-y-0 overflow-hidden rounded-card border border-border bg-surface transition-colors before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-[color:var(--card-accent,var(--color-border))] hover:border-[color:var(--card-accent)] focus-visible:border-[color:var(--card-accent)]"
                style={lead ? { ["--card-accent" as string]: accentOf(lead.look) } : undefined}
                data-testid="highlight-tile"
                data-metric={t.metricId}
              >
                {/* 1. What is ranked: the full name, never cut. */}
                <span className="block px-3.5 pb-2.5 pt-3 text-sm font-semibold leading-snug text-fg" data-testid="highlight-label">
                  {t.label}
                </span>
                {/* 2. Who leads: their identity section, like the top of their player card: their
                    artwork (a static crop, no effects) in their own colours, dark under the text and
                    opening up towards the right, their avatar ringed in their colour. */}
                <span className="relative flex min-h-[4.75rem] min-w-0 items-center gap-3 overflow-hidden border-y border-border/60 px-3.5 py-2.5" data-testid="highlight-identity">
                  {lead ? (
                    <>
                      <CardArtLayer art={lead.art} accent={accentOf(lead.look)} kind="splash" position="center 22%" look={lead.look} decorate={false} strength="light" testId="highlight-art" />
                      <span aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-r from-surface from-15% via-surface/70 via-55% to-transparent" />
                      <span className="relative shrink-0">
                        <CardAvatar look={lead.look} name={lead.name} src={lead.avatarUrl} size="md" className="ring-2 ring-[color:var(--card-accent)] ring-offset-2 ring-offset-surface" />
                        <Crown className="absolute -right-1.5 -top-2 h-4 w-4 rounded-full bg-surface p-px text-warn" aria-hidden />
                      </span>
                      <span className="relative min-w-0 flex-1 [text-shadow:0_1px_8px_rgb(0_0_0/0.6)]">
                        <span className="block text-2xs font-semibold uppercase tracking-label text-warn md:text-3xs">Leader</span>
                        <span className="flex min-w-0 items-center gap-1.5 text-base font-semibold leading-tight text-fg" data-testid="highlight-leader" title={lead.name}>
                          <span className="truncate">{lead.name}</span>
                          {lead.role ? <RoleIcon role={lead.role} className="h-3.5 w-3.5 shrink-0 text-fg-muted" title={ROLE_LABELS[lead.role]} /> : null}
                        </span>
                        <RankInline rank={lead.rank} className="text-xs text-fg-muted" />
                      </span>
                    </>
                  ) : (
                    <span className="text-sm text-fg-subtle">Nobody qualifies yet</span>
                  )}
                </span>
                {/* 3. The winning value and the games behind it. */}
                <span className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3.5 pt-2.5">
                  {lead && t.leader ? (
                    <>
                      <span className="text-2xl font-bold leading-tight tabular-nums" style={{ color: "var(--card-accent)" }} data-testid="highlight-value">
                        {t.leader.valueText}
                      </span>
                      {t.leader.sampleText ? <span className="text-xs tabular-nums text-fg-subtle">{t.leader.sampleText}</span> : null}
                    </>
                  ) : (
                    <span className="text-2xl font-bold leading-tight text-fg-subtle" aria-hidden>
                      —
                    </span>
                  )}
                </span>
                {/* 4. Where you stand, then who is second. */}
                <span className="flex min-w-0 flex-col gap-1.5 px-3.5 pb-3 pt-2 text-xs text-fg-muted">
                  {viewerIsPlayer ? t.yours ? <YourPlace rank={t.yours.rank} of={t.yours.of} /> : <span className="text-fg-subtle" data-testid="your-place" data-rank="none">You: not ranked</span> : null}
                  <span className="flex min-w-0 items-center gap-1.5 border-t border-border/60 pt-2">
                    {second && t.runnerUp ? (
                      <>
                        <span className="shrink-0 text-fg-subtle">2nd</span>
                        <CardAvatar look={second.look} name={second.name} src={second.avatarUrl} size="xs" />
                        <span className="min-w-0 truncate text-fg" title={second.name}>
                          {second.name}
                        </span>
                        <span className="ml-auto shrink-0 tabular-nums text-fg-muted">{t.runnerUp.valueText}</span>
                      </>
                    ) : t.leader ? (
                      "No runner-up yet"
                    ) : (
                      "\u00a0"
                    )}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="px-1 text-xs text-fg-subtle" data-testid="scope-footnote">
        {view.gamesInScope} games from {view.playerCount} team member{view.playerCount === 1 ? "" : "s"} in this scope. Choose a tile for the full ranking; every statistic is listed under its category above.
      </p>
    </section>
  );
}

const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th"}`;

/** The viewer's own place on a board, in words: "You · 3rd of 5" (gold when first); `compact` drops "of 5" (kept in the tooltip). */
function YourPlace({ rank, of, compact = false }: { rank: number; of: number; compact?: boolean }) {
  return (
    <span className={cn("inline-flex w-fit shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums", rank === 1 ? "bg-warn/20 text-warn" : "bg-surface-2 text-fg-muted")} title={`Your place on this board: ${ordinal(rank)} of ${of}`} data-testid="your-place" data-rank={rank}>
      You · {ordinal(rank)}
      {compact ? null : <span className="font-normal text-fg-subtle">of {of}</span>}
    </span>
  );
}

/** Every statistic of the category: its leader and your place. A swipeable row on small screens. */
function MetricRail({ view, player }: { view: LeaderboardView; player: (id: string) => ViewPlayer }) {
  const f = view.filters;
  return (
    <nav aria-label="Statistics" className="min-w-0 lg:row-span-2">
      <ScrollCurrentIntoView selector='[data-testid="metric-list"] [aria-current="true"]' />
      <ScrollRow as="ul" className="-mx-4 flex snap-x scroll-px-4 gap-1.5 px-4 pb-1 sm:mx-0 sm:px-0 lg:flex-col lg:overflow-visible lg:pb-0" data-testid="metric-list">
        {view.metrics.map((m) => {
          const on = m.id === f.metricId;
          const lead = m.leader ? player(m.leader.playerId) : null;
          return (
            <li key={m.id} className="shrink-0 snap-start lg:shrink">
              <Link href={leaderboardHref(f, { metricId: m.id }, view.basePath)} aria-current={on ? "true" : undefined} className={cn("flex min-h-12 w-56 items-center gap-2.5 rounded-panel border px-2.5 py-1.5 transition-colors lg:w-auto", on ? "border-accent bg-accent/10" : "border-border/70 bg-surface hover:border-border-strong")} data-testid={`metric-${m.id}`}>
                {lead ? <CardAvatar look={lead.look} name={lead.name} src={lead.avatarUrl} size="xs" /> : <span className="h-6 w-6 shrink-0 rounded-full border border-dashed border-border" aria-hidden />}
                {/* The statistic gets the full width; the leader and your place share the line below it. */}
                <span className="min-w-0 flex-1">
                  <span className={cn("line-clamp-2 block text-sm leading-snug", on ? "font-semibold text-fg" : "font-medium text-fg")}>{m.label}</span>
                  <span className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-fg-subtle">
                    <span className="min-w-0 flex-1 truncate">{lead && m.leader ? `${lead.name} · ${m.leader.valueText}` : "No leader yet"}</span>
                    {m.yours ? <YourPlace rank={m.yours.rank} of={m.yours.of} compact /> : null}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ScrollRow>
    </nav>
  );
}

/** A player's name and picture: their profile for members; on the public boards, which open no profile, the same content without a link. */
function ProfileLink({ href, className, testId, children }: { href: string | null; className: string; testId?: string; children: ReactNode }) {
  return href ? (
    <Link href={href} className={className} data-testid={testId}>
      {children}
    </Link>
  ) : (
    <span className={className} data-testid={testId}>
      {children}
    </span>
  );
}

function StepLink({ href, label, direction }: { href: string | null; label: string; direction: "previous" | "next" }) {
  const Icon = direction === "previous" ? ChevronLeft : ChevronRight;
  const cls = "grid h-9 w-9 place-items-center rounded-lg border border-border text-fg-muted pointer-coarse:h-11 pointer-coarse:w-11";
  return href ? (
    <Link href={href} scroll={false} className={cn(cls, "hover:border-border-strong hover:text-fg")} aria-label={label} title={label} data-testid={`metric-${direction}`}>
      <Icon className="h-4 w-4" />
    </Link>
  ) : (
    <span className={cn(cls, "opacity-30")} aria-hidden>
      <Icon className="h-4 w-4" />
    </span>
  );
}

/**
 * Wider screens: the top three on plinths (first in the middle and highest), with each player's
 * own card colour. Phones show the leader spotlight and the ranking instead.
 */
function Podium({ entries, player, champ, viewer }: { entries: ViewEntry[]; player: (id: string) => ViewPlayer; champ: (id: string | null) => PortraitChampion | null; viewer: string | null }) {
  const order = entries.length === 3 ? [entries[1]!, entries[0]!, entries[2]!] : entries.length === 2 ? [entries[1]!, entries[0]!] : entries;
  return (
    <ol className={cn("mx-auto hidden max-w-3xl items-end gap-3 sm:grid", entries.length >= 3 ? "grid-cols-3" : entries.length === 2 ? "max-w-xl grid-cols-2" : "max-w-xs grid-cols-1")} data-testid="podium" aria-label="Top three">
      {order.map((e) => {
        const p = player(e.playerId);
        const first = e.rank === 1;
        const you = e.playerId === viewer;
        const c = champ(e.championId);
        const place = PLACE[Math.min(e.rank, 3) - 1]!;
        return (
          <li key={e.playerId} className="flex min-w-0 flex-col items-center text-center" style={{ ["--card-accent" as string]: accentOf(p.look) }} data-testid="podium-entry" data-rank={e.rank} data-player-id={e.playerId} data-you={you ? "true" : undefined}>
            {/* Each of the top three in their own card colours and artwork (a static crop), so the
                podium reads as players, not avatars on a blank page. */}
            <ProfileLink href={p.profileHref} className="group relative flex w-full min-w-0 max-w-full flex-col items-center gap-1.5 overflow-hidden rounded-card border border-border/70 px-2 pb-2.5 pt-7" testId="podium-identity">
              <CardArtLayer art={p.art} accent={accentOf(p.look)} kind="splash" position="center 22%" look={p.look} decorate={false} strength="strong" testId="podium-art" />
              <span className="relative">
                {first ? <Crown className="absolute -top-6 left-1/2 h-5 w-5 -translate-x-1/2 text-warn drop-shadow" aria-hidden /> : null}
                <CardAvatar look={p.look} name={p.name} src={p.avatarUrl} size={first ? "xl" : "lg"} className={cn("ring-2 ring-offset-2 ring-offset-surface", place.ring)} />
              </span>
              <span className="relative flex max-w-full items-center gap-1.5">
                <span className={cn("truncate text-sm font-semibold text-fg drop-shadow", p.profileHref && "group-hover:underline")}>{p.name}</span>
                {you ? <Badge tone="accent">You</Badge> : null}
              </span>
            </ProfileLink>
            <RankInline rank={p.rank} className="text-xs text-fg-muted" />
            <span className={cn("mt-1 font-semibold tabular-nums leading-none", first ? "text-3xl" : "text-2xl")} style={{ color: "var(--card-accent)" }} data-testid="podium-value">
              {e.valueText}
            </span>
            <span className="mt-1 flex max-w-full items-center gap-1 truncate text-xs text-fg-muted">
              {c ? <ChampionPortrait champion={c} size="xs" title={c.name} /> : null}
              <span className="truncate">{[c?.name, e.note, e.when, e.sampleText].filter(Boolean).join(" · ")}</span>
            </span>
            <span className={cn("mt-2 grid w-full place-items-start justify-center rounded-t-panel border border-b-0 pt-1.5 text-lg font-bold tabular-nums", place.plinth, place.text)} aria-hidden>
              {e.rank}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Phones: the leader, large, before the ranking. */
function LeaderSpotlight({ e, p, champ, you }: { e: ViewEntry; p: ViewPlayer; champ: PortraitChampion | null; you: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-card border border-warn/40 bg-gradient-to-r from-warn/15 to-transparent p-3 sm:hidden" style={{ ["--card-accent" as string]: accentOf(p.look) }} data-testid="leader-spotlight" data-player-id={e.playerId}>
      <span className="relative">
        <Crown className="absolute -top-3 left-1/2 h-4 w-4 -translate-x-1/2 text-warn" aria-hidden />
        <CardAvatar look={p.look} name={p.name} src={p.avatarUrl} size="lg" className="ring-2 ring-warn/70 ring-offset-2 ring-offset-surface" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium uppercase tracking-label text-warn">Leader</span>
        <ProfileLink href={p.profileHref} className="flex items-center gap-1.5 text-base font-semibold text-fg">
          <span className="truncate">{p.name}</span>
          {you ? <Badge tone="accent">You</Badge> : null}
        </ProfileLink>
        <span className="block truncate text-xs text-fg-muted">{[champ?.name, e.note, e.when, e.sampleText].filter(Boolean).join(" · ")}</span>
      </span>
      <span className="shrink-0 text-2xl font-semibold tabular-nums" style={{ color: "var(--card-accent)" }}>
        {e.valueText}
      </span>
    </div>
  );
}

/** One player in the ranking: place, identity, a bar against the leader, the value. */
function Row({ e, p, champ, you, onPodium = false }: { e: ViewEntry; p: ViewPlayer; champ: PortraitChampion | null; you: boolean; onPodium?: boolean }) {
  const top = e.rank <= 3 ? PLACE[e.rank - 1]! : null;
  return (
    <li className={cn("relative isolate flex min-h-14 items-center gap-3 overflow-hidden rounded-panel border px-3 py-2", you ? "border-accent/50 bg-accent/10" : "border-border/60 bg-bg-elevated/40", onPodium && "sm:hidden")} style={{ ["--card-accent" as string]: accentOf(p.look) }} data-testid="board-row" data-rank={e.rank} data-player-id={e.playerId} data-you={you ? "true" : undefined}>
      {/* A restrained crop of the player's own artwork behind the value end of the row (from tablets
          up), fading out before the name: identity without a full card per row. */}
      <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 -z-10 hidden w-2/5 overflow-hidden [mask-image:linear-gradient(to_right,transparent,#000_70%)] sm:block" data-testid="row-art">
        <CardArtLayer art={p.art} accent={accentOf(p.look)} kind="splash" position="center 22%" look={p.look} decorate={false} strength="strong" testId="row-art-image" />
      </span>
      {/* The leader and you are told apart at a glance: gold rail for first place, accent for you. */}
      {e.rank === 1 || you ? <span className={cn("absolute inset-y-0 left-0 w-1", e.rank === 1 ? "bg-warn" : "bg-accent")} aria-hidden data-testid="row-rail" data-kind={e.rank === 1 ? "leader" : "you"} /> : null}
      <span className={cn("w-6 shrink-0 text-center text-sm font-bold tabular-nums", top ? top.text : "text-fg-subtle")}>{e.rank}</span>
      <CardAvatar look={p.look} name={p.name} src={p.avatarUrl} size="md" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <ProfileLink href={p.profileHref} className={cn("truncate py-0.5 text-sm font-semibold text-fg", p.profileHref && "hover:underline")}>
            {p.name}
          </ProfileLink>
          {you ? <Badge tone="accent">You</Badge> : null}
        </span>
        {/* The gap to the leader at a glance (the leader's bar is full). */}
        <span className="mt-1 block h-1.5 w-full max-w-md overflow-hidden rounded-full bg-surface-3" aria-hidden>
          <span className="block h-full rounded-full" style={{ width: `${Math.max(4, Math.round(e.bar * 100))}%`, background: "var(--card-accent)" }} data-testid="row-bar" />
        </span>
        <span className="mt-1 flex items-center gap-1.5 truncate text-xs text-fg-muted">
          {champ ? <ChampionPortrait champion={champ} size="xs" title={champ.name} /> : null}
          <span className="truncate">{[champ?.name, e.note, e.when, e.sampleText].filter(Boolean).join(" · ")}</span>
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-lg font-semibold tabular-nums text-fg" data-testid="row-value">
          {e.valueText}
        </span>
        {e.chase ? <span className="hidden max-w-[14rem] text-xs text-fg-muted md:block">{e.chase}</span> : null}
      </span>
    </li>
  );
}

/** Where you stand, in one line, where the side panel is not beside the board (phones to laptops). */
function YouStrip({ view, player }: { view: LeaderboardView; player: (id: string) => ViewPlayer }) {
  const you = view.you!;
  const me = player(you.playerId);
  const leader = you.leader ? player(you.leader.playerId) : null;
  return (
    <div className="mt-3 flex items-center gap-3 rounded-panel border border-accent/40 bg-accent/10 px-3 py-2 2xl:hidden" data-testid="you-strip">
      <CardAvatar look={me.look} name={me.name} src={me.avatarUrl} size="sm" />
      <span className="min-w-0 flex-1 text-sm">
        <span className="font-semibold text-fg">{you.rank ? `You: #${you.rank} of ${you.of}` : "You: not ranked"}</span>
        <span className="block text-xs text-fg-muted">{you.rank === 1 ? "You lead this board." : you.rank && leader && you.leader ? `${you.chase} (${leader.name}, ${you.leader.valueText})` : you.status}</span>
      </span>
      {you.valueText ? <span className="shrink-0 text-base font-semibold tabular-nums text-fg">{you.valueText}</span> : null}
    </div>
  );
}

/** Where you stand: your place, the leader you are chasing and the gap, and your best boards. */
function YouPanel({ view, player }: { view: LeaderboardView; player: (id: string) => ViewPlayer }) {
  const you = view.you!;
  const b = view.board;
  const me = player(you.playerId);
  const leader = you.leader ? player(you.leader.playerId) : null;
  return (
    <section className="rounded-card border border-accent/40 bg-gradient-to-b from-accent/10 to-surface p-4" data-testid="your-position">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-fg">
        <Target className="h-4 w-4 text-accent" aria-hidden /> Your position · {b.label}
      </h3>
      <p className="mt-1 text-3xl font-semibold tabular-nums text-fg">{you.rank ? `#${you.rank}` : "Unranked"}</p>
      <p className="text-xs text-fg-muted">{you.rank ? `of ${you.of} ranked` : you.status}</p>
      {you.rank && you.rank > 1 && leader && you.leader ? (
        <div className="mt-3 rounded-panel border border-border/70 bg-surface/70 p-3" data-testid="chase-leader">
          <p className="text-xs font-medium uppercase tracking-label text-fg-subtle">Chase #1</p>
          <div className="mt-2 flex items-center gap-2">
            <CardAvatar look={leader.look} name={leader.name} src={leader.avatarUrl} size="sm" />
            <span className="min-w-0 flex-1 truncate text-sm text-fg">{leader.name}</span>
            <span className="text-sm font-semibold tabular-nums" style={{ color: accentOf(leader.look) }}>
              {you.leader.valueText}
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <CardAvatar look={me.look} name={me.name} src={me.avatarUrl} size="sm" />
            <span className="min-w-0 flex-1 truncate text-sm text-fg">You</span>
            <span className="text-sm font-semibold tabular-nums text-fg">{you.valueText}</span>
          </div>
          <p className="mt-2 text-sm text-fg">{you.chase}</p>
          {b.kind === "average" || b.kind === "rate" ? <p className="mt-1 text-xs text-fg-subtle">An average moves slowly: closing the gap takes several games above the leader&apos;s level, not one.</p> : null}
        </div>
      ) : (
        <p className="mt-2 text-sm text-fg-muted">{you.rank === 1 ? "You lead this board." : you.status}</p>
      )}
      {view.strengths.length ? (
        <div className="mt-3 border-t border-border/60 pt-3" data-testid="strengths">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-label text-fg-subtle">
            <TrendingUp className="h-3.5 w-3.5 text-good" aria-hidden /> Where you rank best
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {view.strengths.map((s) => (
              <li key={s.metricId}>
                <Link href={leaderboardHref(view.filters, { category: s.category, metricId: s.metricId }, view.basePath)} className="flex items-center justify-between gap-2 rounded-lg px-1.5 py-1 text-sm hover:bg-surface-2">
                  <span className="min-w-0 truncate text-fg">{s.label}</span>
                  <span className="shrink-0 text-xs tabular-nums text-fg-muted">
                    #{s.rank}/{s.of} · {s.valueText}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
