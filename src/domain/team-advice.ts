import { ROLE_LABELS, type Role } from "./roles";
import type { ChampionInfo } from "./engine/types";
import type { TraitKey } from "./champion-model/traits";
import type { ProficiencyTier } from "./proficiency";

/*
  Team page advice, advisory only (choosing the lineup stays with whoever may manage it):

    - a compact composition summary of the current lineup's champion pools: unfilled roles,
      champions per role, damage profile, engage and frontline;
    - for each empty role, the registered players who could fill it, best first, each with short
      reasons drawn from their roles, pool, Riot proficiency and what the lineup lacks.

  Everything is computed from pools (what can be drafted) and curated champion characteristics;
  it is a summary of options, not a draft.
*/

export type Level = "low" | "medium" | "high";

export interface LineupPool {
  role: Role;
  /** The assigned player's champions for this role, in their order (empty when unassigned). */
  champions: string[];
  assigned: boolean;
}

export interface CompositionSummary {
  unfilled: Role[];
  coverage: Array<{ role: Role; champions: number }>;
  damage: { magicShare: number | null; label: "Mostly physical" | "Mostly magic" | "Mixed" | "Not enough champions" };
  engage: Level | null;
  frontline: Level | null;
  /** Plain sentences about gaps (at most three). */
  notes: string[];
}

/** First choices count most: a player's top three champions for the role, weighted 1, 0.6, 0.4. */
const WEIGHTS = [1, 0.6, 0.4];

function poolTrait(champions: string[], trait: TraitKey, profiles: Map<string, ChampionInfo>): number | null {
  let sum = 0;
  let weight = 0;
  champions.slice(0, WEIGHTS.length).forEach((id, i) => {
    const p = profiles.get(id)?.profile;
    if (!p) return;
    sum += p.traits[trait] * WEIGHTS[i]!;
    weight += WEIGHTS[i]!;
  });
  return weight > 0 ? sum / weight : null;
}

/** Average per filled role on the 0–3 trait scale → level. */
function level(perRole: number[]): Level | null {
  if (perRole.length === 0) return null;
  const avg = perRole.reduce((s, v) => s + v, 0) / perRole.length;
  return avg >= 1.2 ? "high" : avg >= 0.6 ? "medium" : "low";
}

export function summariseComposition(lineup: LineupPool[], profiles: Map<string, ChampionInfo>): CompositionSummary {
  const filled = lineup.filter((r) => r.assigned && r.champions.length > 0);
  const traitPerRole = (t: TraitKey) => filled.map((r) => poolTrait(r.champions, t, profiles)).filter((v): v is number => v !== null);
  const physical = traitPerRole("physicalDamage").reduce((s, v) => s + v, 0);
  const magic = traitPerRole("magicDamage").reduce((s, v) => s + v, 0);
  const magicShare = physical + magic > 0 ? magic / (physical + magic) : null;
  const damageLabel: CompositionSummary["damage"]["label"] = filled.length < 2 || magicShare === null ? "Not enough champions" : magicShare < 0.3 ? "Mostly physical" : magicShare > 0.65 ? "Mostly magic" : "Mixed";
  const engage = level(traitPerRole("engage"));
  const frontline = level(traitPerRole("frontline"));
  const unfilled = lineup.filter((r) => !r.assigned).map((r) => r.role);
  const notes: string[] = [];
  if (unfilled.length) notes.push(`${unfilled.map((r) => ROLE_LABELS[r]).join(", ")} ${unfilled.length === 1 ? "has" : "have"} no player yet.`);
  const empty = lineup.filter((r) => r.assigned && r.champions.length === 0).map((r) => ROLE_LABELS[r.role]);
  if (empty.length) notes.push(`${empty.join(", ")}: no champions in the pool for ${empty.length === 1 ? "that role" : "those roles"}, so nothing can be recommended there.`);
  if (damageLabel === "Mostly physical") notes.push("Damage leans physical: enemies can stack armour.");
  else if (damageLabel === "Mostly magic") notes.push("Damage leans magic: enemies can stack magic resist.");
  else if (engage === "low" && filled.length >= 3) notes.push("Little engage in the pools: fights start on the enemy's terms.");
  else if (frontline === "low" && filled.length >= 3) notes.push("Little frontline in the pools.");
  return { unfilled, coverage: lineup.map((r) => ({ role: r.role, champions: r.assigned ? r.champions.length : 0 })), damage: { magicShare, label: damageLabel }, engage, frontline, notes: notes.slice(0, 3) };
}

