import { Lightbulb, ThumbsUp, TriangleAlert } from "lucide-react";
import { categoryLabel } from "@/domain/development/categories";
import { EXECUTION_LEVELS } from "@/domain/development/reviews";
import { LP_REASON_TEXT, type SessionLp, type SessionSummary } from "@/domain/development/sessions";
import { rankLabel } from "@/domain/rank-progress";
import { ChampionPortrait } from "@/components/champion-portrait";
import type { JournalLookups } from "@/components/ranked/types";
import { cn } from "@/lib/cn";

function Stat({ label, children, tone }: { label: string; children: React.ReactNode; tone?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-2xs uppercase tracking-label text-fg-subtle">{label}</p>
      <p className={cn("text-xl font-semibold tabular-nums leading-tight text-fg", tone)}>{children}</p>
    </div>
  );
}

/** LP over the session from stored rank snapshots, or why it is not known (never a guess). */
export function LpChange({ lp }: { lp: SessionLp }) {
  if (lp.state === "unknown")
    return (
      <Stat label="LP">
        <span className="text-base font-normal text-fg-muted" title={LP_REASON_TEXT[lp.reason]}>
          Not known
        </span>
      </Stat>
    );
  return (
    <Stat label="LP" tone={lp.change > 0 ? "text-good" : lp.change < 0 ? "text-red" : undefined}>
      <span title={`${rankLabel(lp.from.tier, lp.from.division)} ${lp.from.leaguePoints ?? 0} LP → ${rankLabel(lp.to.tier, lp.to.division)} ${lp.to.leaguePoints ?? 0} LP`}>
        {lp.change > 0 ? "+" : ""}
        {lp.change}
      </span>
    </Stat>
  );
}

/**
 * What a session came to: results and LP (from Riot), the champions played, then what the player's
 * own reviews say (follow-through, what went well, what kept being hard, learning points) and the
 * suggestions those support. Self-reported parts are labelled as such; nothing is inferred beyond them.
 */
export function SessionSummaryView({ summary, lp, lookups }: { summary: SessionSummary; lp: SessionLp; lookups: Pick<JournalLookups, "championsById"> }) {
  const s = summary;
  return (
    <div className="space-y-4" data-testid="session-summary">
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        <Stat label="Games">{s.games}</Stat>
        <Stat label="Won">
          <span className="text-blue">{s.wins}</span>
        </Stat>
        <Stat label="Lost">
          <span className="text-red">{s.losses}</span>
        </Stat>
        <div className="col-span-3 sm:col-span-1">
          <LpChange lp={lp} />
        </div>
      </div>
      {lp.state === "unknown" && lp.reason !== "no-games" ? <p className="-mt-2 text-xs text-fg-muted">LP: {LP_REASON_TEXT[lp.reason]}</p> : null}
      {s.champions.length ? (
        <div>
          <p className="mb-1.5 text-2xs uppercase tracking-label text-fg-subtle">Champions</p>
          <ul className="flex flex-wrap gap-2" data-testid="summary-champions">
            {s.champions.map((c) => (
              <li key={c.championId} className="flex items-center gap-2 rounded-full border border-border bg-surface py-0.5 pl-0.5 pr-3 text-sm">
                <ChampionPortrait champion={lookups.championsById[c.championId] ?? { id: c.championId, name: c.championId, portraitUrl: "" }} size="xs" className="rounded-full" />
                <span className="text-fg">{lookups.championsById[c.championId]?.name ?? c.championId}</span>
                <span className="tabular-nums text-fg-muted">
                  {c.wins}W {c.games - c.wins}L
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="rounded-md border border-border bg-bg-elevated p-3" data-testid="summary-reviews">
        <p className="mb-2 text-2xs font-semibold uppercase tracking-label text-fg-subtle">From your reviews · self-reported</p>
        {s.reviews.done === 0 ? (
          <p className="text-sm text-fg-muted">No reviews in this session{s.reviews.pending ? ` yet (${s.reviews.pending} waiting)` : ""}. The parts below fill in from your reviews.</p>
        ) : (
          <div className="space-y-3 text-sm">
            {s.execution.rated ? (
              <div>
                <p className="text-fg">
                  Plan followed in <span className="font-semibold">{s.execution.followed}</span> of {s.execution.rated} reviewed game{s.execution.rated === 1 ? "" : "s"}.
                </p>
                <ul className="mt-1.5 grid grid-cols-4 gap-1" aria-label="How consistently you followed your plan, per game">
                  {EXECUTION_LEVELS.map((l) => (
                    <li key={l.value} className="min-w-0 text-center">
                      <span className="block truncate text-2xs text-fg-subtle">{l.label}</span>
                      <span className="block font-semibold tabular-nums text-fg">{s.execution.levels[l.value]}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {s.wentWell.length ? (
              <p className="flex items-start gap-1.5 text-fg">
                <ThumbsUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-good" aria-hidden />
                <span>
                  <span className="text-fg-muted">Went well: </span>
                  {s.wentWell.map((a) => `${categoryLabel(a.key)}${a.count > 1 ? ` (${a.count})` : ""}`).join(", ")}
                </span>
              </p>
            ) : null}
            {s.recurring.length ? (
              <p className="flex items-start gap-1.5 text-fg" data-testid="summary-recurring">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" aria-hidden />
                <span>
                  <span className="text-fg-muted">Hard more than once: </span>
                  {s.recurring.map((a) => `${categoryLabel(a.key)} (${a.count})`).join(", ")}
                </span>
              </p>
            ) : null}
            {s.learnings.length ? (
              <div>
                <p className="text-fg-muted">Your learning points</p>
                <ul className="mt-1 space-y-1">
                  {s.learnings.map((l, i) => (
                    <li key={i} className="border-l-2 border-accent/50 pl-2 text-fg">
                      {l}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p className="text-xs text-fg-subtle">
              {s.reviews.done} reviewed{s.reviews.skipped ? ` · ${s.reviews.skipped} skipped` : ""}
              {s.reviews.pending ? ` · ${s.reviews.pending} waiting` : ""}
            </p>
          </div>
        )}
      </div>
      {s.suggestions.length ? (
        <div data-testid="summary-suggestions">
          <p className="mb-1.5 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-label text-fg-subtle">
            <Lightbulb className="h-3.5 w-3.5 text-accent" aria-hidden /> Suggested focus
          </p>
          <ul className="space-y-1.5 text-sm text-fg">
            {s.suggestions.map((t, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent" aria-hidden />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
