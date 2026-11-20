import { Sigma } from "lucide-react";
import type { MatchupEvidence, EvidenceSection } from "@/domain/matchup-intel/evidence";

/*
  MATCHUP INTEL's evidence from the team's own games (docs/MATCHUP_INTEL.md, "In your games"): in
  the fold it shares with Riot's tips, so the one-screen fit holds. Its words in the fold's line state the tiers with their n
  ("In your games (n = 9) · In the team's games (n = 23)"); inside, each section's lines, every one
  counted from stored games with its sample ("4 of 9 games · patch 26.22 · Solo/Duo 3, Normal Draft
  6"), never a recommendation. A section with no counted line says why in one line. Then the
  evidence the page does not have, said as such ("No high-elo evidence (not collected)").
*/

export const NO_HIGH_ELO = "No high-elo evidence (not collected)";
export const NO_DUO_NOTES = "No curated notes for this 2v2";
export const UNCERTAIN = "Matchup uncertain: no curated notes and no counted games for this pair, so each champion's own facts follow";

/** The tier a row of the page rests on, in small type beside its title ("Riot's data", "Checked notes (AI reviewers)"). */
export function TierLabel({ children }: { children: string }) {
  return (
    <span className="text-2xs font-normal leading-none text-fg-subtle" data-testid="evidence-tier">
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
    <section className="space-y-0.5" data-testid={`evidence-${section.scope}`} aria-label={section.tier ?? (section.scope === "own" ? "In your games" : "In the team's games")}>
      {/* With nothing counted, the one honest line names the scope itself. */}
      {section.tier && section.lines.length ? <h3 className="text-xs font-semibold text-fg">{section.tier}</h3> : null}
      {section.lines.length ? (
        <ul className="space-y-0.5">
          {section.lines.map((l) => (
            <li key={l.key} className="text-xs leading-snug text-fg-muted" data-testid="evidence-line" data-key={l.key}>
              <span className="font-medium text-fg">{l.label}:</span> <span data-testid="evidence-values">{l.values}</span>
              {l.sample ? (
                <>
                  {" "}
                  <span className="text-fg-subtle" data-testid="evidence-sample">
                    {l.key === "record" || l.key.startsWith("with-") || l.key.startsWith("vs-") ? "· " : ""}
                    {l.sample}
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
    </section>
  );
}

/** The evidence's words in the fold's line: its tiers with their n, or why a scope is not counted. */
export function EvidenceSummary({ evidence }: { evidence: MatchupEvidence | null }) {
  const summary = evidence?.sections.length ? evidence.sections.map(summaryOf).join(" · ") : "Counted once your champion is chosen";
  return (
    <span className="flex min-w-0 flex-wrap items-baseline gap-x-2" data-testid="matchup-evidence-summary">
      <span className="flex items-center gap-1.5 text-sm font-semibold text-fg">
        <Sigma className="h-3.5 w-3.5 text-fg-subtle" aria-hidden />
        Evidence
      </span>
      <span className="text-2xs text-fg-subtle" data-testid="matchup-evidence-tiers">
        {summary}
      </span>
    </span>
  );
}

/**
 * The evidence inside the fold it shares with Riot's tips (one line for both, so the one-screen fit
 * holds). `evidence` is null until your champion is chosen; the matchup is "uncertain" when the pair
 * has no curated notes and no counted line.
 */
export function EvidenceBody({ evidence, duo, pair }: { evidence: MatchupEvidence | null; duo: boolean; pair: { chosen: boolean; curated: boolean } }) {
  const counted = !!evidence?.sections.some((s) => s.lines.length);
  const uncertain = pair.chosen && !pair.curated && !counted;
  return (
    <div className="space-y-2 border-t border-border pt-1.5" data-testid="matchup-evidence-panel">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg">
        <Sigma className="h-3.5 w-3.5 text-fg-subtle" aria-hidden />
        Evidence from stored games
      </h3>
      {uncertain ? (
        <p className="text-xs text-fg" data-testid="matchup-uncertain">
          {UNCERTAIN}
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
        {duo ? <li data-testid="matchup-evidence-duo">{NO_DUO_NOTES}</li> : null}
      </ul>
    </div>
  );
}
