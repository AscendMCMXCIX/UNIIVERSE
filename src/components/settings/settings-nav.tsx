"use client";

import { Gamepad2, UserRound } from "lucide-react";
import { SubNav } from "@/components/ui/sub-nav";

export function SettingsNav() {
  return (
    <SubNav
      label="Settings"
      items={[
        { href: "/settings", label: "Account", icon: UserRound, exact: true },
        { href: "/settings/riot", label: "Riot accounts", icon: Gamepad2 },
      ]}
    />
  );
}
