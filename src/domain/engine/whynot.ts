import { ROLE_LABELS } from "../roles";
import type { EvalContext } from "./evaluate";
import type { Candidate } from "./types";
import { formatDelta, formatPercent } from "./util";

export interface WhyNotComparison {
  recommended: { championId: string; role: string; playerId: string };
  alternative: { championId: string; role: string; playerId: string };
  /** Positive = recommended better, in win-rate points. */
  totalGap: number;
  closeness: "very close" | "close" | "clear" | "decisive";
  points: Array<{ topic: string; text: string; favours: "recommended" | "alternative" | "neither" }>;
  verdict: string;
}

const name = (ctx: EvalContext, id: string) => ctx.champions.get(id)?.name ?? id;

/**
 * "Why not X?" — compares the recommendation with another legal candidate on the same dimensions
 * the engine used, so the team can see how close the call really is.
 */
export function explainWhyNot(recommended: Candidate, alternative: Candidate, ctx: EvalContext): WhyNotComparison {
  const r = recommended.evaluation;
  const a = alternative.evaluation;
  const points: WhyNotComparison["points"] = [];
  const add = (topic: string, diff: number, text: string, threshold = 0.004) => {
    points.push({ topic, text, favours: diff > threshold ? "recommended" : diff < -threshold ? "alternative" : "neither" });
  };

  // Lane: compare the lane evaluation for the respective roles.
  const rl = r.lanes.find((l) => l.championId === recommended.championId);
  const al = a.lanes.find((l) => l.championId === alternative.championId);
  if (rl && al) {
    const diff = rl.expectedDelta - al.expectedDelta;
    const opp = rl.likelyOpponent ? ` into ${name(ctx, rl.likelyOpponent)}` : "";
    add("Lane", diff, rl.likelyOpponent || al.likelyOpponent ? `${name(ctx, recommended.championId)} ${formatDelta(rl.expectedDelta)} vs ${name(ctx, alternative.championId)} ${formatDelta(al.expectedDelta)}${opp} (${al.severity.replace(/-/g, " ")})` : "No enemy revealed in this role yet: lane comparison is blind.");
  }
  add("Team synergy", r.synergyPart - a.synergyPart, `Synergy ${formatDelta(r.synergyPart)} vs ${formatDelta(a.synergyPart)}${r.identity && a.identity && r.identity !== a.identity ? ` (${r.identity} vs ${a.identity} shape)` : ""}`);
  add("Into their draft", r.enemyPart - a.enemyPart, `Strength into their draft ${formatDelta(r.enemyPart)} vs ${formatDelta(a.enemyPart)}`);
  add("Current patch", r.components.strength - a.components.strength, `Champion strength ${formatPercent(ctx.stats.strength(recommended.championId, recommended.role).estimate)} vs ${formatPercent(ctx.stats.strength(alternative.championId, alternative.role).estimate)}`, 0.006);

  // Proficiency / comfort.
  const rp = ctx.proficiency?.(recommended.playerId, recommended.championId, recommended.role) ?? null;
  const ap = ctx.proficiency?.(alternative.playerId, alternative.championId, alternative.role) ?? null;
  if (rp || ap) {
    const diff = (rp?.score ?? 0.5) - (ap?.score ?? 0.5);
    add("Player proficiency", diff * 0.1, `${name(ctx, recommended.championId)}: ${rp?.tier ?? "no data"} · ${name(ctx, alternative.championId)}: ${ap?.tier ?? "no data"}`, 0.004);
  } else {
    add("Player comfort", r.components.comfort - a.components.comfort, "Based on configured pool order (no linked-account data)", 0.003);
  }

  // Damage profile.
  const rt = ctx.champions.get(recommended.championId)?.profile.traits;
  const at = ctx.champions.get(alternative.championId)?.profile.traits;
  if (rt && at) {
    const rPhys = rt.physicalDamage >= rt.magicDamage ? "physical" : "magic";
    const aPhys = at.physicalDamage >= at.magicDamage ? "physical" : "magic";
    if (rPhys !== aPhys) add("Damage profile", r.components.structure - a.components.structure, `${name(ctx, recommended.championId)} is ${rPhys}, ${name(ctx, alternative.championId)} is ${aPhys}; team balance favours ${r.components.structure >= a.components.structure ? "the recommendation" : "the alternative"}`, 0.003);
  }

  // Timing.
  const td = recommended.timing.adjustment - alternative.timing.adjustment;
  const tParts: string[] = [];
  if (recommended.timing.denialProbability >= 0.25) tParts.push(`${name(ctx, recommended.championId)} ${formatPercent(recommended.timing.denialProbability, 0)} likely gone before our next pick`);
  if (alternative.timing.denialProbability >= 0.25) tParts.push(`${name(ctx, alternative.championId)} ${formatPercent(alternative.timing.denialProbability, 0)} likely gone`);
  if (alternative.timing.enemyRoleHidden && alternative.role !== recommended.role) tParts.push(`${ROLE_LABELS[alternative.role]} can still be held for a counterpick`);
  add("Pick timing", td, tParts.length ? tParts.join("; ") : "No timing pressure either way", 0.003);

  const totalGap = recommended.pickNowScore - alternative.pickNowScore;
  const closeness: WhyNotComparison["closeness"] = Math.abs(totalGap) < 0.005 ? "very close" : Math.abs(totalGap) < 0.015 ? "close" : Math.abs(totalGap) < 0.03 ? "clear" : "decisive";
  const favoursAlt = points.filter((p) => p.favours === "alternative").map((p) => p.topic.toLowerCase());
  const favoursRec = points.filter((p) => p.favours === "recommended").map((p) => p.topic.toLowerCase());
  const verdict =
    totalGap >= 0
      ? `${name(ctx, recommended.championId)} is ${closeness === "very close" ? "marginally" : closeness === "close" ? "slightly" : "clearly"} ahead (${formatDelta(totalGap)})${favoursRec.length ? `: ${favoursRec.join(", ")}` : ""}${favoursAlt.length ? `. ${name(ctx, alternative.championId)} wins on ${favoursAlt.join(", ")}.` : "."}`
      : `${name(ctx, alternative.championId)} actually scores higher by ${formatDelta(-totalGap)} on raw fit; the recommendation differs on timing or confidence.`;
  return {
    recommended: { championId: recommended.championId, role: recommended.role, playerId: recommended.playerId },
    alternative: { championId: alternative.championId, role: alternative.role, playerId: alternative.playerId },
    totalGap,
    closeness,
    points,
    verdict,
  };
}
