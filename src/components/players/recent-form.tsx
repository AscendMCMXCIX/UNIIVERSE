import { TrendingDown, TrendingUp } from "lucide-react";
import type { RecentForm } from "@/domain/recent-form";
import { FORM_MIN_RECENT } from "@/domain/recent-form";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/cn";

/**
 * The newest results of the current filter (newest on the left) and the recent win rate beside
 * the whole sample. "Better lately" / "worse lately" only appear with enough games on both sides.
 */
export function RecentFormStrip({ form, championsById }: { form: RecentForm; championsById: Record<string, PortraitChampion> }) {
  if (form.last.length === 0) return null;
  const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
  const champ = (id: string) => championsById[id] ?? { id, name: id, portraitUrl: "" };
  return (
    <div className="flex flex-col gap-2 rounded-panel border border-border bg-surface/60 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-4" data-testid="recent-form">
      <div className="min-w-0">
        <p className="text-xs font-medium text-fg-subtle">Last {form.last.length} games</p>
        <ol className="mt-1 flex items-center gap-1" aria-label={`Last ${form.last.length} results, newest first`}>
          {form.last.map((g) => (
            <li key={g.matchId} className="relative" title={`${g.win ? "Win" : "Loss"} · ${champ(g.championId).name}`}>
              <ChampionPortrait champion={champ(g.championId)} size="xs" className={cn("ring-2", g.win ? "ring-good" : "ring-bad")} />
              <span className="sr-only">{g.win ? "Win" : "Loss"} on {champ(g.championId).name}</span>
              <span aria-hidden className={cn("absolute -bottom-0.5 left-1/2 h-1 w-3 -translate-x-1/2 rounded-full", g.win ? "bg-good" : "bg-bad")} />
            </li>
          ))}
        </ol>
      </div>
      <dl className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm sm:ml-auto" data-testid="recent-form-rates">
        <div>
          <dt className="text-xs text-fg-subtle">Last {form.recent.games}</dt>
          <dd className="font-semibold tabular-nums text-fg">
            {pct(form.recent.winRate)} <span className="text-xs font-normal text-fg-muted">{form.recent.wins}W {form.recent.games - form.recent.wins}L</span>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-fg-subtle">All {form.season.games}</dt>
          <dd className="font-semibold tabular-nums text-fg">{pct(form.season.winRate)}</dd>
        </div>
        <div className="flex items-center gap-1 text-xs" data-testid="recent-form-trend" data-trend={form.trend ?? "none"}>
          {form.trend === "up" ? (
            <span className="inline-flex items-center gap-1 text-good">
              <TrendingUp className="h-3.5 w-3.5" aria-hidden /> Better lately (+{form.gapPoints} pts)
            </span>
          ) : form.trend === "down" ? (
            <span className="inline-flex items-center gap-1 text-bad">
              <TrendingDown className="h-3.5 w-3.5" aria-hidden /> Worse lately ({form.gapPoints} pts)
            </span>
          ) : form.trend === "steady" ? (
            <span className="text-fg-muted">In line with the season</span>
          ) : (
            <span className="text-fg-subtle">Too few games to call a trend</span>
          )}
          <InfoTip label="About recent form" text={`The most recent games of the current filter against all of them. A trend is only named with at least ${FORM_MIN_RECENT} recent games, ${FORM_MIN_RECENT} more before them, and a gap of 8 percentage points or more.`} />
        </div>
      </dl>
    </div>
  );
}
