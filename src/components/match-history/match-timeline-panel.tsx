"use client";

import * as React from "react";
import { goldStory, LEAD_MIN, type GoldPoint } from "@/domain/match-analysis";
import type { MatchTimelineResult } from "@/server/accounts/match-timeline";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/cn";

/*
  The game minute by minute: the two teams' gold difference from the player's side, from Riot's
  match timeline (loaded when this section first opens; see getMatchTimeline). Above the zero line
  the player's team had more gold. The curve is described in figures only (the largest lead and
  deficit, the end, when a clear lead changed sides): no cause is read into it.
*/

export const signedGold = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${formatCount(Math.abs(n))}`;

/** Minutes into the game as a clock: 12.5 → "12:30". */
export function gameClock(minute: number): string {
  const s = Math.max(0, Math.round(minute * 60));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const goldTone = (n: number) => (Math.abs(n) < 1 ? "text-fg-muted" : n > 0 ? "text-good" : "text-bad");

export function TimelinePanel({ result }: { result: MatchTimelineResult | null }) {
  if (!result) return <div className="h-56 animate-pulse rounded-panel bg-surface-2 motion-reduce:animate-none" aria-busy="true" aria-label="Loading the timeline" data-testid="timeline-loading" />;
  if (result.status !== "ok")
    return (
      <p className="rounded-panel border border-dashed border-border p-3 text-sm text-fg-muted" data-testid="timeline-message">
        {result.message}
      </p>
    );
  const gold = result.timeline.gold;
  const story = gold ? goldStory(gold) : null;
  return (
    <div className="space-y-3" data-testid="match-timeline">
      {gold && story ? (
        <>
          <GoldChart points={gold} />
          <ul className="-mt-1 flex flex-wrap gap-x-5 gap-y-1 text-xs text-fg-muted" data-testid="gold-story">
            <li>
              Largest lead{" "}
              {story.lead ? (
                <>
                  <span className="font-semibold tabular-nums text-fg">{signedGold(story.lead.diff)}</span> at {gameClock(story.lead.minute)}
                </>
              ) : (
                "none"
              )}
            </li>
            <li>
              Largest deficit{" "}
              {story.deficit ? (
                <>
                  <span className="font-semibold tabular-nums text-fg">{signedGold(story.deficit.diff)}</span> at {gameClock(story.deficit.minute)}
                </>
              ) : (
                "none"
              )}
            </li>
            <li>
              At the end <span className={cn("font-semibold tabular-nums", goldTone(story.final.diff))}>{signedGold(story.final.diff)}</span>
            </li>
            <li data-testid="gold-lead-changes" data-changes={story.changes.length}>
              {story.changes.length === 0
                ? `No change of lead (${formatCount(LEAD_MIN)} gold or more)`
                : `The lead changed sides ${story.changes.length === 1 ? "once" : `${story.changes.length} times`}: ${story.changes.map((c) => `${gameClock(c.minute)} (${c.to === "ahead" ? "your team ahead" : "the other team ahead"})`).join(", ")}`}
            </li>
          </ul>
          <GoldTable points={gold} />
        </>
      ) : (
        <p className="rounded-panel border border-dashed border-border p-3 text-sm text-fg-muted" data-testid="gold-missing">
          The gold difference needs every player&apos;s figures in the timeline, and this game&apos;s timeline does not hold them all (a removed player, or figures Riot did not send), so it is not drawn.
        </p>
      )}
      <p className="text-2xs text-fg-subtle">From Riot&apos;s match timeline, read once per frame (every minute). Kills, objectives and buildings are not marked yet.</p>
    </div>
  );
}

/**
 * The gold difference as one line around zero, washed blue where the player's team was ahead and red
 * where it was behind (the site's colours for a won and a lost game). Drawn at the width it is
 * shown, so the labels keep their size; they are HTML over the drawing. Hover, touch or the arrow
 * keys read one frame; Home and End jump to the ends. GoldTable holds every frame.
 */
export function GoldChart({ points, testId = "gold-chart" }: { points: GoldPoint[]; testId?: string }) {
  const box = React.useRef<HTMLDivElement>(null);
  const [W, setW] = React.useState(640);
  const [at, setAt] = React.useState<number | null>(null);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  React.useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = W < 480 ? 150 : 180;
  const pad = { l: 48, r: 10, t: 8, b: 20 };
  const end = Math.max(1, points[points.length - 1]!.minute);
  const extent = Math.max(0, ...points.map((p) => Math.abs(p.diff)));
  const step = extent > 8000 ? 5000 : extent > 3000 ? 2000 : 1000;
  const max = Math.max(1000, Math.ceil(extent / step) * step);
  const x = (minute: number) => pad.l + ((W - pad.l - pad.r) * minute) / end;
  const y = (v: number) => pad.t + ((H - pad.t - pad.b) * (max - v)) / (2 * max);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(p.minute).toFixed(1)},${y(p.diff).toFixed(1)}`).join("");
  const area = `${line}L${x(points[points.length - 1]!.minute).toFixed(1)},${y(0).toFixed(1)}L${x(points[0]!.minute).toFixed(1)},${y(0).toFixed(1)}Z`;
  const ticks = H >= 180 ? [max, max / 2, 0, -max / 2, -max] : [max, 0, -max];
  const every = W < 480 ? 10 : 5;
  // From the first mark after the start: "0:00" would meet the lowest value's label in the corner.
  const minutes = Array.from({ length: Math.floor(end / every) }, (_, i) => (i + 1) * every).filter((m) => x(m) <= W - pad.r - 12);
  const pick = (clientX: number, rect: DOMRect) => {
    const minute = ((((clientX - rect.left) / rect.width) * W - pad.l) / (W - pad.l - pad.r)) * end;
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(p.minute - minute) < Math.abs(points[best]!.minute - minute)) best = i;
    });
    setAt(best);
  };
  const hover = at === null ? null : points[at]!;
  return (
    <figure className="min-w-0" data-testid={testId}>
      <figcaption id={`${uid}-cap`} className="mb-1.5 text-xs text-fg-muted">
        Gold difference between the teams (your team minus theirs)
      </figcaption>
      <div className="relative" ref={box}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full touch-pan-y select-none rounded focus-visible:outline-2 focus-visible:outline-accent"
          role="img"
          aria-labelledby={`${uid}-cap`}
          aria-describedby={`${uid}-readout`}
          tabIndex={0}
          onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
          onPointerDown={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
          onPointerLeave={() => setAt(null)}
          onBlur={() => setAt(null)}
          onKeyDown={(e) => {
            const last = points.length - 1;
            const next = e.key === "ArrowRight" ? Math.min(last, (at ?? -1) + 1) : e.key === "ArrowLeft" ? Math.max(0, (at ?? last + 1) - 1) : e.key === "Home" ? 0 : e.key === "End" ? last : null;
            if (next === null) return;
            e.preventDefault();
            setAt(next);
          }}
          data-testid={`${testId}-svg`}
        >
          <defs>
            <clipPath id={`${uid}-above`}>
              <rect x={0} y={0} width={W} height={y(0)} />
            </clipPath>
            <clipPath id={`${uid}-below`}>
              <rect x={0} y={y(0)} width={W} height={H - y(0)} />
            </clipPath>
          </defs>
          {ticks.map((v) => (
            <line key={v} x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className={v === 0 ? "stroke-fg-subtle/70" : "stroke-border/50"} strokeWidth={1} />
          ))}
          <path d={area} className="fill-blue/15" clipPath={`url(#${uid}-above)`} />
          <path d={area} className="fill-red/15" clipPath={`url(#${uid}-below)`} />
          <path d={line} fill="none" className="stroke-accent" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" data-testid={`${testId}-line`} />
          {hover ? (
            <g aria-hidden>
              <line x1={x(hover.minute)} x2={x(hover.minute)} y1={pad.t} y2={H - pad.b} className="stroke-fg-subtle/60" strokeWidth={1} />
              <circle cx={x(hover.minute)} cy={y(hover.diff)} r={4.5} className="fill-accent stroke-bg-elevated" strokeWidth={2} />
            </g>
          ) : null}
        </svg>
        {/* Axis labels: HTML over the drawing, in the site's text sizes. */}
        {ticks.map((v) => (
          <span key={v} className="pointer-events-none absolute -translate-y-1/2 pr-1.5 text-right text-3xs tabular-nums text-fg-subtle" style={{ left: 0, width: pad.l, top: y(v) }} aria-hidden>
            {v === 0 ? "0" : signedGold(v)}
          </span>
        ))}
        {minutes.map((m) => (
          <span key={m} className="pointer-events-none absolute -translate-x-1/2 text-3xs tabular-nums text-fg-subtle" style={{ left: x(m), top: H - pad.b + 4 }} aria-hidden>
            {m}:00
          </span>
        ))}
      </div>
      <p id={`${uid}-readout`} className={cn("mt-1 min-h-[1.25rem] text-xs tabular-nums", hover ? "text-fg" : "text-fg-subtle")} aria-live="polite" data-testid={`${testId}-readout`}>
        {hover ? (
          <>
            {gameClock(hover.minute)} · {hover.diff === 0 ? "Even" : hover.diff > 0 ? "Your team ahead by " : "The other team ahead by "}
            {hover.diff === 0 ? null : <span className={cn("font-semibold", goldTone(hover.diff))}>{formatCount(Math.abs(hover.diff))}</span>}
            {hover.diff === 0 ? null : " gold"}
          </>
        ) : (
          "Hover, touch or use the arrow keys to read a minute."
        )}
      </p>
    </figure>
  );
}

/** Every frame of the gold difference as a table: the chart's values without hovering, for any reader. */
function GoldTable({ points }: { points: GoldPoint[] }) {
  return (
    <details className="text-xs">
      <summary className="inline-flex min-h-9 cursor-pointer items-center rounded text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11">Every minute as a table</summary>
      <div className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-border">
        <table className="w-full text-xs tabular-nums" data-testid="gold-chart-table">
          <caption className="sr-only">Gold difference at every frame, your team minus the other team</caption>
          <thead className="sticky top-0 bg-surface text-fg-subtle">
            <tr>
              <th scope="col" className="px-3 py-1 text-left font-medium">
                Time
              </th>
              <th scope="col" className="px-3 py-1 text-right font-medium">
                Difference
              </th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.minute} className="border-t border-border/60">
                <td className="px-3 py-1 text-fg-muted">{gameClock(p.minute)}</td>
                <td className={cn("px-3 py-1 text-right font-medium", goldTone(p.diff))}>{signedGold(p.diff)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
