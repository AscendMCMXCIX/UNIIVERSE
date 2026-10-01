import type { CompetitionMode } from "../competition";
import { ROLES, ROLE_LABELS, type Role } from "../roles";
import type { Assignment } from "../roster/assignments";
import { flexOwners, legalRolesFor, poolFor } from "../roster/eligibility";
import type { PlayerProfile } from "../roster/types";
import { recommendBlindBans, type OpeningRoute } from "../engine/blind-bans";
import type { SearchContext } from "../engine/search";
import { assessScouting, banDamage, likelyPicks, type ScoutedPlayer, type ScoutingAssessment } from "../scouting";

export interface PreDraftInput {
  mode: CompetitionMode;
  players: PlayerProfile[];
  assignment: Assignment;
  ctx: SearchContext;
  /** Scouted opponent players (may be empty or partial). */
  opponents: ScoutedPlayer[];
  now?: Date;
}

export interface BanConsideration {
  championId: string;
  score: number;
  source: "team" | "scouting" | "both";
  reasons: string[];
  likelyRole: Role | null;
  targetLabel: string | null;
}

export interface PreDraftPlan {
  mode: CompetitionMode;
  scouting: { available: boolean; players: Array<ScoutingAssessment & { label: string; likelyRole: Role | null }>; summary: string };
  bans: BanConsideration[];
  expectedPriorities: Array<{ label: string; role: Role | null; picks: Array<{ championId: string; weight: number; tier: string }>; confidence: string }>;
  flexes: { ours: Array<{ championId: string; owners: Array<{ playerId: string; role: Role }> }>; theirs: Array<{ championId: string; roles: Role[]; label: string }> };
  routes: OpeningRoute[];
  poolRisks: Array<{ role: Role; playerId: string; options: number; threatened: number; message: string; escape: string | null }>;
}

/**
 * Pre-draft preparation for any mode. Works with full, partial or zero opponent information:
 * team-specific blind bans always exist; scouting adds (confidence-weighted) ban damage and
 * expected priorities when accounts are known.
 */
