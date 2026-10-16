import Link from "next/link";
import { TrendingDown, TrendingUp } from "lucide-react";
import type { FormMetric, RecentForm } from "@/domain/recent-form";
import { FORM_MIN_GAMES, FORM_MIN_RECENT } from "@/domain/recent-form";
import type { PortraitChampion } from "@/components/champion-portrait";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/cn";

const fmt = (m: Pick<FormMetric, "key" | "recent">) => (m.recent === null ? "—" : m.recent.toFixed(m.key === "vision" ? 0 : 1));

/**
 * The last results of the current filter as squares (oldest on the left, newest on the right; the
 * strip opens Match History) and the recent win rate beside the whole sample. "Better lately" /
 * "worse lately" only appear with enough games on both sides. Hidden below five games.
 */
export function RecentFormStrip({ form, championsById, historyHref }: { form: RecentForm; championsById: Record<string, PortraitChampion>; historyHref: string }) {
  if (form.season.games < FORM_MIN_GAMES) return null;
  const strip = [...form.last].reverse();
  const wins = strip.filter((g) => g.win).length;
  const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
  const champ = (id: string) => championsById[id] ?? { id, name: id, portraitUrl: "" };
  return (
    <div className="flex flex-col gap-2 rounded-panel border border-border bg-surface/60 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-4" data-testid="recent-form">
      <div className="min-w-0">
        <p className="text-xs font-medium text-fg-subtle">Last {strip.length} games · oldest to newest</p>
        <Link href={historyHref} className="mt-1 flex min-h-6 items-center gap-0.5 rounded-sm" aria-label={`Last ${strip.length} games: ${wins} wins, ${strip.length - wins} losses, newest last. Open Match History`} data-testid="recent-form-strip">
          {strip.map((g) => (
            <span key={g.matchId} title={`${g.win ? "Win" : "Loss"} · ${champ(g.championId).name}`} className={cn("h-5 w-3 rounded-[3px] sm:w-3.5", g.win ? "bg-good/80" : "bg-bad/70")} data-result={g.win ? "W" : "L"} />
          ))}
        </Link>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm sm:ml-auto">
        <dl className="flex flex-wrap items-baseline gap-x-4 gap-y-1" data-testid="recent-form-rates">
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
          {/* The same comparison for KDA and CS/min (vision for supports), each over the games that carry it. */}
          {form.metrics.map((m) => (
            <div key={m.key} data-testid={`recent-form-${m.key}`} data-direction={m.direction ?? "none"} title={`${m.label}: last ${m.recentGames} games against all ${m.seasonGames}${m.direction === null ? " (too few games to compare)" : ""}`}>
              <dt className="text-xs text-fg-subtle">{m.label}</dt>
              <dd className="font-semibold tabular-nums text-fg">
                {fmt(m)}
                {m.season !== null ? <span className="text-xs font-normal text-fg-muted"> vs {fmt({ ...m, recent: m.season })}</span> : null}
                {m.direction === "up" ? <TrendingUp className="ml-1 inline h-3.5 w-3.5 text-good" aria-label="higher lately" /> : m.direction === "down" ? <TrendingDown className="ml-1 inline h-3.5 w-3.5 text-bad" aria-label="lower lately" /> : null}
              </dd>
            </div>
          ))}
        </dl>
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
          <InfoTip label="About recent form" text={`The most recent games of the current filter against all of them. A trend is only named with at least ${FORM_MIN_RECENT} recent games, ${FORM_MIN_RECENT} more before them, and a clear gap: 8 percentage points of win rate, 15% of KDA or vision, 0.5 CS per minute. KDA, CS and vision count only the games that carry them; an arrow marks a clear gap.`} />
        </div>
      </div>
    </div>
  );
}
