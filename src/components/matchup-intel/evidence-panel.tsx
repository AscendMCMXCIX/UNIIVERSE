import { Sigma } from "lucide-react";
import { cn } from "@/lib/cn";
import { riotChangedLead } from "./wording";
import type { MatchupEvidence, EvidenceSection } from "@/domain/matchup-intel/evidence";

/*
  MATCHUP INTEL's evidence from the team's own games (docs/MATCHUP_INTEL.md, "In your games"): in
  the fold it shares with Riot's tips, so the one-screen fit holds. Its words in the fold's line state the tiers with their n
  ("In your games (n = 9) · In the team's games (n = 23)"); inside, each section's lines, every one
  counted from stored games with its sample ("4 of 9 games · patch 26.22 · Solo/Duo 3, Normal Draft
  6"), never a recommendation. A section with no counted line says why in one line. Then the
  evidence the page does not have, said as such ("No high-elo evidence (not collected)", "Power
  spikes: Not measured yet", "No wave guidance for this matchup").
*/

export const NO_HIGH_ELO = "No high-elo evidence (not collected)";
export const NO_DUO_NOTES = "No curated notes for this 2v2";
/**
 * The briefing's items with nothing measured or written for them yet (the overhaul's PLAN §4), said
 * as such beside the high-elo line, never left out or guessed: power spikes wait for the high-elo
 * statistics (OD4; explanations for the owner's curation, OD6); wave guidance has no honest source,
 * as Riot's match records hold no wave state (docs/MATCHUP_INTEL.md, "Evidence" in the S7a section).
 */
export const POWER_SPIKES_LABEL = "Power spikes:";
export const NOT_MEASURED_YET = "Not measured yet";
export const NO_WAVE_GUIDANCE = "No wave guidance for this matchup";
export const UNCERTAIN = "Matchup uncertain: no curated notes and no counted games for this pair, so each champion's own facts follow";
/** The pair has a curated briefing, hidden above (too old, or resting on a change): never "no curated notes". */
export const UNCERTAIN_HIDDEN = "Matchup uncertain: this pair's curated briefing is hidden above and no games are counted, so each champion's own facts follow";


/** The tier a row of the page rests on, in small type beside its title ("Riot's data", "Checked notes (AI reviewers)"). */
export function TierLabel({ children, className }: { children: string; className?: string }) {
  return (
    <span className={cn("text-2xs font-normal leading-none text-fg-subtle", className)} data-testid="evidence-tier">
      {children}
    </span>
  );
}

/** A section's summary words: its tier with n, or why it is not counted. */
function summaryOf(s: EvidenceSection): string {
  if (s.tier) return s.tier;
  return s.scope === "own" ? "In your games: no player profile" : "In the team's games: not part of this access";
}

function Section({ section }: { section: EvidenceSection }) {
  return (
    <div className="space-y-0.5" data-testid={`evidence-${section.scope}`}>
      {/* With nothing counted, the one honest line names the scope itself. */}
      {section.tier && section.lines.length ? <p className="text-xs font-semibold text-fg">{section.tier}</p> : null}
      {section.lines.length ? (
        <ul className="space-y-0.5">
          {section.lines.map((l) => (
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
            </li>
          ))}
        </ul>
      ) : null}
      {section.empty ? (
        <p className="text-xs text-fg-muted" data-testid="evidence-empty">
          {section.empty}
        </p>
      ) : null}
      {section.positionNote ? <p className="text-2xs text-fg-subtle">{section.positionNote}</p> : null}
    </div>
  );
}

/** The evidence's tiers with their n, or why a scope is not counted, in one line of words. */
export function evidenceSummaryWords(evidence: MatchupEvidence | null): string {
  return evidence?.sections.length ? evidence.sections.map(summaryOf).join(" · ") : evidence ? "Not counted: no current patch is known yet" : "Counted once the first slot holds a champion";
}

/**
 * The evidence's first row, for a phone's first screen (glance.tsx): the first counted line with its
 * tier and sample; else the first section's one honest line (too few games, and how many); else the
 * tiers' words. The same words the fold holds, never more.
 */
export function firstEvidenceRow(evidence: MatchupEvidence | null): { tier: string | null; label: string | null; text: string } {
  const counted = evidence?.sections.find((s) => s.lines.length);
  if (counted) {
    const l = counted.lines[0]!;
    return { tier: counted.tier, label: l.label, text: `${l.values}${l.sample ? `${l.sample.startsWith("of ") ? " " : " · "}${l.sample}` : ""}` };
  }
  const empty = evidence?.sections.find((s) => s.empty);
  if (empty?.empty) return { tier: null, label: null, text: empty.empty };
  return { tier: null, label: null, text: evidenceSummaryWords(evidence) };
}

/** The evidence's words in the fold's line: its tiers with their n, or why a scope is not counted. */
export function EvidenceSummary({ evidence }: { evidence: MatchupEvidence | null }) {
  const summary = evidenceSummaryWords(evidence);
  return (
    // Its own line in the fold's line, in small type, so the fold stays two lines at 1440 × 900.
    <span className="basis-full text-2xs text-fg-subtle" data-testid="matchup-evidence-summary">
      <span className="font-semibold text-fg-muted">Evidence:</span> <span data-testid="matchup-evidence-tiers">{summary}</span>
    </span>
  );
}

/**
 * The evidence inside the fold it shares with Riot's tips (one line for both, so the one-screen fit
 * holds). `evidence` is null until your champion is chosen; the matchup is "uncertain" when the pair
 * shows no curated briefing and no counted line (saying so differently when its briefing is hidden).
 */
export function EvidenceBody({ evidence, duo, pair }: { evidence: MatchupEvidence | null; duo: boolean; pair: { chosen: boolean; curated: boolean; /** A curated briefing exists but is hidden. */ hidden?: boolean } }) {
  const counted = !!evidence?.sections.some((s) => s.lines.length);
  const uncertain = pair.chosen && !pair.curated && !counted;
  return (
    <div className="space-y-2 border-t border-border pt-1.5" data-testid="matchup-evidence-panel">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-fg">
        <Sigma className="h-3.5 w-3.5 text-fg-subtle" aria-hidden />
        Evidence from stored games
      </p>
      {uncertain ? (
        <p className="text-xs text-fg" data-testid="matchup-uncertain">
          {pair.hidden ? UNCERTAIN_HIDDEN : UNCERTAIN}
        </p>
      ) : null}
      {evidence?.sections.map((s) => <Section key={s.scope} section={s} />)}
      {evidence?.ignored.length ? (
        <p className="text-2xs text-fg-subtle" data-testid="evidence-ignored">
          {`These counts ignore the empty ${evidence.ignored.length === 1 ? "slot" : "slots"}: ${evidence.ignored.join(", ")}.`}
        </p>
      ) : null}
      <ul className="space-y-0.5 border-t border-border pt-1.5 text-xs text-fg-muted" data-testid="matchup-evidence">
        <li data-testid="matchup-evidence-high-elo">
          <span className="font-medium text-fg">Runes, items and skill order:</span> {NO_HIGH_ELO}
        </li>
        <li data-testid="matchup-evidence-power-spikes">
          <span className="font-medium text-fg">{POWER_SPIKES_LABEL}</span> {NOT_MEASURED_YET}
        </li>
        <li data-testid="matchup-evidence-wave">{NO_WAVE_GUIDANCE}</li>
        {duo ? <li data-testid="matchup-evidence-duo">{NO_DUO_NOTES}</li> : null}
      </ul>
    </div>
  );
}
