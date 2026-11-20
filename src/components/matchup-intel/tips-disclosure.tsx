"use client";

import type * as React from "react";
import { Fold } from "@/components/ui/fold";

/*
  Riot's tips as one fold (docs/MATCHUP_INTEL.md, "The dashboard"): a single line under the enemy's
  kit until opened, so the one-screen fit holds at 1920 by 950 with the longest briefings. The
  shared Fold (a row: its chevron at the line's end), on the native details element, so it works
  before the page's code has run.
*/

export function TipsDisclosure({ summary, children }: { summary: React.ReactNode; children: React.ReactNode }) {
  return (
    <Fold variant="row" testId="matchup-riot-tips-fold" summaryTestId="matchup-riot-tips-summary" summary={summary}>
      {children}
    </Fold>
  );
}
