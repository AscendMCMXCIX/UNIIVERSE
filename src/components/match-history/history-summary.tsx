import { TrendingDown, TrendingUp } from "lucide-react";
import type { HistorySummary } from "@/domain/history-summary";
import type { FormMetric } from "@/domain/recent-form";
import type { MatchHistoryPage } from "@/server/players/match-history";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { InfoTip } from "@/components/ui/info-tip";
import { StatLine, StatStrip, StatTile } from "@/components/ui/stat-strip";
import { formatCount, formatDayMonth } from "@/lib/format";
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

/*
  Laid out by ui/stat-strip (owner decision D8, 8 Nov 2026): one row of tiles from 60rem of its own
  width (a desktop), one flowing line on a tablet, and three lines on a phone: the results with the
  record; KDA, CS (vision for supports), kill participation and the streak; the champions played
  most, the ladder change and the trend, with the ⓘ at the end. A line wraps only where its figures
  do not fit (a 320px phone, a large text size). Every figure, word and explanation is the same at
  every width.
*/
export function HistorySummaryStrip({ summary, ladder, championsById }: { summary: HistorySummary; ladder: MatchHistoryPage["ladder"]; championsById: Record<string, PortraitChampion> }) {
  const { form } = summary;
  if (form.recent.games === 0) return null;
  const strip = [...form.last].reverse();
  const champ = (id: string) => championsById[id] ?? { id, name: id, portraitUrl: "" };
  const kp = summary.killParticipation;
  // Without a trend every figure fits one line of the widest screens' strip (from 78rem): one text
  // line instead of tiles there. A trend's figure would not, so the tiles stay.
  const trend = form.trend === "up" || form.trend === "down";
  const wideLine = !trend;
  return (
    <StatStrip label={`Your last ${form.recent.games} games in this list`} testId="history-summary">
      <StatLine>
        <StatTile
            wideLine={wideLine}
          lead
          labelFirst
          label={`Last ${form.recent.games}`}
          value={
            // 6px squares on a phone (4px on the narrowest), so the record keeps their line; 8px from 36rem.
            <span className="flex h-5 items-center gap-px @min-[36rem]/strip:gap-0.5" role="img" aria-label={`${form.recent.wins} wins and ${form.recent.games - form.recent.wins} losses, oldest to newest`} data-testid="history-summary-strip">
              {strip.map((g) => (
                <span key={g.matchId} className={cn("h-5 w-1 shrink-0 rounded-sm @min-[20rem]/strip:w-1.5 @min-[36rem]/strip:w-2", g.win ? "bg-blue/85" : "bg-red/75")} title={`${g.win ? "Win" : "Loss"} · ${champ(g.championId).name}`} data-result={g.win ? "W" : "L"} />
              ))}
            </span>
          }
        />
        <StatTile wideLine={wideLine} value={form.recent.winRate === null ? "—" : `${Math.round(form.recent.winRate * 100)}%`} label={`${form.recent.wins}W ${form.recent.games - form.recent.wins}L`} testId="history-summary-record" />
      </StatLine>
      <StatLine>
        {form.metrics.map((m) => (
          <StatTile
            wideLine={wideLine}
            key={m.key}
            value={
              <>
                {metricText(m)}
                {m.direction === "up" ? <TrendingUp className="h-3.5 w-3.5 text-good" aria-label="higher lately" /> : m.direction === "down" ? <TrendingDown className="h-3.5 w-3.5 text-bad" aria-label="lower lately" /> : null}
              </>
            }
            label={m.key === "cs" ? "CS/min" : m.key === "vision" ? "vision" : "KDA"}
            title={`${m.label} over the last ${m.recentGames} games${m.season !== null ? `; ${metricText({ ...m, recent: m.season })} over all ${m.seasonGames} in this list` : ""}`}
            testId={`history-summary-${m.key}`}
          />
        ))}
        <StatTile wideLine={wideLine} value={kp.value === null ? "—" : `${Math.round(kp.value * 100)}%`} label="KP" title={kp.games ? `Kills and assists over the team's kills, in the ${kp.games} recent games that record both` : "Team kills are not recorded for these games"} testId="history-summary-kp" />
        {summary.streak && summary.streak.games >= 2 ? <StatTile wideLine={wideLine} value={<span className={summary.streak.win ? "text-blue" : "text-red"}>{summary.streak.games}</span>} label={summary.streak.win ? "wins in a row" : "losses in a row"} testId="history-summary-streak" /> : null}
      </StatLine>
      <StatLine>
        {summary.mostPlayed.length ? (
          <StatTile
            wideLine={wideLine}
            labelFrom60
            label="Played most"
            value={
              <ul className="flex flex-wrap items-center gap-x-2 gap-y-1" aria-label="Played most in these games" data-testid="history-summary-champions">
                {summary.mostPlayed.map((c) => (
                  <li key={c.championId} className="flex items-center gap-1" title={`${champ(c.championId).name}: ${c.wins} won, ${c.games - c.wins} lost`}>
                    {/* 20px, the line's height: the portrait's own size (xs) is drawn inside this box. */}
                    <span className="flex h-5 w-5 shrink-0 [&>*]:h-full [&>*]:w-full [&>*]:rounded [&>*]:text-4xs">
                      <ChampionPortrait champion={champ(c.championId)} size="xs" />
                    </span>
                    <span className="text-xs font-normal tabular-nums text-fg-muted">
                      {c.wins}–{c.games - c.wins}
                    </span>
                    <span className="sr-only">{champ(c.championId).name}</span>
                  </li>
                ))}
              </ul>
            }
          />
        ) : null}
        {ladder ? (
          <StatTile
            wideLine={wideLine}
            value={
              <span className={ladder.points > 0 ? "text-good" : ladder.points < 0 ? "text-bad" : "text-fg-muted"}>
                {ladder.points > 0 ? "+" : ladder.points < 0 ? "−" : ""}
                {formatCount(Math.abs(ladder.points))}
              </span>
            }
            label={`${ladder.queue === "flex" ? "Flex" : "Solo/Duo"} points, ${ladder.since === null ? `${ladder.days} days` : `since ${formatDayMonth(ladder.since)}`}`}
            title={`${ladder.from} → ${ladder.to}${ladder.riotId ? ` on ${ladder.riotId}` : ""}. Ladder points: LP, with 100 for each division gained or lost. From stored rank readings, not per game.`}
            testId="history-summary-ladder"
          />
        ) : null}
        {trend ? (
          <StatTile
            wideLine={wideLine}
            value={
              <span className={cn("inline-flex items-center gap-1", form.trend === "up" ? "text-good" : "text-bad")}>
                {form.trend === "up" ? <TrendingUp className="h-3.5 w-3.5" aria-hidden /> : <TrendingDown className="h-3.5 w-3.5" aria-hidden />}
                {form.trend === "up" ? "Better" : "Worse"} lately
              </span>
            }
            label={`(${form.gapPoints !== null && form.gapPoints > 0 ? "+" : ""}${form.gapPoints} pts)`}
            testId="history-summary-trend"
          />
        ) : null}
        <InfoTip
          className="ml-auto self-center"
          label="About these figures"
          text={`Over the newest ${form.recent.games} games this list holds with its filters (all ${form.season.games} for the trend). KDA, CS and kill participation count only the games that record them. A trend is named only with enough games and a clear gap, the same rule as the Overview's Recent form. The ladder change comes from rank readings taken at each sync, so it is not split by game.`}
        />
      </StatLine>
    </StatStrip>
  );
}
