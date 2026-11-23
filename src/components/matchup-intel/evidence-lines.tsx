import { riotChangedLead } from "./wording";
import type { EvidenceLine } from "@/domain/matchup-intel/evidence";
import { SUMMONER_SPELL_HASTE_WORDS } from "@/domain/matchup-intel/haste";

/*
  A section's counted evidence lines, each with its sample, its "Riot changed this" label and its
  note (evidence-panel.tsx: the team's games; high-elo-panel.tsx: the observed Master+ games).
*/

/** A section's counted lines, each with its sample (the team's games and the observed Master+ games alike). */
export function EvidenceLines({ lines, scope, hasteWordsAt }: { lines: readonly EvidenceLine[]; scope: string; hasteWordsAt: string | null }) {
  return (
    <ul className="space-y-0.5">
          {lines.map((l) => (
            <li key={l.key} className="text-xs leading-snug text-fg-muted" data-testid="evidence-line" data-key={l.key}>
              <span className="font-medium text-fg">{l.label}:</span> <span data-testid="evidence-values">{l.values}</span>
              {l.sample ? (
                <>
                  {" "}
                  <span className="text-fg-subtle" data-testid="evidence-sample">
                    {l.sample.startsWith("of ") ? "" : "· "}
                    {l.sample}
                  </span>
                </>
              ) : null}
              {l.changedOn ? (
                <>
                  {" "}
                  <span className="text-2xs text-fg-subtle" data-testid="riot-changed">
                    · {riotChangedLead(false)} <span className="whitespace-nowrap">on {l.changedOn}</span>
                  </span>
                </>
              ) : null}
              {l.note ? <span className="block text-2xs text-fg-subtle">{l.note}</span> : null}
              {/* Riot's base cooldowns only: the haste choice never shortens a summoner spell. */}
              {l.cooldowns ? (
                <span className="block text-2xs text-fg-subtle" data-testid="evidence-spell-cooldowns">
                  {l.cooldowns}
                  {hasteWordsAt === `${scope}:${l.key}` ? `. ${SUMMONER_SPELL_HASTE_WORDS}.` : "."}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
  );
}
