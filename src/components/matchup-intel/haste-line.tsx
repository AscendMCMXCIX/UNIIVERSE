"use client";

import * as React from "react";
import { GENERAL_RULE_TIP, cooldownAtHaste, hasteMarkWords, meansLine, type HasteBasis, type MeansAbility } from "@/domain/matchup-intel/haste";
import type { AbilityRef } from "@/domain/matchup-intel/types";
import { InfoTip } from "@/components/ui/info-tip";
import { formatPerRank } from "@/lib/format";
import { HasteContext } from "./matchup-frame";

/*
  An ability's cooldown at the haste chosen in the bar (docs/MATCHUP_INTEL.md, "Cooldowns at a
  haste"), under its base line: nothing at 0 haste (the base line says it all), otherwise the value
  at that haste where Riot's general rule applies, the base where the checked notes mark it static
  or leave it open, and which case it is, in words. Never a timer or "ready at". "Riot's general
  rule" opens what the rule rests on (GENERAL_RULE_TIP): the shared InfoTip with the mark's own words
  as its trigger (a tap on touch screens, hover or focus elsewhere), never a hover-only title
  (DESIGN_SYSTEM §7, "Explain"). The space before it is its own: inside the trigger a line's leading
  space is not drawn.
*/

export function HasteLine({ basis }: { basis: HasteBasis }) {
  const { haste } = React.useContext(HasteContext);
  if (haste <= 0 || basis.mark === "none") return null;
  const lines = cooldownAtHaste(basis, haste);
  const value = lines.map((l) => `${l.form ? `${l.form}: ` : ""}${formatPerRank(l.seconds, "s")}`).join("; ");
  const hasted = basis.mark === "general";
  return (
    <p className="basis-full text-xs leading-snug text-fg-muted" data-testid="ability-haste" data-mark={basis.mark}>
      <span className="text-fg-subtle">{`At ${haste} haste: `}</span>
      <span className={hasted ? "font-semibold tabular-nums text-fg" : "tabular-nums"} data-testid="ability-haste-value">
        {value}
      </span>
      {hasted ? (
        <>
          {" "}
          <InfoTip text={GENERAL_RULE_TIP} testId="ability-haste-rule" className="touch-target text-2xs text-fg-subtle">
            <span data-testid="ability-haste-mark">{` · ${hasteMarkWords(basis)}`}</span>
          </InfoTip>
        </>
      ) : (
        <span className="text-2xs text-fg-subtle" data-testid="ability-haste-mark">
          {` · ${hasteMarkWords(basis)}`}
        </span>
      )}
    </p>
  );
}

/**
 * A briefing row's "what it means" line (docs/MATCHUP_INTEL.md, "What it means"): the cooldowns of
 * the enemy's abilities the row rests on, at the haste chosen in the bar, by the cooldown table's own
 * rule, and which case each is. Numbers only, never a verdict, a timer or a "ready at"; nothing for a
 * row that names no enemy ability, or whose numbers do not allow one (meansPart). An ⓘ in the row's
 * heading opens it (the threat's, the opportunity's; the lane points' together beside "In lane",
 * each ability once): the shared InfoTip, a tap on a touch screen, hover or focus elsewhere, and a
 * screen reader reads it as the ⓘ's description. It takes no height: under the chips, or after them,
 * it made the overview up to 147px taller, which the one-screen fit cannot spare.
 */
export function MeansLine({ refs, means, label }: { refs: readonly AbilityRef[]; means: Readonly<Partial<Record<AbilityRef, MeansAbility>>> | undefined; /** The name of the button, after its row ("What the threat means"). */ label: string }) {
  const { haste } = React.useContext(HasteContext);
  if (!means) return null;
  const line = meansLine(refs.flatMap((r) => (means[r] ? [means[r]!] : [])), haste);
  if (!line) return null;
  return (
    <span className="ml-0.5 inline-flex normal-case tracking-normal" data-means={line}>
      <InfoTip text={`What it means: ${line}.`} label={label} testId="briefing-means" />
    </span>
  );
}
