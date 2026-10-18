import { ROLE_LABELS } from "@/domain/roles";
import { tierPhrase, type ProficiencyTier } from "@/domain/proficiency";
import type { BanRecommendation, BreakdownItem, PairRecommendation, PickRecommendation } from "@/domain/engine/types";

/*
  The one-line reason shown under a recommendation in the Draft Room. Composed from the structured
  data the engine already returns (its breakdown, proficiency, the roles a ban protects), so the
  short line can never disagree with the engine. The engine's own full sentences stay unchanged
  under Analysis → "Why this recommendation"; nothing here changes how options are ranked.
*/

export const HEADLINE_MAX = 90;

interface Names {
  player: (id: string | null | undefined) => string;
  champion: (id: string) => string;
}

/** Below this, a factor's contribution (win-rate units) is too small to be "the reason". */
const MEANINGFUL = 0.003;

const FACTOR_PHRASE: Partial<Record<BreakdownItem["key"], string>> = {
  "team-fit": "fits our composition",
  "enemy-interaction": "good into their picks",
  "patch-strength": "strong this patch",
  "pro-priority": "high pro priority",
  timing: "may not last to our next pick",
};

const EXPERIENCED = new Set<ProficiencyTier>(["core", "strong", "comfortable"]);

function cap(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}

function fit(parts: string[]): string {
  const out: string[] = [];
  for (const p of parts.filter(Boolean)) {
    const next = [...out, p].join(" · ");
    if (next.length > HEADLINE_MAX) break;
    out.push(p);
  }
  return cap(out.join(" · "));
}

/** The player's experience with the champion, in a few words, when there is real evidence. */
function experience(rec: PickRecommendation, names: Names): string | null {
  const prof = rec.breakdown.proficiency;
  const who = names.player(rec.playerId);
  if (!prof || prof.games <= 0) return null;
  const tier = prof.tier as ProficiencyTier;
  if (EXPERIENCED.has(tier)) return `${who} ${tierPhrase(tier, "it")} (${prof.games} game${prof.games === 1 ? "" : "s"})`;
  return null;
}

/** The strongest positive factor other than the player's own experience, as a short phrase. */
function topFactor(rec: PickRecommendation): string | null {
  const best = [...rec.breakdown.items].filter((i) => i.key !== "player-proficiency" && i.key !== "realism" && FACTOR_PHRASE[i.key] && i.value >= MEANINGFUL).sort((a, b) => b.value - a.value)[0];
  return best ? FACTOR_PHRASE[best.key]! : null;
}

export function pickHeadline(rec: PickRecommendation, names: Names): string {
  const exp = experience(rec, names);
  const factor = topFactor(rec);
  const flex = rec.candidate.isFlex ? "flex pick" : null;
  if (exp) return fit([exp, factor ?? "", flex ?? ""]);
  // No experience on record: say what does support it, and whose pool it comes from.
  return fit([factor ?? `in ${names.player(rec.playerId)}'s ${ROLE_LABELS[rec.role]} pool`, factor ? `${names.player(rec.playerId)}'s pool` : "", flex ?? ""]);
}

/**
 * The ban's reason. The likely enemy role is not repeated here: the line above it (and the role
 * icon beside alternatives) already says it, so this line adds who the ban protects.
 */
export function banHeadline(rec: BanRecommendation, names: Names): string {
  const protectedNames = [...new Set(rec.protects.map((p) => names.player(p.playerId)))];
  if (protectedNames.length) return fit([`protects ${protectedNames.slice(0, 2).join(" and ")}`]);
  return fit([rec.likelyRole ? "" : "high priority for them", "denies a strong option"]);
}

export function pairHeadline(rec: PairRecommendation, names: Names): string {
  const [a, b] = rec.picks;
  return fit([`${names.champion(a.championId)} and ${names.champion(b.championId)} together`, "both in our pools"]);
}

export function recommendationHeadline(rec: PickRecommendation | BanRecommendation | PairRecommendation, names: Names): string {
  if (rec.kind === "pick") return pickHeadline(rec, names);
  if (rec.kind === "ban") return banHeadline(rec, names);
  return pairHeadline(rec, names);
}
