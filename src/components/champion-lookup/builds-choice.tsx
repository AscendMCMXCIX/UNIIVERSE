"use client";

import * as React from "react";
import { DEFAULT_BUILD_QUEUE, type BuildQueueKey, type BuildSource } from "@/domain/champion-builds";
import type { Role } from "@/domain/roles";

/*
  What a champion's builds section shows (docs/CHAMPION_INTEL.md, "Builds and runes"), held by the
  page's view (LookupView), which writes it to the address:
  - the role, each column's own (role, role2), swapped with its champion and dropped when the
    champion changes;
  - the queue and the source, the page's (queue, source): both columns of Compare read the same
    population, so changing either column's choice changes both, and Swap, ✕ and a new champion
    keep them;
  - whether it sits in a column of Compare (its rows then take the board's own, so the two
    champions' parts line up).
  Outside the page (a test) the section keeps its own, as one champion's.
*/

export interface BuildsChoice {
  /** The role chosen; null for the section's default (its most played role). */
  role: Role | null;
  setRole: (role: Role | null) => void;
  /** The queue the builds count (Ranked Solo/Duo by default; never several). */
  queue: BuildQueueKey;
  setQueue: (queue: BuildQueueKey) => void;
  /** The team's matches, or anonymous Master+ games where the page offers them. */
  source: BuildSource;
  setSource: (source: BuildSource) => void;
  /** The section sits in a column of Compare's board (its subgrid rows), not across one champion's. */
  compare?: boolean;
}

const BuildsChoiceContext = React.createContext<BuildsChoice | null>(null);

export function BuildsChoiceProvider({ value, children }: { value: BuildsChoice; children: React.ReactNode }) {
  return <BuildsChoiceContext.Provider value={value}>{children}</BuildsChoiceContext.Provider>;
}

/** The column's choices and their setters, or a state of the section's own where no page holds one. */
export function useBuildsChoice(): BuildsChoice {
  const held = React.useContext(BuildsChoiceContext);
  const [role, setRole] = React.useState<Role | null>(null);
  const [queue, setQueue] = React.useState<BuildQueueKey>(DEFAULT_BUILD_QUEUE);
  const [source, setSource] = React.useState<BuildSource>("team");
  return held ?? { role, setRole, queue, setQueue, source, setSource };
}
