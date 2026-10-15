import Link from "next/link";
import { Crown, Info, Medal, Target, TrendingUp, Trophy } from "lucide-react";
import { readableColour, type CardLook } from "@/domain/card-style";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { CardAvatar } from "@/components/players/card-look";
import { RankInline } from "@/components/players/rank-emblem";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/cn";
import { leaderboardHref, type LeaderboardView, type ViewEntry, type ViewPlayer } from "@/server/leaderboards/view";
import { LeaderboardFilterBar } from "./filter-bar";

/*
  TEAM LEADERBOARDS: one category and one metric at a time (no wall of numbers). The selected
  metric gets a podium for the top three and compact rows for everyone else; the metric list
  beside it shows each metric's leader and your place, so anyone can see where they could be
  number one. Values are Riot game data only; nothing from private journals is used.
*/

const KIND_LABEL = { total: "Total", average: "Average", rate: "Rate", record: "Record" } as const;
const KIND_HINT = {
  total: "Adds up over the games in scope: more games, more chances.",
  average: "Per game or per minute over the games with the figure: fair between players with different game counts.",
  rate: "A share of the games played.",
  record: "One game or one run: the best ever recorded in scope.",
} as const;

const accentOf = (look: CardLook) => (look.style.colours.primary === "#1fc3ff" ? "var(--color-accent)" : readableColour(look.style.colours.primary));

