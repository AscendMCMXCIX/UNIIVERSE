"use client";

import { Gamepad2, LayoutDashboard, Swords } from "lucide-react";
import { SubNav } from "@/components/ui/sub-nav";

/** The profile's three tabs; the same for My Profile and a teammate. */
export function ProfileTabs({ basePath }: { basePath: string }) {
  return (
    <SubNav
      label="Profile"
      items={[
        { href: basePath, label: "Overview", icon: LayoutDashboard, exact: true },
        { href: `${basePath}/champions`, label: "Champions & Roles", icon: Swords },
        { href: `${basePath}/accounts`, label: "Riot Accounts", icon: Gamepad2 },
      ]}
    />
  );
}
