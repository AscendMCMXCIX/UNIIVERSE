"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { screenBox } from "@/lib/screen";
import { lastMouseMove } from "./input-kind";
import { topModal } from "./top-layer";

const MARGIN = 8;
const GAP = 6;

/**
 * Where an open bubble goes: above its trigger, or below when there is no room above; centred on
 * it but kept 8px inside the screen. Fixed to the screen, so no card, table or window clips it.
 * Never over its own trigger: where neither side has room (large text on a small phone), it opens
 * as a small sheet at the screen's edge away from the trigger instead ("sheet", with `edge`).
 */
export function placeTip(anchor: { left: number; top: number; bottom: number; width: number }, bubble: { width: number; height: number }, viewport: { width: number; height: number }): { left: number; top: number; side: "top" | "bottom" } | { side: "sheet"; edge: "top" | "bottom" } {
  const centre = anchor.left + anchor.width / 2;
  const left = Math.min(Math.max(MARGIN, centre - bubble.width / 2), Math.max(MARGIN, viewport.width - MARGIN - bubble.width));
  const above = anchor.top - GAP - bubble.height;
  if (above >= MARGIN) return { left, top: above, side: "top" };
  if (anchor.bottom + GAP + bubble.height <= viewport.height - MARGIN) return { left, top: anchor.bottom + GAP, side: "bottom" };
  return { side: "sheet", edge: (anchor.top + anchor.bottom) / 2 > viewport.height / 2 ? "top" : "bottom" };
}

/**
 * What an open bubble does with placeTip's answer: it lands there; or, where neither side has room
 * for it at the body text size (large text on a small phone), it is drawn compact first (12px, as
 * every bubble was before 25 Nov 2026, in a bubble up to 18rem wide) and placed again; only where the
 * compact bubble has no room either does it open as the sheet. The body size stays wherever it fits.
 */
export function tipStep(target: ReturnType<typeof placeTip>, compact: boolean): "land" | "compact" | "sheet" {
  if (target.side !== "sheet") return "land";
  return compact ? "sheet" : "compact";
}

/** How long a mouse rests on a trigger before its bubble opens (none on keyboard focus or a tap). */
export const HOVER_OPEN_MS = 150;
/** How long after the pointer leaves both the trigger and its bubble the bubble closes (the way across the gap). */
export const HOVER_CLOSE_MS = 100;

/**
 * The style position (left, top) that lands the bubble's box at `target` on screen. A fixed bubble
 * is placed relative to the screen, unless what holds it is a containing block for fixed boxes: a
 * window during its opening motion, whose transform moves and scales the bubble with it. Where the
 * bubble landed (`landed`, its box on screen) for the style position it had (`style`), and its size
 * before any transform (`size`: its computed width and height, unrounded), give that offset and
 * scale, and so the position that puts it at `target`: the same as `target` when nothing moves it.
 * offsetWidth and offsetHeight round the size to whole pixels: a bubble 63.5px tall, read as 64, was
 * taken for one scaled by 0.992, and landed up to 3.5px nearer its ⓘ than it goes, more the lower it
 * sat (on the page, where nothing placed it again; in a window, for a frame).
 */
export function landAt(target: { left: number; top: number }, style: { left: number; top: number }, landed: { left: number; top: number; width: number; height: number }, size: { width: number; height: number }): { left: number; top: number } {
  const scaleX = size.width > 0 && landed.width > 0 ? landed.width / size.width : 1;
  const scaleY = size.height > 0 && landed.height > 0 ? landed.height / size.height : 1;
  return { left: style.left + (target.left - landed.left) / scaleX, top: style.top + (target.top - landed.top) / scaleY };
}

/**
 * What an open bubble is drawn in: the open window its trigger sits in, else the topmost open window,
 * else the page. A window is a modal dialog in the browser's top layer, drawn above the whole page:
 * a bubble left on the page would be drawn under it, out of sight (top-layer.ts).
 */
export function tipHost(trigger: Element | null): HTMLElement {
  return trigger?.closest<HTMLElement>("dialog[open]") ?? topModal() ?? document.body;
}

/**
 * Whether what holds an open bubble is moving itself: a window's opening or closing motion, or a
 * transition of its own (a sheet settling back). Its transform makes it the box the bubble is placed
 * in, a different box at every frame, and none once it is still.
 */
export function moving(host: { getAnimations?: () => ReadonlyArray<{ playState: string }> }): boolean {
  return typeof host.getAnimations === "function" && host.getAnimations().some((a) => a.playState === "running");
}

