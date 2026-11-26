"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import type { ChampionRow } from "@/server/players/overview";
import type { GameRecord } from "@/domain/player-stats";
import type { PerformanceSummary } from "@/domain/season-stats";
import type { MultikillSummary } from "@/domain/multikills";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import { RoleIcon } from "@/components/role-icon";
import { HOVER_CLOSE_MS, HOVER_OPEN_MS, placeTip } from "@/components/ui/info-tip";
import { screenBox } from "@/lib/screen";
import { formatCount, percent } from "@/lib/format";
import { cn } from "@/lib/cn";

/*
  All Champions' positions (the owner's request of 25 Nov 2026): one row per champion, with the
  League position icon of every position the player actually played it in within the page's
  filters, most played first (server/players/overview.ts, domain/season-stats positionsPlayed). Each
  icon names its position, games, win rate and record (a tooltip on hover and keyboard focus, and its
  accessible name), and opens the champion's preview in that position.
*/

/** A position's own figures, or the champion's where they are the same (one position, no game without one); null for a position the row does not hold. */
export interface RoleFigures {
  selected: GameRecord;
  performance: PerformanceSummary;
  multikills: MultikillSummary | null;
}

export function roleFigures(row: ChampionRow, role: Role | null): RoleFigures | null {
  if (role === null) return null;
  const entry = row.roles.find((r) => r.role === role);
  if (!entry) return null;
  if (entry.figures) return entry.figures;
  // Sent once (ChampionRole.figures): the row's own figures are this position's.
  return { selected: row.selected, performance: row.performance, multikills: row.multikills ?? null };
}

/** "12 games · 58% · 7W 5L": a position's record in words (the tooltip, the accessible name). */
export function roleRecordWords(r: { games: number; wins: number }): string {
  const games = `${formatCount(r.games)} game${r.games === 1 ? "" : "s"}`;
  if (!r.games) return games;
  return `${games} · ${percent(r.wins / r.games, 0)} win rate · ${formatCount(r.wins)}W ${formatCount(r.games - r.wins)}L`;
}

/**
 * One position's icon on a champion's row: a press opens the champion in that position, and a small
 * tooltip says what the icon is (an InfoTip is its own button, so it cannot sit on a control): it
 * opens after the mouse rests on the icon (HOVER_OPEN_MS) or as the keyboard focuses it, stays while
 * the pointer crosses onto it, and closes on leaving both, on blur, on a press, on scrolling, or on
 * Escape (which then does nothing else: WCAG 1.4.13). Fixed to the screen, above the icon or below
 * it where there is no room (placeTip), so no card or pane clips it. Touch has no hover: a tap is the
 * icon's own action, and what the tip says is also the icon's accessible name.
 */
