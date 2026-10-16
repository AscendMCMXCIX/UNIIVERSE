import * as React from "react";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/cn";

/*
  The statistics pages' shared pieces (Solo Queue Meta, Duo Synergies, Pro Play): one panel frame,
  one rank number, and two quiet meters that show a figure's size at a glance next to the number
  itself (never instead of it). Sample sizes and small-sample notes stay with each page's figures.
*/

/** A statistics panel: a title (with an optional draft-slot code and explanation), a line of context, controls, the list, a footnote. */
export function StatPanel({ title, code, tip, meta, toolbar, footer, children, className, testId, titleId }: { title?: React.ReactNode; code?: string; tip?: string; meta?: React.ReactNode; toolbar?: React.ReactNode; footer?: React.ReactNode; children: React.ReactNode; className?: string; testId?: string; titleId?: string }) {
  return (
    <section className={cn("min-w-0 overflow-hidden rounded-card border border-border bg-surface", className)} aria-labelledby={title ? titleId : undefined} data-testid={testId}>
      {title || meta ? (
        <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-border px-3.5 py-2.5">
          {title ? (
            <h3 id={titleId} className="flex items-center gap-2 text-sm font-semibold text-fg">
              {title}
              {code ? <span className="rounded bg-surface-2 px-1.5 py-px font-mono text-[0.6875rem] font-medium text-fg-muted">{code}</span> : null}
              {tip ? <InfoTip label={`About ${typeof title === "string" ? title : "this list"}`} text={tip} /> : null}
            </h3>
          ) : null}
          {meta ? <span className="text-xs text-fg-subtle">{meta}</span> : null}
        </header>
      ) : null}
      {toolbar ? <div className="border-b border-border p-2">{toolbar}</div> : null}
      {children}
      {footer ? <div className="border-t border-border/70 px-3.5 py-2.5 text-xs text-fg-muted">{footer}</div> : null}
    </section>
  );
}

/** A row's place in a ranking (the first three slightly stronger). */
export function RankNumber({ rank, className }: { rank: number; className?: string }) {
  return <span className={cn("tabular-nums text-xs font-semibold", rank <= 3 ? "text-fg-muted" : "text-fg-subtle", className)}>{rank}</span>;
}

/** How large a share is, as a thin bar under its number (0–1 of the list's largest value). */
export function Meter({ value, tone = "accent", className }: { value: number; tone?: "accent" | "good" | "bad" | "muted"; className?: string }) {
  const width = Math.max(0, Math.min(1, value));
  return (
    <span className={cn("block h-1 w-full overflow-hidden rounded-full bg-surface-3/80", className)} aria-hidden>
      <span className={cn("block h-full rounded-full", tone === "good" ? "bg-good/80" : tone === "bad" ? "bg-bad/80" : tone === "muted" ? "bg-fg-subtle/60" : "bg-accent/80")} style={{ width: `${Math.round(width * 100)}%` }} data-testid="stat-meter" />
    </span>
  );
}

/** A figure that can go either way (points above or below an expectation): a bar from the centre line. */
export function DivergingMeter({ value, max, className }: { value: number; max: number; className?: string }) {
  const share = max > 0 ? Math.max(-1, Math.min(1, value / max)) : 0;
  const half = Math.round(Math.abs(share) * 50);
  return (
    <span className={cn("relative block h-1 w-full overflow-hidden rounded-full bg-surface-3/80", className)} aria-hidden>
      <span className="absolute inset-y-0 left-1/2 w-px bg-border-strong" />
      <span className={cn("absolute inset-y-0 rounded-full", share >= 0 ? "left-1/2 bg-good/80" : "right-1/2 bg-bad/80")} style={{ width: `${half}%` }} data-testid="stat-diverging" />
    </span>
  );
}
