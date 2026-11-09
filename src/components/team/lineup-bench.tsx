"use client";

import * as React from "react";
import { Repeat2 } from "lucide-react";
import type { Role } from "@/domain/roles";
import type { RosterSlot } from "@/server/team/roster";
import { assignmentStatus } from "@/domain/roster";
import { CardAvatar, CardName, cardColourVars } from "@/components/players/card-look";
import { Avatar } from "@/components/ui/avatar";
import { RoleIcon } from "@/components/role-icon";
import { cn } from "@/lib/cn";

/**
 * How each lineup card turns, and which cards show their substitute, kept outside React state: a
 * card registers its own turn and reports its side, so the bench can turn a card and show which
 * cards are turned while a turn re-renders the bench alone, never the five cards (each card's side
 * stays its own state, as before).
 */
export interface LineupTurns {
  /** A card's turn (to the substitute when `to`; `focus` moves keyboard focus onto the side turned to), or null when it cannot turn. */
  register: (role: Role, turn: ((to: boolean, focus: boolean) => void) | null) => void;
  turn: (role: Role, to: boolean, focus: boolean) => void;
  /** A card says which side it shows. */
  report: (role: Role, shown: boolean) => void;
  shown: (role: Role) => boolean;
  subscribe: (listener: () => void) => () => void;
}

export function createLineupTurns(): LineupTurns {
  const turns = new Map<Role, (to: boolean, focus: boolean) => void>();
  const shown = new Set<Role>();
  const listeners = new Set<() => void>();
  return {
    register: (role, turn) => {
      if (turn) turns.set(role, turn);
      else turns.delete(role);
    },
    turn: (role, to, focus) => turns.get(role)?.(to, focus),
    report: (role, isShown) => {
      if (shown.has(role) === isShown) return;
      if (isShown) shown.add(role);
      else shown.delete(role);
      for (const l of listeners) l();
    },
    shown: (role) => shown.has(role),
    subscribe: (l) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
  };
}

/**
 * What the bench shows: a row of the substitutes when any role has one; otherwise nothing, except
 * for a lineup manager one quiet line on where to choose them. The Team page sizes the cards' art
 * from it (team-roster.tsx), so both read it from here.
 */
export function benchShape(slots: RosterSlot[], canManageLineup: boolean): "row" | "hint" | "none" {
  if (slots.some((s) => s.substitute)) return "row";
  return canManageLineup ? "hint" : "none";
}

/**
 * What sizes the cards' art five across (globals.css, lineup-art-height), as the lineup's own CSS
 * variables: the bench under the cards (its row, with room for a name on two lines; its one-line
 * hint; or nothing) and whether any card shows this season's figures. A card's two faces share one
 * grid cell, so a back whose substitute's figures this viewer may see makes the card as tall as one
 * with figures even when its starter's are hidden: both sides count.
 */
export function lineupArtVars(slots: RosterSlot[], canManageLineup: boolean): Record<string, string | number> {
  const bench = benchShape(slots, canManageLineup);
  // A back exists only behind a starter (an open role shows its substitute on the bench alone).
  const figures = slots.some((s) => !!s.player && (s.player.statsVisible || !!s.substitute?.player.statsVisible));
  return { "--lineup-bench": bench === "row" ? "5.25rem" : bench === "hint" ? "1.75rem" : "0rem", "--lineup-figures": figures ? 1 : 0 };
}

/** The width of the cards five across, so the bench's cells stand under their cards (team-roster.tsx's track). */
const FIVE_ACROSS_WIDTH = "@min-[58rem]/lineup:not-short:mx-auto @min-[58rem]/lineup:not-short:w-full @min-[58rem]/lineup:not-short:max-w-[84rem] @min-[90rem]/lineup:not-short:max-w-(--content-wide)";

