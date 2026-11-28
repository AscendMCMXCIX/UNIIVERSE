"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { useWorkspace, useWorkspaceShort, useWorkspaceShortNarrow } from "./posture";

/*
  The one-screen workspace's shared parts (docs/RESPONSIVE.md, "One-screen desktop pages"; the owner's
  requirement of 27 and 28 Nov 2026: on a desktop window a page the reader works in is one screen).
  The gate is the platform's (globals.css, the `ws` and `ws-host` variants; ui/posture.ts, WS_QUERY
  and useWorkspace): a fine pointer, from 80rem wide, at least 41 of the page's own rem tall. A page
  opts in by marking its section [data-workspace]; outside the gate it is the flow, the page as it
  always was, the one thing that scrolls.

  The data contract every workspace page keeps (e2e/workspace.ts and the Production check read it):
    data-workspace     the section, while the gate may hold (the server's HTML and the hydration render,
                       where the CSS decides), and not once the page knows it does not;
    data-ws-card       a card that reaches the frame's foot (its bottom is held above #content's padding);
    data-ws-foot       a card's footer (the range and the pager), the list's rows ending at least 12px
                       above it;
    data-ws-row        a measured row (useRowBudget's default selector);
    data-ws-region     a paged list's region, with data-per, data-page, data-pages and data-total.

  Every wrapper between the shell's frame and the section carries WS_COLUMN (risk 2 of the design: a
  wrapper left a block keeps the section from filling the frame, and an @container wrapper with
  mx-auto shrinks to 0px wide in the flex frame: /settings went from 1115 to 3714px tall).

  The section is a container named `ws` (@container/ws), never `section`: that name is All Champions'
  own, and the short form's narrow blocks in globals.css read it. The short form (ws-short:) is opt-in
  per page: a page that writes none of its classes is unaffected, and its section marks
  [data-ws-short] only where it asks for it.
*/

/** The classes of every element between the shell's frame and a workspace section: a flex column the section fills, as wide as the frame. */
export const WS_COLUMN = "ws-host:flex ws-host:w-full ws-host:flex-1 ws-host:flex-col";

/** A workspace section's own classes: its parts 12px apart (space-y in the flow, a gap in the workspace's flex column). */
export const WS_SECTION = "@container/ws space-y-3 ws:flex ws:flex-1 ws:flex-col ws:gap-3 ws:space-y-0";
/** A workspace card's surface (the flow's card, unchanged) and its fill of the frame in the workspace. */
export const WS_CARD_SURFACE = "rounded-card border border-border bg-surface panel-depth";
export const WS_CARD_FILL = "ws:flex ws:flex-1 ws:flex-col";
/** A workspace card's footer: drawn in the workspace only, at the card's foot, 44px tall. */
export const WS_FOOT = "mt-auto hidden min-h-11 items-center gap-3 border-t border-border/70 px-3 ws:flex";

/** What a workspace page reads of the gate (useWorkspaceMarks). */
export interface WorkspaceMarks {
  /** null on the server and while hydrating (the CSS gate decides the first paint); then whether the window holds the workspace. */
  ws: boolean | null;
  /** The section is marked [data-workspace]: the gate may hold (ws !== false). */
  workspace: boolean;
  /** The lists measure their pages: the gate holds, known once hydrated (ws === true). */
  paged: boolean;
  /** The short form applies, by the page's own rem (asked for with `short`). */
  short: boolean;
  /** The narrow section's short form applies, by the page's own rem (asked for with `shortNarrow`). */
  shortNarrow: boolean;
  /** The section's data attributes: data-workspace, and data-ws-short / data-ws-short-narrow where asked for and they apply. */
  attrs: WorkspaceAttrs;
}

export interface WorkspaceAttrs {
  "data-workspace"?: "";
  "data-ws-short"?: "";
  "data-ws-short-narrow"?: "";
}

/** The marks for these posture readings (pure: useWorkspaceMarks' arithmetic, for its unit test). */
export function workspaceMarks(ws: boolean | null, shortNow: boolean | null, shortNarrowNow: boolean | null, o: { short?: boolean; shortNarrow?: boolean; enabled?: boolean } = {}): WorkspaceMarks {
  const { short: askShort = false, shortNarrow: askNarrow = false, enabled = true } = o;
  const workspace = enabled && ws !== false;
  const paged = enabled && ws === true;
  const short = workspace && askShort && shortNow === true;
  const shortNarrow = workspace && askNarrow && shortNarrowNow === true;
  const attrs: WorkspaceAttrs = {};
  if (workspace) attrs["data-workspace"] = "";
  if (short) attrs["data-ws-short"] = "";
  if (shortNarrow) attrs["data-ws-short-narrow"] = "";
  return { ws: enabled ? ws : false, workspace, paged, short, shortNarrow, attrs };
}

