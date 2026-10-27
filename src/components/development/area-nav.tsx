"use client";

import { BookOpenCheck, Compass, ListChecks } from "lucide-react";
import { SubNav } from "@/components/ui/sub-nav";

/** Ranked Development's three areas: Overview (before and after a game), Sessions, and Development (the library). */
export function DevelopmentAreaNav() {
  return (
    <SubNav
      label="Ranked Development"
      items={[
        { href: "/overview/development", label: "Overview", icon: Compass, exact: true },
        { href: "/overview/development/sessions", label: "Sessions", icon: ListChecks },
        { href: "/overview/development/library", label: "Development", icon: BookOpenCheck },
      ]}
    />
  );
}
