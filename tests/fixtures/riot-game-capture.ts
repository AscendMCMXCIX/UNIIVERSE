import type { RiotGameFixture } from "./riot-game";

/*
  The fields UNIIVERSE keeps from 20 Nov 2026 on, added to a scripted game (tests/fixtures/riot-game)
  the way Riot's own answers carry them (test data only), so the stored size of a match record and
  of a timeline can be measured on something shaped like a real game, and a fold can be checked
  end to end:
  - every frame: each player's place on the map (along their lane, the jungle's camps or back at the
    fountain), the champion's stats (ability haste rising as items are finished, beside the other
    stats Riot sends and UNIIVERSE drops) and damage stats (dropped too);
  - the events of a real game around the purchases the script already has: a build of 18–28
    purchases per player, the components each finished item uses up, potions drunk and control wards
    placed (ITEM_DESTROYED), a starting item sold, an undone purchase, LEVEL_UP for every level the
    frames show, wards placed and cleared (dropped), and the turret plates each side broke;
  - every participant: Riot's challenges (the ten lane and jungle figures among about forty others
    UNIIVERSE drops) and the figures for supports and tanks.
  The script's own figures (kills, gold, CS, level, objectives) are left exactly as they were.
*/

type Json = Record<string, unknown>;

/** Riot's map: blue fountain bottom left, red top right (map units). */
const FOUNTAIN: Record<100 | 200, [number, number]> = { 100: [554, 581], 200: [14_340, 14_391] };
/** Where each position spends the laning phase, for each side (a few points along the lane). */
const LANE_POINTS: Record<string, Record<100 | 200, Array<[number, number]>>> = {
  TOP: { 100: [[1_520, 9_800], [1_890, 12_110], [3_120, 13_400]], 200: [[4_200, 13_700], [2_900, 13_120], [1_980, 11_600]] },
  JUNGLE: { 100: [[3_820, 7_960], [6_910, 5_210], [7_870, 3_840], [10_390, 6_920]], 200: [[11_010, 6_970], [7_890, 9_420], [6_980, 10_980], [4_410, 8_050]] },
  MIDDLE: { 100: [[5_840, 6_120], [6_710, 6_980], [7_210, 7_390]], 200: [[8_980, 8_720], [8_110, 7_960], [7_640, 7_510]] },
  BOTTOM: { 100: [[10_580, 1_420], [12_100, 1_910], [13_210, 3_080]], 200: [[13_470, 4_190], [13_020, 2_810], [11_600, 1_840]] },
  UTILITY: { 100: [[10_900, 1_780], [12_350, 2_310], [13_000, 3_400]], 200: [[13_200, 4_520], [12_700, 3_100], [11_400, 2_200]] },
};
const POSITIONS = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] as const;
/** Each position's finished items in order, with the components each one uses up (Riot sends ITEM_DESTROYED for those held). */
const BUILDS: Record<(typeof POSITIONS)[number], Array<{ item: number; from: number[] }>> = {
  TOP: [{ item: 3044, from: [1028, 1036] }, { item: 3078, from: [3044, 3057, 1001] }, { item: 3047, from: [1001, 1029] }, { item: 6333, from: [3133, 1028] }, { item: 3053, from: [3044, 1011] }, { item: 3065, from: [3211, 3067] }],
  JUNGLE: [{ item: 6692, from: [3134, 1037] }, { item: 3047, from: [1001, 1029] }, { item: 3071, from: [3044, 3133] }, { item: 3036, from: [3035, 1037] }, { item: 1036, from: [] }],
  MIDDLE: [{ item: 3802, from: [1052, 3916] }, { item: 6655, from: [3802, 1058] }, { item: 3020, from: [1001, 1052] }, { item: 3089, from: [1058, 1058, 1026] }, { item: 4645, from: [1058, 3916] }, { item: 3135, from: [1026, 3108] }],
  BOTTOM: [{ item: 6670, from: [1036, 1042] }, { item: 6672, from: [6670, 1018] }, { item: 3006, from: [1001, 1042] }, { item: 3031, from: [1038, 1018, 1037] }, { item: 3036, from: [3035, 1037] }, { item: 3094, from: [3086, 1042] }],
  UTILITY: [{ item: 3866, from: [3865] }, { item: 3867, from: [3866] }, { item: 3117, from: [1001] }, { item: 3107, from: [1028, 3067] }, { item: 3222, from: [3114, 1028] }],
};
/** The side that loses a plate breaks first on its weaker lanes; plates fall before 14:00. */
const PLATE_LANES = ["TOP_LANE", "MID_LANE", "BOT_LANE"] as const;

