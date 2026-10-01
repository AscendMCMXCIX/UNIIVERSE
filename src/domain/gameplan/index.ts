import { compositionIdentity, compositionInteraction, teamProfile, type Identity } from "../composition";
import type { ChampionTraits } from "../champion-model/traits";
import { ROLE_LABELS, type Role } from "../roles";
import type { PlayerProfile } from "../roster/types";
import { evaluateTeam, type EvalContext } from "../engine/evaluate";
import { estimateEnemyRoles } from "../engine/enemy";
import { mergeEngineConfig } from "../engine/config";
import type { ChampionInfo, EngineConfig, StatsProvider, TeamMember } from "../engine/types";
import { enemyTeamProfile } from "../engine/evaluate";

export interface GamePlanInput {
  ours: TeamMember[];
  enemyChampionIds: string[];
  players: PlayerProfile[];
  champions: Map<string, ChampionInfo>;
  stats: StatsProvider;
  config?: Partial<EngineConfig>;
}

export interface GamePlan {
  identity: { ours: Identity; theirs: Identity | null; summary: string };
  winCondition: string[];
  lanePriorities: string[];
  teamfight: { initiator: string | null; followUp: string | null; protectors: string[]; damage: string[]; plan: string[] };
  sideLane: { sider: string | null; formation: "1-3-1" | "4-1" | "5-man"; notes: string[] };
  objectives: { dragon: string; baron: string; early: string };
  threats: string[];
  avoid: string[];
  /** Compact lines meant to be read aloud before loading finishes. */
  summaryLines: string[];
}

interface Member extends TeamMember {
  name: string;
  playerName: string;
  traits: ChampionTraits;
}

function label(m: Member): string {
  return `${m.name} (${m.playerName}, ${ROLE_LABELS[m.role]})`;
}

function maxBy(members: Member[], key: keyof ChampionTraits, min = 2): Member | null {
  let best: Member | null = null;
  for (const m of members) {
    if (m.traits[key] < min) continue;
    if (!best || m.traits[key] > best.traits[key]) best = m;
  }
  return best;
}

/**
 * Produces the post-draft game plan: identity, win condition, lane priorities, teamfight roles,
 * side-lane formation, objective approach, key threats and situations to avoid.
 */