export function Leaderboards({ view, champions }: { view: LeaderboardView; champions: Record<string, PortraitChampion> }) {
  const f = view.filters;
  const b = view.board;
  const player = (id: string) => view.players[id]!;
  const champ = (id: string | null) => (id ? (champions[id] ?? { id, name: id, portraitUrl: "" }) : null);
  const updated = view.lastUpdated ? new Date(view.lastUpdated).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null;
  return (
    <div className="mx-auto flex w-full max-w-[110rem] flex-col gap-4" data-testid="leaderboards">
      <PageHeader
        title="Leaderboards"
        description={
          <>
            Friendly competition on the team&apos;s own Riot games. <span className="text-fg-subtle" data-testid="scope-label">{view.scopeLabel}</span>
          </>
        }
        actions={
          <span className="text-xs text-fg-subtle" data-testid="last-updated" title="Leaderboards follow the account syncs: new games appear after the next sync, not live.">
            {updated ? `Data from the last account sync: ${updated}` : "No account sync yet"}
          </span>
        }
      />
      <LeaderboardFilterBar filters={f} seasons={view.seasons} />

      <nav aria-label="Leaderboard categories" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" data-testid="leaderboard-categories">
        {view.categories.map((c) => (
          <Link key={c.key} href={leaderboardHref(f, { category: c.key })} aria-current={c.key === f.category ? "page" : undefined} className={cn("inline-flex min-h-9 shrink-0 items-center rounded-full border px-3.5 text-sm font-medium transition-colors pointer-coarse:min-h-11", c.key === f.category ? "border-accent bg-accent/15 text-fg" : "border-border text-fg-muted hover:border-border-strong hover:text-fg")} data-testid={`category-${c.key}`}>
            {c.label}
          </Link>
        ))}
      </nav>

      {view.playerCount === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-6 text-sm text-fg-muted">No team members to compare yet. Members appear here once their account setup is finished.</p>
      ) : (
        <div className="grid min-w-0 gap-4 xl:grid-cols-[17rem_minmax(0,1fr)_19rem]">
          {/* Metric list: the leader of each and your place, so you can spot boards you could win. */}
          <aside aria-label="Metrics" className="min-w-0">
            <ul className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 xl:mx-0 xl:flex-col xl:overflow-visible xl:p-0" data-testid="metric-list">
              {view.metrics.map((m) => {
                const on = m.id === f.metricId;
                const lead = m.leader ? player(m.leader.playerId) : null;
                return (
                  <li key={m.id} className="shrink-0 xl:shrink">
                    <Link href={leaderboardHref(f, { metricId: m.id })} aria-current={on ? "true" : undefined} className={cn("flex min-h-11 w-60 items-center gap-2.5 rounded-xl border px-3 py-2 transition-colors xl:w-auto", on ? "border-accent bg-accent/10" : "border-border bg-surface hover:border-border-strong")} data-testid={`metric-${m.id}`}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-fg">{m.label}</span>
                        <span className="block truncate text-xs text-fg-subtle">{lead && m.leader ? `${lead.name} · ${m.leader.valueText}` : "No leader yet"}</span>
                      </span>
                      {m.yours ? (
                        <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums", m.yours.rank === 1 ? "bg-accent/20 text-accent" : "bg-surface-2 text-fg-muted")} title="Your place on this board">
                          #{m.yours.rank}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </aside>

          <section aria-labelledby="board-title" className="min-w-0 rounded-2xl border border-border bg-surface p-4 sm:p-5" data-testid="board" data-metric={b.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 id="board-title" className="text-lg font-semibold text-fg">
                  {b.label}
                </h2>
                <p className="mt-0.5 text-sm text-fg-muted">{b.definition}</p>
              </div>
              <Badge tone={b.kind === "record" ? "accent" : b.kind === "total" ? "neutral" : "info"} title={KIND_HINT[b.kind]}>
                <span data-testid="metric-kind">{KIND_LABEL[b.kind]}</span>
              </Badge>
            </div>
            {b.dataNote ? (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-fg-subtle" data-testid="data-note">
                <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden /> {b.dataNote}
              </p>
            ) : null}

            {b.ranked.length === 0 ? (
              <p className="mt-6 rounded-xl border border-dashed border-border p-6 text-center text-sm text-fg-muted" data-testid="board-empty">
                Nobody qualifies yet in this scope.{b.kind === "average" || b.kind === "rate" ? ` Players need ${b.minGames} games with this figure to be ranked.` : ""}
              </p>
            ) : (
              <>
                <Podium entries={b.ranked.slice(0, 3)} player={player} champ={champ} viewer={view.you?.playerId ?? null} />
                {b.ranked.length > 3 ? (
                  <ol className="mt-3 divide-y divide-border/70 rounded-xl border border-border" data-testid="board-rows" aria-label="Everyone else">
                    {b.ranked.slice(3).map((e) => (
                      <Row key={e.playerId} e={e} p={player(e.playerId)} champ={champ(e.championId)} you={e.playerId === view.you?.playerId} />
                    ))}
                  </ol>
                ) : null}
              </>
            )}

            {b.unranked.length || b.noData.length ? (
              <div className="mt-4 space-y-1.5 text-xs text-fg-subtle" data-testid="board-unranked">
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
          </section>

          <aside aria-label="Your standing and records" className="flex min-w-0 flex-col gap-4">
            {view.you ? (
              <section className="rounded-2xl border border-accent/40 bg-accent/5 p-4" data-testid="your-position">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold text-fg">
                  <Target className="h-4 w-4 text-accent" aria-hidden /> Your position
                </h3>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-fg">{view.you.rank ? `#${view.you.rank} of ${view.you.of}` : "Unranked"}</p>
                <p className="text-sm text-fg-muted">{view.you.rank === 1 ? "You lead this board." : view.you.chase ?? view.you.status}</p>
                {view.you.rank && view.you.rank > 1 && b.kind === "average" ? <p className="mt-1 text-xs text-fg-subtle">An average gap: it closes over several games, not in one.</p> : null}
              </section>
            ) : null}
            {view.strengths.length ? (
              <section className="rounded-2xl border border-border bg-surface p-4" data-testid="strengths">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold text-fg">
                  <TrendingUp className="h-4 w-4 text-good" aria-hidden /> Where you rank best
                </h3>
                <ul className="mt-2 space-y-1">
                  {view.strengths.map((s) => (
                    <li key={s.metricId}>
                      <Link href={leaderboardHref(f, { category: s.category, metricId: s.metricId })} className="flex items-center justify-between gap-2 rounded-lg px-1.5 py-1 text-sm hover:bg-surface-2">
                        <span className="min-w-0 truncate text-fg">{s.label}</span>
                        <span className="shrink-0 text-xs tabular-nums text-fg-muted">
                          #{s.rank}/{s.of} · {s.valueText}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {f.category === "records" && view.personalBests.length ? (
              <section className="rounded-2xl border border-border bg-surface p-4" data-testid="personal-bests">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold text-fg">
                  <Medal className="h-4 w-4 text-warn" aria-hidden /> Your personal bests
                </h3>
                <ul className="mt-2 space-y-2">
                  {view.personalBests.map((pb) => (
                    <li key={pb.metricId} className="text-sm">
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
            ) : view.recordHolders.length ? (
              <section className="rounded-2xl border border-border bg-surface p-4" data-testid="record-holders">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold text-fg">
                  <Trophy className="h-4 w-4 text-warn" aria-hidden /> Current record holders
                </h3>
                <ul className="mt-2 space-y-1.5">
                  {view.recordHolders.map((r) => {
                    const p = player(r.playerId);
                    return (
                      <li key={r.metricId}>
                        <Link href={leaderboardHref(f, { category: r.category, metricId: r.metricId })} className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-surface-2">
                          <CardAvatar look={p.look} name={p.name} src={p.avatarUrl} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs text-fg-subtle">{r.label}</span>
                            <span className="block truncate text-sm font-medium text-fg">{p.name}</span>
                          </span>
                          <span className="shrink-0 text-sm font-semibold tabular-nums text-fg">{r.valueText}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}
            <p className="px-1 text-xs text-fg-subtle" data-testid="scope-footnote">
              {view.gamesInScope} games from {view.playerCount} team member{view.playerCount === 1 ? "" : "s"} in this scope. A game seen from two linked accounts counts once. Averages and rates need {b.minGames} games{f.role ? " in the role" : ""} to be ranked.
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}

const PLACE_STYLE = ["border-warn/60 bg-warn/10", "border-fg-subtle/40 bg-surface-2/60", "border-[#c08457]/50 bg-[#c08457]/10"] as const;

/** The top three: first in the middle and raised on wider screens; 1, 2, 3 stacked on phones. */
function Podium({ entries, player, champ, viewer }: { entries: ViewEntry[]; player: (id: string) => ViewPlayer; champ: (id: string | null) => PortraitChampion | null; viewer: string | null }) {
  const order = entries.length === 3 ? [entries[1]!, entries[0]!, entries[2]!] : entries.length === 2 ? [entries[1]!, entries[0]!] : entries;
  return (
    <ol className={cn("mt-4 grid gap-2.5 sm:items-end", entries.length >= 3 ? "sm:grid-cols-3" : entries.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-1")} data-testid="podium" aria-label="Top three">
      {order.map((e) => {
        const p = player(e.playerId);
        const first = e.rank === 1;
        const you = e.playerId === viewer;
        const c = champ(e.championId);
        return (
          <li key={e.playerId} className={cn("relative flex flex-col items-center gap-1 rounded-2xl border px-3 pb-3 text-center sm:gap-1.5", first ? "pt-4 sm:pb-5 sm:pt-5" : "pt-3", PLACE_STYLE[Math.min(e.rank, 3) - 1], you && "ring-2 ring-accent", first ? "max-sm:order-first" : e.rank === 2 ? "max-sm:order-2" : "max-sm:order-3")} style={{ ["--card-accent" as string]: accentOf(p.look) }} data-testid="podium-entry" data-rank={e.rank} data-player-id={e.playerId} data-you={you ? "true" : undefined}>
            <span className="absolute left-2.5 top-2 inline-flex items-center gap-1 text-xs font-bold tabular-nums text-fg-muted">
              {first ? <Crown className="h-3.5 w-3.5 text-warn" aria-hidden /> : null}#{e.rank}
            </span>
            {you ? <Badge tone="accent" className="absolute right-2 top-2">You</Badge> : null}
            <Link href={`/players/${p.id}`} className="flex flex-col items-center gap-1.5">
              <CardAvatar look={p.look} name={p.name} src={p.avatarUrl} size={first ? "hero" : "lg"} />
              <span className="max-w-full truncate text-sm font-semibold text-fg hover:underline">{p.name}</span>
            </Link>
            <RankInline rank={p.rank} className="text-xs text-fg-subtle max-sm:hidden" />
            <span className={cn("font-semibold tabular-nums leading-none", first ? "text-3xl" : "text-2xl")} style={{ color: "var(--card-accent)" }} data-testid="podium-value">
              {e.valueText}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-fg-subtle">
              {c ? <ChampionPortrait champion={c} size="xs" title={c.name} /> : null}
              {[c?.name, e.note, e.when, e.sampleText].filter(Boolean).join(" · ")}
            </span>
            {e.chase ? <span className="text-xs text-fg-muted">{e.chase}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

function Row({ e, p, champ, you }: { e: ViewEntry; p: ViewPlayer; champ: PortraitChampion | null; you: boolean }) {
  return (
    <li className={cn("flex min-h-14 items-center gap-3 px-3 py-2", you && "bg-accent/10")} data-testid="board-row" data-rank={e.rank} data-player-id={e.playerId} data-you={you ? "true" : undefined}>
      <span className="w-7 shrink-0 text-center text-sm font-semibold tabular-nums text-fg-muted">#{e.rank}</span>
      <CardAvatar look={p.look} name={p.name} src={p.avatarUrl} size="md" />
      <span className="min-w-0 flex-1">
        <Link href={`/players/${p.id}`} className="flex items-center gap-1.5 text-sm font-medium text-fg hover:underline">
          <span className="truncate">{p.name}</span>
          {you ? <Badge tone="accent">You</Badge> : null}
        </Link>
        <span className="flex items-center gap-1.5 truncate text-xs text-fg-subtle">
          {champ ? <ChampionPortrait champion={champ} size="xs" title={champ.name} /> : null}
          {[champ?.name, e.note, e.when, e.sampleText].filter(Boolean).join(" · ")}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-base font-semibold tabular-nums text-fg">{e.valueText}</span>
        {e.chase ? <span className="hidden text-xs text-fg-subtle sm:block">{e.chase}</span> : null}
      </span>
    </li>
  );
}
