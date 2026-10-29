import { TrendingDown, TrendingUp } from "lucide-react";
import type { HistorySummary } from "@/domain/history-summary";
import type { FormMetric } from "@/domain/recent-form";
import type { MatchHistoryPage } from "@/server/players/match-history";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { InfoTip } from "@/components/ui/info-tip";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/cn";

/*
  One line above Match History about its newest games (domain/history-summary): the results of the
  last twenty as squares, the record, KDA, CS per minute (vision for supports) and kill
  participation over them, the current streak, the champions played most and, from stored rank
  readings, the ladder change of the last 30 days. It follows Match History's filters, and uses the
  same rules as the Overview's Recent form, so the two never disagree; it adds what belongs to a
  list of games and nothing more (season totals live on the Overview).
*/

const metricText = (m: Pick<FormMetric, "key" | "recent">) => (m.recent === null ? "—" : m.recent.toFixed(m.key === "vision" ? 0 : m.key === "kda" ? 2 : 1));

function Fact({ value, label, title, testId, children }: { value: React.ReactNode; label: string; title?: string; testId?: string; children?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-baseline gap-1 whitespace-nowrap" title={title} data-testid={testId}>
      <span className="text-sm font-semibold tabular-nums text-fg">{value}</span>
      <span className="text-xs text-fg-subtle">{label}</span>
      {children}
    </div>
  );
}

export function HistorySummaryStrip({ summary, ladder, championsById }: { summary: HistorySummary; ladder: MatchHistoryPage["ladder"]; championsById: Record<string, PortraitChampion> }) {
  const { form } = summary;
  if (form.recent.games === 0) return null;
  const strip = [...form.last].reverse();
  const champ = (id: string) => championsById[id] ?? { id, name: id, portraitUrl: "" };
  const kp = summary.killParticipation;
  return (
    <section aria-label={`Your last ${form.recent.games} games in this list`} className="rounded-panel border border-border bg-surface/60 px-3 py-2.5" data-testid="history-summary">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="whitespace-nowrap text-xs text-fg-subtle">Last {form.recent.games}</span>
          <span className="flex items-center gap-0.5" role="img" aria-label={`${form.recent.wins} wins and ${form.recent.games - form.recent.wins} losses, oldest to newest`} data-testid="history-summary-strip">
            {strip.map((g) => (
              <span key={g.matchId} className={cn("h-5 w-2 rounded-sm", g.win ? "bg-blue/85" : "bg-red/75")} title={`${g.win ? "Win" : "Loss"} · ${champ(g.championId).name}`} data-result={g.win ? "W" : "L"} />
            ))}
          </span>
        </div>
        <Fact value={form.recent.winRate === null ? "—" : `${Math.round(form.recent.winRate * 100)}%`} label={`${form.recent.wins}W ${form.recent.games - form.recent.wins}L`} testId="history-summary-record" />
        {form.metrics.map((m) => (
          <Fact key={m.key} value={metricText(m)} label={m.key === "cs" ? "CS/min" : m.key === "vision" ? "vision" : "KDA"} title={`${m.label} over the last ${m.recentGames} games${m.season !== null ? `; ${metricText({ ...m, recent: m.season })} over all ${m.seasonGames} in this list` : ""}`} testId={`history-summary-${m.key}`}>
            {m.direction === "up" ? <TrendingUp className="h-3.5 w-3.5 self-center text-good" aria-label="higher lately" /> : m.direction === "down" ? <TrendingDown className="h-3.5 w-3.5 self-center text-bad" aria-label="lower lately" /> : null}
          </Fact>
        ))}
        <Fact value={kp.value === null ? "—" : `${Math.round(kp.value * 100)}%`} label="KP" title={kp.games ? `Kills and assists over the team's kills, in the ${kp.games} recent games that record both` : "Team kills are not recorded for these games"} testId="history-summary-kp" />
        {summary.streak && summary.streak.games >= 2 ? (
          <Fact value={<span className={summary.streak.win ? "text-blue" : "text-red"}>{summary.streak.games}</span>} label={summary.streak.win ? "wins in a row" : "losses in a row"} testId="history-summary-streak" />
        ) : null}
        {summary.mostPlayed.length ? (
          <ul className="flex items-center gap-2.5" aria-label="Played most in these games" data-testid="history-summary-champions">
            {summary.mostPlayed.map((c) => (
              <li key={c.championId} className="flex items-center gap-1" title={`${champ(c.championId).name}: ${c.wins} won, ${c.games - c.wins} lost`}>
                <ChampionPortrait champion={champ(c.championId)} size="xs" className="h-6 w-6 rounded text-4xs" />
                <span className="text-xs tabular-nums text-fg-muted">
                  {c.wins}–{c.games - c.wins}
                </span>
                <span className="sr-only">{champ(c.championId).name}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {ladder ? (
          <Fact
            value={
              <span className={ladder.points > 0 ? "text-good" : ladder.points < 0 ? "text-bad" : "text-fg-muted"}>
                {ladder.points > 0 ? "+" : ladder.points < 0 ? "−" : ""}
                {formatCount(Math.abs(ladder.points))}
              </span>
            }
            label={`${ladder.queue === "flex" ? "Flex" : "Solo/Duo"} points, ${ladder.days} days`}
            title={`${ladder.from} → ${ladder.to}${ladder.riotId ? ` on ${ladder.riotId}` : ""}. Ladder points: LP, with 100 for each division gained or lost. From stored rank readings, not per game.`}
            testId="history-summary-ladder"
          />
        ) : null}
        {form.trend === "up" || form.trend === "down" ? (
          <span className={cn("inline-flex items-center gap-1 whitespace-nowrap text-xs", form.trend === "up" ? "text-good" : "text-bad")} data-testid="history-summary-trend">
            {form.trend === "up" ? <TrendingUp className="h-3.5 w-3.5" aria-hidden /> : <TrendingDown className="h-3.5 w-3.5" aria-hidden />}
            {form.trend === "up" ? "Better" : "Worse"} lately ({form.gapPoints !== null && form.gapPoints > 0 ? "+" : ""}
            {form.gapPoints} pts)
          </span>
        ) : null}
        <InfoTip
          className="ml-auto"
          label="About these figures"
          text={`Over the newest ${form.recent.games} games this list holds with its filters (all ${form.season.games} for the trend). KDA, CS and kill participation count only the games that record them. A trend is named only with enough games and a clear gap, the same rule as the Overview's Recent form. The ladder change comes from rank readings taken at each sync, so it is not split by game.`}
        />
      </div>
    </section>
  );
}
