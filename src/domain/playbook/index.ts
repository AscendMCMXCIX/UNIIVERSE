import { compositionIdentity, compositionInteraction, teamProfile } from "../composition";
import { threatMap, type ThreatEntry } from "../composition/threats";
import { executionProfile, powerProfile, resourceNeed } from "../champion-model/derived";
import type { ChampionTraits } from "../champion-model/traits";
import { buildGamePlan, type GamePlan, type GamePlanInput } from "../gameplan";
import { ROLE_LABELS, type Role } from "../roles";
import { enemyTeamProfile } from "../engine/evaluate";
import { estimateEnemyRoles } from "../engine/enemy";

export interface PlaybookInput extends GamePlanInput {
  /** Coach note entered during the draft (shown verbatim at the top of the playbook). */
  coachNote?: string | null;
  /** Lane deltas known from the final evaluation (optional; derived from the game plan otherwise). */
}

export interface PlayerJob {
  playerId: string;
  playerName: string;
  championId: string;
  role: Role;
  /** One-line job description. */
  job: string;
  /** Two to five words for the Quick Playbook ("Control side lane"). */
  short?: string;
  laning: string;
  fights: string;
}

export interface PlaybookRule {
  if: string;
  then: string;
}

export interface Playbook {
  version: 2;
  /** Quick playbook: eight one-liners, in reading order. */
  quick: {
    winCondition: string;
    earlyPlan: string;
    playFor: string;
    fights: string;
    sideLane: string;
    objectives: string;
    watchFor: string;
    avoid: string;
  };
  coachNote: string | null;
  playerJobs: PlayerJob[];
  rules: PlaybookRule[];
  scenarios: { ahead: string[]; even: string[]; behind: string[] };
  denial: { theirWinCondition: string; deny: string[] };
  critique: string[];
  threats: ThreatEntry[];
  /** The underlying detailed plan (identity, lanes, teamfight, objectives). */
  plan: GamePlan;
  /** Discord-ready lines. */
  summaryLines: string[];
}

