"use client";

import * as React from "react";
import { PanelLeftClose, PanelLeftOpen, Pin } from "lucide-react";
import { cn } from "@/lib/cn";
import { RAIL_DIVIDER, RAIL_FADE, RAIL_HIGHLIGHT, RAIL_HOVER, RAIL_ICON, RAIL_ICON_IDLE, RAIL_ROW, SIDEBAR_COOKIE, SIDEBAR_RAIL } from "@/lib/sidebar";
import { releaseEarlyTaps } from "./early-taps";

/** Delays that keep the hover preview calm: no flicker when the pointer only grazes the edge. */
export const PEEK_OPEN_DELAY_MS = 90;
export const PEEK_CLOSE_DELAY_MS = 240;

/** The slide: transform only (composited), one curve for the edge and the content so they stay in step. */
const SLIDE = "transition-transform duration-220 ease-glide motion-reduce:transition-none";

/**
 * The desktop sidebar. Two saved states, chosen with the button under the logo (or Ctrl+\): pinned
 * open (labels) or collapsed (a rail of entry icons: My Profile, Team). While collapsed, pointing at it (or tabbing into it) opens
 * it temporarily over the page, without moving the page, and it folds back when the pointer
 * leaves. A hover never changes the saved choice, and the sidebar stays open while one of its
 * menus is open or the keyboard focus is inside it. The saved choice lives in a cookie, so the
 * server renders the right width on every page: no jump on load.
 *
 * How it animates: the content is always laid out at the full width, with every icon in the
 * same place in both states, so opening and closing never re-flows text. A window with
 * overflow hidden slides to move the visible edge, and the content inside it slides back by the
 * same amount on the same curve, so it stays still while the edge passes over it: both are
 * transforms (composited, no repaint per frame), and the edge clips the labels and the current
 * page's highlight in every frame. (Before, the clip was switched 220 ms after the slide began,
 * so while collapsing the current entry's highlight and the fading labels stood out over the
 * page beside the rail.) The page itself takes its new width at once, under the opaque panel.
 * The labels and the shadow fade (opacity). Reduced motion switches every transition off.
 */
