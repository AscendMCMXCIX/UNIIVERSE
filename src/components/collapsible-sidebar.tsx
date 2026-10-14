"use client";

import * as React from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/cn";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";

/** True inside the desktop sidebar while it shows icons only (groups then show every page as an icon). */
export const SidebarCollapsedContext = React.createContext(false);

/** Delays that keep the hover preview calm: no flicker when the pointer only grazes the edge. */
export const PEEK_OPEN_DELAY_MS = 120;
export const PEEK_CLOSE_DELAY_MS = 260;

/**
 * The desktop sidebar. Two saved states, chosen with the button next to the logo (or Ctrl+\):
 * pinned open (labels) or collapsed (icons). While collapsed, pointing at it (or tabbing into it)
 * opens it temporarily over the page, without moving the page, and it folds back when the
 * pointer leaves. A hover never changes the saved choice, and the sidebar stays open while one of
 * its menus is open or the keyboard focus is inside it. The saved choice lives in a cookie, so the
 * server renders the right width on every page: no jump on load.
 */
export function CollapsibleSidebar({ initialCollapsed, brand, children }: { initialCollapsed: boolean; brand: React.ReactNode; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = React.useState(initialCollapsed);
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
    setCollapsed((was) => {
      const next = !was;
      persist(next);
      return next;
    });
  }, []);

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
    // Touch has no hover: there the button is the way to open it.
    if (!collapsed || e.pointerType === "touch" || suppressPeek.current) return;
    clearTimer();
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

  const label = collapsed ? "Keep sidebar open" : "Collapse sidebar";
  return (
    <SidebarCollapsedContext.Provider value={!open}>
      {/* The slot keeps the pinned width; a peeking sidebar overlays the page instead of pushing it. */}
      <div className={cn("sticky top-0 z-40 hidden h-dvh shrink-0 transition-[width] duration-200 ease-out motion-reduce:transition-none lg:block", collapsed ? "w-[4.5rem]" : "w-64")} data-testid="sidebar-slot">
        <aside
          ref={asideRef}
          data-collapsed={!open}
          data-peek={peek}
          onPointerEnter={onPointerEnter}
          onPointerLeave={onPointerLeave}
          onFocus={onFocus}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          className={cn(
            "group/sidebar absolute inset-y-0 left-0 flex flex-col overflow-y-auto overflow-x-hidden border-r border-border bg-bg-elevated/80 backdrop-blur transition-[width,box-shadow] duration-200 ease-out motion-reduce:transition-none",
            open ? "w-64" : "w-[4.5rem]",
            peek && "bg-bg-elevated shadow-2xl shadow-black/50",
          )}
          data-testid="sidebar"
        >
          <div className={cn("flex items-center gap-2 pb-4 pt-5", open ? "px-3 pl-4" : "flex-col px-2")}>
            <div className="min-w-0 flex-1">{brand}</div>
            <button
              type="button"
              onClick={toggle}
              aria-expanded={!collapsed}
              aria-label={label}
              title={`${label} (Ctrl+\\)`}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border text-fg-muted transition-colors hover:border-border-strong hover:bg-surface-2 hover:text-fg"
              data-testid="sidebar-toggle"
            >
              {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" aria-hidden /> : <PanelLeftClose className="h-[18px] w-[18px]" aria-hidden />}
            </button>
          </div>
          {children}
        </aside>
      </div>
    </SidebarCollapsedContext.Provider>
  );
}
