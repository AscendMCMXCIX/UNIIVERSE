"use client";

import * as React from "react";
import type { Side } from "@/domain/draft";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import { ChampionPortrait } from "@/components/champion-portrait";
import type { PickerChampion } from "@/components/champion-picker";
import { RoleIcon } from "@/components/role-icon";
import { Panel, PanelBody } from "@/components/ui/panel";
import { cn } from "@/lib/cn";

export interface BoardRow {
  role: Role | null;
  label: string;
  sub?: string;
  champion: PickerChampion | null;
  active: boolean;
  onClick?: () => void;
  key?: string;
}

export interface BoardTeam {
  title: string;
  side: Side;
  bans: Array<PickerChampion | null>;
  rows: BoardRow[];
  ours: boolean;
  identity?: string | null;
}

/**
 * The draft board for phones and tablets: BLUE (B1–B5) on the left, RED (R1–R5) on the right,
 * each with its bans row. Our rows are roles with players (tap one to pick for that role); enemy
 * rows are picks in order with the most likely role.
 */
export function CompactBoard({ teams, className }: { teams: BoardTeam[]; className?: string }) {
  const ordered = [...teams].sort((a, b) => (a.side === "blue" ? -1 : 1) - (b.side === "blue" ? -1 : 1));
  return (
    <Panel className={className} aria-label="Draft board">
      <PanelBody className="p-2 sm:p-3">
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
                    const sub = r.champion ? (team.ours ? r.label : r.sub ?? (r.role ? ROLE_LABELS[r.role] : "")) : r.sub ?? (r.role ? ROLE_LABELS[r.role] : "");
                    return (
                      <button key={r.key ?? i} type="button" disabled={!r.onClick} onClick={r.onClick} className={cn("flex min-h-11 w-full items-center gap-1.5 rounded-md p-1 text-left", r.active && "bg-accent/10 ring-1 ring-accent/50", r.onClick && "hover:bg-surface-2")}>
                        <ChampionPortrait champion={r.champion} size="sm" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1 text-xs font-medium">
                            {r.role ? <RoleIcon role={r.role} className="h-3 w-3 shrink-0 text-accent" /> : null}
                            <span className="truncate">{r.champion?.name ?? (team.ours ? r.label : `${prefix}${i + 1}`)}</span>
                          </div>
                          <div className="truncate text-xs text-fg-subtle">{sub}</div>
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
