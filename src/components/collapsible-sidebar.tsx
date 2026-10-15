"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen, Pin } from "lucide-react";
import { cn } from "@/lib/cn";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";

/** Delays that keep the hover preview calm: no flicker when the pointer only grazes the edge. */
export const PEEK_OPEN_DELAY_MS = 90;
export const PEEK_CLOSE_DELAY_MS = 240;

/**
 * The desktop sidebar. Two saved states, chosen with the button at its foot (or Ctrl+\): pinned
 * open (labels) or collapsed (a rail of group icons: My Profile, Team, Meta & Trends). While collapsed, pointing at it (or tabbing into it) opens
 * it temporarily over the page, without moving the page, and it folds back when the pointer
 * leaves. A hover never changes the saved choice, and the sidebar stays open while one of its
 * menus is open or the keyboard focus is inside it. The saved choice lives in a cookie, so the
 * server renders the right width on every page: no jump on load.
 *
 * How it animates: the content is always laid out at the full width, with every icon in the
 * same place in both states (the group headings and the first group's links), so opening and closing never re-flows text. Every animated frame is
 * compositor-only: the background panel slides (transform), the labels and the shadow fade
 * (opacity); the groups fold and unfold through their grid rows (NavLinks). The clip that hides the labels and limits the clickable area to the icon column is
 * never animated (animating clip-path repaints the whole sidebar each frame): it opens at once,
 * and closes only after the slide has finished.
 */
export function CollapsibleSidebar({ initialCollapsed, brand, children, footer }: { initialCollapsed: boolean; brand: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
  const [savedCollapsed, setSavedCollapsed] = React.useState(initialCollapsed);
  // The Draft Room needs the whole width: there the sidebar is a rail unless opened for this visit.
  // That never changes the saved choice, and it is rendered on the server too (no jump on load).
  const pathname = usePathname() ?? "";
  const inRoom = /^\/draft\/[^/]+$/.test(pathname);
  // Opened for one room only: another draft (or leaving and coming back) starts as a rail again.
  const [expandedRoom, setExpandedRoom] = React.useState<string | null>(null);
  const collapsed = savedCollapsed || (inRoom && expandedRoom !== pathname);
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
    if (inRoom && !savedCollapsed) {
      setExpandedRoom((was) => (was === pathname ? null : pathname));
      return;
    }
    setSavedCollapsed((was) => {
      const next = !was;
      persist(next);
      return next;
    });
  }, [inRoom, savedCollapsed, pathname]);

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
    // Touch has no hover: there the button at the foot opens it.
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
    <div className={cn("sticky top-0 z-40 hidden h-dvh shrink-0 lg:block", collapsed ? "w-[4.5rem]" : "w-64")} data-testid="sidebar-slot">
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
        className={cn(
          "group/sidebar absolute inset-y-0 left-0 w-64",
          // Collapsed: only the 4.5rem icon column is visible (and clickable). Open: everything,
          // plus room for the shadow of a peeking sidebar. Switched, never tweened.
          open ? "[clip-path:inset(0_-3rem_0_0)] [transition:clip-path_0s]" : "[clip-path:inset(0_11.5rem_0_0)] [transition:clip-path_0s_linear_220ms] motion-reduce:[transition:none]",
        )}
        data-testid="sidebar"
      >
        {/* The peek shadow: its own layer, faded in and out (opacity only). */}
        <div aria-hidden className={cn("pointer-events-none absolute inset-0 shadow-2xl shadow-black/50 transition-opacity duration-200 motion-reduce:transition-none", peek ? "opacity-100" : "opacity-0")} />
        {/* Background and edge: slides with the visible width (composited transform). */}
        <div
          aria-hidden
          className={cn(
            "absolute inset-0 border-r border-border bg-bg-elevated/95 transition-transform duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform motion-reduce:transition-none",
            open ? "translate-x-0" : "-translate-x-[11.5rem]",
          )}
        />
        <div className="relative flex h-full w-64 flex-col overflow-y-auto overflow-x-hidden">
          <div className="px-4 pb-4 pt-5">{brand}</div>
          {children}
          <div className="mt-auto space-y-3 px-3 pb-3 pt-6">
            <button
              type="button"
              onClick={toggle}
              aria-expanded={!collapsed}
              aria-label={label}
              title={`${label} (Ctrl+\\)`}
              className="flex min-h-9 w-full items-center gap-3 rounded-lg pl-[15px] pr-3 text-left text-sm text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
              data-testid="sidebar-toggle"
            >
              <ToggleIcon className="h-[18px] w-[18px] shrink-0" aria-hidden />
              <span className="truncate transition-opacity duration-150 group-data-[collapsed=true]/sidebar:opacity-0">{label}</span>
            </button>
            {footer}
          </div>
        </div>
      </aside>
    </div>
  );
}
