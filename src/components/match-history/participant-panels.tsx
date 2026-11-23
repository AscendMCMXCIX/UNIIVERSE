"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import type { MatchTimelineResult, TimelinePlayerView } from "@/server/accounts/match-timeline";
import type { RunePage } from "@/server/players/match-history";
import { maxOrder, shopVisits, skillGrid, SKILL_KEYS } from "@/domain/build-path";
import { segmentClass, segmentedGroupClass } from "@/components/ui/segmented";
import { cn } from "@/lib/cn";
import { IconImg } from "./icon-img";
import { gameClock } from "./match-format";

/*
  Build Path | Skill Order | Runes: three segmented headings above the lane, for the player being
  inspected (docs/DESIGN_SYSTEM.md, "The post-game view"). One shows at a time; the choice stays
  while another player is inspected. The build path and skill order read the stored timeline (one
  answer per opened game, every player's in it), the runes the game's record. A game without a
  timeline says so in one plain line; nothing is filled in from the final items.
*/

export type PanelKey = "build" | "skills" | "runes";
const PANELS: Array<{ key: PanelKey; label: string }> = [
  { key: "build", label: "Build Path" },
  { key: "skills", label: "Skill Order" },
  { key: "runes", label: "Runes" },
];

/** A plain line in the panel's place: why there is nothing to show. */
function Unavailable({ children, testId = "panel-unavailable" }: { children: React.ReactNode; testId?: string }) {
  return (
    <p className="text-xs text-fg-muted" data-testid={testId}>
      {children}
    </p>
  );
}

/** Why the timeline cannot give a build path or a skill order, in the page's words. */
function timelineWords(result: MatchTimelineResult | null, entry: TimelinePlayerView | null): string | null {
  if (!result) return null;
  if (result.status !== "ok") return "Timeline not available for this game, so its build path and skill order are not shown.";
  if (!entry) return "This player is not in the stored timeline of this game.";
  return null;
}

function BuildPath({ entry, sales, kinds }: { entry: TimelinePlayerView; sales: boolean; kinds: boolean }) {
  if (!entry.path.length) return <Unavailable>No purchases recorded for this player.</Unavailable>;
  const visits = shopVisits(entry.path);
  return (
    <div className="space-y-1.5">
      <ol className="flex flex-wrap items-start gap-x-0.5 gap-y-1.5" aria-label="Purchases and sales, in order" data-testid="build-path">
        {visits.map((visit, i) => (
          <li key={i} className="flex items-start gap-0.5" data-testid="build-visit">
            <span className="flex flex-col items-center gap-0.5">
              <span className="flex items-end gap-0.5 rounded-md bg-black/25 p-0.5">
                {visit.map((x, k) => (
                  <span key={k} className="relative" data-testid="build-item" data-kind={x.kind} data-done={x.done || undefined} data-minor={x.minor || undefined}>
                    <IconImg
                      icon={x.url ? { url: x.url, name: x.name } : null}
                      size={x.minor ? 18 : 24}
                      className={cn(x.kind === "sell" && "opacity-45 grayscale", x.done && x.kind === "buy" && "ring-2 ring-fg/80", x.minor && "opacity-75")}
                    />
                    {x.kind === "sell" ? (
                      <span className="absolute -right-0.5 -top-1 rounded-sm bg-bg px-0.5 text-4xs font-semibold leading-3 text-fg-muted" aria-hidden>
                        −
                      </span>
                    ) : null}
                    <span className="sr-only">
                      {x.url ? "" : x.name}
                      {x.kind === "sell" ? ", sold" : x.done ? ", completed" : ""}
                    </span>
                  </span>
                ))}
              </span>
              <span className="text-2xs tabular-nums leading-3 text-fg-subtle">{gameClock(visit[0]!.ms)}</span>
            </span>
            {i < visits.length - 1 ? <ChevronRight className="mt-2 h-3 w-3 shrink-0 text-fg-subtle/70" aria-hidden /> : null}
          </li>
        ))}
      </ol>
      <p className="text-2xs text-fg-subtle" data-testid="build-legend">
        {kinds ? "Ringed: completed item. Smaller: consumables and wards. " : ""}
        {sales ? "Faded with −: sold. " : "Sales were not recorded for this game. "}
        Undone purchases are left out.
      </p>
    </div>
  );
}

