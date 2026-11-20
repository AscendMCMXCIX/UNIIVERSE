"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";

/*
  Riot's tips as one fold (docs/MATCHUP_INTEL.md, "The dashboard"): a single line under the enemy's
  kit until opened, so the one-screen fit holds at 1920 by 950 with the longest briefings. The native
  details element: it works before the page's code has run.
*/

export function TipsDisclosure({ summary, children }: { summary: React.ReactNode; children: React.ReactNode }) {
  return (
    <details className="group/tipsall" data-testid="matchup-riot-tips-fold">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 pointer-fine:min-h-7 [&::-webkit-details-marker]:hidden" data-testid="matchup-riot-tips-summary">
        {summary}
        <ChevronDown className="h-4 w-4 shrink-0 text-fg-subtle transition-transform group-open/tipsall:rotate-180 motion-reduce:transition-none" aria-hidden />
      </summary>
      {children}
    </details>
  );
}