/**
 * Whether a mouse rests on the trigger, having moved onto it: the pointer is over it, and the last
 * move the page heard (lastMouseMove, from its first move on, before its code ran too) landed on it.
 * True as an ⓘ hydrates under a mouse that moved onto it while the page was hydrating, a move nothing
 * else heard; false for an ⓘ laid under a pointer at rest (a window opening under the pointer that
 * pressed its opener), which last moved over something else.
 */
export function restsAfterMovingOnto(trigger: { contains(other: Node | null): boolean; matches(selectors: string): boolean }, last: EventTarget | null): boolean {
  if (!last || typeof (last as Partial<Node>).nodeType !== "number") return false;
  return trigger.contains(last as Node) && trigger.matches(":hover");
}

/**
 * The one tooltip of the app: a short explanation of whatever it wraps (by default a small ⓘ), one
 * behaviour everywhere (docs/DESIGN_SYSTEM.md §7, "Explain").
 *
 * - **Mouse:** opens once the pointer has rested on the trigger for 150ms (HOVER_OPEN_MS), moving
 *   onto it, never by coming in alone: a trigger that a window opening lays under a pointer at rest
 *   gets a pointerenter with no move, and stays closed until the pointer moves (a bubble opened so,
 *   never pointed at, took the Escape meant for its window). The bubble is hoverable (WCAG 1.4.13):
 *   it takes the pointer, the 6px gap to the trigger is bridged, and it closes 100ms
 *   (HOVER_CLOSE_MS) after the pointer has left both. A mouse resting on the trigger as it hydrates,
 *   having moved onto it, opens it then (restsAfterMovingOnto).
 * - **Keyboard:** opens at once on focus; closes on blur or Escape.
 * - **Touch:** a tap opens it. Any tap closes it (on the ⓘ, on the bubble or anywhere else), and
 *   that closing tap does nothing else: a tap on the text a bubble covers never reaches the link or
 *   button under it. Scrolling closes it.
 * - **Escape** closes the bubble alone, never the window or the list it sits in.
 * - **Placement** (placeTip): above, else below, 8px inside the screen, never over its own trigger;
 *   where neither side has room at the body text size, the compact bubble (tipStep), and only where
 *   that has none either, a small sheet at the screen's far edge with the same text. Never a
 *   bubble that scrolls inside itself. Drawn in a layer above the page, or inside the window the
 *   trigger sits in (tipHost), and placed again at every frame while that window moves (landAt,
 *   moving).
 * - **Name:** `label` names an ⓘ specifically ("About KDA"): never "More information". A text
 *   trigger (children) is named by its text and drawn with a dotted underline.
 * - The text is also the trigger's accessible description, so screen readers read it without
 *   opening it. Keep it to one plain sentence, at most about 25 words (tip-length.test.ts).
 *
 * Interactive menus are not tooltips: they stay click-to-open popovers.
 */