function SkillOrder({ entry }: { entry: TimelinePlayerView }) {
  const grid = skillGrid(entry.skills);
  if (!grid.levels) return <Unavailable>No skill points recorded for this player.</Unavailable>;
  const max = maxOrder(entry.skills);
  // One grid of every level where the panel is wide enough, else two of nine levels each.
  const table = (from: number, to: number, className: string) => (
    <table className={cn("w-full table-fixed border-separate border-spacing-0.5 text-center text-2xs tabular-nums", className)}>
      <thead>
        <tr>
          <th scope="col" className="w-5 font-normal">
            <span className="sr-only">Skill</span>
          </th>
          {Array.from({ length: to - from + 1 }, (_, i) => (
            <th key={i} scope="col" className="font-normal text-fg-subtle">
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
                <td key={i} className={cn("h-5 rounded-sm", taken ? (k === "R" ? "bg-accent-2/35 font-semibold text-fg" : "bg-fg/15 font-semibold text-fg") : "bg-surface-3/40")}>
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
    <div className="@container/sk space-y-1" data-testid="skill-grid" data-levels={grid.levels}>
      <div className="hidden @min-[26rem]/sk:block">{table(1, 18, "")}</div>
      <div className="space-y-1 @min-[26rem]/sk:hidden">
        {table(1, 9, "")}
        {table(10, 18, "")}
      </div>
      <p className="text-2xs text-fg-subtle">
        {max.length ? <>Maxed {max.join(" → ")}. </> : null}
        {grid.levels < 18 ? `${grid.levels} skill points in this game.` : "All 18 skill points."}
      </p>
    </div>
  );
}

function Runes({ page }: { page: RunePage | null }) {
  if (!page) return <Unavailable>This game&apos;s rune page was not stored (older records keep only the keystone and the paths).</Unavailable>;
  const rune = (r: RunePage["primary"][number], big = false) => (
    <li key={r.name} className="flex min-w-0 items-center gap-1.5">
      <IconImg icon={r} size={big ? 28 : 22} rounded="rounded-full" className="bg-black/35" />
      <span className={cn("min-w-0 truncate text-xs", big ? "font-semibold text-fg" : "text-fg-muted")}>{r.name}</span>
    </li>
  );
  const tree = (icon: RunePage["primaryTree"], fallback: string) => (
    <span className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-label text-fg-subtle">
      <IconImg icon={icon} size={16} rounded="rounded-full" />
      {icon?.name ?? fallback}
    </span>
  );
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5" data-testid="rune-page">
      <section aria-label={`Primary path: ${page.primaryTree?.name ?? "not recorded"}`} className="min-w-0 space-y-1">
        {tree(page.primaryTree, "Primary")}
        <ul className="space-y-0.5">{page.primary.map((r, i) => rune(r, i === 0))}</ul>
      </section>
      <section aria-label={`Secondary path: ${page.secondaryTree?.name ?? "not recorded"}`} className="min-w-0 space-y-1">
        {tree(page.secondaryTree, "Secondary")}
        <ul className="space-y-0.5">{page.secondary.map((r) => rune(r))}</ul>
        {page.shards.length ? (
          <div className="space-y-0.5 pt-0.5" data-testid="rune-shards">
            <span className="block text-2xs font-semibold uppercase tracking-label text-fg-subtle">Shards</span>
            <span className="flex items-center gap-1" role="group" aria-label="Stat shards">
              {page.shards.map((r, i) => (
                <IconImg key={i} icon={r} size={18} rounded="rounded-full" className="bg-black/35" />
              ))}
            </span>
          </div>
        ) : null}
      </section>
    </div>
  );
}

/** The three headings and the one chosen, for the player inspected (`entry`: their timeline; `page`: their rune page). */
export function ParticipantPanels({ panel, onPanel, result, entry, page }: { panel: PanelKey; onPanel: (p: PanelKey) => void; result: MatchTimelineResult | null; entry: TimelinePlayerView | null; page: RunePage | null }) {
  const uid = React.useId();
  const tl = result?.status === "ok" ? result.timeline : null;
  const missing = panel !== "runes" ? timelineWords(result, entry) : null;
  return (
    <section aria-labelledby={`${uid}-h`} className="space-y-2 rounded-lg bg-surface px-3 py-2" data-testid="participant-panels" data-panel={panel}>
      <h3 id={`${uid}-h`} className="sr-only">
        {PANELS.find((p) => p.key === panel)!.label}
      </h3>
      <div role="radiogroup" aria-label="Show the build path, the skill order or the runes" className={segmentedGroupClass()} data-testid="panel-tabs">
        {PANELS.map((p) => (
          <button key={p.key} type="button" role="radio" aria-checked={panel === p.key} onClick={() => onPanel(p.key)} className={segmentClass(panel === p.key)} data-testid={`panel-${p.key}`}>
            {p.label}
          </button>
        ))}
      </div>
      {/* As tall as the tallest of the three on most games, so the lane under it stays put as they switch. */}
      <div className="min-h-28" data-testid="panel-body">
        {panel === "runes" ? (
          <Runes page={page} />
        ) : !result ? (
          <div role="status" className="h-12 animate-pulse rounded-md bg-surface-2 motion-reduce:animate-none">
            <span className="sr-only">Loading the timeline</span>
          </div>
        ) : missing ? (
          <Unavailable testId="panel-timeline-missing">{missing}</Unavailable>
        ) : panel === "build" ? (
          <BuildPath entry={entry!} sales={!!tl?.sales} kinds={!!tl?.itemKinds} />
        ) : (
          <SkillOrder entry={entry!} />
        )}
      </div>
    </section>
  );
}
