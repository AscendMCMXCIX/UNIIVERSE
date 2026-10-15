import Link from "next/link";
import { Info, Swords, Users } from "lucide-react";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import { SOLO_DUO_QUEUE, type TogetherGame } from "@/domain/played-together";
import { queueLabel } from "@/server/players/match-history";
import type { PlayedTogether } from "@/server/matches/played-together";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { CardAvatar } from "@/components/players/card-look";
import { RoleIcon } from "@/components/role-icon";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import { TogetherDetails } from "./together-details";

/*
  Team → Matches → Played together: Riot games with two or more team members on the same side,
  newest first. Each game shows who played, on which champion and in which role, and how it went.
  "Played together" means the same team in the same game: Riot's match data does not say who
  queued together, so no game is labelled a premade party.
*/

export const TOGETHER_QUEUES: Record<string, { label: string; queues: number[] | null }> = {
  all: { label: "All games", queues: null },
  solo: { label: "Ranked Solo/Duo", queues: [420] },
  flex: { label: "Ranked Flex", queues: [440] },
  normal: { label: "Normal games", queues: [400, 430, 480, 490] },
  clash: { label: "Clash", queues: [700] },
};

export interface TogetherFilters {
  queue: string;
  min: number;
  player: string | null;
  limit: number;
}

const fmtDuration = (s: number | null) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : null);