export function InfoTip({ text, className, label, children, testId = "info-tip", tabIndex }: { text: React.ReactNode; className?: string; testId?: string; /** -1 leaves it out of the tab order where what it sits on is already the one stop; pointers, taps and screen readers still reach it. */ tabIndex?: number } & ({ children: React.ReactNode; label?: string } | { children?: undefined; /** The ⓘ's name: what it explains ("About KDA"). */ label: string })) {
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState<{ left: number; top: number; side: "top" | "bottom" } | null>(null);
  // Where neither side has room: a sheet at this edge of the screen, until it closes.
  const [sheet, setSheet] = React.useState<"top" | "bottom" | null>(null);
  // Drawn compact (tipStep): the body-size bubble had room on neither side. Until it closes.
  const [compact, setCompact] = React.useState(false);
  // Where the open bubble is drawn, chosen as it opens (tipHost).
  const [host, setHost] = React.useState<HTMLElement | null>(null);
  const trigger = React.useRef<HTMLButtonElement>(null);
  const bubble = React.useRef<HTMLSpanElement>(null);
  // The pointer that pressed the trigger, so a tap does not count as keyboard focus.
  const pressed = React.useRef<string | null>(null);
  // Opened by a tap: scrolling closes it.
  const tapped = React.useRef(false);
  // A mouse over the trigger has opened the bubble on this visit (from its coming in to its leaving):
  // closed by Escape, it stays closed while the pointer moves on over the trigger.
  const visited = React.useRef(false);
  const openTimer = React.useRef(0);
  const closeTimer = React.useRef(0);
  const id = React.useId();

  const clearTimers = () => {
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
  };
  React.useEffect(() => clearTimers, []);

  const place = React.useCallback(() => {
    const t = trigger.current;
    const b = bubble.current;
    if (!t || !b || b.dataset.sheet) return;
    const landed = b.getBoundingClientRect();
    // The screen as fixed positioning sees it, the box the tip is placed in (lib/screen.ts).
    const target = placeTip(t.getBoundingClientRect(), landed, screenBox());
    const next = tipStep(target, b.dataset.compact === "true");
    // Drawn compact, then placed again (the layout effect below, before it is shown).
    if (next === "compact") return setCompact(true);
    if (target.side === "sheet") {
      setSheet(target.edge);
      return;
    }
    // Its size before any transform, unrounded (landAt): the border box, as every box here is sized.
    const size = getComputedStyle(b);
    const at = landAt(target, { left: parseFloat(b.style.left) || 0, top: parseFloat(b.style.top) || 0 }, landed, { width: parseFloat(size.width), height: parseFloat(size.height) });
    setPos((cur) => (cur && cur.side === target.side && Math.abs(cur.left - at.left) < 0.5 && Math.abs(cur.top - at.top) < 0.5 ? cur : { ...at, side: target.side }));
  }, []);

  React.useLayoutEffect(() => {
    if (open) place();
  }, [open, compact, place]);

  const show = React.useCallback((viaTap = false) => {
    clearTimers();
    tapped.current = viaTap;
    setOpen((was) => {
      if (!was) {
        setPos(null);
        setSheet(null);
        setCompact(false);
        setHost(tipHost(trigger.current));
      }
      return true;
    });
  }, []);
  const hide = React.useCallback(() => {
    clearTimers();
    setOpen(false);
  }, []);
  /** The pointer left the trigger or the bubble: closes once it has been off both for HOVER_CLOSE_MS. */
  const leave = () => {
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      visited.current = false;
      setOpen(false);
    }, HOVER_CLOSE_MS);
  };
  const stay = () => window.clearTimeout(closeTimer.current);

  // As the trigger hydrates (a layout effect: before React replays the pointer's coming in, which
  // then starts no new visit), a mouse that moved onto it while the page hydrated, and rests on it
  // still, opens it, as that move would have. A trigger mounted under a pointer at rest stays closed.
  React.useLayoutEffect(() => {
    const t = trigger.current;
    if (!t || !restsAfterMovingOnto(t, lastMouseMove())) return;
    visited.current = true;
    show();
  }, [show]);

  // While the window holding the bubble moves (its opening motion, as a pointer moving over the
  // window opens a bubble in it), the bubble is placed again at every frame, and once more as it comes
  // to rest: placed once in a moving window, it was left off its ⓘ by the window's offset when the
  // motion ended, the window then no longer the box it is placed in (landAt).
  React.useEffect(() => {
    if (!open || !host || host === document.body) return;
    let frame = 0;
    const follow = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      place();
      if (moving(host)) frame = requestAnimationFrame(follow);
    };
    follow();
    // A motion starting, or ending (the last frame of one is not always drawn before its end).
    for (const type of ["animationstart", "animationend", "animationcancel", "transitionrun", "transitionend", "transitioncancel"]) host.addEventListener(type, follow);
    return () => {
      cancelAnimationFrame(frame);
      for (const type of ["animationstart", "animationend", "animationcancel", "transitionrun", "transitionend", "transitioncancel"]) host.removeEventListener(type, follow);
    };
  }, [open, host, place]);

  React.useEffect(() => {
    if (!open) return;
    // A tap or a press anywhere but the trigger and the bubble closes it. A tap's own effect is
    // kept from the page (the press here, the click it becomes below): the tap that closes a bubble
    // does nothing else. A mouse's click elsewhere still does what it does (its bubble follows the
    // pointer, so nothing it covers is hidden from it).
    let swallow = false;
    const onDown = (e: PointerEvent) => {
      const at = e.target as Node;
      if (trigger.current?.contains(at) || bubble.current?.contains(at)) return;
      if (e.pointerType !== "mouse") {
        swallow = true;
        e.preventDefault();
        e.stopPropagation();
      }
      hide();
    };
    // Escape closes the bubble, and only the bubble: heard first (on the window, as it is captured)
    // and kept from everything else, the window it sits in included, whose close request is the
    // key's own default action (stopping the key alone left it to close the window).
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      hide();
    };
    const onScroll = () => {
      // A press that became a scroll is no tap: the click after it is not swallowed.
      swallow = false;
      if (tapped.current) hide();
      else place();
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", place);
      // The click that the closing tap becomes, after the bubble has gone: kept from the page too.
      if (swallow) swallowNextClick();
    };
  }, [open, place, hide]);

  const sheetOpen = sheet !== null;
  return (
    <span className="inline-flex align-middle">
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-describedby={id}
        tabIndex={tabIndex}
        data-testid={testId}
        data-open={open || undefined}
        onPointerDown={(e) => {
          pressed.current = e.pointerType;
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          // A mouse click keeps the hover bubble open; a tap toggles it.
          if (pressed.current === "mouse") show();
          else if (open) hide();
          else show(true);
          pressed.current = null;
        }}
        // A mouse opens it by resting on it, moving: coming in starts a visit (unless the bubble is
        // open already, under a mouse that opened it as the trigger hydrated), and a move starts the
        // wait. A pointer coming back from the bubble keeps it open.
        onPointerEnter={(e) => {
          if (e.pointerType !== "mouse") return;
          stay();
          if (!open) visited.current = false;
        }}
        onPointerMove={(e) => {
          if (e.pointerType !== "mouse" || visited.current) return;
          visited.current = true;
          window.clearTimeout(openTimer.current);
          openTimer.current = window.setTimeout(() => show(), HOVER_OPEN_MS);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType !== "mouse") return;
          if (!open) {
            window.clearTimeout(openTimer.current);
            visited.current = false;
            return;
          }
          leave();
        }}
        onFocus={() => {
          if (!pressed.current) show();
        }}
        onBlur={() => hide()}
        // The ⓘ is a 24px target (WCAG 2.5.8) around its 16px mark, with negative margins so the line
        // around it keeps its size; on touch screens the button itself is 44px, its larger negative margins
        // keeping the same 16px in the line (an invisible ::after before, which counted as overflow). Wrapped text is
        // 24px tall the same way, with a dotted underline to show it opens, and gets no larger area:
        // it often sits on a card that is itself a link, which must keep its taps.
        className={cn(
          children
            ? "-my-1 inline-flex min-h-6 cursor-help items-center rounded-sm underline decoration-current/40 decoration-dotted underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            : "group/tip relative -m-1 inline-flex h-6 w-6 shrink-0 cursor-help items-center justify-center rounded-full text-fg-subtle hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:-m-3.5 pointer-coarse:h-11 pointer-coarse:w-11",
          className,
        )}
      >
        {children ?? (
          <span aria-hidden className="grid h-4 w-4 place-items-center rounded-full border border-border-strong text-4xs font-semibold leading-none group-hover/tip:border-accent">
            i
          </span>
        )}
      </button>
      {/* Always present for screen readers; the visible bubble below is drawn only while open. */}
      <span id={id} className="sr-only">
        {text}
      </span>
      {open && host
        ? createPortal(
            // It takes the pointer (hoverable), and a press or a click on it reaches nothing under it:
            // a click or a tap on it closes it, and nothing else.
            <span
              ref={bubble}
              role="tooltip"
              aria-hidden
              style={sheetOpen ? undefined : { left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? "visible" : "hidden" }}
              className={cn(
                "fixed z-[100] block border border-border-strong bg-bg-elevated text-left font-normal normal-case tracking-normal text-fg shadow-lg",
                sheetOpen
                  ? cn("inset-x-0 px-safe-4 py-3 text-sm leading-normal motion-safe:fade-in", sheet === "bottom" ? "bottom-0 rounded-t-[1.25rem] border-b-0 pb-safe-4" : "top-0 rounded-b-[1.25rem] border-t-0 pt-safe-4")
                  : cn(
                      "w-max rounded-md leading-snug motion-safe:animate-[fade-in_100ms_ease-out]",
                      // The body text size (25 Nov 2026, the owner's readability request: 12px before), a line about as long as it was;
                      // compact (12px, as before) only where that has room on neither side of the trigger (tipStep).
                      compact ? "max-w-[min(18rem,calc(100%-16px))] px-2.5 py-1.5 text-xs" : "max-w-[min(20rem,calc(100%-16px))] px-3 py-2 text-sm",
                      // The 6px between the bubble and its trigger belongs to the bubble, so a pointer crossing it stays in one visit.
                      "before:absolute before:inset-x-0 before:h-1.5 before:content-['']",
                      pos?.side === "bottom" ? "before:bottom-full" : "before:top-full",
                    ),
              )}
              data-testid={`${testId}-bubble`}
              data-sheet={sheet ?? undefined}
              data-compact={compact || undefined}
              onPointerDown={(e) => e.stopPropagation()}
              onPointerEnter={(e) => {
                if (e.pointerType === "mouse") stay();
              }}
              onPointerLeave={(e) => {
                if (e.pointerType !== "mouse") return;
                if (e.relatedTarget instanceof Node && trigger.current?.contains(e.relatedTarget)) return;
                leave();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                hide();
              }}
            >
              {text}
            </span>,
            host,
          )
        : null}
    </span>
  );
}

/** Keeps the next click (within a moment) from reaching the page: the click a closing tap becomes. */
function swallowNextClick() {
  const stop = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    done();
  };
  const done = () => {
    window.removeEventListener("click", stop, true);
    window.clearTimeout(timer);
  };
  window.addEventListener("click", stop, true);
  const timer = window.setTimeout(done, 700);
}
