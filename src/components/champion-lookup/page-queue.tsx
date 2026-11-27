"use client";

import * as React from "react";
import { DEFAULT_LANE_QUEUE, type LaneQueueKey } from "@/domain/matchup/queues";

/*
  The page's queue (docs/CHAMPION_INTEL.md, "Address"; the owner's decision D5): one choice for the
  whole of Champion Intel, Ranked Solo/Duo by default, Flex, Normal Draft and Clash each on their
  own. Held by the page's view (LookupView), which writes it to the address (queue=flex, Solo/Duo
  left out) and keeps it through Swap, ✕ and a champion change; read and set here by Matchup Intel's
  "In the team's matches" (every queue's figures are already on the page, so a change reads
  nothing). The builds by queue read the same choice (their BuildsChoiceProvider; the two are one
  parameter). Outside the page (a test) a block keeps a queue of its own.
*/

export interface PageQueue {
  queue: LaneQueueKey;
  setQueue: (queue: LaneQueueKey) => void;
}

const PageQueueContext = React.createContext<PageQueue | null>(null);

export function PageQueueProvider({ value, children }: { value: PageQueue; children: React.ReactNode }) {
  return <PageQueueContext.Provider value={value}>{children}</PageQueueContext.Provider>;
}

/** The page's queue and its setter, or a state of the block's own where no page holds one. */
export function usePageQueue(): PageQueue {
  const held = React.useContext(PageQueueContext);
  const [own, setOwn] = React.useState<LaneQueueKey>(DEFAULT_LANE_QUEUE);
  return held ?? { queue: own, setQueue: setOwn };
}