export function buildGamePlan(input: GamePlanInput): GamePlan {
  const config = mergeEngineConfig(input.config);
  const playersById = new Map(input.players.map((p) => [p.id, p]));
  const members: Member[] = input.ours.map((m) => ({
    ...m,
    name: input.champions.get(m.championId)?.name ?? m.championId,
    playerName: playersById.get(m.playerId)?.displayName ?? "?",
    traits: input.champions.get(m.championId)?.profile.traits ?? ({} as ChampionTraits),
  }));
  const enemyIds = input.enemyChampionIds;
  const enemyName = (id: string) => input.champions.get(id)?.name ?? id;
  const enemyEstimates = estimateEnemyRoles(enemyIds, input.champions, input.stats);
  const ourProfile = teamProfile(members.map((m) => m.traits));
  const theirProfile = enemyTeamProfile(enemyIds, input.champions);
  const ourIdentity = compositionIdentity(ourProfile);
  const theirIdentity = enemyIds.length >= 2 ? compositionIdentity(theirProfile) : null;
  const interaction = compositionInteraction(ourProfile, theirProfile);

  const ctx: EvalContext = {
    players: playersById,
    champions: input.champions,
    stats: input.stats,
    config,
    enemy: enemyEstimates,
    enemyProfile: theirProfile,
    memo: new Map(),
  };
  const evaluation = evaluateTeam(input.ours, ctx);

  // --- Teamfight roles ---
  const initiator = maxBy(members, "engage");
  const followUp = members.filter((m) => m !== initiator && (m.traits.dive >= 2 || m.traits.engage >= 2)).sort((a, b) => b.traits.dive + b.traits.engage - (a.traits.dive + a.traits.engage))[0] ?? null;
  const protectors = members.filter((m) => m.traits.peel >= 2).map(label);
  // The carry to protect: sustained damage first, then scaling and range (a backline hypercarry
  // needs peel far more than a melee duelist does).
  const carryScore = (m: Member) => m.traits.sustainedDps * 2 + m.traits.scaling + m.traits.range;
  const dps = members.filter((m) => m.traits.sustainedDps >= 2).sort((a, b) => carryScore(b) - carryScore(a));
  const burst = members.filter((m) => m.traits.burst >= 3);
  const carry = dps[0] ?? members.find((m) => m.role === "ADC") ?? null;
  const teamfightPlan: string[] = [];
  if (initiator) teamfightPlan.push(`${label(initiator)} initiates${followUp ? `, ${followUp.name} follows` : ""}.`);
  else if (ourProfile.totals.counterEngage >= 3) teamfightPlan.push("No hard engage: fight on counter-engage and punish their initiation.");
  else teamfightPlan.push("No reliable initiation: fight around picks and objective setups rather than open 5v5s.");
  if (protectors.length) teamfightPlan.push(`${protectors.join(" and ")} peel for ${carry ? carry.name : "the carries"}.`);
  if (carry) teamfightPlan.push(`${label(carry)} delivers sustained damage; keep them alive first.`);
  if (burst.length) teamfightPlan.push(`${burst.map((b) => b.name).join(" and ")} look for burst on isolated targets.`);

  // --- Side lane ---
  const sider = maxBy(members, "sideLane", 2);
  const theirSider = Math.max(0, ...enemyIds.map((id) => input.champions.get(id)?.profile.traits.sideLane ?? 0));
  let formation: GamePlan["sideLane"]["formation"] = "5-man";
  const sideNotes: string[] = [];
  if (sider && sider.traits.sideLane >= 3 && sider.traits.sideLane >= theirSider) {
    formation = "1-3-1";
    sideNotes.push(`${label(sider)} pressures the side lane; the other four hold mid and threaten the opposite side.`);
  } else if (sider && sider.traits.sideLane >= 2) {
    formation = "4-1";
    sideNotes.push(`${label(sider)} takes the side wave while four group; collapse when they send two.`);
  } else {
    sideNotes.push("No strong sider: group as five, use waveclear to reset and look for the objective fight.");
  }
  if (ourProfile.totals.waveclear < 4) sideNotes.push("Waveclear is limited: avoid getting stuck defending multiple lanes at once.");
  if (theirSider >= 3) sideNotes.push(`Their sider is strong: match with ${sider ? sider.name : "two members"} or trade objectives instead of 1v1ing.`);

  // --- Lane priorities ---
  const laneLines: string[] = [];
  const lanes = [...evaluation.lanes].sort((a, b) => b.expectedDelta - a.expectedDelta);
  const best = lanes[0];
  const worst = lanes[lanes.length - 1];
  if (best && best.likelyOpponent && best.expectedDelta >= 0.015) {
    const m = members.find((x) => x.role === best.role)!;
    laneLines.push(`Play through ${ROLE_LABELS[best.role]}: ${m.name} is favoured into ${enemyName(best.likelyOpponent)}.`);
  }
  if (worst && worst.likelyOpponent && worst.expectedDelta <= -0.03) {
    const m = members.find((x) => x.role === worst.role)!;
    laneLines.push(`Protect ${ROLE_LABELS[worst.role]}: ${m.name} is behind into ${enemyName(worst.likelyOpponent)}; play safe and let the jungler cover.`);
  }
  const jungler = members.find((m) => m.role === "JUNGLE");
  if (jungler) {
    if (jungler.traits.earlyGame >= 3) laneLines.push(`${jungler.name} is a strong early jungler: path towards the lane with priority and gank early.`);
    else if (jungler.traits.scaling >= 2) laneLines.push(`${jungler.name} wants farm: lanes should play for priority and avoid demanding early ganks.`);
    else laneLines.push(`${jungler.name} should track their jungler and play for objective control.`);
  }
  const earlyLane = members.filter((m) => m.role !== "JUNGLE").sort((a, b) => b.traits.earlyGame - a.traits.earlyGame)[0];
  if (earlyLane && earlyLane.traits.earlyGame >= 3 && !laneLines.some((l) => l.includes(earlyLane.name))) {
    laneLines.push(`${earlyLane.name} has early pressure: use it for priority on first objectives.`);
  }
  if (laneLines.length === 0) laneLines.push("No standout lane: play even lanes and win through the mid-game team structure.");

  // --- Win condition ---
  const winCondition: string[] = [];
  const scalingEdge = (ourProfile.totals.scaling - theirProfile.totals.scaling) / Math.max(1, members.length);
  switch (ourIdentity.primary) {
    case "Dive":
      winCondition.push(`Force fights onto their backline${carry ? ` while ${carry.name} cleans up` : ""}.`);
      break;
    case "Front-to-back":
      winCondition.push(`Fight front-to-back around objectives and keep ${carry ? carry.name : "the carry"} alive.`);
      break;
    case "Pick":
      winCondition.push("Catch isolated targets before objectives spawn, then take the objective for free.");
      break;
    case "Poke / Siege":
      winCondition.push("Siege with poke and take towers; never take a 50/50 engage fight.");
      break;
    case "Scaling":
      winCondition.push("Survive the early game, concede what is not free, and win the late-game fights.");
      break;
    case "Split pressure":
      winCondition.push(`${sider ? sider.name : "Our sider"} creates side pressure; the group forces the objective or the opposite side.`);
      break;
    case "Teamfight engage":
      winCondition.push("Group early and force 5v5 teamfights on our engage.");
      break;
    case "Early skirmish":
      winCondition.push("Win early skirmishes, snowball tempo and close before they stabilise.");
      break;
  }
  if (scalingEdge > 0.4) winCondition.push("We outscale: do not force risky plays before our power spikes.");
  else if (scalingEdge < -0.4) winCondition.push("They outscale: convert early leads into objectives and end before 30 minutes.");
  for (const note of interaction.notes.filter((n) => n.value > 0.25).slice(0, 1)) winCondition.push(note.text + ".");

  // --- Objectives ---
  const ourFight = ourProfile.totals.engage + ourProfile.totals.frontline + ourProfile.totals.reliableCC;
  const theirFight = theirProfile.totals.engage + theirProfile.totals.frontline + theirProfile.totals.reliableCC;
  const dragon = ourFight >= theirFight ? "Contest dragons: our 5v5 structure is at least as strong as theirs." : "Trade dragons for towers or the opposite objective unless we have numbers.";
  const canSetUpBaron = ourProfile.totals.waveclear >= 5 || (sider && sider.traits.sideLane >= 3);
  const baron = canSetUpBaron
    ? `Baron is our win condition once ${sider ? `${sider.name} pulls their sider bot side` : "waves are pushed"}; set vision first.`
    : "Only take Baron after a won fight or a pick; we lack the pressure to force it cleanly.";
  const early = ourProfile.totals.earlyGame >= theirProfile.totals.earlyGame ? "Take the early objectives aggressively; our early game is stronger." : "Concede early objectives unless they are free; we win later.";

  // --- Threats ---
  const threats: string[] = [];
  for (const id of enemyIds) {
    const t = input.champions.get(id)?.profile.traits;
    if (!t) continue;
    const n = enemyName(id);
    if (t.dive >= 3 && carry) threats.push(`${n} will dive ${carry.name}: ${protectors.length ? "peel is mandatory" : "position carefully"}.`);
    else if (t.pick >= 3) threats.push(`${n} catches isolated targets: move together and ward deep.`);
    else if (t.poke >= 3) threats.push(`${n} poke: do not stand in choke points waiting.`);
    else if (t.scaling >= 3) threats.push(`${n} scales hard: close the game before they come online.`);
  }
  for (const lane of lanes) {
    if (lane.likelyOpponent && lane.expectedDelta <= -0.04) {
      threats.push(`${enemyName(lane.likelyOpponent)} wins ${ROLE_LABELS[lane.role]} lane: expect pressure there early.`);
    }
  }

  // --- Avoid ---
  const avoid: string[] = [];
  for (const note of interaction.notes.filter((n) => n.value < -0.15).slice(0, 3)) avoid.push(note.text + ".");
  if (theirProfile.totals.counterEngage >= 4) avoid.push("Do not engage into their disengage without flanks.");
  if (theirProfile.maxes.engage >= 3 && formation === "1-3-1") avoid.push("Do not get caught 4v5 while the sider is far away.");
  if (scalingEdge < -0.4) avoid.push("Avoid passive play; a long game favours them.");
  if (avoid.length === 0) avoid.push("Avoid fighting without vision or without our initiator.");

  const summary = `${ourIdentity.primary}${ourIdentity.secondary ? ` / ${ourIdentity.secondary}` : ""} composition${theirIdentity ? ` against a ${theirIdentity.primary.toLowerCase()} draft` : ""}.`;

  const summaryLines = [
    `IDENTITY: ${summary}`,
    `WIN CON: ${winCondition[0] ?? ""}`,
    `LANES: ${laneLines[0] ?? ""}`,
    `FIGHTS: ${teamfightPlan[0] ?? ""}`,
    `SIDE: ${formation} — ${sideNotes[0] ?? ""}`,
    `OBJECTIVES: ${dragon}`,
    threats[0] ? `THREAT: ${threats[0]}` : "",
    `AVOID: ${avoid[0] ?? ""}`,
  ].filter(Boolean);

  return {
    identity: { ours: ourIdentity.primary, theirs: theirIdentity?.primary ?? null, summary },
    winCondition: dedupe(winCondition),
    lanePriorities: dedupe(laneLines),
    teamfight: { initiator: initiator ? label(initiator) : null, followUp: followUp ? label(followUp) : null, protectors, damage: dps.map(label), plan: teamfightPlan },
    sideLane: { sider: sider ? label(sider) : null, formation, notes: sideNotes },
    objectives: { dragon, baron, early },
    threats: dedupe(threats).slice(0, 5),
    avoid: dedupe(avoid).slice(0, 4),
    summaryLines,
  };
}

function dedupe(items: string[]): string[] {
  return [...new Set(items)];
}

export type { Role };
