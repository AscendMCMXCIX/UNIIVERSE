"use client";

import * as React from "react";
import { TrendingUp, Trophy } from "lucide-react";
import { SubTabs } from "@/components/ui/sub-tabs";
import { PageToolbar } from "@/components/ui/page-toolbar";

/**
 * Leaderboards' two views as secondary tabs (ui/sub-tabs), as Match History's Games and
 * Encounters: Recent form and Records & achievements. A client component, so the tabs' icons stay
 * in the browser (a server component cannot hand components to one).
 */
export function LeaderboardsViews({ current, hrefs }: { current: "form" | "records"; hrefs: Record<"form" | "records", string> }) {
  const items = [
    { key: "form", label: "Recent form", icon: TrendingUp, href: hrefs.form, testId: "leaderboards-tab-form" },
    { key: "records", label: "Records & achievements", short: "Records", icon: Trophy, href: hrefs.records, testId: "leaderboards-tab-records" },
  ];
  // From md, once these tabs have scrolled away: the same two views at the pinned tabs' end (ui/page-toolbar.tsx).
  const own = React.useRef<HTMLElement>(null);
  return (
    <>
      <SubTabs ref={own} label="Leaderboards views" items={items} current={current} testId="leaderboards-views" />
      <PageToolbar anchor={own} label="Leaderboards controls">
        <SubTabs size="compact" label="Leaderboards views" items={items} current={current} testId="leaderboards-views" />
      </PageToolbar>
    </>
  );
}
