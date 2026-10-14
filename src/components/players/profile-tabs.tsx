"use client";

import { BarChart3, UserRound } from "lucide-react";
import { SubNav } from "@/components/ui/sub-nav";

export function ProfileTabs({ playerId, showStats }: { playerId: string; showStats: boolean }) {
  return (
    <SubNav
      label="Profile sections"
      items={[{ href: `/players/${playerId}`, label: "Profile", icon: UserRound, exact: true }, ...(showStats ? [{ href: `/players/${playerId}/stats`, label: "Season statistics", icon: BarChart3 }] : [])]}
    />
  );
}