export function buildPreDraftPlan(input: PreDraftInput): PreDraftPlan {
  const { players, assignment, ctx, opponents } = input;
  const blind = recommendBlindBans(players, assignment, ctx, { count: 8, routes: 3 });

  const assessed = opponents.map((o) => {
    const a = assessScouting(o, { now: input.now });
    return { player: o, assessment: { ...a, likelyPicks: likelyPicks(o, ctx.stats, ctx.champions) } };
  });
  const available = assessed.some((a) => a.assessment.likelyPicks.length > 0);

  const ourAnswers = (championId: string, role: Role): string[] => {
    const out: string[] = [];
    for (const p of players) {
      for (const r of legalRolesFor(p)) {
        if (r !== role) continue;
        for (const c of poolFor(p, r)) {
          const ours = ctx.stats.strength(c, r).estimate;
          const theirs = ctx.stats.strength(championId, r).estimate;
          const expected = Math.max(0.3, Math.min(0.7, 0.5 + (ours - 0.5) - (theirs - 0.5)));
          const mu = ctx.stats.matchup(c, r, championId, r, expected);
          if (mu.estimate - 0.5 >= 0.03 && mu.confidence >= 0.2) out.push(ctx.champions.get(c)?.name ?? c);
        }
      }
    }
    return out;
  };
  const damage = available ? banDamage(assessed, ctx.stats, ctx.champions, ourAnswers, 8) : [];

  // Merge: team-blind value + scouting ban damage (scaled so a high-confidence scouted threat can
  // outrank a generic meta ban, while low-confidence scouting cannot).
  const merged = new Map<string, BanConsideration>();
  const blindMax = Math.max(0.0001, ...blind.bans.map((b) => b.score));
  for (const b of blind.bans) merged.set(b.championId, { championId: b.championId, score: b.score / blindMax, source: "team", reasons: b.reasons, likelyRole: b.likelyRole, targetLabel: null });
  const dmgMax = Math.max(0.0001, ...damage.map((d) => d.score));
  for (const d of damage) {
    const target = assessed.find((a) => a.player.id === d.targetPlayerId);
    const scaled = (d.score / dmgMax) * (0.5 + 0.7 * (target?.assessment.weight ?? 0));
    const existing = merged.get(d.championId);
    if (existing) {
      existing.score += scaled;
      existing.source = "both";
      existing.reasons = [...d.reasons, ...existing.reasons].slice(0, 5);
      existing.targetLabel = target?.player.label ?? null;
    } else {
      merged.set(d.championId, { championId: d.championId, score: scaled, source: "scouting", reasons: d.reasons, likelyRole: d.role, targetLabel: target?.player.label ?? null });
    }
  }
  const bans = [...merged.values()].sort((a, b) => b.score - a.score).slice(0, 8);

  const expectedPriorities = assessed
    .filter((a) => a.assessment.likelyPicks.length > 0)
    .map((a) => ({
      label: a.player.label,
      role: a.player.likelyRole,
      picks: a.assessment.likelyPicks.slice(0, 5).map((p) => ({ championId: p.championId, weight: p.weight, tier: p.proficiency.tier })),
      confidence: a.assessment.confidence,
    }));

  // Flexes: ours from configuration, theirs from scouted picks that appear in two roles.
  const oursMap = new Map<string, Array<{ playerId: string; role: Role }>>();
  for (const p of players) for (const r of legalRolesFor(p)) for (const c of poolFor(p, r)) oursMap.set(c, flexOwners(players, c));
  const ours = [...oursMap.entries()].filter(([, owners]) => new Set(owners.map((o) => o.role)).size > 1).map(([championId, owners]) => ({ championId, owners }));
  const theirs: PreDraftPlan["flexes"]["theirs"] = [];
  for (const a of assessed) {
    for (const p of a.assessment.likelyPicks) {
      const prior = ctx.champions.get(p.championId)?.profile.rolePrior ?? {};
      const roles = (Object.entries(prior) as Array<[Role, number]>).filter(([, w]) => w >= 0.2).map(([r]) => r);
      if (roles.length > 1 && !theirs.some((t) => t.championId === p.championId)) theirs.push({ championId: p.championId, roles, label: a.player.label });
    }
  }

  const poolRisks = blind.poolDepth.map((d) => {
    const player = players.find((p) => p.id === d.playerId);
    const escape = player?.secondaryRole ? `${player.displayName} can move to ${ROLE_LABELS[player.secondaryRole]} (${poolFor(player, player.secondaryRole).length} options)` : null;
    const remaining = d.options - d.threatenedByBans;
    let message: string;
    if (d.options === 0) message = `No ${ROLE_LABELS[d.role]} options at all`;
    else if (remaining <= 1) message = `If we leave ${ROLE_LABELS[d.role]} late, bans could leave ${player?.displayName ?? "the player"} with ${remaining} comfortable option${remaining === 1 ? "" : "s"}`;
    else if (d.threatenedByBans >= 2) message = `${d.threatenedByBans} of ${d.options} ${ROLE_LABELS[d.role]} options are ban-prone this patch`;
    else message = `${ROLE_LABELS[d.role]} pool is safe (${d.options} options)`;
    return { role: d.role, playerId: d.playerId, options: d.options, threatened: d.threatenedByBans, message, escape };
  });

  const known = assessed.filter((a) => a.player.accountsTotal > 0).length;
  const summary =
    opponents.length === 0
      ? "No opponent information: bans and routes are built from our lineup and current data."
      : `${known} of ${opponents.length} opponent players have known accounts; ${assessed.filter((a) => a.assessment.confidence === "high").length} high confidence.`;

  return {
    mode: input.mode,
    scouting: { available, players: assessed.map((a) => ({ ...a.assessment, label: a.player.label, likelyRole: a.player.likelyRole })), summary },
    bans,
    expectedPriorities,
    flexes: { ours, theirs },
    routes: blind.routes,
    poolRisks: poolRisks.sort((a, b) => a.options - a.threatened - (b.options - b.threatened)),
  };
}

export { ROLES };
