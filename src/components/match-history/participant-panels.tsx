"use client";

import * as React from "react";
import type { MatchTimelineResult, TimelinePlayerView } from "@/server/accounts/match-timeline";
import type { RunePage } from "@/server/players/match-history";
import { buildItemKind, shopVisits, skillGrid, SKILL_KEYS } from "@/domain/build-path";
import { segmentClass, segmentedGroupClass } from "@/components/ui/segmented";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/cn";
import { IconImg } from "./icon-img";
import { gameClock } from "./match-format";

/*
  Build Path | Skill Order | Runes: one segmented control (the shared segmentedGroupClass and
  segmentClass) over one area of a fixed height, for the player being inspected
  (docs/DESIGN_SYSTEM.md, "The post-game view"). One shows at a time; the choice stays while
  another player is inspected, and switching never moves what is under it: the area is as tall as
  the tallest of the three (the skill grid's four rows, or the rune page) at every width.

  The build path is a wrapping timeline in game order: each shop visit its items over its game time.
  Nothing scrolls and nothing is cut (the owner's brief of 24 Nov 2026, §2 and §4): where a long
  game's visits need more rows than the area has, the path is split into pages of whole rows, with
  page buttons under it (the same segmented control), so every purchase is one press away. The skill
  order is the grid alone; the rune page two paths and the shards. A game without a timeline says so
  in a quiet phrase; nothing is filled in from the final items.
*/

export type PanelKey = "build" | "skills" | "runes";
const PANELS: Array<{ key: PanelKey; label: string }> = [
  { key: "build", label: "Build Path" },
  { key: "skills", label: "Skill Order" },
  { key: "runes", label: "Runes" },
];

/** A quiet phrase in the panel's place: why there is nothing to show. */
function Unavailable({ children, testId = "panel-unavailable" }: { children: React.ReactNode; testId?: string }) {
  return (
    <p className="text-xs text-fg-subtle" data-testid={testId}>
      {children}
    </p>
  );
}

/** Why the timeline cannot give a build path or a skill order, in a phrase. */
function timelineWords(result: MatchTimelineResult | null, entry: TimelinePlayerView | null): string | null {
  if (!result) return null;
  if (result.status !== "ok") return "Timeline not available for this game";
  if (!entry) return "Not in this game's stored timeline";
  return null;
}

const KIND_WORDS = { done: "completed item", part: "component", minor: "consumable", sell: "sold" } as const;

/**
 * The build path, wrapped in game order. Measured once at each width: the visits are laid out
 * whole; if their rows are taller than the area (`room`, the panel body's fixed height), they are
 * split into pages of whole rows (a page starts a row, so a page shown alone wraps exactly as it
 * did measured). Hidden pages stay in the page (`hidden`), so every purchase is in the document.
 */
