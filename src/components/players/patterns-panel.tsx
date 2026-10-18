import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Lock } from "lucide-react";
import { formatPatternValue, PATTERN_MIN_GAMES, patternSentence, type FigurePattern, type Patterns, type PatternWindow } from "@/domain/patterns";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { cn } from "@/lib/cn";

/*
  Patterns & Notes, the patterns half: the player's own trends in neutral words, with the games and
  dates behind each figure. Shown only to the player themself (the pages pass it for their own
  profile and their own blocks only). "summary" is the compact line-up for My Profile; "full" is the
  Solo Queue Blocks panel, with every figure in a sentence and what was left out.
*/

const day = (ms: number) => new Date(ms).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
const span = (w: PatternWindow) => (day(w.from) === day(w.to) ? day(w.to) : `${day(w.from)} – ${day(w.to)}`);
const DIRECTION = {
  higher: { icon: ArrowUpRight, word: "higher" },
  lower: { icon: ArrowDownRight, word: "lower" },
  same: { icon: ArrowRight, word: "about the same" },
} as const;

function Figure({ p }: { p: FigurePattern }) {
  const d = DIRECTION[p.direction];
  const Icon = d.icon;
  return (
    <li className="min-w-0 rounded-lg border border-border/70 bg-bg-elevated/50 px-3 py-2" data-testid="pattern-figure" data-key={p.key} data-direction={p.direction}>
      <span className="block text-xs text-fg-subtle">{p.label}</span>
      <span className="flex items-baseline gap-1.5">
        <span className="text-lg font-semibold tabular-nums text-fg">{formatPatternValue(p.key, p.recent.value)}</span>
        <span className="inline-flex items-center gap-0.5 text-xs text-fg-muted">
          <Icon className="h-3.5 w-3.5" aria-hidden /> {d.word}
        </span>
      </span>
      <span className="block text-[0.6875rem] tabular-nums text-fg-subtle">
        {formatPatternValue(p.key, p.before.value)} before · {p.recent.games} / {p.before.games} games
      </span>
    </li>
  );
}

export function PatternsPanel({ patterns: pt, championsById, variant, blocksHref }: { patterns: Patterns; championsById: Record<string, PortraitChampion>; variant: "summary" | "full"; blocksHref?: string }) {
  const champ = (id: string) => championsById[id] ?? { id, name: id, portraitUrl: "" };
  const enough = pt.figures.length > 0 || pt.champions.length > 0;
  const windows = pt.recent && pt.before ? { recent: pt.recent.games, before: pt.before.games } : undefined;
  return (
    <section aria-labelledby={`patterns-${variant}`} className={cn("rounded-card border border-border bg-surface p-4", variant === "summary" && "space-y-3")} data-testid={`patterns-${variant}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`patterns-${variant}`} className="flex items-center gap-2 text-base font-semibold text-fg">
          {variant === "summary" ? "Your patterns" : "Patterns"}
          <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[0.6875rem] font-medium text-fg-muted" title="Only you can see this: it is never shown to teammates and never used for drafting or rankings">
            <Lock className="h-3 w-3" aria-hidden /> Only you
          </span>
        </h2>
        {variant === "summary" && blocksHref ? (
          <Link href={blocksHref} className="text-sm text-accent hover:underline" data-testid="patterns-more">
            Patterns &amp; Notes →
          </Link>
        ) : null}
      </div>
      {pt.recent ? (
        <p className="text-xs text-fg-muted" data-testid="patterns-window">
          Your last {pt.recent.games} Ranked games ({span(pt.recent)}){pt.before ? ` compared with the ${pt.before.games} before them (${span(pt.before)})` : ""}.
        </p>
      ) : null}
      {!enough ? (
        <p className="mt-2 text-sm text-fg-muted" data-testid="patterns-empty">
          Patterns appear once there are at least {PATTERN_MIN_GAMES} Ranked games in your latest games and {PATTERN_MIN_GAMES} before them.
        </p>
      ) : variant === "summary" ? (
        <>
          {pt.figures.length ? (
            <ul className="grid grid-cols-2 gap-2 lg:grid-cols-4" data-testid="pattern-figures">
              {pt.figures.map((p) => (
                <Figure key={p.key} p={p} />
              ))}
            </ul>
          ) : null}
          {pt.champions.length ? (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted" data-testid="pattern-champions">
              {pt.champions.map((c) => (
                <span key={c.championId} className="inline-flex items-center gap-1.5">
                  <ChampionPortrait champion={champ(c.championId)} size="xs" />
                  <span className="text-fg">{champ(c.championId).name}</span> {c.games} games, {c.wins}W {c.games - c.wins}L
                </span>
              ))}
            </p>
          ) : null}
        </>
      ) : (
        <div className="mt-3 space-y-3">
          {pt.figures.length ? (
            <ul className="space-y-1.5 text-sm text-fg" data-testid="pattern-sentences">
              {pt.figures.map((p) => (
                <li key={p.key} className="flex gap-2" data-testid="pattern-sentence" data-key={p.key}>
                  <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-fg-subtle" />
                  {patternSentence(p, windows)}
                </li>
              ))}
            </ul>
          ) : null}
          {pt.champions.length ? (
            <div data-testid="pattern-champions">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">Champions in your last {pt.recent?.games} games</h3>
              <ul className="mt-1.5 grid gap-1.5 sm:grid-cols-3">
                {pt.champions.map((c) => (
                  <li key={c.championId} className="flex min-w-0 items-center gap-2 rounded-lg border border-border/70 bg-bg-elevated/50 px-2.5 py-1.5 text-xs text-fg-muted">
                    <ChampionPortrait champion={champ(c.championId)} size="sm" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-fg">{champ(c.championId).name}</span>
                      {c.games} games, {c.wins}W {c.games - c.wins}L{c.before ? ` · before: ${c.before.games} games, ${c.before.wins}W ${c.before.games - c.before.wins}L` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {pt.omitted.length ? (
            <p className="text-xs text-fg-subtle" data-testid="patterns-omitted">
              Not enough games with the figure yet (at least {PATTERN_MIN_GAMES} on each side): {pt.omitted.join(", ")}.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