export function PlayedTogetherView({ data, shown, total, filters, champions, href }: { data: PlayedTogether; shown: Array<TogetherGame & { draftedMatchId: string | null }>; total: number; filters: TogetherFilters; champions: Record<string, PortraitChampion>; href: (change: Partial<TogetherFilters>) => string }) {
  const p = (id: string) => data.players[id];
  const allInScope = total;
  const chip = (on: boolean) => cn("inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors pointer-coarse:min-h-11", on ? "border-accent bg-accent/15 text-fg" : "border-border text-fg-muted hover:border-border-strong hover:text-fg");
  return (
    <div className="space-y-4" data-testid="played-together">
      <p className="flex items-start gap-2 rounded-panel border border-border bg-surface px-3.5 py-2.5 text-xs text-fg-muted" data-testid="together-note">
        <Info className="mt-px h-4 w-4 shrink-0 text-accent" aria-hidden />
        <span>
          Riot games in which two or more team members were on the <strong className="text-fg">same team</strong>, found in their synced match histories (no extra Riot requests). Riot&apos;s match data does not say who queued together, so these are games <strong className="text-fg">played together</strong>, not confirmed premade parties. Several linked accounts of one player count as one member; members on opposite sides are never counted as teammates.
        </span>
      </p>

      {data.pairs.length ? (
        <section aria-label="Played together most" className="rounded-card border border-border bg-surface p-3.5" data-testid="together-pairs">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-fg">
            <Users className="h-4 w-4 text-accent" aria-hidden /> Played together most
          </h2>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {data.pairs.slice(0, 6).map((pair) => {
              const a = p(pair.a);
              const b = p(pair.b);
              if (!a || !b) return null;
              return (
                <li key={`${pair.a}|${pair.b}`} className="flex min-w-0 items-center gap-2 rounded-panel border border-border/70 bg-bg-elevated/50 px-2.5 py-2">
                  <span className="flex -space-x-2">
                    <CardAvatar look={a.look} name={a.name} src={a.avatarUrl} size="sm" />
                    <CardAvatar look={b.look} name={b.name} src={b.avatarUrl} size="sm" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-fg">
                    {a.name} + {b.name}
                  </span>
                  <span className="shrink-0 text-right text-xs tabular-nums text-fg-muted">
                    <span className="block font-semibold text-fg">{pair.games} game{pair.games === 1 ? "" : "s"}</span>
                    {pair.wins}W {pair.games - pair.wins}L
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-col gap-2" data-testid="together-filters">
        <nav aria-label="Games" className="flex flex-wrap gap-1.5">
          {Object.entries(TOGETHER_QUEUES).map(([k, q]) => (
            <Link key={k} href={href({ queue: k, limit: 20 })} aria-current={filters.queue === k ? "page" : undefined} className={chip(filters.queue === k)} data-testid={`together-queue-${k}`}>
              {q.label}
            </Link>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-1.5">
          <nav aria-label="Team members in the game" className="flex flex-wrap gap-1.5">
            {[2, 3, 4, 5].map((n) => (
              <Link key={n} href={href({ min: n, limit: 20 })} aria-current={filters.min === n ? "page" : undefined} className={chip(filters.min === n)} data-testid={`together-min-${n}`}>
                {n === 5 ? "All five" : `${n}+ members`}
              </Link>
            ))}
          </nav>
          <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden />
          <nav aria-label="With" className="flex flex-wrap gap-1.5">
            <Link href={href({ player: null, limit: 20 })} aria-current={!filters.player ? "page" : undefined} className={chip(!filters.player)}>
              Anyone
            </Link>
            {Object.values(data.players).map((pl) => (
              <Link key={pl.id} href={href({ player: pl.id, limit: 20 })} aria-current={filters.player === pl.id ? "page" : undefined} className={chip(filters.player === pl.id)} data-testid="together-player">
                <CardAvatar look={pl.look} name={pl.name} src={pl.avatarUrl} size="xs" />
                {pl.name}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      <p className="text-xs text-fg-subtle" data-testid="together-count">
        {allInScope} game{allInScope === 1 ? "" : "s"} played together in this view
        {data.unknownSide ? ` · ${data.unknownSide} more shared game${data.unknownSide === 1 ? "" : "s"} could not be checked yet (their match details are not stored, so the side is unknown)` : ""}
      </p>

      {shown.length === 0 ? (
        <p className="rounded-panel border border-dashed border-border p-6 text-center text-sm text-fg-muted" data-testid="together-empty">
          No games with {filters.min === 5 ? "all five" : `${filters.min} or more`} team members on the same side{filters.queue !== "all" ? ` in ${TOGETHER_QUEUES[filters.queue]!.label}` : ""} yet. Games appear here once their members&apos; accounts have synced them.
        </p>
      ) : (
        <ol className="space-y-2.5" data-testid="together-list">
          {shown.map((g) => (
            <TogetherCard key={`${g.matchId}|${g.teamId}`} g={g} p={p} champions={champions} />
          ))}
        </ol>
      )}
      {shown.length < total ? (
        <Link href={href({ limit: filters.limit + 20 })} scroll={false} className="block rounded-panel border border-border py-2.5 text-center text-sm text-fg-muted hover:border-border-strong hover:text-fg" data-testid="together-more">
          Show more ({total - shown.length} more)
        </Link>
      ) : null}
    </div>
  );
}

function TogetherCard({ g, p, champions }: { g: TogetherGame & { draftedMatchId: string | null }; p: (id: string) => PlayedTogether["players"][string] | undefined; champions: Record<string, PortraitChampion> }) {
  const tone = g.win === true ? "bg-good" : g.win === false ? "bg-bad" : "bg-border-strong";
  const champ = (id: string) => champions[id] ?? { id, name: id, portraitUrl: "" };
  return (
    <li className="relative overflow-hidden rounded-panel border border-border bg-surface pl-1.5" data-testid="together-game" data-match-id={g.matchId} data-members={g.members.length}>
      <span className={`absolute inset-y-0 left-0 w-1.5 ${tone}`} aria-hidden />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 px-3 py-2">
        <span className={cn("text-sm font-bold", g.win === true ? "text-good" : g.win === false ? "text-bad" : "text-fg-muted")}>{g.win === true ? "Victory" : g.win === false ? "Defeat" : "No result"}</span>
        <span className="text-sm text-fg">{queueLabel(g.queueId)}</span>
        <span className="text-xs text-fg-muted">{formatDate(new Date(g.gameCreation))}</span>
        {fmtDuration(g.durationS) ? <span className="text-xs tabular-nums text-fg-muted">{fmtDuration(g.durationS)}</span> : null}
        <Badge tone="accent" data-testid="together-size">
          {g.members.length} team members
        </Badge>
        <span className="text-xs text-fg-subtle" title="Riot's match data does not say who queued together">
          Played together · party not verified
        </span>
        {g.draftedMatchId ? (
          <Link href={`/matches/${g.draftedMatchId}`} className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline" data-testid="together-drafted">
            <Swords className="h-3.5 w-3.5" aria-hidden /> Drafted match
          </Link>
        ) : null}
        <span className="ml-auto">
          <TogetherDetails playerId={g.members[0]!.playerId} matchId={g.matchId} championsById={champions} />
        </span>
      </div>
      <ul className="grid grid-cols-1 gap-px bg-border/40 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        {g.members.map((m) => {
          const pl = p(m.playerId);
          const c = champ(m.championId);
          return (
            <li key={m.playerId} className="flex min-w-0 items-center gap-2.5 bg-surface px-3 py-2" data-testid="together-member" data-player-id={m.playerId}>
              <span className="relative shrink-0">
                <ChampionPortrait champion={c} size="md" title={c.name} />
                {pl ? (
                  <span className="absolute -bottom-1 -right-1">
                    <CardAvatar look={pl.look} name={pl.name} src={pl.avatarUrl} size="xs" />
                  </span>
                ) : null}
              </span>
              <span className="min-w-0 flex-1">
                <Link href={`/players/${m.playerId}`} className="block truncate py-0.5 text-sm font-semibold text-fg hover:underline">
                  {pl?.name ?? "Player"}
                </Link>
                <span className="flex min-w-0 items-center gap-1 text-xs text-fg-muted">
                  {m.role && m.role in ROLE_LABELS ? <RoleIcon role={m.role as Role} className="h-3 w-3 shrink-0" /> : null}
                  <span className="truncate">
                    {m.role && m.role in ROLE_LABELS ? ROLE_LABELS[m.role as Role] : "Role unknown"} · {c.name}
                  </span>
                </span>
                <span className="block truncate text-xs tabular-nums text-fg-subtle">
                  <span className="font-semibold text-fg">{m.kills === null ? "—" : `${m.kills}/${m.deaths}/${m.assists}`}</span> · {m.cs ?? "—"} CS{m.damage ? ` · ${(m.damage / 1000).toFixed(1)}k dmg` : ""}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      {g.queueId === SOLO_DUO_QUEUE && g.members.length > 2 ? <p className="px-3 py-1.5 text-xs text-fg-subtle">Ranked Solo/Duo allows parties of two at most, so not all of them queued together.</p> : null}
      {g.opponents.length ? <p className="px-3 py-1.5 text-xs text-fg-subtle">Also in this game, on the other team: {g.opponents.join(", ")}.</p> : null}
    </li>
  );
}
