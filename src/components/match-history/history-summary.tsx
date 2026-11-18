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
  Laid out by ui/stat-strip (owner decision D8, 8 Nov 2026), in the order the approved design reads:
  the form (the last twenty as squares, the streak, the trend), the record, KDA, CS (vision for
  supports) and kill participation, the champions played most and the ladder change. The ⓘ sits
  with "Last 20", which it explains. On a phone from 393px, three lines with every figure at once:
    1. "Last 20 ⓘ", the squares (they share what the line leaves, 3 to 8px each), the streak
       ("4W streak") and, when one is named, the trend ("Better +9 pts");
    2. the record, KDA, CS and kill participation, spread across;
    3. the champions played most and the ladder change ("+45 Solo/Duo since 30 Sep").
  The words a phone's line leaves out are read by screen readers and are in each figure's title
  ("4 wins in a row", "Solo/Duo points", "Better lately"); from 36rem the trend says them again. A
  line wraps where its figures still do not fit: at 375px a streak beside a named trend takes a
  second row on the first line (the squares, never under 3px, go under "Last 20 ⓘ" or the trend
  moves down), and the longest ladder label or a two-digit record on a champion can move the ladder
  change to a fourth line; a 360px phone's ladder change, a 320px phone and a large text size wrap
  too. From 36rem one flowing line, from 60rem one row of tiles, from 78rem without a trend one line
  of text (ui/stat-strip).
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
  const streak = summary.streak && summary.streak.games >= 2 ? summary.streak : null;
  const streakWords = streak ? `${streak.games} ${streak.win ? "wins" : "losses"} in a row` : "";
  const gap = form.gapPoints ?? 0;
  return (
    <StatStrip label={`Your last ${form.recent.games} games in this list`} testId="history-summary">
      <StatLine>
        <StatTile
          wideLine={wideLine}
          lead
          labelFirst
          // On a phone the squares take what the line leaves (each 3 to 8px), and never less: where
          // 3px squares do not fit beside the streak and a trend, they go under "Last 20 ⓘ" or the
          // trend takes the next line (never drawn under the streak); 6px from 36rem.
          className="@max-[36rem]/strip:min-w-min @max-[36rem]/strip:flex-1"
          valueClassName="@max-[36rem]/strip:flex-1"
          label={
            <>
              Last {form.recent.games}{" "}
              {/* The ⓘ's 16px box keeps a tile's 14px caption line (its 24px target reaches past it). */}
              <span className="inline-flex @min-[60rem]/strip:-my-px">
                <InfoTip
                  label="About these figures"
                  text={`Over the newest ${form.recent.games} games this list holds with its filters (all ${form.season.games} for the trend). KDA, CS and kill participation count only the games that record them. A trend is named only with enough games and a clear gap, the same rule as the Overview's Recent form. The ladder change comes from rank readings taken at each sync, so it is not split by game.`}
                />
              </span>
            </>
          }
          value={
            <span className="flex h-5 flex-1 items-center gap-px @min-[36rem]/strip:flex-none @min-[36rem]/strip:gap-0.5" role="img" aria-label={`${form.recent.wins} wins and ${form.recent.games - form.recent.wins} losses, oldest to newest`} data-testid="history-summary-strip">
              {strip.map((g) => (
                <span key={g.matchId} className={cn("h-5 min-w-0.75 max-w-2 flex-1 rounded-sm @min-[36rem]/strip:w-1.5 @min-[36rem]/strip:max-w-none @min-[36rem]/strip:flex-none", g.win ? "bg-blue/85" : "bg-red/75")} title={`${g.win ? "Win" : "Loss"} · ${champ(g.championId).name}`} data-result={g.win ? "W" : "L"} />
              ))}
            </span>
          }
        />
        {streak ? (
          <StatTile
            wideLine={wideLine}
            value={
              <span className={streak.win ? "text-blue" : "text-red"}>
                <span aria-hidden>
                  {streak.games}
                  {streak.win ? "W" : "L"}
                </span>
                <span className="sr-only">{streakWords}</span>
              </span>
            }
            label={<span aria-hidden>streak</span>}
            title={streakWords}
            testId="history-summary-streak"
          />
        ) : null}
        {trend ? (
          <StatTile
            wideLine={wideLine}
            value={
              <span className={cn("inline-flex items-center gap-1", form.trend === "up" ? "text-good" : "text-bad")}>
                {form.trend === "up" ? <TrendingUp className="h-3.5 w-3.5" aria-hidden /> : <TrendingDown className="h-3.5 w-3.5" aria-hidden />}
                {form.trend === "up" ? "Better" : "Worse"}
                <span className="@max-[36rem]/strip:sr-only"> lately</span>
              </span>
            }
            label={
              <>
                <span className="@max-[36rem]/strip:sr-only">(</span>
                {gap > 0 ? "+" : ""}
                {form.gapPoints} pts<span className="@max-[36rem]/strip:sr-only">)</span>
              </>
            }
            title={`${form.trend === "up" ? "Better" : "Worse"} lately: the last ${form.recent.games} games' win rate is ${Math.abs(gap)} points ${gap > 0 ? "above" : "below"} that of all ${form.season.games} in this list`}
            testId="history-summary-trend"
          />
        ) : null}
      </StatLine>
      <StatLine className="@max-[36rem]/strip:justify-between">
        <StatTile wideLine={wideLine} value={form.recent.winRate === null ? "—" : `${Math.round(form.recent.winRate * 100)}%`} label={`${form.recent.wins}W ${form.recent.games - form.recent.wins}L`} testId="history-summary-record" />
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
      </StatLine>
      <StatLine>
        {summary.mostPlayed.length ? (
          <StatTile
            wideLine={wideLine}
            labelFrom60
            label="Played most"
            value={
              <ul className="flex flex-wrap items-center gap-x-1 gap-y-1 @min-[36rem]/strip:gap-x-2" aria-label="Played most in these games" data-testid="history-summary-champions">
                {summary.mostPlayed.map((c) => (
                  <li key={c.championId} className="flex items-center gap-0.5 @min-[36rem]/strip:gap-1" title={`${champ(c.championId).name}: ${c.wins} won, ${c.games - c.wins} lost`}>
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
            // "Solo/Duo since 3 Nov" as the approved design writes it; "points" for screen readers.
            label={
              <>
                {ladder.queue === "flex" ? "Flex" : "Solo/Duo"}
                <span className="sr-only"> points</span>
                {ladder.since === null ? `, ${ladder.days} days` : ` since ${formatDayMonth(ladder.since)}`}
              </>
            }
            title={`${ladder.from} → ${ladder.to}${ladder.riotId ? ` on ${ladder.riotId}` : ""}. Ladder points: LP, with 100 for each division gained or lost. From stored rank readings, not per game.`}
            testId="history-summary-ladder"
          />
        ) : null}
      </StatLine>
    </StatStrip>
  );
}