interface Member {
  playerId: string;
  playerName: string;
  championId: string;
  name: string;
  role: Role;
  traits: ChampionTraits;
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const first = (items: string[], fallback: string) => clean(items[0] ?? fallback);

/**
 * Match Playbook v2: the detailed game plan plus a quick card, per-player jobs, IF→THEN rules,
 * ahead/even/behind scenarios, an enemy denial plan and an honest self-critique.
 * Pure: the same draft always yields the same playbook. It is archived with the match and
 * never fed back into recommendations.
 */
export function buildPlaybook(input: PlaybookInput): Playbook {
  const plan = buildGamePlan(input);
  const playersById = new Map(input.players.map((p) => [p.id, p]));
  const members: Member[] = input.ours.map((m) => ({
    playerId: m.playerId,
    playerName: playersById.get(m.playerId)?.displayName ?? "?",
    championId: m.championId,
    name: input.champions.get(m.championId)?.name ?? m.championId,
    role: m.role,
    traits: input.champions.get(m.championId)?.profile.traits ?? ({} as ChampionTraits),
  }));
  const enemyName = (id: string) => input.champions.get(id)?.name ?? id;
  const enemyEstimates = estimateEnemyRoles(input.enemyChampionIds, input.champions, input.stats);
  const theirs = input.enemyChampionIds.map((id) => ({ championId: id, role: enemyEstimates.find((e) => e.championId === id)?.mostLikely ?? null, traits: input.champions.get(id)?.profile.traits, name: enemyName(id) })).filter((m): m is typeof m & { traits: ChampionTraits } => !!m.traits);
  const ourProfile = teamProfile(members.map((m) => m.traits));
  const theirProfile = enemyTeamProfile(input.enemyChampionIds, input.champions);
  const theirIdentity = theirs.length >= 2 ? compositionIdentity(theirProfile) : null;
  const interaction = compositionInteraction(ourProfile, theirProfile);
  const threats = threatMap(members.map((m) => ({ championId: m.championId, role: m.role, traits: m.traits, name: m.name })), theirs);

  const carry = members.filter((m) => m.traits.sustainedDps >= 2).sort((a, b) => b.traits.sustainedDps * 2 + b.traits.scaling + b.traits.range - (a.traits.sustainedDps * 2 + a.traits.scaling + a.traits.range))[0] ?? members.find((m) => m.role === "ADC") ?? null;
  const initiator = members.filter((m) => m.traits.engage >= 2).sort((a, b) => b.traits.engage - a.traits.engage)[0] ?? null;
  const sider = members.filter((m) => m.traits.sideLane >= 2).sort((a, b) => b.traits.sideLane - a.traits.sideLane)[0] ?? null;
  const ourCurve = powerProfile({ ...members[0]!.traits, earlyGame: Math.round(ourProfile.totals.earlyGame / Math.max(1, members.length)), scaling: Math.round(ourProfile.totals.scaling / Math.max(1, members.length)) }).curve;
  const theirCurve = theirs.length ? (theirProfile.totals.scaling > theirProfile.totals.earlyGame + 1 ? "late" : theirProfile.totals.earlyGame > theirProfile.totals.scaling + 1 ? "early" : "mid") : "mid";

  // --- Quick card ---
  const earlyPlan = ourCurve === "early" || (ourCurve !== "late" && theirCurve === "late") ? `Play for early pressure: ${first(plan.lanePriorities, "take even trades")}` : ourCurve === "late" ? `Play safe early: ${first(plan.lanePriorities, "farm and concede what is not free")}` : first(plan.lanePriorities, "Play even lanes and win the mid game.");
  const playFor = carry && sider && sider !== carry ? `${carry.name} in fights and ${sider.name} on the side` : carry ? `${carry.name} (${carry.playerName})` : first(plan.winCondition, "the team structure");
  const quick: Playbook["quick"] = {
    winCondition: first(plan.winCondition, "Win through team structure."),
    earlyPlan: clean(earlyPlan),
    playFor: clean(`Play for ${playFor}.`),
    fights: first(plan.teamfight.plan, "Fight around objectives."),
    sideLane: clean(`${plan.sideLane.formation}: ${first(plan.sideLane.notes, "group and reset")}`),
    objectives: clean(`${plan.objectives.early} ${plan.objectives.dragon}`),
    watchFor: first(threats.filter((t) => t.weight < 0).map((t) => t.text), first(plan.threats, "Nothing unusual: standard vision and tracking.")),
    avoid: first(plan.avoid, "Avoid fighting without vision."),
  };

  // --- Per-player jobs ---
  const playerJobs: PlayerJob[] = members.map((m) => jobFor(m, members, theirs, plan, carry, initiator, sider));

  // --- IF → THEN rules ---
  const rules: PlaybookRule[] = [];
  if (initiator) rules.push({ if: `${initiator.name} lands the engage`, then: `everyone follows immediately; ${carry ? `${carry.name} cleans up` : "focus the first target"}.` });
  if (sider) rules.push({ if: `${sider.name} is pushing a side wave`, then: "the other four hold mid vision and threaten the opposite objective; do not take a 4v5 fight." });
  for (const t of theirs) {
    if (t.traits.engage >= 3) rules.push({ if: `${t.name} is missing from the map`, then: "back off from unwarded areas; they are setting up a flank or an objective fight." });
    if (t.traits.dive >= 3 && carry) rules.push({ if: `${t.name} goes onto ${carry.name}`, then: `${members.filter((m) => m.traits.peel >= 2 && m !== carry).map((m) => m.name).join(" and ") || "everyone"} peel first, then turn.` });
    if (t.traits.sideLane >= 3) rules.push({ if: `${t.name} splits alone`, then: `${sider && sider.traits.sideLane >= t.traits.sideLane ? `${sider.name} matches` : "send two or trade the objective"}; never a losing 1v1.` });
    if (t.traits.poke >= 3) rules.push({ if: `${t.name} starts poking at an objective`, then: initiator ? `${initiator.name} engages before health drops, or we back off and reset.` : "back off and reset; we cannot engage into it." });
    if (t.traits.counterEngage >= 3 && initiator) rules.push({ if: `${t.name} has disengage up`, then: "wait it out or engage from a flank; a front engage is wasted." });
  }
  if (ourCurve === "late" || theirCurve === "early") rules.push({ if: "they force early plays", then: "concede the objective, farm safely and scale; no coin-flip fights before two items." });
  if (rules.length === 0) rules.push({ if: "an objective is about to spawn", then: "set vision a minute early and group with the initiator." });

  // --- Scenarios ---
  const scenarios = {
    ahead: [
      sider ? `Use ${sider.name}'s side pressure to force them to answer; take towers and the next objective.` : "Group and siege; take the objective they cannot contest.",
      `Keep ${carry ? carry.name : "the carry"} safe: a lead is lost through a caught carry, not a lost objective.`,
      ourCurve === "early" || theirCurve === "late" ? "Close before their scaling matters: Baron after the next won fight." : "Do not force; convert the lead into vision control and objectives.",
    ],
    even: [first(plan.winCondition, "Play the structure."), quick.objectives, initiator ? `Fights start on ${initiator.name}'s terms only.` : "Fight on picks and objective setups, not open 5v5s."],
    behind: [
      ourCurve === "late" ? "Concede objectives that cost a fight; farm safely and wait for our spikes." : "Trade objectives instead of contesting; look for a pick before the next spawn.",
      sider ? `${sider.name} keeps side pressure to buy time.` : "Clear waves with the whole team and protect towers.",
      "One clean fight brings it back: never two bad ones.",
    ],
  };

  // --- Denial plan ---
  const theirWin = theirIdentity ? winConditionFor(theirIdentity.primary, theirs) : theirs.length ? `Play through ${theirs.map((t) => t.name).join(", ")}.` : "Unknown: no enemy picks recorded.";
  const deny: string[] = [];
  const theirCarry = theirs.filter((t) => t.traits.sustainedDps >= 3 || (t.traits.scaling >= 3 && t.traits.range >= 2)).sort((a, b) => b.traits.scaling - a.traits.scaling)[0];
  if (theirCarry) deny.push(`Deny ${theirCarry.name}: ${members.some((m) => m.traits.dive >= 2 || m.traits.pick >= 3) ? `${members.filter((m) => m.traits.dive >= 2 || m.traits.pick >= 3).map((m) => m.name).join(" and ")} threaten them every fight` : "track them and pressure their lane"}.`);
  const theirEngager = theirs.filter((t) => t.traits.engage >= 3)[0];
  if (theirEngager) deny.push(`Deny ${theirEngager.name}'s engage: ${ourProfile.totals.counterEngage >= 2 ? "hold disengage for it" : "vision on flanks and spacing"}.`);
  const theirSider = theirs.filter((t) => t.traits.sideLane >= 3)[0];
  if (theirSider) deny.push(`Deny ${theirSider.name}'s split: ward their side jungle and ${sider ? `send ${sider.name}` : "collapse with two"}.`);
  if (theirCurve === "late") deny.push("Deny their scaling: end before three items.");
  if (theirCurve === "early") deny.push("Deny their early game: safe wave management, no 2v2 skirmishes without a reason.");
  if (deny.length === 0) deny.push("Play our structure; nothing specific to deny.");

  // --- Self-critique ---
  const critique: string[] = [];
  if (ourProfile.totals.frontline < 3) critique.push("Thin frontline: we cannot absorb an engage, so fights must start on our terms.");
  if (ourProfile.totals.engage < 3 && ourProfile.totals.pick < 3) critique.push("Limited engage: we rely on them making the first move or on picks.");
  if (ourProfile.totals.waveclear < 4) critique.push("Weak waveclear: sieges against us will be uncomfortable; do not fall behind on side waves.");
  const phys = members.reduce((s, m) => s + m.traits.physicalDamage, 0);
  const magic = members.reduce((s, m) => s + m.traits.magicDamage, 0);
  if (phys >= 9 && magic <= 3) critique.push("Almost all physical damage: armour stacking hurts us; end before they itemise.");
  if (magic >= 9 && phys <= 3) critique.push("Almost all magic damage: magic resist stacking hurts us; end before they itemise.");
  const hungry = members.filter((m) => resourceNeed(m.traits).need === "strongside");
  if (hungry.length >= 3) critique.push(`Three resource-hungry champions (${hungry.map((m) => m.name).join(", ")}): decide before minute one who gets the jungle's attention.`);
  const demanding = members.filter((m) => executionProfile(m.traits).total >= 0.6);
  if (demanding.length >= 2) critique.push(`${demanding.map((m) => m.name).join(" and ")} are demanding to execute: keep the plan simple and avoid chaotic fights.`);
  for (const note of interaction.notes.filter((n) => n.value < -0.15).slice(0, 2)) critique.push(`${note.text}.`);
  for (const lane of plan.lanePriorities.filter((l) => /Protect/.test(l))) critique.push(lane);
  if (critique.length === 0) critique.push("No structural weakness stands out; execution decides.");

  const summaryLines = [
    `WIN CONDITION: ${quick.winCondition}`,
    `EARLY PLAN: ${quick.earlyPlan}`,
    `PLAY FOR: ${quick.playFor}`,
    `FIGHTS: ${quick.fights}`,
    `SIDE LANE: ${quick.sideLane}`,
    `OBJECTIVES: ${quick.objectives}`,
    `WATCH FOR: ${quick.watchFor}`,
    `AVOID: ${quick.avoid}`,
    ...(input.coachNote ? [`STRATEGY: ${input.coachNote}`] : []),
    "",
    ...playerJobs.map((j) => `${ROLE_LABELS[j.role].toUpperCase()} ${j.playerName} (${input.champions.get(j.championId)?.name ?? j.championId}): ${j.job}`),
    "",
    ...rules.slice(0, 5).map((r) => `IF ${r.if} → ${r.then}`),
  ];

  return {
    version: 2,
    quick,
    coachNote: input.coachNote?.trim() || null,
    playerJobs,
    rules: dedupeRules(rules),
    scenarios,
    denial: { theirWinCondition: theirWin, deny: [...new Set(deny)] },
    critique: [...new Set(critique)].slice(0, 6),
    threats,
    plan,
    summaryLines,
  };
}

function jobFor(m: Member, members: Member[], theirs: Array<{ championId: string; role: Role | null; traits: ChampionTraits; name: string }>, plan: GamePlan, carry: Member | null, initiator: Member | null, sider: Member | null): PlayerJob {
  const t = m.traits;
  const opponent = theirs.find((e) => e.role === m.role);
  const lane = plan.lanePriorities.find((l) => l.includes(m.name));
  let job: string;
  if (m === initiator) job = `Initiate fights on your terms; you decide when we go${carry ? `, ${carry.name} follows` : ""}.`;
  else if (m === sider) job = `Side-lane pressure: push the wave, draw two, and join only when the fight is set.`;
  else if (m === carry) job = `Primary damage: stay alive first, deal damage second; never the first body in a fight.`;
  else if (t.peel >= 2) job = `Protect ${carry ? carry.name : "the carry"}: your cooldowns are for peel, not for engaging.`;
  else if (t.pick >= 3) job = `Find picks before objectives: catch an isolated target, then we take the objective.`;
  else if (t.poke >= 3) job = `Poke before fights: lower their health bars so they cannot contest.`;
  else if (m.role === "JUNGLE") job = t.earlyGame >= 2 ? "Gank the lane with priority early; track their jungler and set up objectives." : "Farm to your spikes; secure objectives and protect lanes under pressure.";
  else if (t.sustainedDps >= 2 || t.burst >= 3) job = `Secondary damage: farm safely, position with ${carry ? carry.name : "the carry"} and follow up on the engage.`;
  else job = `${t.frontline >= 2 ? "Frontline" : "Flexible"}: hold the line and follow the initiator.`;
  const laning = opponent ? `${lane ? lane.replace(/^Play through [A-Za-z]+: |^Protect [A-Za-z]+: /, "") : `Standard lane into ${opponent.name}.`}` : lane ?? "Standard laning: trade when their jungler is shown elsewhere.";
  const fights =
    m === carry
      ? "Back line, maximum uptime; disengage if the frontline is dead."
      : m === initiator
        ? "Front, first to commit; wait for flanks to be set."
        : t.peel >= 2 && carry
          ? `Stay with ${carry.name}; body-block dives.`
          : t.dive >= 2
            ? `Flank onto ${theirs.find((e) => e.traits.sustainedDps >= 3)?.name ?? "their carry"} once their cooldowns are down.`
            : t.sustainedDps >= 2 || t.burst >= 3
              ? "Second line: stay near the carry, deal damage once the frontline has committed."
              : "Mid-line: follow the engage, kite back if it fails.";
  return { playerId: m.playerId, playerName: m.playerName, championId: m.championId, role: m.role, job: clean(job), short: shortJob(m, carry, initiator, sider), laning: clean(laning), fights: clean(fights) };
}

/** The Quick Playbook assignment: the same decision as the full job, in a few words. */
function shortJob(m: Member, carry: Member | null, initiator: Member | null, sider: Member | null): string {
  const t = m.traits;
  if (m === initiator) return "Start the fights";
  if (m === sider) return "Control side lane";
  if (m === carry) return "Stay alive, deal damage";
  if (t.peel >= 2) return carry ? `Protect ${carry.name}` : "Peel for the carries";
  if (t.pick >= 3) return "Find picks before objectives";
  if (t.poke >= 3) return "Poke before fights";
  if (m.role === "JUNGLE") return t.earlyGame >= 2 ? "Gank early, set up objectives" : "Farm spikes, secure objectives";
  if (t.sustainedDps >= 2 || t.burst >= 3) return "Follow up on the engage";
  return t.frontline >= 2 ? "Hold the frontline" : "Follow the initiator";
}

/** A job's short form, also for playbooks archived before short jobs existed. */
export function shortJobText(job: PlayerJob): string {
  return job.short ?? job.job.split(/[:;,.]/)[0]!.trim();
}

function winConditionFor(identity: string, theirs: Array<{ name: string; traits: ChampionTraits }>): string {
  const carry = theirs.filter((t) => t.traits.sustainedDps >= 3).sort((a, b) => b.traits.scaling - a.traits.scaling)[0];
  switch (identity) {
    case "Dive":
      return `Dive our backline${carry ? ` and let ${carry.name} clean up` : ""}.`;
    case "Front-to-back":
      return `Front-to-back fights around ${carry ? carry.name : "their carry"}.`;
    case "Pick":
      return "Catch someone before objectives and take them for free.";
    case "Poke / Siege":
      return "Poke us down and siege towers without committing.";
    case "Scaling":
      return `Survive early and win late${carry ? ` through ${carry.name}` : ""}.`;
    case "Split pressure":
      return `${theirs.sort((a, b) => b.traits.sideLane - a.traits.sideLane)[0]?.name ?? "Their sider"} splits while four pressure the map.`;
    case "Teamfight engage":
      return "Force 5v5 fights on their engage.";
    case "Early skirmish":
      return "Win early skirmishes and snowball tempo.";
    default:
      return "Play their structure.";
  }
}

function dedupeRules(rules: PlaybookRule[]): PlaybookRule[] {
  const seen = new Set<string>();
  return rules.filter((r) => (seen.has(r.if) ? false : (seen.add(r.if), true))).slice(0, 8);
}
