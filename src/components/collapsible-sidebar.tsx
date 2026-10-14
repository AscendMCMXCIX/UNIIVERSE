"use client";

import * as React from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/cn";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";

/**
 * The desktop sidebar, expandable (labels) or collapsed (icons with tooltips). The choice is kept
 * in a cookie, so the server renders the right width on every page and visit: no jump on load.
 * Everything inside reads the state from `data-collapsed` (group "sidebar") through CSS.
 */
export function CollapsibleSidebar({ initialCollapsed, children }: { initialCollapsed: boolean; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = React.useState(initialCollapsed);
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "expanded"}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  };
  return (
    <aside
      data-collapsed={collapsed}
      className={cn("group/sidebar sticky top-0 hidden h-dvh shrink-0 flex-col overflow-y-auto overflow-x-hidden border-r border-border bg-bg-elevated/80 backdrop-blur transition-[width] duration-200 ease-out motion-reduce:transition-none lg:flex", collapsed ? "w-[4.5rem]" : "w-64")}
      data-testid="sidebar"
    >
      {children}
      <div className={cn("px-3 pb-3", collapsed && "px-2")}>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-sm text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
          data-testid="sidebar-toggle"
        >
          {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px] shrink-0" aria-hidden /> : <PanelLeftClose className="h-[18px] w-[18px] shrink-0" aria-hidden />}
          <span className="truncate group-data-[collapsed=true]/sidebar:hidden">Collapse</span>
        </button>
      </div>
    </aside>
  );
}
