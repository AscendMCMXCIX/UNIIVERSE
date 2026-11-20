import Link from "next/link";
import { TrendingDown, TrendingUp } from "lucide-react";
import type { FormMetric, RecentForm } from "@/domain/recent-form";
import { FORM_GAP, FORM_METRIC_GAP, FORM_MIN_GAMES, FORM_MIN_RECENT, FORM_RECENT } from "@/domain/recent-form";
import type { PortraitChampion } from "@/components/champion-portrait";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/cn";

/**
 * Recent form's ⓘ, true to recentForm(): the newest FORM_RECENT games against all of them; a trend
 * (and each figure's arrow) only with FORM_MIN_RECENT more games before those and a clear gap.
 */
export const RECENT_FORM_HELP = `The latest ${FORM_RECENT} games against all in this filter. Trends and arrows need ${FORM_MIN_RECENT}+ older games too and a clear gap: ${FORM_GAP}+ win-rate points, ${FORM_METRIC_GAP.kda.relative * 100}% KDA or vision, ${FORM_METRIC_GAP.cs.absolute} CS/min.`;

const fmt = (m: Pick<FormMetric, "key" | "recent">) => (m.recent === null ? "—" : m.recent.toFixed(m.key === "vision" ? 0 : 1));

/**
 * Recent form as a compact card: the last results of the current filter as bars (oldest on the
 * left, newest on the right; a win above the line, a loss below it; the strip opens Match History), the recent win rate beside the whole
 * sample, and the same comparison for KDA and CS/min (vision for supports). "Better lately" /
 * "worse lately" only appear with enough games on both sides. Hidden below five games.
 */
export function RecentFormStrip({ form, championsById, historyHref, narrowed = null }: { form: RecentForm; championsById: Record<string, PortraitChampion>; historyHref: string; /** The Refine filters narrowing it, in words (it counts the same games as Season performance). */ narrowed?: string | null }) {
  if (form.season.games < FORM_MIN_GAMES) return null;
  const strip = [...form.last].reverse();
  const wins = strip.filter((g) => g.win).length;
  const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
  const champ = (id: string) => championsById[id] ?? { id, name: id, portraitUrl: "" };
  return (
    <section aria-labelledby="recent-form-title" className="@container flex flex-col gap-3 rounded-card border border-border bg-surface p-4 panel-depth" data-testid="recent-form">
      {/* The verdict on the title's row (it was a footer row of its own, a row more on a phone),
          what the bars show on the line under it. */}
      <div className="space-y-0.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <h2 id="recent-form-title" className="text-base font-semibold text-fg">
            Recent form
          </h2>
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
            <InfoTip label="About recent form" text={RECENT_FORM_HELP} />
          </div>
        </div>
        <p className="text-xs text-fg-subtle">Last {strip.length} · oldest to newest</p>
      </div>
      {narrowed ? (
        <p className="-mt-2 truncate text-xs text-fg-muted" title={`Filtered: ${narrowed}`} data-testid="recent-form-scope">
          Filtered: {narrowed}
        </p>
      ) : null}
      {/* A win rises above the line and a loss hangs below it, so the run reads without its colours too. */}
      {/* The bars share the card's width (up to a fixed size each), over a faint centre line. No
          floor: one in rem grew with the text, and at 175-200% on a 320px phone twenty bars ran up to
          61px past the card and the screen; there they narrow to about 6px instead. */}
      <Link href={historyHref} className="group/strip touch-target relative flex items-center gap-0.5 rounded-sm before:pointer-events-none before:absolute before:inset-x-0 before:top-1/2 before:h-px before:bg-border/70" aria-label={`Last ${strip.length} games: ${wins} wins, ${strip.length - wins} losses, newest last. Open Match History`} data-testid="recent-form-strip">
        {strip.map((g) => (
          <span key={g.matchId} title={`${g.win ? "Win" : "Loss"} · ${champ(g.championId).name}`} className={cn("relative flex h-8 min-w-0 max-w-3.5 flex-1 flex-col @xl:max-w-5", g.win ? "justify-start" : "justify-end")} data-result={g.win ? "W" : "L"}>
            <span className={cn("h-4 rounded-[3px] transition-opacity duration-150 group-hover/strip:opacity-100", g.win ? "bg-blue opacity-90" : "bg-red opacity-80")} />
          </span>
        ))}
      </Link>
      {/* The card ends at its content (UD.PO2): it was stretched to the season card's height beside
          it, leaving about 90px between the bars and these figures at 1280-1920. */}
      {/* Four across from 18rem of card (a phone at 100% text), each figure's context under it below
          32rem; two by two where four would not hold their figures (a 320px phone at large text). */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm @min-[18rem]:grid-cols-4 @min-[18rem]:gap-x-3" data-testid="recent-form-rates">
        <div>
          <dt className="text-xs text-fg-subtle">Last {form.recent.games}</dt>
          <dd className="text-lg font-semibold tabular-nums text-fg">
            {pct(form.recent.winRate)} <span className="text-xs font-normal text-fg-muted @min-[18rem]:@max-lg:block">{form.recent.wins}W {form.recent.games - form.recent.wins}L</span>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-fg-subtle">All {form.season.games}</dt>
          <dd className="text-lg font-semibold tabular-nums text-fg">{pct(form.season.winRate)}</dd>
        </div>
        {form.metrics.map((m) => (
          <div key={m.key} data-testid={`recent-form-${m.key}`} data-direction={m.direction ?? "none"} >
            <dt className="text-xs text-fg-subtle">{m.label}</dt>
            <dd className="text-lg font-semibold tabular-nums text-fg">
              {fmt(m)}
              {m.season !== null ? <span className="text-xs font-normal text-fg-muted @min-[18rem]:@max-lg:block"> vs {fmt({ ...m, recent: m.season })}</span> : null}
              <span className="sr-only">{`: the last ${m.recentGames} games against all ${m.seasonGames}${m.direction === null ? ", too few to compare" : ""}`}</span>
              {m.direction === "up" ? <TrendingUp className="ml-1 inline h-3.5 w-3.5 text-good" aria-label="higher lately" /> : m.direction === "down" ? <TrendingDown className="ml-1 inline h-3.5 w-3.5 text-bad" aria-label="lower lately" /> : null}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
