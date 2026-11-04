"use client";

import { TrendingUp, Trophy } from "lucide-react";
import { SubTabs } from "@/components/ui/sub-tabs";

/**
 * Leaderboards' two views as secondary tabs (ui/sub-tabs), as Match History's Games and
 * Encounters: Recent form and Records & achievements. A client component, so the tabs' icons stay
 * in the browser (a server component cannot hand components to one).
 */
export function LeaderboardsViews({ current, hrefs }: { current: "form" | "records"; hrefs: Record<"form" | "records", string> }) {
  const items = [
    { key: "form", label: "Recent form", icon: TrendingUp, href: hrefs.form, testId: "leaderboards-tab-form" },
    { key: "records", label: "Records & achievements", icon: Trophy, href: hrefs.records, testId: "leaderboards-tab-records" },
  ];
  return <SubTabs label="Leaderboards views" items={items} current={current} testId="leaderboards-views" />;
}