function BuildPath({ entry, kinds, items }: { entry: TimelinePlayerView; kinds: boolean; items: Record<string, { name: string; url: string | null }> }) {
  const visits = React.useMemo(() => shopVisits(entry.path.map((x) => ({ ...x, name: items[String(x.id)]?.name ?? `Item ${x.id}`, url: items[String(x.id)]?.url ?? null }))), [entry.path, items]);
  const box = React.useRef<HTMLDivElement>(null);
  const list = React.useRef<HTMLOListElement>(null);
  const [width, setWidth] = React.useState(0);
  const [layout, setLayout] = React.useState<{ width: number; rowOf: number[]; rows: number; perPage: number } | null>(null);
  const [page, setPage] = React.useState(0);
  React.useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    setWidth(Math.round(el.clientWidth));
    const ro = new ResizeObserver(() => setWidth(Math.round(el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const measuring = !layout || layout.width !== width;
  const roomOf = () => {
    const body = box.current?.closest<HTMLElement>("[data-testid=panel-body]");
    return body ? parseFloat(getComputedStyle(body).minHeight) || body.clientHeight : 0;
  };
  React.useLayoutEffect(() => {
    const ol = list.current;
    if (!measuring || !ol || !width) return;
    const lis = [...ol.children] as HTMLElement[];
    const room = roomOf();
    const gap = parseFloat(getComputedStyle(ol).rowGap) || 0;
    // Each visit's row, by its top.
    const tops = [...new Set(lis.map((li) => li.offsetTop))].sort((a, b) => a - b);
    const rowOf = lis.map((li) => tops.indexOf(li.offsetTop));
    const rowHeight = Math.max(...lis.map((li) => li.offsetHeight), 1);
    let perPage = tops.length;
    if (ol.offsetHeight > room + 0.5) {
      // The page buttons under the path take about a field's height (44px by touch); checked once drawn, below.
      const pager = (window.matchMedia("(pointer: coarse)").matches ? 44 : 36) + 6;
      perPage = Math.max(1, Math.floor((room - pager + gap) / (rowHeight + gap)));
    }
    setLayout({ width, rowOf, rows: tops.length, perPage });
    setPage(0);
  }, [measuring, width, visits]);
  // Drawn in pages, the path and its buttons must still fit the area: one row fewer a page until they do.
  React.useLayoutEffect(() => {
    const el = box.current;
    if (measuring || !layout || !el || layout.perPage >= layout.rows || layout.perPage <= 1) return;
    if (el.offsetHeight > roomOf() + 0.5) setLayout({ ...layout, perPage: layout.perPage - 1 });
  }, [measuring, layout, page]);
  const pageOf = !measuring && layout ? layout.rowOf.map((r) => Math.floor(r / layout.perPage)) : null;
  if (!entry.path.length) return <Unavailable>No purchases recorded</Unavailable>;
  const pages = !measuring && layout ? Math.max(1, Math.ceil(layout.rows / layout.perPage)) : 1;
  return (
    <div ref={box} className="space-y-1.5" data-testid="build-path-box" data-pages={pages} data-page={Math.min(page, pages - 1)}>
      <ol ref={list} className="flex flex-wrap items-start gap-x-2.5 gap-y-1" aria-label={pages > 1 ? `Purchases and sales, in order: page ${Math.min(page, pages - 1) + 1} of ${pages}` : "Purchases and sales, in order"} data-testid="build-path" data-path={entry.path.length}>
        {visits.map((visit, i) => (
          <li key={i} className="flex flex-col items-start gap-0.5" hidden={pageOf ? pageOf[i] !== Math.min(page, pages - 1) : undefined} data-testid="build-visit">
            <span className="flex items-end gap-0.5">
              {visit.map((x, k) => {
                const kind = buildItemKind(x, kinds);
                return (
                  <span key={k} className="relative" data-testid="build-item" data-kind={x.kind} data-done={x.done || undefined} data-minor={x.minor || undefined}>
                    <IconImg
                      icon={x.url ? { url: x.url, name: x.name } : null}
                      size={kind === "minor" ? 16 : 22}
                      className={cn(kind === "sell" && "opacity-40 grayscale", kind === "done" && "ring-2 ring-fg/75", kind === "minor" && "opacity-80")}
                    />
                    {kind === "sell" ? (
                      <span className="absolute -right-0.5 -top-1 rounded-sm bg-bg px-0.5 text-4xs font-semibold leading-3 text-fg-muted" aria-hidden>
                        −
                      </span>
                    ) : null}
                    <span className="sr-only">
                      {x.url ? "" : x.name}
                      {kind ? `, ${KIND_WORDS[kind]}` : ""}
                    </span>
                  </span>
                );
              })}
            </span>
            <span className="text-2xs tabular-nums leading-3 text-fg-subtle">{gameClock(visit[0]!.ms)}</span>
          </li>
        ))}
      </ol>
      {pages > 1 ? (
        <div role="group" aria-label="Pages of the build path" className={segmentedGroupClass("flex-wrap")} data-testid="build-pages">
          {Array.from({ length: pages }, (_, p) => (
            <button key={p} type="button" aria-pressed={p === Math.min(page, pages - 1)} aria-label={`Page ${p + 1} of ${pages}`} onClick={() => setPage(p)} className={segmentClass(p === Math.min(page, pages - 1), { className: "min-w-8 tabular-nums" })} data-testid="build-page">
              {p + 1}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SkillOrder({ entry }: { entry: TimelinePlayerView }) {
  const grid = skillGrid(entry.skills);
  if (!grid.levels) return <Unavailable>No skill points recorded</Unavailable>;
  // One grid of every level where the panel is wide enough, else two of nine levels each. Nothing
  // under it: the order each skill was maxed and the points taken are read from the grid itself.
  const table = (from: number, to: number) => (
    <table className="w-full table-fixed border-separate border-spacing-0.5 text-center text-2xs tabular-nums">
      <thead>
        <tr>
          <th scope="col" className="w-5 font-normal">
            <span className="sr-only">Skill</span>
          </th>
          {Array.from({ length: to - from + 1 }, (_, i) => (
            <th key={i} scope="col" className="pb-px font-normal leading-4 text-fg-subtle">
              <span className="sr-only">Level </span>
              {from + i}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {SKILL_KEYS.map((k) => (
          <tr key={k}>
            <th scope="row" className="text-left text-xs font-semibold text-fg-muted">
              {k}
            </th>
            {Array.from({ length: to - from + 1 }, (_, i) => {
              const level = from + i;
              const taken = grid.rows[k].includes(level);
              return (
                <td key={i} className={cn("h-5 rounded-sm leading-5", taken ? (k === "R" ? "bg-accent-2/40 font-semibold text-fg" : "bg-fg/20 font-semibold text-fg") : "bg-surface-3/50")}>
                  {taken ? k : <span className="sr-only">—</span>}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
  return (
    <div className="@container/sk" data-testid="skill-grid" data-levels={grid.levels}>
      <div className="hidden @min-[20rem]/sk:block">{table(1, 18)}</div>
      <div className="space-y-1 @min-[20rem]/sk:hidden">
        {table(1, 9)}
        {table(10, 18)}
      </div>
    </div>
  );
}

function Runes({ page }: { page: RunePage | null }) {
  if (!page) return <Unavailable>Rune page not stored for this game</Unavailable>;
  const rune = (r: RunePage["primary"][number], big = false) => (
    <li key={r.name} className="flex min-w-0 items-center gap-2">
      <IconImg icon={r} size={big ? 20 : 18} rounded="rounded-full" className="bg-black/35" />
      <span className={cn("min-w-0 truncate text-xs leading-5", big ? "font-semibold text-fg" : "text-fg-muted")}>{r.name}</span>
    </li>
  );
  const tree = (icon: RunePage["primaryTree"], fallback: string) => (
    <span className="flex items-center gap-1.5 text-2xs font-semibold uppercase leading-4 tracking-label text-fg-subtle">
      <IconImg icon={icon} size={14} rounded="rounded-full" />
      {icon?.name ?? fallback}
    </span>
  );
  return (
    <div className="grid grid-cols-2 gap-x-4" data-testid="rune-page">
      <section aria-label={`Primary path: ${page.primaryTree?.name ?? "not recorded"}`} className="min-w-0 space-y-1">
        {tree(page.primaryTree, "Primary")}
        <ul className="space-y-0.5">{page.primary.map((r, i) => rune(r, i === 0))}</ul>
      </section>
      <section aria-label={`Secondary path: ${page.secondaryTree?.name ?? "not recorded"}`} className="min-w-0 space-y-1">
        {tree(page.secondaryTree, "Secondary")}
        <ul className="space-y-0.5">{page.secondary.map((r) => rune(r))}</ul>
        {page.shards.length ? (
          <span className="flex items-center gap-1 pt-1" role="group" aria-label="Stat shards" data-testid="rune-shards">
            {page.shards.map((r, i) => (
              <IconImg key={i} icon={r} size={16} rounded="rounded-full" className="bg-black/35" />
            ))}
          </span>
        ) : null}
      </section>
    </div>
  );
}

/** The build path's one explanation: its marks, and what it leaves out. */
function buildTip(kinds: boolean, sales: boolean): string {
  const marks = kinds ? "Ringed: completed item; small: consumables and wards; faded with a minus: sold." : "Faded with a minus: sold.";
  return sales ? `${marks} Undone purchases are left out.` : "Sales were not recorded for this game. Undone purchases are left out.";
}

/** The control and the one panel chosen, for the player inspected (`entry`: their timeline; `page`: their rune page). */
export function ParticipantPanels({ panel, onPanel, result, entry, page }: { panel: PanelKey; onPanel: (p: PanelKey) => void; result: MatchTimelineResult | null; entry: TimelinePlayerView | null; page: RunePage | null }) {
  const tl = result?.status === "ok" ? result.timeline : null;
  const missing = panel !== "runes" ? timelineWords(result, entry) : null;
  return (
    // Named by the view shown, without a heading element: the post-game view has no headings of its own above it (axe's heading order).
    <section aria-label={PANELS.find((p) => p.key === panel)!.label} className="@container/pp min-w-0 space-y-1.5" data-testid="participant-panels" data-panel={panel}>
      <div className="flex min-h-8 items-center justify-between gap-2 pointer-coarse:min-h-11">
        <div role="radiogroup" aria-label="Show the build path, the skill order or the runes" className={segmentedGroupClass("flex-wrap")} data-testid="panel-tabs">
          {PANELS.map((p) => (
            // One stop in the tab order, the chosen view; ← → (↑ ↓) choose the next, as radios do.
            <button
              key={p.key}
              type="button"
              role="radio"
              aria-checked={panel === p.key}
              tabIndex={panel === p.key ? 0 : -1}
              onClick={() => onPanel(p.key)}
              onKeyDown={(e) => {
                const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
                if (!step) return;
                e.preventDefault();
                const next = PANELS[(PANELS.findIndex((x) => x.key === p.key) + step + PANELS.length) % PANELS.length]!;
                onPanel(next.key);
                (e.currentTarget.parentElement?.querySelector(`[data-testid=panel-${next.key}]`) as HTMLElement | null)?.focus();
              }}
              className={segmentClass(panel === p.key)}
              data-testid={`panel-${p.key}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {panel === "build" && tl && entry?.path.length ? <InfoTip label="About the build path" testId="build-info" text={buildTip(!!tl.itemKinds, !!tl.sales)} /> : null}
      </div>
      {/* One height for the three, at every width (the skill grid's or the rune page's, whichever is taller): switching never moves what is under it. */}
      <div className="min-h-54 @min-[20rem]/pp:min-h-28" data-testid="panel-body">
        {panel === "runes" ? (
          <Runes page={page} />
        ) : !result ? (
          <div role="status" className="h-12 animate-pulse rounded-md bg-surface-2 motion-reduce:animate-none">
            <span className="sr-only">Loading the timeline</span>
          </div>
        ) : missing ? (
          <Unavailable testId="panel-timeline-missing">{missing}</Unavailable>
        ) : panel === "build" ? (
          <BuildPath key={entry!.slot} entry={entry!} kinds={!!tl?.itemKinds} items={tl?.items ?? {}} />
        ) : (
          <SkillOrder entry={entry!} />
        )}
      </div>
    </section>
  );
}
