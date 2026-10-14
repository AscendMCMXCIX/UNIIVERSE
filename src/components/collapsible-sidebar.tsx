"use client";

import * as React from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/cn";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";

/** True inside the desktop sidebar while it is collapsed to icons (groups then show every page as an icon). */
export const SidebarCollapsedContext = React.createContext(false);

/**
 * The desktop sidebar, expanded (labels) or collapsed (icons with tooltips). The toggle sits in
 * the sidebar's header, next to the logo, on every page; Ctrl+\ (⌘+\ on a Mac) toggles it too.
 * The choice is kept in a cookie, so the server renders the right width on every page and visit:
 * no jump on load. Everything inside reads the state from `data-collapsed` (group "sidebar")
 * through CSS, or from SidebarCollapsedContext.
 */
export function CollapsibleSidebar({ initialCollapsed, brand, children }: { initialCollapsed: boolean; brand: React.ReactNode; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = React.useState(initialCollapsed);
  const toggle = React.useCallback(() => {
    setCollapsed((was) => {
      const next = !was;
      document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "expanded"}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
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
  const label = collapsed ? "Expand sidebar" : "Collapse sidebar";
  return (
    <SidebarCollapsedContext.Provider value={collapsed}>
      <aside
        data-collapsed={collapsed}
        className={cn("group/sidebar sticky top-0 hidden h-dvh shrink-0 flex-col overflow-y-auto overflow-x-hidden border-r border-border bg-bg-elevated/80 backdrop-blur transition-[width] duration-200 ease-out motion-reduce:transition-none lg:flex", collapsed ? "w-[4.5rem]" : "w-64")}
        data-testid="sidebar"
      >
        <div className={cn("flex items-center gap-2 pb-4 pt-5", collapsed ? "flex-col px-2" : "px-3 pl-4")}>
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
    </SidebarCollapsedContext.Provider>
  );
}
