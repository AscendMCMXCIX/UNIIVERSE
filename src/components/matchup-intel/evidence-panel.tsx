import { ChevronDown, Sigma } from "lucide-react";
import type { MatchupEvidence, EvidenceSection } from "@/domain/matchup-intel/evidence";
import { Panel } from "@/components/ui/panel";

/*
  MATCHUP INTEL's evidence from the team's own games (docs/MATCHUP_INTEL.md, "In your games"): one
  fold under Riot's tips, so the one-screen fit holds. Its summary states the tiers with their n
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
    <span className="text-2xs font-normal text-fg-subtle" data-testid="evidence-tier">
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
      {section.tier ? <h3 className="text-xs font-semibold text-fg">{section.tier}</h3> : null}
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

/**
 * The evidence fold. `evidence` is null until your champion is chosen; `uncertain`: the pair has no
 * curated notes and no counted line, so the page says the matchup is uncertain.
 */
export function EvidencePanel({ evidence, duo, pair }: { evidence: MatchupEvidence | null; duo: boolean; pair: { chosen: boolean; curated: boolean } }) {
  const counted = !!evidence?.sections.some((s) => s.lines.length);
  const uncertain = pair.chosen && !pair.curated && !counted;
  const summary = evidence?.sections.length ? evidence.sections.map(summaryOf).join(" · ") : "Counted once your champion is chosen";
  return (
    <Panel className="px-3 py-1.5" data-testid="matchup-evidence-panel">
      <details className="group/evidence" data-testid="matchup-evidence-fold">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 pointer-fine:min-h-7 [&::-webkit-details-marker]:hidden" data-testid="matchup-evidence-summary">
          <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-fg">
              <Sigma className="h-3.5 w-3.5 text-fg-subtle" aria-hidden />
              Evidence
            </span>
            <span className="text-2xs text-fg-subtle" data-testid="matchup-evidence-tiers">
              {summary}
            </span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-fg-subtle transition-transform group-open/evidence:rotate-180 motion-reduce:transition-none" aria-hidden />
        </summary>
        <div className="space-y-2 pb-1">
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
      </details>
    </Panel>
  );
}
