"use client";

import * as React from "react";
import type { Side } from "@/domain/draft";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import { ChampionPortrait } from "@/components/champion-portrait";
import type { PickerChampion } from "@/components/champion-picker";
import { RoleIcon } from "@/components/role-icon";
import { RoleStatusBadge } from "@/components/players/role-status-badge";
import type { AssignmentStatus } from "@/domain/roster";
import { Panel, PanelBody } from "@/components/ui/panel";
import { cn } from "@/lib/cn";

export interface BoardRow {
  role: Role | null;
  label: string;
  sub?: string;
  /** Our rows: Main Role or Off Role for the player in this position (`assignmentStatus`). */
  status?: AssignmentStatus;
  champion: PickerChampion | null;
  active: boolean;
  onClick?: () => void;
  key?: string;
  /** The champion shown is only selected, not locked in yet. */
  preview?: boolean;
}

export interface BoardTeam {
  title: string;
  side: Side;
  bans: Array<PickerChampion | null>;
  rows: BoardRow[];
  ours: boolean;
  identity?: string | null;
  /** Enemy turn: the champion selected for their next pick, shown in that slot until locked. */
  preview?: PickerChampion | null;
}

/**
 * Our row's second line: the position held (never cut short), after the pick also who plays it,
 * then Main Role or Off Role: beside it in the desktop columns, under it on the narrow board.
 */
export function OurSlotLine({ row, stacked = false, className }: { row: Pick<BoardRow, "role" | "label" | "champion" | "status">; stacked?: boolean; className?: string }) {
  return (
    <span className={cn("flex min-w-0 gap-x-1.5 gap-y-0.5 text-xs", stacked ? "flex-col items-start" : "flex-wrap items-center", className)}>
      <span className="flex min-w-0 max-w-full items-center">
        {row.champion ? <span className="min-w-0 truncate">{row.label}&nbsp;·&nbsp;</span> : null}
        {row.role ? <span className="shrink-0">{ROLE_LABELS[row.role]}</span> : null}
      </span>
      {row.status && row.role ? <RoleStatusBadge status={row.status} role={row.role} /> : null}
    </span>
  );
}

/**
 * The draft board for phones and tablets: BLUE (B1–B5) on the left, RED (R1–R5) on the right,
 * each with its bans row. Our rows are roles with players (tap one to pick for that role); enemy
 * rows are picks in order with the most likely role.
 */
export function CompactBoard({ teams, className, collapsible = false }: { teams: BoardTeam[]; className?: string; /** Phones: one line per team (picks and bans), the full board one tap away. */ collapsible?: boolean }) {
  const ordered = [...teams].sort((a, b) => (a.side === "blue" ? -1 : 1) - (b.side === "blue" ? -1 : 1));
  const [open, setOpen] = React.useState(false);
  // Collapsible (phones only): a one-line summary per team until opened; tablets always see the board.
  const folded = collapsible && !open;
  return (
    <Panel className={className} aria-label="Draft board">
      {folded ? (
        <button type="button" onClick={() => setOpen(true)} aria-expanded={false} className="flex w-full flex-col gap-1.5 p-2 text-left md:hidden" data-testid="board-summary">
          {ordered.map((team) => {
            const picks = Array.from({ length: 5 }, (_, i) => team.rows[i]?.champion ?? null);
            const bans = team.bans.filter(Boolean).length;
            return (
              <span key={team.side} className="flex min-w-0 items-center gap-2">
                <span className={cn("w-14 shrink-0 truncate text-xs font-semibold", team.side === "blue" ? "text-blue" : "text-red")}>{team.ours ? "Us" : "Them"}</span>
                <span className="flex gap-1">
                  {picks.map((c, i) => (
                    <ChampionPortrait key={i} champion={c} size="xs" />
                  ))}
                </span>
                <span className="ml-auto shrink-0 text-[0.6875rem] text-fg-subtle">
                  {bans} ban{bans === 1 ? "" : "s"}
                </span>
              </span>
            );
          })}
          <span className="self-center text-xs font-medium text-accent">Show the full board</span>
        </button>
      ) : null}
      <PanelBody className={cn("p-2 sm:p-3", folded && "max-md:hidden")}>
        {collapsible ? (
          <button type="button" onClick={() => setOpen(false)} aria-expanded className="mb-2 w-full text-center text-xs font-medium text-accent md:hidden" data-testid="board-collapse">
            Show less
          </button>
        ) : null}
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          {ordered.map((team) => {
            const blue = team.side === "blue";
            const prefix = blue ? "B" : "R";
            return (
              <div key={team.side} className="min-w-0">
                <div className={cn("mb-1 flex items-baseline justify-between gap-1 text-xs font-semibold", blue ? "text-blue" : "text-red")}>
                  <span className="truncate">{team.title}</span>
                  <span className="shrink-0 text-xs uppercase tracking-wider text-fg-subtle">{team.side}</span>
                </div>
                <div className="mb-1.5 flex gap-1" role="group" aria-label={`${team.title} bans`}>
                  {Array.from({ length: 5 }, (_, i) => (
                    <ChampionPortrait key={i} champion={team.bans[i] ?? null} size="xs" dimmed className={cn(team.bans[i] && "grayscale")} />
                  ))}
                </div>
                <div className={cn("space-y-1 border-l-2 pl-1.5", blue ? "border-blue/50" : "border-red/50")}>
                  {Array.from({ length: 5 }, (_, i) => {
                    const r = team.rows[i];
                    if (!r) {
                      return (
                        <div key={i} className="flex min-h-11 items-center gap-1.5 p-1 text-xs text-fg-subtle">
                          <ChampionPortrait champion={null} size="sm" />
                          {prefix}
                          {i + 1}
                        </div>
                      );
                    }
                    const sub = r.sub ?? (r.role ? ROLE_LABELS[r.role] : "");
                    return (
                      <button key={r.key ?? i} type="button" disabled={!r.onClick} onClick={r.onClick} className={cn("flex min-h-11 w-full items-center gap-1.5 rounded-md p-1 text-left", r.active && "bg-accent/10 ring-1 ring-accent/50", r.onClick && "hover:bg-surface-2")}>
                        <ChampionPortrait champion={r.champion} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1 text-xs font-medium">
                            {r.role ? <RoleIcon role={r.role} className="h-3 w-3 shrink-0 text-accent" /> : null}
                            <span className="truncate">{r.champion?.name ?? (team.ours ? r.label : `${prefix}${i + 1}`)}</span>
                          </div>
                          {team.ours ? <OurSlotLine row={r} stacked className="text-fg-subtle" /> : <div className="truncate text-xs text-fg-subtle">{sub}</div>}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {team.identity ? <div className="mt-1 truncate text-xs text-fg-subtle">Reads as: {team.identity}</div> : null}
              </div>
            );
          })}
        </div>
      </PanelBody>
    </Panel>
  );
}