/**
 * THE BENCH: each role's designated substitute as team information, under the lineup (the only
 * team information the roster carries beside the cards, which showed it as an unlabelled icon on
 * the cards with one). Five across, a row of five cells under the cards, each under its own card:
 * the substitute's picture in their frame, their name in their style and whether the role is their
 * Main Role, or a quiet "No substitute" (an open role's cell, or on the public page one whose
 * player is not shown, says nothing: its substitute is not shown either). Narrower (tablets, a phone
 * held sideways): one wrapping row of the substitutes only, after a "Substitutes" label, each a chip
 * with the role's icon and the name (the picture too where there is room). A phone held upright
 * lays the chips two to a row under the label (a lone last chip takes the row), their names
 * wrapping inside the chip, so two substitutes never take a row each on a small phone; at a large
 * text size, where two would leave a chip under 8.5rem (a name a letter wide), one to a row.
 *
 * A substitute is a button that turns their card over to them, the same turn as the card's own
 * control (it calls the card's), and moves focus to the card's way back; pressed while the card
 * shows them, it turns the card back. On a phone, where one card is in view, it first brings that
 * card into view. Nothing is saved or fetched. Lineup managers choose substitutes in Edit lineup,
 * on the cards; the bench never changes the lineup.
 */
export function LineupBench({ slots, turns, onTurn, canManageLineup, editingLineup }: { slots: RosterSlot[]; turns: LineupTurns; /** Turns a role's card (to its substitute when `to`), bringing it into view first where the lineup is a track. */ onTurn: (role: Role, to: boolean) => void; canManageLineup: boolean; editingLineup: boolean }) {
  const id = React.useId();
  const shape = benchShape(slots, canManageLineup);
  // A phone held upright: two chips to a row (one a row once larger text leaves a chip under 8.5rem),
  // and an odd one out takes a row of its own.
  const subs = slots.filter((s) => s.substitute);
  const lone = subs.length % 2 === 1 ? subs.at(-1)!.role : null;
  if (shape === "none") return null;
  if (shape === "hint")
    return editingLineup ? null : (
      <p className="mt-3 text-center text-xs text-fg-subtle" data-testid="bench-none">
        No substitutes yet · Edit lineup → Substitute
      </p>
    );
  return (
    <section aria-labelledby={id} className={cn("mt-3", FIVE_ACROSS_WIDTH)} data-testid="lineup-bench">
      <h2 id={id} className="sr-only">
        Substitutes
      </h2>
      {/* Five across and on a phone held upright the cells share one height along a row (a name on
          two lines makes its row taller, never one cell). */}
      <ul className="flex flex-wrap items-center justify-center gap-2 @max-xl/lineup:not-short:grid @max-xl/lineup:not-short:grid-cols-[repeat(auto-fill,minmax(min(100%,max(8.5rem,calc(50%_-_0.25rem))),1fr))] @max-xl/lineup:not-short:items-stretch @min-[58rem]/lineup:not-short:grid @min-[58rem]/lineup:not-short:grid-cols-5 @min-[58rem]/lineup:not-short:items-stretch @min-[58rem]/lineup:not-short:gap-3 @7xl/lineup:not-short:gap-5">
        {/* The row's label where it is a row of chips (the heading above is for screen readers):
            before them, or on a line of its own over the chips of a phone held upright. Five
            across each cell says it. */}
        <li aria-hidden className="text-2xs font-medium uppercase tracking-label text-fg-subtle @max-xl/lineup:not-short:col-span-full @max-xl/lineup:not-short:text-center @min-[58rem]/lineup:not-short:hidden">
          Substitutes
        </li>
        {slots.map((s) =>
          s.substitute ? (
            <li key={s.role} className={cn("flex min-w-0", s.role === lone && "@max-xl/lineup:not-short:col-span-full")}>
              <BenchEntry slot={s} turns={turns} onTurn={onTurn} />
            </li>
          ) : s.player ? (
            // Five across only: a cell under every card, so a role without a substitute says so.
            <li key={s.role} className="hidden min-h-14 min-w-0 items-center justify-center rounded-panel border border-dashed border-border px-2.5 text-xs text-fg-subtle @min-[58rem]/lineup:not-short:flex" data-testid={`bench-empty-${s.role}`}>
              <span className="sr-only">{s.roleLabel}: </span>No substitute
            </li>
          ) : (
            // An open role, or on the public page a role whose player is not shown (their substitute is
            // withheld with them): nothing is known about a substitute, so its column stays empty
            // rather than say "No substitute" where one may exist.
            <li key={s.role} aria-hidden className="hidden @min-[58rem]/lineup:not-short:block" data-testid={`bench-empty-${s.role}`} data-open-role />
          ),
        )}
      </ul>
    </section>
  );
}

