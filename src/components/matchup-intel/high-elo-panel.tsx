"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { segmentClass, segmentedGroupClass } from "@/components/ui/segmented";
import { REGION_NAMES, type HighEloRegion, type HighEloSection } from "@/domain/matchup-intel/high-elo/lines";
import { HIGH_ELO_CHOICES } from "@/domain/matchup-intel/high-elo/counts";
import { EvidenceLines } from "./evidence-lines";

/*
  MATCHUP INTEL's observed Master+ games (docs/HIGH_ELO_EVIDENCE.md, "What the page shows"): the
  third section of the evidence fold, after the team's own games. All regions first, the others one
  press away on the shared segmented control (no tab, no new scrolling: the fold stays closed by
  default). Its title says the games were observed, and the line under it that they are not the
  curated briefing's advice, so the two are never read as one.
*/

/** The segment's short name; the full one is its accessible name, and the tier line says it once chosen. */
const SHORT: Record<HighEloRegion, string> = { all: "All", americas: "Americas", europe: "Europe", asia: "KR/JP", sea: "SEA/OCE" };

export const HIGH_ELO_NOT_ADVICE = "Observed shares, not advice: weighted by each region's Master+ players, so no region counts for more than its share. The curated briefing is written separately.";

const isChoice = (key: string) => (HIGH_ELO_CHOICES as readonly string[]).includes(key);

export function HighEloPanel({ sections }: { sections: readonly HighEloSection[] }) {
  const [region, setRegion] = useState<HighEloRegion>("all");
  const section = sections.find((s) => s.region === region) ?? sections[0]!;
  return (
    <div className="space-y-1 border-t border-border pt-1.5" data-testid="evidence-high">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="text-xs font-semibold text-fg" data-testid="high-elo-tier">
          {section.tier}
        </p>
        <div role="radiogroup" aria-label="Region of the Master+ games" className={segmentedGroupClass("ml-auto")} data-testid="high-elo-regions">
          {sections.map((s) => (
            <button key={s.region} type="button" role="radio" aria-checked={s.region === region} aria-label={REGION_NAMES[s.region]} onClick={() => setRegion(s.region)} className={segmentClass(s.region === region, { className: cn("min-h-6 px-2 text-2xs") })} data-region={s.region}>
              {SHORT[s.region]}
            </button>
          ))}
        </div>
      </div>
      <p className="text-2xs text-fg-subtle" data-testid="high-elo-not-advice">
        {HIGH_ELO_NOT_ADVICE}
      </p>
      {section.lines.length ? (
        <>
          <EvidenceLines lines={section.lines.filter((l) => l.key === "record" || l.key === "pair")} scope="high" hasteWordsAt={null} />
          {/* The choices' one shared sample, said once above them. */}
          {section.choices ? (
            <p className="text-2xs text-fg-subtle" data-testid="high-elo-choices">
              {section.choices}
            </p>
          ) : null}
          <EvidenceLines lines={section.lines.filter((l) => isChoice(l.key))} scope="high" hasteWordsAt={null} />
          <EvidenceLines lines={section.lines.filter((l) => l.key === "end")} scope="high" hasteWordsAt={null} />
        </>
      ) : null}
      {section.empty ? (
        <p className="text-xs text-fg-muted" data-testid="high-elo-empty">
          {section.empty}
        </p>
      ) : null}
    </div>
  );
}