function RoleButton({ champion, role, games, wins, active, onPick, onAhead }: { champion: string; role: Role; games: number; wins: number; active: boolean; onPick: (role: Role, keyboard: boolean) => void; onAhead?: (role: Role) => void }) {
  const words = roleRecordWords({ games, wins });
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState<{ left: number; top: number } | null>(null);
  const trigger = React.useRef<HTMLButtonElement>(null);
  const bubble = React.useRef<HTMLSpanElement>(null);
  const openTimer = React.useRef(0);
  const closeTimer = React.useRef(0);
  // This visit of the mouse has started its wait (from moving onto the icon to leaving it).
  const visited = React.useRef(false);
  const clearTimers = () => {
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
  };
  React.useEffect(() => clearTimers, []);
  const show = React.useCallback(() => {
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
    setPos(null);
    setOpen(true);
  }, []);
  const hide = React.useCallback(() => {
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
    setOpen(false);
  }, []);
  const leave = () => {
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), HOVER_CLOSE_MS);
  };
  React.useLayoutEffect(() => {
    const t = trigger.current;
    const b = bubble.current;
    if (!open || !t || !b) return;
    const anchor = t.getBoundingClientRect();
    const screen = screenBox();
    const at = placeTip(anchor, b.getBoundingClientRect(), screen);
    // No room on either side (a large text size on a small phone): below it, kept on the screen.
    setPos(at.side === "sheet" ? { left: 8, top: Math.max(8, Math.min(anchor.bottom + 6, screen.height - b.offsetHeight - 8)) } : { left: at.left, top: at.top });
  }, [open]);
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // The tip's Escape, and only the tip's: the preview behind it stays open.
      e.preventDefault();
      e.stopPropagation();
      hide();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", hide, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", hide, true);
    };
  }, [open, hide]);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        // A mouse opens it by resting on the icon after moving onto it: never an icon that a change of
        // layout (the list narrowing as the preview opens) put under a pointer at rest.
        onPointerEnter={(e) => {
          if (e.pointerType !== "mouse") return;
          window.clearTimeout(closeTimer.current);
          visited.current = false;
        }}
        onPointerMove={(e) => {
          if (e.pointerType !== "mouse" || open || visited.current) return;
          visited.current = true;
          window.clearTimeout(openTimer.current);
          openTimer.current = window.setTimeout(show, HOVER_OPEN_MS);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType !== "mouse") return;
          visited.current = false;
          leave();
        }}
        onPointerDown={(e) => {
          hide();
          if (e.pointerType === "mouse") onAhead?.(role);
        }}
        onFocus={(e) => {
          if (e.currentTarget.matches(":focus-visible")) show();
        }}
        onBlur={hide}
        onClick={(e) => onPick(role, e.detail === 0)}
        aria-label={`${champion} as ${ROLE_LABELS[role]}: ${words}`}
        aria-pressed={active}
        // Above the row's own button (stretched over the row): a 24px target (WCAG 2.5.8), its negative
        // margins keeping the line's 16px.
        className={cn(
          "relative z-[1] -my-1 inline-grid h-6 w-6 shrink-0 place-items-center rounded transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
          active ? "text-accent" : "text-fg-muted hover:text-fg",
        )}
        data-testid="champion-role"
        data-role={role}
        data-games={games}
      >
        <RoleIcon role={role} decorative className="h-4 w-4" />
      </button>
      {open
        ? createPortal(
            <span
              ref={bubble}
              role="tooltip"
              aria-hidden
              style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? "visible" : "hidden" }}
              className="fixed z-[100] block w-max max-w-[min(18rem,calc(100%-16px))] rounded-md border border-border-strong bg-bg-elevated px-2.5 py-1.5 text-left text-xs leading-snug text-fg shadow-lg motion-safe:animate-[fade-in_100ms_ease-out]"
              data-testid="champion-role-tip"
              onPointerEnter={(e) => {
                if (e.pointerType === "mouse") window.clearTimeout(closeTimer.current);
              }}
              onPointerLeave={(e) => {
                if (e.pointerType === "mouse") leave();
              }}
            >
              <span className="font-semibold">{ROLE_LABELS[role]}</span>
              <span className="text-fg-muted"> · {words}</span>
            </span>,
            document.body,
          )
        : null}
    </>
  );
}