export function CollapsibleSidebar({ initialCollapsed, brand, children, footer }: { initialCollapsed: boolean; brand: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
  const [savedCollapsed, setSavedCollapsed] = React.useState(initialCollapsed);
  const collapsed = savedCollapsed;
  const [peek, setPeek] = React.useState(false);
  const asideRef = React.useRef<HTMLElement>(null);
  const timer = React.useRef<number | null>(null);
  const pointerInside = React.useRef(false);
  /** Just collapsed with the button: no preview until the pointer has left the sidebar once. */
  const suppressPeek = React.useRef(false);

  const clearTimer = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  /** Something inside still needs the sidebar open: an open menu, or keyboard focus. */
  const busy = React.useCallback(() => {
    const el = asideRef.current;
    if (!el) return false;
    if (el.querySelector('[aria-expanded="true"][aria-haspopup]')) return true;
    const active = document.activeElement;
    return !!active && el.contains(active) && active.matches(":focus-visible");
  }, []);
  const scheduleClose = React.useCallback(() => {
    clearTimer();
    timer.current = window.setTimeout(() => {
      if (pointerInside.current || busy()) return;
      setPeek(false);
    }, PEEK_CLOSE_DELAY_MS);
  }, [busy]);

  const persist = (next: boolean) => {
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "expanded"}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  };
  const toggle = React.useCallback(() => {
    clearTimer();
    setPeek(false);
    suppressPeek.current = pointerInside.current;
    setSavedCollapsed((was) => {
      const next = !was;
      persist(next);
      return next;
    });
  }, []);

  // The page's code runs now: a click on the collapse control made before it (early-taps.ts) is
  // passed on to the control, once however often it was clicked (a toggle applied twice would undo
  // itself).
  React.useEffect(() => releaseEarlyTaps("sidebar"), []);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "\\" && (e.ctrlKey || e.metaKey) && !e.altKey) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  // When a menu opened from the peeking sidebar closes, fold back if the pointer has left.
  React.useEffect(() => {
    const el = asideRef.current;
    if (!el || !peek) return;
    const observer = new MutationObserver(() => {
      if (!pointerInside.current && !busy()) scheduleClose();
    });
    observer.observe(el, { subtree: true, attributes: true, attributeFilter: ["aria-expanded"] });
    return () => observer.disconnect();
  }, [peek, busy, scheduleClose]);
  React.useEffect(() => () => clearTimer(), []);

  const open = !collapsed || peek;
  const onPointerEnter = (e: React.PointerEvent) => {
    pointerInside.current = true;
    // Touch has no hover: there the button under the logo opens it.
    if (!collapsed || e.pointerType === "touch" || suppressPeek.current) return;
    clearTimer();
    if (peek) return;
    timer.current = window.setTimeout(() => setPeek(true), PEEK_OPEN_DELAY_MS);
  };
  const onPointerLeave = () => {
    pointerInside.current = false;
    suppressPeek.current = false;
    if (!collapsed) return;
    if (!peek) clearTimer();
    else scheduleClose();
  };
  const onFocus = (e: React.FocusEvent) => {
    if (collapsed && (e.target as HTMLElement).matches(":focus-visible")) {
      clearTimer();
      setPeek(true);
    }
  };
  const onBlur = (e: React.FocusEvent) => {
    if (!collapsed || !peek) return;
    if (e.relatedTarget && asideRef.current?.contains(e.relatedTarget as Node)) return;
    scheduleClose();
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && peek) {
      setPeek(false);
      (document.querySelector("main") as HTMLElement | null)?.focus?.();
    }
  };

  const label = collapsed ? (peek ? "Keep sidebar open" : "Open sidebar") : "Collapse sidebar";
  const ToggleIcon = collapsed ? (peek ? Pin : PanelLeftOpen) : PanelLeftClose;
  return (
    // The slot keeps the pinned width; a peeking sidebar overlays the page instead of pushing it.
    <div className={cn("sticky top-0 z-40 hidden h-dvh shrink-0 lg:block", collapsed ? SIDEBAR_RAIL : "w-64")} data-testid="sidebar-slot">
      <aside
        aria-label="Sidebar"
        ref={asideRef}
        data-collapsed={!open}
        data-peek={peek}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        // Only the window below takes the pointer: collapsed, the page beside the icon column stays clickable.
        className="group/sidebar pointer-events-none absolute inset-y-0 left-0 w-64"
        data-testid="sidebar"
      >
        {/* The peek shadow: on its own layer, it moves with the visible edge and fades (opacity only). */}
        <div aria-hidden className={cn(SLIDE, "absolute inset-0", open ? "translate-x-0" : "-translate-x-[11.5rem]")}>
          <div className={cn("absolute inset-0 shadow-2xl shadow-black/50 transition-opacity duration-200 motion-reduce:transition-none", peek ? "opacity-100" : "opacity-0")} />
        </div>
        {/* The window onto the sidebar: its right edge is the sidebar's visible edge, and it clips
            everything (labels, the current page's highlight) at that edge in every frame. Clip,
            not hidden: an overflow-hidden box can still be scrolled by focus or scrollIntoView,
            which would shift the content sideways under the edge. */}
        {/* The edge line is drawn just outside the window (a 1px shadow, not a border), so the
            collapsed rail's inside is the full 4.5rem and its centre line is the icons' and the logo's. */}
        <div className={cn(SLIDE, "pointer-events-auto absolute inset-0 overflow-clip bg-chrome shadow-[1px_0_0_var(--color-border)]", open ? "translate-x-0" : "-translate-x-[11.5rem]")} data-testid="sidebar-window">
          {/* The content moves the other way by the same amount on the same curve: it stays still on
              screen. It wears the frame's light (chrome-light, globals.css): a sheen from the top and
              a faint violet glow behind the logo, the page's ambient light continued into the frame,
              so the logo sits in light rather than on a flat block, open or collapsed. */}
          <div className={cn(SLIDE, "chrome-light flex h-full w-64 flex-col overflow-y-auto overflow-x-hidden", open ? "translate-x-0" : "translate-x-[11.5rem]")}>
            {/* Three zones, each separated by a hairline (RAIL_DIVIDER): the brand with the collapse
                control under it, the pages, and the footer (the switch between the modes, Install App,
                the account). Inside a zone every icon is one 2.625rem step below the last; the logo
                is a step and a half above the control, so the brand has room around it. No padding
                on the left: the brand centres the logo in a rail-wide column from this edge
                (SIDEBAR_RAIL_COLUMN, app-shell.tsx). */}
            <div className="pb-2 pr-4 pt-4">{brand}</div>
            {/* The collapse control: under the logo, in the icon column, so it is in the same place open or collapsed. */}
            <div className="px-3 pb-3">
              {/* Named by its visible text (no aria-label): the name is exactly what is shown, so a
                  speech user can say it. The shortcut hint is not part of the name; screen readers
                  get it from aria-keyshortcuts and the tooltip. It is a quieter row than the pages
                  (lighter text, no weight); its shortcut appears over the row's end while it is pointed
                  at or focused, taking no room from the label. A click before the page's code has run
                  is kept (data-early; suppressHydrationWarning: the script may have marked it
                  aria-busy, which React leaves alone). */}
              <button
                type="button"
                onClick={toggle}
                aria-expanded={!collapsed}
                aria-keyshortcuts="Control+Backslash Meta+Backslash"
                title={`${label} (Ctrl+\\)`}
                className={cn(RAIL_ROW, "min-h-9 py-1.5 font-normal text-fg-subtle hover:text-fg")}
                data-early="sidebar"
                suppressHydrationWarning
                data-testid="sidebar-toggle"
              >
                <span className={cn(RAIL_HIGHLIGHT, RAIL_HOVER)} aria-hidden />
                <ToggleIcon className={cn(RAIL_ICON, RAIL_ICON_IDLE)} aria-hidden />
                <span className={cn("min-w-0 flex-1 truncate", RAIL_FADE)}>{label}</span>
                <kbd className="absolute right-3 top-1/2 -translate-y-1/2 rounded border border-border bg-bg/40 px-1.5 py-px font-sans text-2xs leading-4 text-fg-subtle opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 group-data-[collapsed=true]/sidebar:opacity-0!" aria-hidden>
                  Ctrl {"\\"}
                </kbd>
              </button>
            </div>
            <div className={RAIL_DIVIDER} aria-hidden data-testid="rail-divider" />
            <div className="pt-3">{children}</div>
            {footer ? (
              <div className="mt-auto pt-6">
                <div className={RAIL_DIVIDER} aria-hidden data-testid="rail-divider" />
                <div className="space-y-1 px-3 pb-3 pt-3">{footer}</div>
              </div>
            ) : null}
          </div>
        </div>
      </aside>
    </div>
  );
}