/**
 * The gate as a page reads it: `workspace` marks the section (ws !== false), `paged` measures its lists
 * (ws === true), and `attrs` are the section's data attributes. `short` and `shortNarrow` opt in to the
 * short form's marks (the CSS bands decide the first paint; once hydrated the page adds the marks where
 * its own rem is short and the CSS cannot tell: a larger browser text size). `enabled: false` keeps the
 * page in the flow whatever the window (a state with nothing to fit).
 */
export function useWorkspaceMarks(o: { short?: boolean; shortNarrow?: boolean; enabled?: boolean } = {}): WorkspaceMarks {
  const ws = useWorkspace();
  const short = useWorkspaceShort();
  const shortNarrow = useWorkspaceShortNarrow();
  const { short: askShort, shortNarrow: askNarrow, enabled } = o;
  return React.useMemo(() => workspaceMarks(ws, short, shortNarrow, { short: askShort, shortNarrow: askNarrow, enabled }), [ws, short, shortNarrow, askShort, askNarrow, enabled]);
}

const MarksContext = React.createContext<WorkspaceMarks | null>(null);

/** The nearest WorkspaceSection's marks (null outside one): its lists read `paged` from here. */
export function useWorkspaceSection(): WorkspaceMarks | null {
  return React.useContext(MarksContext);
}

type Tag = "section" | "div" | "article" | "main";

/**
 * A workspace page's section: in the workspace the flex remainder of the shell's window-tall column
 * (its parts 12px apart by a gap, so a closed or top-layer dialog never shortens the frame by a
 * margin); in the flow a block with its parts 12px apart, as before. A container named `ws`.
 * `marks`: the page's own useWorkspaceMarks (it reads `paged` too); else the section reads the gate
 * itself, with `short`, `shortNarrow` and `enabled` as useWorkspaceMarks takes them.
 */
export function WorkspaceSection({
  as = "section",
  labelledBy,
  label,
  testId,
  marks: given,
  short,
  shortNarrow,
  enabled,
  className,
  ref,
  children,
}: {
  as?: Tag;
  /** The id of the section's heading (aria-labelledby). */
  labelledBy?: string;
  /** Or its name (aria-label), where it has no heading. */
  label?: string;
  testId?: string;
  marks?: WorkspaceMarks;
  short?: boolean;
  shortNarrow?: boolean;
  enabled?: boolean;
  className?: string;
  ref?: React.Ref<HTMLElement>;
  children?: React.ReactNode;
}) {
  const own = useWorkspaceMarks({ short, shortNarrow, enabled });
  const marks = given ?? own;
  const Element = as as React.ElementType;
  return (
    <MarksContext.Provider value={marks}>
      <Element ref={ref} className={cn(WS_SECTION, className)} aria-labelledby={labelledBy} aria-label={labelledBy ? undefined : label} data-testid={testId} {...marks.attrs}>
        {children}
      </Element>
    </MarksContext.Provider>
  );
}

/**
 * A card that fills the workspace's frame to its foot (data-ws-card: the tests hold its bottom above
 * #content's padding). `bare` drops the surface (a list that is not in a card of its own). Other props
 * (a paged list's region attributes, its id) go on the element.
 */
export function WorkspaceCard({ as = "div", bare = false, testId, className, ref, children, ...rest }: { as?: Tag | "aside" | "form" | "fieldset"; bare?: boolean; testId?: string; className?: string; ref?: React.Ref<HTMLElement>; children?: React.ReactNode } & Omit<React.HTMLAttributes<HTMLElement>, "className" | "children">) {
  const Element = as as React.ElementType;
  return (
    <Element ref={ref} className={cn("relative min-w-0", !bare && WS_CARD_SURFACE, WS_CARD_FILL, className)} data-ws-card="" data-testid={testId} {...rest}>
      {children}
    </Element>
  );
}

/** A card's footer in the workspace (data-ws-foot): its range and pager (PagedFooter), drawn in the workspace only. */
export function WorkspaceFoot({ testId, className, ref, children }: { testId?: string; className?: string; ref?: React.Ref<HTMLDivElement>; children?: React.ReactNode }) {
  return (
    <div ref={ref} className={cn(WS_FOOT, className)} data-ws-foot="" data-testid={testId}>
      {children}
    </div>
  );
}

/**
 * The first paint's rows in tiers of the window's height (the server's HTML and the hydration render,
 * before the page can measure): a row past `tiers.tall` is hidden in the workspace, past `tiers.mid`
 * under board-at-tall, past `tiers.gate` under board-at-mid (globals.css, board-*). Each page proves its
 * tiers from its own chrome (one row fewer than fit the tier's smallest window in every band), so
 * hydration only adds rows below them. All Champions' are { gate: 3, mid: 7, tall: 9 }.
 */
export function wsTierClass(i: number, tiers: { gate: number; mid: number; tall: number }): string | undefined {
  if (i >= tiers.tall) return "ws:hidden";
  if (i >= tiers.mid) return "ws:board-below-tall:hidden";
  if (i >= tiers.gate) return "ws:board-below-mid:hidden";
  return undefined;
}
