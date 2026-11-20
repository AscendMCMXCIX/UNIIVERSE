"use client";

import * as React from "react";
import { cooldownAtHaste, hasteMarkWords, type HasteBasis } from "@/domain/matchup-intel/haste";
import { formatPerRank } from "@/lib/format";
import { HasteContext } from "./matchup-frame";

/*
  An ability's cooldown at the haste chosen in the bar (docs/MATCHUP_INTEL.md, "Cooldowns at a
  haste"), under its base line: nothing at 0 haste (the base line says it all), otherwise the value
  at that haste where Riot's general rule applies, the base where the checked notes mark it static
  or leave it open, and which case it is, in words. Never a timer or "ready at". What the general
  rule rests on is said once, by the ⓘ beside the haste choice (HasteChoice), not in a hover-only
  title on every line (DESIGN_SYSTEM §7, "Explain").
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
      <span className="text-2xs text-fg-subtle" data-testid="ability-haste-mark">
        {` · ${hasteMarkWords(basis)}`}
      </span>
    </p>
  );
}
