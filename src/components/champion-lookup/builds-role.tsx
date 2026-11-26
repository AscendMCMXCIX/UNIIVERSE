"use client";

import * as React from "react";
import type { Role } from "@/domain/roles";

/*
  The role a champion's builds section shows (docs/CHAMPION_INTEL.md, "Builds and runes"): held by
  the page's view (LookupView), which writes it to the address (role, role2) beside the champion and
  its haste, swaps it with its champion and drops it when the champion changes. Each column's
  section reads and sets its own here. Outside the page (a test) the section keeps its own.
*/

export interface BuildsRole {
  /** The role chosen; null for the section's default (its most played role). */
  role: Role | null;
  setRole: (role: Role | null) => void;
}

const BuildsRoleContext = React.createContext<BuildsRole | null>(null);

export function BuildsRoleProvider({ value, children }: { value: BuildsRole; children: React.ReactNode }) {
  return <BuildsRoleContext.Provider value={value}>{children}</BuildsRoleContext.Provider>;
}

/** The column's role and its setter, or a state of the section's own where no page holds one. */
export function useBuildsRole(): BuildsRole {
  const held = React.useContext(BuildsRoleContext);
  const [own, setOwn] = React.useState<Role | null>(null);
  return held ?? { role: own, setRole: setOwn };
}
