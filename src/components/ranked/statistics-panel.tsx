import Link from "next/link";
import type { JournalStatistics } from "@/server/ranked/repository";
import { ChampionPortrait } from "@/components/champion-portrait";
import { MetricLabel } from "@/components/ui/metric";
import { Panel, PanelBody, PanelHeader, SectionLabel } from "@/components/ui/panel";
import { percent } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { JournalLookups, TeammateOption } from "./types";

export interface StatisticsPanelProps {
  stats: JournalStatistics;
  lookups: JournalLookups;
  /** Teammates tagged somewhere in the journal (the only ones worth a filter chip). */
  teammates: TeammateOption[];
  /** "all" | "solo" | a teammate id */
  filter: string;
}

const chip = (active: boolean) => cn("inline-flex min-h-9 items-center rounded-md border px-2.5 text-xs transition-colors", active ? "border-accent bg-accent/10 text-accent-strong" : "border-border bg-bg-elevated text-fg-muted hover:text-fg");

/** Plain counts over the owner's games: champions, mistakes, matchups. No models, no weighting. */
export function StatisticsPanel({ stats, lookups, teammates, filter }: StatisticsPanelProps) {
  const name = (id: string) => lookups.championsById[id] ?? { id, name: id, portraitUrl: "" };
  const total = stats.mistakes.reduce((s, m) => s + m.count, 0);
  return (
    <Panel>
      <PanelHeader title="Simple statistics" subtitle={`${stats.games} game${stats.games === 1 ? "" : "s"} ${filter === "all" ? "in your journal" : filter === "solo" ? "played solo" : `played with ${lookups.teammateNames[filter] ?? "that teammate"}`}. Raw counts from what you logged; nothing is modelled.`} />
      <PanelBody className="space-y-4">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by teammate">
          <Link href="/overview/blocks" className={chip(filter === "all")} scroll={false}>
            All games
          </Link>
          <Link href="/overview/blocks?with=solo" className={chip(filter === "solo")} scroll={false}>
            Solo
          </Link>
          {teammates.map((t) => (
            <Link key={t.id} href={`/ranked?with=${t.id}`} className={chip(filter === t.id)} scroll={false}>
              with {t.displayName}
            </Link>
          ))}
        </div>
        {stats.games === 0 ? (
          <p className="text-sm text-fg-muted">Statistics appear once you have logged a game{filter !== "all" ? " with this filter" : ""}.</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            <div>
              <SectionLabel className="mb-1.5">Champion performance</SectionLabel>
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wider text-fg-subtle">
                  <tr>
                    <th className="pb-1 text-left font-medium">Champion</th>
                    <th className="pb-1 text-right font-medium">Games</th>
                    <th className="pb-1 text-right font-medium">W–L</th>
                    <th className="pb-1 text-right font-medium">
                      <MetricLabel id="journal-champion-win-rate" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {stats.champions.slice(0, 12).map((c) => (
                    <tr key={c.championId} className="border-t border-border">
                      <td className="py-1">
                        <span className="inline-flex items-center gap-1.5">
                          <ChampionPortrait champion={name(c.championId)} size="xs" /> {name(c.championId).name}
                        </span>
                      </td>
                      <td className="py-1 text-right tabular-nums">{c.games}</td>
                      <td className="py-1 text-right tabular-nums text-fg-muted">
                        {c.wins}–{c.losses}
                      </td>
                      <td className={cn("py-1 text-right tabular-nums", c.winRate >= 0.5 ? "text-good" : "text-bad")}>{percent(c.winRate, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <SectionLabel className="mb-1.5">Recurring mistakes</SectionLabel>
              {stats.mistakes.length === 0 ? (
                <p className="text-sm text-fg-muted">No main mistake recorded yet. Pick one per game to see patterns here.</p>
              ) : (
                <ul className="space-y-1.5">
                  {stats.mistakes.map((m) => (
                    <li key={m.key} className="text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span>{m.label}</span>
                        <span className="tabular-nums text-fg-muted">
                          {m.count} · {percent(m.count / total, 0)}
                        </span>
                      </div>
                      <div className="mt-0.5 h-1.5 rounded-sm bg-surface-2">
                        <div className="h-1.5 rounded-sm bg-accent" style={{ width: `${Math.round((m.count / total) * 100)}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <SectionLabel className="mb-1.5">Matchups</SectionLabel>
              {stats.matchups.length === 0 ? (
                <p className="text-sm text-fg-muted">Record the enemy laner on your games to see matchup records.</p>
              ) : (
                <ul className="space-y-1">
                  {stats.matchups.slice(0, 12).map((m) => (
                    <li key={`${m.championId}|${m.enemyChampionId}`} className="flex items-center justify-between gap-2 text-sm">
                      <span className="inline-flex items-center gap-1.5">
                        <ChampionPortrait champion={name(m.championId)} size="xs" />
                        <span className="text-fg-subtle">vs</span>
                        <ChampionPortrait champion={name(m.enemyChampionId)} size="xs" />
                        <span className="text-fg-muted">
                          {name(m.championId).name} vs {name(m.enemyChampionId).name}
                        </span>
                      </span>
                      <span className={cn("tabular-nums", m.wins >= m.losses ? "text-good" : "text-bad")}>
                        {m.wins}–{m.losses}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </PanelBody>
    </Panel>
  );
}
