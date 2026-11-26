"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { DetailModal } from "./detail-modal";
import { Popover } from "./popover";
import { useWindowPosture } from "./posture";

/*
  The shared detailed breakdown (docs/DESIGN_SYSTEM.md → Breakdown popover): how a figure was worked
  out, one press away from the figure itself, for what is too long for an InfoTip (one concept in a
  sentence or two). The first is Leaderboards' multikill Score.

  - **The trigger** is the figure itself, a button (a dotted underline says it opens, as an InfoTip's
    words do): Enter, Space, a click or a tap. `aria-haspopup="dialog"` and `aria-expanded`; 44px on a
    touch screen; the shared focus ring. Above a row's own link (`relative z-[2]`, ROW_CONTROL), so a
    row that opens something else keeps its press everywhere but on the figure.
  - **Where it opens** (posture.ts): beside the figure on screens that open previews beside a list,
    as the shared Popover with `placement="side"` (up to the screen's whole height, so a breakdown
    taller than the room under a row opens whole, without a scrollbar of its own at normal sizes);
    a window under 768px wide, or a short one (a phone held sideways), gets a sheet (DetailModal), as
    the Filters do. The sheet's body grows from its content (`flex-auto`, never `flex-1`: Safari 26
    collapsed the other, docs/MOBILE.md).
  - **Layer.** The beside form is drawn at the page's end (a portal to the body): a figure sits in a
    row that is a stacking context of its own (a list row's `isolate`), where the panel's z-50 could
    never rise above the rows and boards after it. Its presses still close nothing (the Popover reads
    its own box and the figure's); the sheet is a dialog in the browser's top layer either way.
  - **Closes** on Escape (the focus back on the figure), a press outside, the focus leaving it, its ✕,
    or the figure leaving the screen. No address and no history entry of its own, no dimming beside a
    list; the sheet dims the page as every sheet does.
  - **The keyboard keeps the figure's place** (the Popover's `portaled`): the beside form is read as if
    it came right after the figure. Tab past its ✕ closes it and goes on to what follows the figure
    (the next row); Shift+Tab out of it closes it with the focus back on the figure (WCAG 2.4.3). The
    sheet keeps the focus inside it until it closes, as every sheet does.
  - **The content** renders only while open (`children` is drawn then), from the figure's own data:
    the breakdown never works the figure out again.
  - **A mark or a label as the trigger** (`bare`): where the breakdown explains a status or a label
    rather than a figure (the data status's ⓘ, the experience label), the caller draws the trigger's
    look in `triggerClassName`, keeping the line's height; the press, the names and the forms stay.
*/

export function BreakdownPopover({ trigger, triggerLabel, triggerClassName, bare = false, title, description, children, testId, panelTestId, widthClassName = "w-[min(44rem,calc(100%-1rem))]" }: {
  /** The figure as the trigger shows it (the score). */
  trigger: React.ReactNode;
  /** The trigger's accessible name: the figure and what pressing it shows ("Score 132: how it was worked out"). */
  triggerLabel: string;
  triggerClassName?: string;
  /** The caller draws the trigger (`triggerClassName`: its size, colours and touch band): a mark or a label, not a figure. */
  bare?: boolean;
  /** The breakdown's heading. */
  title: string;
  description?: React.ReactNode;
  /** The breakdown itself, drawn only while it is open. */
  children: React.ReactNode;
  testId?: string;
  panelTestId?: string;
  /** The beside form's width class (a sheet takes the sheet's own width). */
  widthClassName?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const windowed = useWindowPosture();
  const ref = React.useRef<HTMLButtonElement>(null);
  const panelId = React.useId();
  const anchor = React.useCallback(() => ref.current, []);
  const close = React.useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => ref.current?.isConnected && ref.current.focus({ preventScroll: true }));
  }, []);
  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={triggerLabel}
        data-testid={testId}
        data-open={open || undefined}
        onClick={(e) => {
          // The row under it opens something of its own (a Peek): this press is the figure's alone.
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className={cn(
          bare
            ? "cursor-pointer transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            : "relative z-[2] inline-flex min-h-8 min-w-8 cursor-pointer items-center justify-end rounded-md px-1.5 tabular-nums underline decoration-fg-subtle/70 decoration-dotted underline-offset-4 transition-colors duration-150 hover:bg-surface-2 hover:decoration-fg-muted focus-visible:outline-2 focus-visible:outline-accent data-[open=true]:bg-surface-2 pointer-coarse:min-h-11 pointer-coarse:min-w-11",
          triggerClassName,
        )}
      >
        {trigger}
      </button>
      {open && !windowed
        ? createPortal(
            <Popover anchor={anchor} onClose={close} title={title} description={description} placement="side" portaled widthClassName={widthClassName} testId={panelTestId} closeTestId={panelTestId ? `${panelTestId}-close` : undefined} id={panelId}>
              {children}
            </Popover>,
            document.body,
          )
        : null}
      {open && windowed ? (
        <DetailModal open onClose={() => setOpen(false)} size="sheet" sheetWidth="picker" title={title} description={description} testId={panelTestId} closeTestId={panelTestId ? `${panelTestId}-close` : undefined}>
          <div id={panelId}>{children}</div>
        </DetailModal>
      ) : null}
    </>
  );
}