/** A position mark's box on the screen (its position, and its edges in CSS pixels). */
export interface MarkBox {
  role: Role;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** How far above and below a mark a tap still counts as on it (px): the role line's own spacing. */
const MARK_SLOP_Y = 6;
/** The most a mark's box is widened on each side (px): half the marks' gap, and never more. */
const MARK_SLOP_X = 4;

/**
 * The position whose mark a tap at (x, y) lands on, or null: each mark's box widened by half the gap
 * to its neighbours (the outer marks by the same half gap; at most MARK_SLOP_X) and by MARK_SLOP_Y
 * above and below. A touch screen's row stays one 44px target; a tap on its marks honours the mark
 * tapped, anywhere else on the row the most played position.
 */
export function roleAtPoint(marks: readonly MarkBox[], x: number, y: number): Role | null {
  const half = (a: MarkBox | undefined, b: MarkBox | undefined) => (a && b ? Math.min(MARK_SLOP_X, Math.max(0, (b.left - a.right) / 2)) : null);
  for (let i = 0; i < marks.length; i++) {
    const m = marks[i]!;
    const before = half(marks[i - 1], m);
    const after = half(m, marks[i + 1]);
    const left = before ?? after ?? 0;
    const right = after ?? before ?? 0;
    if (x >= m.left - left && x < m.right + right && y >= m.top - MARK_SLOP_Y && y <= m.bottom + MARK_SLOP_Y) return m.role;
  }
  return null;
}

/** The position mark drawn under (x, y) in a champion's row (touch screens; none is drawn with a mouse), or null. */
export function roleMarkAt(row: Element | null, x: number, y: number): Role | null {
  if (!row) return null;
  const marks = [...row.querySelectorAll<HTMLElement>("[data-testid=champion-role-mark]")]
    .map((el) => ({ role: el.dataset.role as Role, box: el.getBoundingClientRect() }))
    .filter((m) => m.box.width > 0)
    .map(({ role, box }) => ({ role, left: box.left, right: box.right, top: box.top, bottom: box.bottom }));
  return roleAtPoint(marks, x, y);
}

/** "Top: 22 games · 50% win rate · 11W 11L; Jungle: …": every position's record in words (the marks' screen-reader text). */
export function positionsWords(roles: ReadonlyArray<{ role: Role; games: number; wins: number }>): string {
  return roles.map((r) => `${ROLE_LABELS[r.role]}: ${roleRecordWords(r)}`).join("; ");
}

/**
 * Every position a champion was played in, most played first; "No position" where none of its games
 * records one. `active`: the position its open preview shows.
 *
 * With a mouse (a fine pointer) each icon is a control of its own: a tooltip, and a press that opens
 * the champion in that position. On a touch screen a 44px target per icon cannot fit a compact row,
 * so the icons are 14px marks there and the row stays one 44px target: a tap on a mark opens the
 * champion in that position (the row's button reads where it was tapped: roleMarkAt), anywhere else
 * on the row its most played position. What a tooltip says is the marks' screen-reader text, and
 * the preview's position choice (44px segments, right under its name) shows each position's games,
 * win rate and record.
 */
export function RoleIcons({ row, champion, active, onPick, onAhead }: { row: ChampionRow; champion: string; active: Role | null; onPick: (role: Role, keyboard: boolean) => void; onAhead?: (role: Role) => void }) {
  if (!row.roles.length) {
    return (
      <span className="shrink-0 whitespace-nowrap text-fg-subtle" data-testid="champion-roles">
        No position<span className="sr-only"> recorded</span>
      </span>
    );
  }
  return (
    <span className="flex min-w-0 shrink-0 items-center" data-testid="champion-roles">
      <span className="hidden flex-wrap items-center pointer-fine:flex" role="group" aria-label={`${champion}'s positions`} data-role-buttons>
        {row.roles.map((r) => (
          <RoleButton key={r.role} champion={champion} role={r.role} games={r.games} wins={r.wins} active={active === r.role} onPick={onPick} onAhead={onAhead} />
        ))}
      </span>
      {/* 14px marks 2px apart (the icon sized by its box: RoleIcon's own 16px would win over a
          smaller class), so five and "In pool" fit the table's narrowest champion column (9rem
          beside the portrait) on one line. A tap passes through them to the row's button, which
          reads which mark it was on (an icon drawn as a mask paints above the button's cover). */}
      <span className="pointer-events-none flex flex-wrap items-center gap-x-0.5 pointer-fine:hidden" data-role-marks>
        {row.roles.map((r) => (
          <span key={r.role} className={cn("inline-flex h-3.5 w-3.5", active === r.role ? "text-accent" : "text-fg-muted")} data-testid="champion-role-mark" data-role={r.role} data-games={r.games}>
            <RoleIcon role={r.role} decorative className="h-full w-full" />
          </span>
        ))}
        <span className="sr-only">Played as {positionsWords(row.roles)}</span>
      </span>
    </span>
  );
}