function BenchEntry({ slot, turns, onTurn }: { slot: RosterSlot; turns: LineupTurns; onTurn: (role: Role, to: boolean) => void }) {
  const sub = slot.substitute!.player;
  const shown = React.useSyncExternalStore(turns.subscribe, () => turns.shown(slot.role), () => false);
  // A card turns only with a starter on its front: a role held by nobody shows its substitute here alone.
  const turnable = !!slot.player;
  const main = assignmentStatus(sub, slot.role) === "main";
  // A chip (a phone's row holds two, a name wrapping inside it), or five across a cell under the substitute's card.
  const shell = "flex min-h-11 w-full min-w-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-left @xl/lineup:gap-2 @xl/lineup:px-3 @min-[58rem]/lineup:not-short:min-h-14 @min-[58rem]/lineup:not-short:rounded-panel @min-[58rem]/lineup:not-short:px-2.5 @min-[58rem]/lineup:not-short:py-2";
  const body = (
    <>
      {/* The role: the column says it five across, where each cell stands under its card. */}
      <span className="inline-flex shrink-0 @min-[58rem]/lineup:not-short:hidden" style={{ color: "var(--card-accent)" }}>
        <RoleIcon role={slot.role} className="h-4 w-4" decorative />
      </span>
      {/* The picture where there is room (not on a phone's narrow row). Held sideways it waits for
          the first card's art (globals.css, the art-wait rules). */}
      <span className="hidden shrink-0 @xl/lineup:flex">
        <CardAvatar look={sub.look} name={sub.name} src={sub.avatarUrl}>
          <Avatar name={sub.name} src={sub.avatarUrl} size="xs" className="@min-[58rem]/lineup:not-short:h-8 @min-[58rem]/lineup:not-short:w-8 @min-[58rem]/lineup:not-short:text-xs" />
        </CardAvatar>
      </span>
      <span className="min-w-0 flex-1" data-bench-name>
        <CardName look={sub.look} name={sub.name} decorative className="text-xs leading-snug text-fg @xl/lineup:text-sm" />
        {/* Five across, under the name: the turn, that they are the substitute, and whether the role
            is their Main Role (the name keeps the cell's width). Read out everywhere, "Sub" as the
            whole word: a word split across hidden text is read in two parts ("Sub stitute"). */}
        <span className="sr-only flex items-center gap-1 text-2xs leading-4 text-fg-subtle @min-[58rem]/lineup:not-short:not-sr-only">
          {turnable ? <Repeat2 className={cn("h-3 w-3 shrink-0", shown && "text-accent")} aria-hidden /> : null}
          <span className="sr-only">, {slot.roleLabel} </span>
          <span>
            <span aria-hidden>Sub</span>
            <span className="sr-only">Substitute</span> · {main ? "Main Role" : "Off Role"}
          </span>
        </span>
      </span>
      {turnable ? <Repeat2 className={cn("h-4 w-4 shrink-0 @min-[58rem]/lineup:not-short:hidden", shown ? "text-accent" : "text-fg-subtle")} aria-hidden /> : null}
    </>
  );
  // Nothing to turn (no starter on the card's front): said plainly, without a control's raised look.
  if (!turnable)
    return (
      <span className={cn(shell, "border-border/70 bg-surface/40")} style={cardColourVars(sub.look)} data-testid={`bench-${slot.role}`}>
        {body}
      </span>
    );
  return (
    <button
      type="button"
      onClick={() => onTurn(slot.role, !turns.shown(slot.role))}
      aria-pressed={shown}
      title={shown ? `Back to the starting ${slot.roleLabel}` : `Show ${sub.name} on the ${slot.roleLabel} card`}
      className={cn(shell, "panel-depth transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none", shown ? "border-accent/60 bg-surface-3" : "border-border bg-surface hover:border-border-strong hover:bg-surface-2")}
      style={cardColourVars(sub.look)}
      data-testid={`bench-${slot.role}`}
    >
      {body}
    </button>
  );
}
