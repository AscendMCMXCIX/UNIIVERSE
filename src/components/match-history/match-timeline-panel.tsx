"use client";

import * as React from "react";
import { X } from "lucide-react";
import { goldStory, LEAD_MIN, type GoldPoint } from "@/domain/match-analysis";
import { eventsBetween, goldSwings, lanesFor, mergeGrubs, objectiveLabel, objectiveLegend, OBJECTIVE_MARK, type EventsInWindow, type ObjectiveKind, type TimelineEventsView } from "@/domain/match-events";
import type { MatchTimelineResult } from "@/server/accounts/match-timeline";
import { InfoTip } from "@/components/ui/info-tip";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/cn";

/*
  The game minute by minute: the two teams' gold difference from the player's side, from Riot's
  match timeline (loaded when this section first opens; see getMatchTimeline), with the kills and
  objectives where they happened. Above the zero line the player's team had more gold. The curve is
  described in figures only (the largest lead and deficit, the end, when a clear lead changed
  sides), and its largest swings are listed with what happened in the same minutes, side by side:
  nothing says one caused the other.
*/

export const signedGold = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${formatCount(Math.abs(n))}`;

/** Minutes into the game as a clock: 12.5 → "12:30". */
export function gameClock(minute: number): string {
  const s = Math.max(0, Math.round(minute * 60));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const goldTone = (n: number) => (Math.abs(n) < 1 ? "text-fg-muted" : n > 0 ? "text-good" : "text-bad");

/** "your team" / "the other team", for an objective. */
const sideWords = (own: boolean) => (own ? "your team" : "the other team");

export function TimelinePanel({ result }: { result: MatchTimelineResult | null }) {
  if (!result) return <div className="h-56 animate-pulse rounded-panel bg-surface-2 motion-reduce:animate-none" aria-busy="true" aria-label="Loading the timeline" data-testid="timeline-loading" />;
  if (result.status !== "ok")
    return (
      <p className="rounded-panel border border-dashed border-border p-3 text-sm text-fg-muted" data-testid="timeline-message">
        {result.message}
      </p>
    );
  const { gold, goldNote, events, eventsNote } = result.timeline;
  const story = gold ? goldStory(gold) : null;
  const swings = gold ? goldSwings(gold) : [];
  return (
    <div className="space-y-3" data-testid="match-timeline">
      {gold && story ? (
        <>
          <GoldChart points={gold} events={events} />
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
          {events && swings.length ? <Swings swings={swings} events={events} /> : null}
          <GoldTable points={gold} />
        </>
      ) : (
        <p className="rounded-panel border border-dashed border-border p-3 text-sm text-fg-muted" data-testid="gold-missing" data-reason={goldNote ?? undefined}>
          {goldNote === "contradicts"
            ? "This game's timeline and its record disagree about which team had more gold at the end, so the gold difference and the lane figures are not shown. The scoreboard and Analysis read the record."
            : "The gold difference needs every player's figures in the timeline, and this game's timeline does not hold them all (a removed player, or figures Riot did not send), so it is not drawn."}
        </p>
      )}
      {events ? (
        <EventList events={events} />
      ) : (
        <p className="text-xs text-fg-muted" data-testid="events-note">
          {eventsNote ?? "Riot does not provide the kills and objectives of this game, so they are not marked."}
        </p>
      )}
    </div>
  );
}

/** "your team 3 kills, theirs 1": each team's kills, the player's team first. */
const teamKillWords = (own: number, enemy: number) => `your team ${own} ${own === 1 ? "kill" : "kills"}, theirs ${enemy}`;

/** One line about a window of the game: the kills, the objectives taken and the player's own kills and deaths, in words. */
function windowWords(w: EventsInWindow): string {
  const parts: string[] = [];
  if (w.kills && (w.kills.own || w.kills.enemy)) parts.push(teamKillWords(w.kills.own, w.kills.enemy));
  for (const o of w.objectives) parts.push(`${objectiveLabel(o)} for ${sideWords(o.own)}`);
  if (w.you && (w.you.kills || w.you.deaths)) parts.push(`you: ${[w.you.kills ? `${w.you.kills} ${w.you.kills === 1 ? "kill" : "kills"}` : null, w.you.deaths ? `${w.you.deaths} ${w.you.deaths === 1 ? "death" : "deaths"}` : null].filter(Boolean).join(", ")}`);
  return parts.length ? parts.join(" · ") : "no kill or objective recorded";
}

/** The largest moves of the gold difference, each with what happened in the same minutes. */
function Swings({ swings, events }: { swings: ReturnType<typeof goldSwings>; events: TimelineEventsView }) {
  const id = React.useId();
  return (
    <section className="space-y-1.5" aria-labelledby={id} data-testid="gold-swings">
      <h4 id={id} className="flex items-center gap-1.5 text-xs font-semibold text-fg">
        Largest swings
        <InfoTip label="About the swings" text="The three largest moves of the gold difference over about three minutes (1,500 gold or more), each with the kills and objectives recorded in those minutes. They are listed side by side: the page does not say what caused a swing." />
      </h4>
      <ol className="space-y-1">
        {swings.map((s) => {
          const change = s.end - s.start;
          return (
            <li key={s.from} className="text-xs leading-snug" data-testid="gold-swing">
              <span className="tabular-nums text-fg-muted">
                {gameClock(s.from)}–{gameClock(s.to)}
              </span>{" "}
              <span className={cn("font-semibold tabular-nums", goldTone(change))}>{signedGold(change)}</span>{" "}
              <span className="text-fg-subtle">
                ({signedGold(s.start)} to {signedGold(s.end)})
              </span>
              <span className="block text-fg-muted" data-testid="gold-swing-events">
                In those minutes: {windowWords(eventsBetween(events, s.from, s.to))}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

type EventMark = { kind: ObjectiveKind; own: boolean } | "kill" | "assist" | "death";

/** The chart's mark for an event: an objective's letter in its team's colour, a dot for the player's kill, a ring for an assist, a cross for a death. */
function EventMarkIcon({ mark }: { mark: EventMark }) {
  if (mark === "kill") return <span className="h-2 w-2 rounded-full bg-good" />;
  if (mark === "assist") return <span className="h-2 w-2 rounded-full border-[1.5px] border-good" />;
  if (mark === "death") return <X className="h-3 w-3 text-bad" strokeWidth={3} />;
  return <span className={cn("grid h-4 w-4 place-items-center rounded text-3xs font-bold leading-none", mark.own ? "bg-blue/20 text-blue" : "bg-red/20 text-red")}>{OBJECTIVE_MARK[mark.kind]}</span>;
}

/** Every objective and the player's own kills, assists and deaths, in order: the markers in words. */
function EventList({ events }: { events: TimelineEventsView }) {
  type Row = { minute: number; what: string; side: "own" | "enemy" | "you"; mark: EventMark; key: string };
  const rows: Row[] = [
    ...mergeGrubs(events.objectives).map((o, i): Row => ({ minute: o.minute, what: objectiveLabel(o), side: o.own ? "own" : "enemy", mark: { kind: o.kind, own: o.own }, key: `o${i}` })),
    ...(events.you
      ? [
          ...events.you.kills.map((m, i): Row => ({ minute: m, what: "Your kill", side: "you", mark: "kill", key: `k${i}` })),
          ...events.you.assists.map((m, i): Row => ({ minute: m, what: "Your assist", side: "you", mark: "assist", key: `a${i}` })),
          ...events.you.deaths.map((m, i): Row => ({ minute: m, what: "Your death", side: "you", mark: "death", key: `d${i}` })),
        ]
      : []),
  ].sort((a, b) => a.minute - b.minute);
  const kills = events.kills;
  return (
    <details className="text-xs" data-testid="timeline-events-list">
      <summary className="inline-flex min-h-9 cursor-pointer items-center rounded text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11">
        {/* One run of text, so it wraps as a sentence on a phone. */}
        <span>
          Every objective, and your kills, assists and deaths
          {kills ? <span className="tabular-nums text-fg-subtle"> ({teamKillWords(kills.own.length, kills.enemy.length)})</span> : null}
        </span>
      </summary>
      {/* On a touch screen the table runs with the page: a box that scrolls inside the page would catch the finger. */}
      <div className="mt-1 rounded-lg border border-border pointer-fine:max-h-64 pointer-fine:overflow-y-auto">
        <table className="w-full text-xs" data-testid="timeline-events-table">
          <caption className="sr-only">Objectives taken by each team and your kills, assists and deaths, in game time order</caption>
          <thead className="bg-surface text-fg-subtle pointer-fine:sticky pointer-fine:top-0">
            <tr>
              <th scope="col" className="px-3 py-1 text-left font-medium">
                Time
              </th>
              <th scope="col" className="px-3 py-1 text-left font-medium">
                Event
              </th>
              <th scope="col" className="px-3 py-1 text-left font-medium">
                Team
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-border/60" data-side={r.side}>
                <td className="px-3 py-1 tabular-nums text-fg-muted">{gameClock(r.minute)}</td>
                <td className="px-3 py-1 text-fg">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="grid w-4 shrink-0 place-items-center" aria-hidden>
                      <EventMarkIcon mark={r.mark} />
                    </span>
                    {r.what}
                  </span>
                </td>
                <td className={cn("px-3 py-1", r.side === "own" ? "text-blue" : r.side === "enemy" ? "text-red" : "text-fg-muted")}>{r.side === "own" ? "Your team" : r.side === "enemy" ? "Other team" : "You"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/**
 * The gold difference as one line around zero, washed blue where the player's team was ahead and red
 * where it was behind (the site's colours for a won and a lost game). Drawn at the width it is
 * shown, so the labels keep their size; they are HTML over the drawing. With the game's events: each
 * team's kills as short ticks (the player's team's along the top, the other's along the bottom),
 * and under the curve the objectives each team took and the player's own kills and deaths, at the
 * same scale. Hover, touch or the arrow keys read one frame, with what happened since the frame
 * before; Home and End jump to the ends. The marks under the curve read too: a mark reads the frame
 * that covers it, so its event is in the reading. A touch keeps its reading after the finger
 * lifts (a mouse's ends when it leaves). GoldTable and EventList hold every value in words.
 */
export function GoldChart({ points, events = null, testId = "gold-chart" }: { points: GoldPoint[]; events?: TimelineEventsView | null; testId?: string }) {
  const box = React.useRef<HTMLDivElement>(null);
  const svg = React.useRef<SVGSVGElement>(null);
  const [W, setW] = React.useState(640);
  const [at, setAt] = React.useState<number | null>(null);
  // How the frame was chosen: leaving the chart with the keyboard ends a keyboard reading; a tap under the curve moves the focus but keeps its reading.
  const via = React.useRef<"pointer" | "key">("pointer");
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
  const x = (minute: number) => pad.l + ((W - pad.l - pad.r) * Math.min(end, Math.max(0, minute))) / end;
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
  // A mark reads the first frame at or after its moment (the frame whose "since the minute before" holds it); elsewhere, the nearest frame.
  const read = (e: React.PointerEvent) => {
    via.current = "pointer";
    const mark = (e.target as Element).closest?.("[data-minute]");
    if (mark) {
      const i = points.findIndex((p) => p.minute >= Number(mark.getAttribute("data-minute")));
      setAt(i < 0 ? points.length - 1 : i);
    } else if (svg.current) pick(e.clientX, svg.current.getBoundingClientRect());
  };
  const hover = at === null ? null : points[at]!;
  // What happened since the frame before the one read (or since the start).
  const since = hover && events ? eventsBetween(events, at! > 0 ? points[at! - 1]!.minute : -1, hover.minute) : null;
  const objectives = events ? mergeGrubs(events.objectives) : [];
  const marker = W < 480 ? 14 : 16;
  const placed = lanesFor(
    objectives.map((o) => ({ o, x: x(o.minute) })),
    marker,
  );
  const objectiveRows = placed.length ? Math.max(...placed.map((p) => p.lane)) + 1 : 0;
  const you = events?.you ?? null;
  // The player's kills (dots) and deaths (crosses), 16px rows like before, laid out the same way.
  const yours = you ? lanesFor([...you.kills.map((m) => ({ m, death: false, x: x(m) })), ...you.deaths.map((m) => ({ m, death: true, x: x(m) }))], 12) : [];
  const yourRows = yours.length ? Math.max(...yours.map((p) => p.lane)) + 1 : 0;
  return (
    <figure className="min-w-0" data-testid={testId}>
      <figcaption className="mb-1.5 flex items-start gap-1.5 text-xs text-fg-muted">
        <span id={`${uid}-cap`}>Gold difference between the teams (your team minus theirs){events?.kills ? ", with each team's kills" : ""}</span>
        <InfoTip label="About this chart" text="From Riot's match timeline: the gold is read once per frame (about every minute), the kills and objectives at the moment Riot recorded them. Above the line your team had more gold. Hover or touch the chart or a mark under it to read that minute; on a keyboard, the arrow keys move a minute at a time." />
      </figcaption>
      {/* One pointer area: the curve and the marks under it. A vertical swipe still scrolls the page (and drops the reading). */}
      <div className="touch-pan-y select-none" onPointerDown={read} onPointerMove={read} onPointerLeave={(e) => e.pointerType === "mouse" && setAt(null)} onPointerCancel={() => setAt(null)}>
        <div className="relative" ref={box}>
          <svg
            ref={svg}
            viewBox={`0 0 ${W} ${H}`}
            className="block h-auto w-full rounded focus-visible:outline-2 focus-visible:outline-accent"
            role="img"
            aria-labelledby={`${uid}-cap`}
            aria-describedby={`${uid}-readout`}
            tabIndex={0}
            onBlur={() => via.current === "key" && setAt(null)}
            onKeyDown={(e) => {
              const last = points.length - 1;
              const next = e.key === "ArrowRight" ? Math.min(last, (at ?? -1) + 1) : e.key === "ArrowLeft" ? Math.max(0, (at ?? last + 1) - 1) : e.key === "Home" ? 0 : e.key === "End" ? last : null;
              if (next === null) return;
              e.preventDefault();
              via.current = "key";
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
            {events?.kills ? (
              <g aria-hidden data-testid={`${testId}-kills`} data-own={events.kills.own.length} data-enemy={events.kills.enemy.length}>
                {events.kills.own.map((m, i) => (
                  <line key={`o${i}`} x1={x(m)} x2={x(m)} y1={pad.t} y2={pad.t + 6} className="stroke-blue/70" strokeWidth={1.5} />
                ))}
                {events.kills.enemy.map((m, i) => (
                  <line key={`e${i}`} x1={x(m)} x2={x(m)} y1={H - pad.b - 6} y2={H - pad.b} className="stroke-red/70" strokeWidth={1.5} />
                ))}
              </g>
            ) : null}
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
        {events ? (
          // The same events under the curve, at its scale (in words in the list below; hidden from screen readers here).
          <div className="mt-1 space-y-1" aria-hidden data-testid={`${testId}-events`}>
            {objectives.length ? (
              <div className="relative" style={{ height: objectiveRows * (marker + 2) }} data-testid={`${testId}-objectives`}>
                <span className="absolute left-0 top-0 pr-1.5 text-right text-3xs leading-4 text-fg-subtle" style={{ width: pad.l }}>
                  Objectives
                </span>
                {placed.map(({ o, x: left, lane }, i) => (
                  <span
                    key={i}
                    className={cn("absolute grid -translate-x-1/2 place-items-center rounded text-3xs font-bold leading-none", o.own ? "bg-blue/20 text-blue" : "bg-red/20 text-red")}
                    style={{ left, top: lane * (marker + 2), width: marker, height: marker }}
                    title={`${gameClock(o.minute)} ${objectiveLabel(o)} for ${sideWords(o.own)}`}
                    data-testid="timeline-objective"
                    data-minute={o.minute}
                    data-kind={o.kind}
                    data-own={o.own}
                  >
                    {OBJECTIVE_MARK[o.kind]}
                  </span>
                ))}
              </div>
            ) : null}
            {yours.length ? (
              <div className="relative" style={{ height: yourRows * 16 }} data-testid={`${testId}-you`}>
                <span className="absolute left-0 top-0 pr-1.5 text-right text-3xs leading-4 text-fg-subtle" style={{ width: pad.l }}>
                  You
                </span>
                {yours.map(({ m, death, x: left, lane }, i) =>
                  death ? (
                    <X key={i} className="absolute h-3 w-3 -translate-x-1/2 text-bad" strokeWidth={3} style={{ left, top: lane * 16 + 2 }} data-testid="timeline-you-death" data-minute={m} />
                  ) : (
                    <span key={i} className="absolute h-2 w-2 -translate-x-1/2 rounded-full bg-good" style={{ left, top: lane * 16 + 4 }} title={`${gameClock(m)} your kill`} data-testid="timeline-you-kill" data-minute={m} />
                  ),
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      {events ? (
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-3xs text-fg-subtle" style={{ paddingLeft: pad.l }} aria-hidden>
          <span>
            <span className="text-blue">■</span> your team · <span className="text-red">■</span> the other team
          </span>
          {objectives.length ? <span data-testid={`${testId}-legend`}>{objectiveLegend(objectives)}</span> : null}
          {you ? (
            <span>
              <span className="text-good">●</span> your kill · <span className="text-bad">✕</span> your death
            </span>
          ) : null}
        </p>
      ) : null}
      <p id={`${uid}-readout`} className={cn("mt-1 min-h-[1.25rem] text-xs tabular-nums", hover ? "text-fg" : "text-fg-subtle")} aria-live="polite" data-testid={`${testId}-readout`}>
        {hover ? (
          <>
            {gameClock(hover.minute)} · {hover.diff === 0 ? "Even" : hover.diff > 0 ? "Your team ahead by " : "The other team ahead by "}
            {hover.diff === 0 ? null : <span className={cn("font-semibold", goldTone(hover.diff))}>{formatCount(Math.abs(hover.diff))}</span>}
            {hover.diff === 0 ? null : " gold"}
            {since && (since.objectives.length || since.kills?.own || since.kills?.enemy || since.you?.deaths || since.you?.kills) ? <span className="text-fg-muted"> · since the minute before: {windowWords(since)}</span> : null}
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
      <div className="mt-1 rounded-lg border border-border pointer-fine:max-h-56 pointer-fine:overflow-y-auto">
        <table className="w-full text-xs tabular-nums" data-testid="gold-chart-table">
          <caption className="sr-only">Gold difference at every frame, your team minus the other team</caption>
          <thead className="bg-surface text-fg-subtle pointer-fine:sticky pointer-fine:top-0">
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
