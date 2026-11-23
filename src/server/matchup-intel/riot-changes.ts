import type { ChampionIntelView, MatchupPageView } from "@/domain/matchup-intel/types";
import type { MatchupEvidence } from "@/domain/matchup-intel/evidence";
import type { DigestKind, RiotChanges } from "./digests";

/*
  MATCHUP INTEL's "Riot changed this on 26.24" labels (docs/MATCHUP_INTEL.md, "Patches"): from the
  per-version diff (static_digests), on the row of what they qualify. A champion's panel heading when
  its digest changed (base stats or any ability's cooldowns, ranks, charges or text: the digest does
  not say which ability), and an evidence line when an item or rune its values name changed. Nothing
  when fewer than two patches are recorded (no RiotChanges at all).
*/

/** Every champion, item and rune the page shows that the diff can speak for: the chosen champions, and what the evidence lines name. */
export function namedOnPage(view: MatchupPageView, evidence: MatchupEvidence | null): Array<{ kind: DigestKind; key: string }> {
  const champions = [view.you, view.enemy, view.ally, view.enemy2].filter((c): c is NonNullable<typeof c> => !!c).map((c) => ({ kind: "champion" as const, key: c.id }));
  const named = (evidence?.sections ?? []).flatMap((s) => s.lines.flatMap((l) => l.named ?? []));
  return [...champions, ...named];
}

/**
 * The page's view and evidence with the labels set from `changes` (null: none set), and the evidence
 * lines' `named` keys removed, so they never reach the page.
 */
export function withRiotChanges(view: MatchupPageView, evidence: MatchupEvidence | null, changes: RiotChanges | null): { view: MatchupPageView; evidence: MatchupEvidence | null } {
  const label = (intel: ChampionIntelView | null): ChampionIntelView | null => (intel ? { ...intel, riotChangedOn: changes?.changed.has(`champion:${intel.champion.id}`) ? changes.patch : null } : null);
  const out: MatchupPageView = { ...view, enemyIntel: label(view.enemyIntel), yourIntel: label(view.yourIntel), allyIntel: label(view.allyIntel), enemy2Intel: label(view.enemy2Intel) };
  const ev = evidence && {
    ...evidence,
    sections: evidence.sections.map((s) => ({
      ...s,
      lines: s.lines.map(({ named, ...l }) => (changes && named?.some((n) => changes.changed.has(`${n.kind}:${n.key}`)) ? { ...l, changedOn: changes.patch } : l)),
    })),
  };
  return { view: out, evidence: ev };
}