export function withCaptureFields(game: RiotGameFixture, options: { seed?: number } = {}): RiotGameFixture {
  let seed = options.seed ?? 20_261_120;
  const rnd = () => ((seed = (seed * 9301 + 49_297) % 233_280), seed / 233_280);
  const int = (lo: number, hi: number) => Math.round(lo + rnd() * (hi - lo));
  const match = structuredClone(game.match) as { info: { gameDuration: number; participants: Json[] } };
  const timeline = structuredClone(game.timeline) as { info: { frames: Array<{ timestamp: number; participantFrames: Record<string, Json>; events: Json[] }> } };
  const end = match.info.gameDuration * 1000;
  const frames = timeline.info.frames;
  const teamOf = (pid: number): 100 | 200 => (pid <= 5 ? 100 : 200);
  const positionOf = (pid: number) => POSITIONS[(pid - 1) % 5]!;
  const deathsOf = new Map<number, number[]>();
  for (const f of frames) for (const e of f.events) if (e.type === "CHAMPION_KILL") deathsOf.set(Number(e.victimId), [...(deathsOf.get(Number(e.victimId)) ?? []), Number(e.timestamp)]);
  // Each event goes into the frame of its minute, as Riot files them.
  const frameOf = (t: number) => {
    let i = 0;
    while (i + 1 < frames.length - 1 && frames[i + 1]!.timestamp <= t) i++;
    return frames[i]!;
  };
  const push = (e: Json) => frameOf(Number(e.timestamp)).events.push(e);

  for (let pid = 1; pid <= 10; pid++) {
    const team = teamOf(pid);
    const pos = positionOf(pid);
    const enemy = team === 100 ? 200 : 100;
    // When the player finishes each item (a back every 3–5 minutes from about 6:00), what it used up, and its haste.
    const build = BUILDS[pos];
    const backs: number[] = [];
    for (let t = int(330_000, 420_000); t < end - 60_000 && backs.length < build.length + 3; t += int(180_000, 300_000)) backs.push(t);
    let haste = 0;
    const hasteAt: Array<[number, number]> = [[0, 0]];
    const buy = (t: number, itemId: number) => push({ type: "ITEM_PURCHASED", timestamp: t, participantId: pid, itemId });
    // The start: a second potion, the trinket; potions drunk in the first minutes.
    buy(1_600 + pid * 100, 2003);
    buy(1_700 + pid * 100, 3340);
    for (let k = 0; k < int(1, 3); k++) push({ type: "ITEM_DESTROYED", timestamp: int(150_000, 330_000), participantId: pid, itemId: 2003 });
    backs.forEach((t, k) => {
      const step = build[k];
      if (step) {
        // The components, bought on earlier backs (each a purchase of its own), then used up by the finished item.
        for (const c of step.from) buy(Math.max(t - int(60_000, 170_000), 2_000), c);
        for (const c of step.from) push({ type: "ITEM_DESTROYED", timestamp: t, participantId: pid, itemId: c });
        buy(t, step.item);
        haste += int(0, 1) ? int(10, 25) : 0;
        hasteAt.push([t, haste]);
      }
      // A control ward and potions most backs; a support places more wards.
      if (rnd() < (pos === "UTILITY" ? 0.95 : 0.55)) {
        buy(t + 400, 2055);
        push({ type: "ITEM_DESTROYED", timestamp: Math.min(t + int(40_000, 160_000), end - 1_000), participantId: pid, itemId: 2055 });
      }
      if (rnd() < 0.35) {
        buy(t + 600, 2003);
        push({ type: "ITEM_DESTROYED", timestamp: Math.min(t + int(30_000, 120_000), end - 1_000), participantId: pid, itemId: 2003 });
      }
    });
    // A purchase undone a moment later.
    if (backs[1]) {
      buy(backs[1] + 2_000, 1053);
      push({ type: "ITEM_UNDO", timestamp: backs[1] + 4_000, participantId: pid, beforeId: 1053, afterId: 0, goldGain: 900 });
    }
    // The starting item sold late (not by supports, whose item turns into the next), the trinket swapped.
    if (pos !== "UTILITY" && backs.length > 3) push({ type: "ITEM_SOLD", timestamp: backs[backs.length - 1]! + 1_000, participantId: pid, itemId: pos === "JUNGLE" ? 1103 : 1055 });
    if (backs[2]) {
      push({ type: "ITEM_DESTROYED", timestamp: backs[2] + 800, participantId: pid, itemId: 3340 });
      buy(backs[2] + 800, pos === "UTILITY" ? 3364 : 3363);
    }
    // Wards placed and cleared (Riot sends them; UNIIVERSE keeps none).
    for (let k = 0; k < (pos === "UTILITY" ? 24 : 9); k++) push({ type: "WARD_PLACED", timestamp: int(60_000, end - 1_000), creatorId: pid, wardType: "YELLOW_TRINKET" });
    for (let k = 0; k < (pos === "UTILITY" ? 6 : 2); k++) push({ type: "WARD_KILL", timestamp: int(60_000, end - 1_000), killerId: pid, wardType: "CONTROL_WARD" });

    // Every frame: the place, the stats, the level (already scripted) and the level-ups between frames.
    let previousLevel = 1;
    frames.forEach((f, i) => {
      const pf = f.participantFrames[String(pid)]!;
      const t = f.timestamp;
      const dead = (deathsOf.get(pid) ?? []).some((d) => t >= d && t < d + 25_000);
      const atFountain = i === 0 || dead || rnd() < 0.08;
      const lanePoints = LANE_POINTS[pos]![t < 840_000 ? team : rnd() < 0.5 ? team : enemy];
      const [bx, by] = atFountain ? FOUNTAIN[team] : lanePoints[int(0, lanePoints.length - 1)]!;
      const jitter = atFountain ? 60 : 900;
      pf.position = { x: Math.max(0, bx + int(-jitter, jitter)), y: Math.max(0, by + int(-jitter, jitter)) };
      const h = hasteAt.filter(([at]) => at <= t).at(-1)![1] + (Number(pf.level) >= 5 ? 8 : 0);
      pf.championStats = { abilityHaste: h, abilityPower: int(0, 300), armor: int(30, 200), armorPen: 0, armorPenPercent: 0, attackDamage: int(55, 320), attackSpeed: int(100, 250), bonusArmorPenPercent: 0, bonusMagicPenPercent: 0, ccReduction: 0, cooldownReduction: 0, health: int(400, 3500), healthMax: int(600, 3500), healthRegen: int(5, 60), lifesteal: 0, magicPen: 0, magicPenPercent: 0, magicResist: int(30, 90), movementSpeed: int(330, 450), omnivamp: 0, physicalVamp: 0, power: int(0, 1200), powerMax: int(300, 1200), powerRegen: int(5, 40), spellVamp: 0 };
      pf.damageStats = { magicDamageDone: int(0, 90_000), magicDamageDoneToChampions: int(0, 20_000), magicDamageTaken: int(0, 15_000), physicalDamageDone: int(0, 120_000), physicalDamageDoneToChampions: int(0, 20_000), physicalDamageTaken: int(0, 18_000), totalDamageDone: int(0, 200_000), totalDamageDoneToChampions: int(0, 30_000), totalDamageTaken: int(0, 30_000), trueDamageDone: int(0, 9_000), trueDamageDoneToChampions: int(0, 2_000), trueDamageTaken: int(0, 2_000) };
      const level = Number(pf.level);
      if (i > 0) {
        const from = frames[i - 1]!.timestamp;
        for (let l = previousLevel + 1; l <= level; l++) push({ type: "LEVEL_UP", timestamp: from + Math.round(((l - previousLevel) / (level - previousLevel + 1)) * (t - from)), participantId: pid, level: l });
      }
      previousLevel = level;
    });

    // Riot's challenges: the ten figures UNIIVERSE keeps among others it drops, and the support and tank figures.
    const p = match.info.participants[pid - 1]!;
    const jungle = pos === "JUNGLE";
    const kept = {
      jungleCsBefore10Minutes: jungle ? 58 + rnd() * 20 : 0,
      initialCrabCount: jungle ? int(0, 1) : 0,
      scuttleCrabKills: jungle ? int(1, 4) : 0,
      enemyJungleMonsterKills: jungle ? Math.round(rnd() * 12) / 2 : 0,
      junglerKillsEarlyJungle: jungle ? int(0, 2) : 0,
      killsOnLanersEarlyJungleAsJungler: jungle ? int(0, 3) : 0,
      maxCsAdvantageOnLaneOpponent: Math.round((rnd() * 60 - 15) * 1e6) / 1e6,
      maxLevelLeadLaneOpponent: int(0, 3),
      laningPhaseGoldExpAdvantage: int(0, 1),
      playedChampSelectPosition: 1,
    };
    const dropped = Object.fromEntries(
      ["12AssistStreakCount", "abilityUses", "acesBefore15Minutes", "alliedJungleMonsterKills", "baronTakedowns", "bountyGold", "buffsStolen", "controlWardsPlaced", "damagePerMinute", "damageTakenOnTeamPercentage", "dodgeSkillShotsSmallWindow", "dragonTakedowns", "effectiveHealAndShielding", "enemyChampionImmobilizations", "epicMonsterSteals", "gameLength", "goldPerMinute", "kda", "killParticipation", "laneMinionsFirst10Minutes", "multikills", "outnumberedKills", "perfectGame", "quickSoloKills", "skillshotsDodged", "skillshotsHit", "stealthWardsPlaced", "takedowns", "teamDamagePercentage", "turretTakedowns", "visionScorePerMinute", "wardTakedowns", "controlWardTimeCoverageInRiverOrEnemyHalf", "earlyLaningPhaseGoldExpAdvantage", "visionScoreAdvantageLaneOpponent", "hadAfkTeammate"].map((k) => [k, Math.round(rnd() * 1e9) / 1e6]),
    );
    p.challenges = { ...(p.challenges as Json), ...dropped, ...kept, turretPlatesTaken: 0 };
    p.totalTimeSpentDead = (deathsOf.get(pid) ?? []).reduce((s, d) => s + Math.round(8 + (d / end) * 40), 0);
    p.totalHealsOnTeammates = pos === "UTILITY" ? int(2_000, 9_000) : int(0, 400);
    p.totalDamageShieldedOnTeammates = pos === "UTILITY" ? int(1_500, 7_000) : int(0, 600);
    p.damageSelfMitigated = int(6_000, 45_000);
  }

  // Turret plates: each side breaks some of the other's before 14:00; a plate's breaker is credited.
  const plateCount = new Map<number, number>();
  for (let k = 0; k < 13; k++) {
    const breaker = int(1, 10);
    const lane = PLATE_LANES[k % 3]!;
    const t = int(300_000, 839_000);
    push({ type: "TURRET_PLATE_DESTROYED", timestamp: t, killerId: rnd() < 0.15 ? 0 : breaker, laneType: lane, position: { x: int(1_000, 14_000), y: int(1_000, 14_000) }, teamId: teamOf(breaker) === 100 ? 200 : 100 });
    plateCount.set(breaker, (plateCount.get(breaker) ?? 0) + 1);
  }
  for (const [pid, plates] of plateCount) ((match.info.participants[pid - 1]!.challenges as Json).turretPlatesTaken = plates);
  for (const f of frames) f.events.sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
  return { ...game, match: match as unknown as Json, timeline: timeline as unknown as Json };
}