export interface CandidateFacts {
  id: string;
  name: string;
  primaryRole: Role;
  secondaryRole: Role | null;
  /** Their champions for this role (primary or secondary pool), in order. */
  pool: string[];
  substitute: boolean;
  /** Riot proficiency per pool champion in this role, when linked-account data exists. */
  proficiency: Array<{ championId: string; tier: ProficiencyTier; games: number }>;
}

export interface Suggestion {
  playerId: string;
  name: string;
  fit: "primary" | "secondary";
  /** From the Other players group. */
  substitute: boolean;
  score: number;
  reasons: string[];
}

const STRONG: ProficiencyTier[] = ["core", "strong"];

/**
 * Registered players who could take an empty role, best first. Primary-role players rank above
 * secondary-role players; within that, a deeper pool, proven champions and filling what the
 * lineup lacks move a player up. Players who list neither role are never suggested.
 */
export function suggestForRole(role: Role, candidates: CandidateFacts[], composition: CompositionSummary, profiles: Map<string, ChampionInfo>, limit = 3): Suggestion[] {
  const label = ROLE_LABELS[role];
  const out: Suggestion[] = [];
  for (const c of candidates) {
    const fit = c.primaryRole === role ? "primary" : c.secondaryRole === role ? "secondary" : null;
    if (!fit) continue;
    const reasons: string[] = [];
    let score = fit === "primary" ? 3 : 1.5;
    reasons.push(fit === "primary" ? `${label} is their main role` : `${label} is their secondary role`);
    if (c.pool.length === 0) {
      score -= 2;
      reasons.push(`no ${label} champions in their pool yet`);
    } else {
      score += Math.min(c.pool.length, 5) * 0.3;
      const proven = c.proficiency.filter((p) => STRONG.includes(p.tier)).sort((a, b) => b.games - a.games);
      score += Math.min(proven.length, 3) * 0.5;
      if (proven[0]) {
        const name = profiles.get(proven[0].championId)?.name ?? proven[0].championId;
        reasons.push(`${proven.length > 1 ? `strong on ${proven.length} pool champions, e.g.` : "strong on"} ${name} (${proven[0].games} games)`);
      } else reasons.push(`${c.pool.length} ${label} champion${c.pool.length === 1 ? "" : "s"} in their pool`);
      const engage = poolTrait(c.pool, "engage", profiles) ?? 0;
      const frontline = poolTrait(c.pool, "frontline", profiles) ?? 0;
      const magic = poolTrait(c.pool, "magicDamage", profiles) ?? 0;
      const physical = poolTrait(c.pool, "physicalDamage", profiles) ?? 0;
      if (composition.engage === "low" && engage >= 1.5) {
        score += 0.8;
        reasons.push("brings the engage the lineup lacks");
      } else if (composition.frontline === "low" && frontline >= 1.5) {
        score += 0.8;
        reasons.push("adds frontline the lineup lacks");
      } else if (composition.damage.label === "Mostly physical" && magic > physical) {
        score += 0.6;
        reasons.push("adds magic damage to a physical lineup");
      } else if (composition.damage.label === "Mostly magic" && physical > magic) {
        score += 0.6;
        reasons.push("adds physical damage to a magic lineup");
      }
    }
    out.push({ playerId: c.id, name: c.name, fit, substitute: c.substitute, score: Math.round(score * 100) / 100, reasons: reasons.slice(0, 3) });
  }
  return out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, limit);
}

