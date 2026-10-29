import fixture from "@/server/riot/fixtures/champions.fixture.json";

/*
  A ranked game as Riot's Match-V5 API returns it, with its timeline (test data only). It is built
  from a script of what happened: every champion kill with its killer, victim and assists (one
  execution by a tower among them), the epic monsters and buildings each side took, and each
  player's gold, experience and CS at every frame. The match's figures are then read from that
  script the way Riot's own data relates them: a player's kills, deaths and assists are the kill
  events, their gold, CS and level at the end are the last frame's, and each team's objective
  counts are the events'. A test can therefore check that every view of the game tells the same
  game, from either side. `truth` is the script's own reading, independent of the app's code.
*/

export type Position = "TOP" | "JUNGLE" | "MIDDLE" | "BOTTOM" | "UTILITY";

export interface ScriptPlayer {
  puuid: string;
  gameName: string;
  tagLine: string;
  champion: string;
}

export interface GameTruth {
  /** Kills each team made (executions are no one's kills). */
  kills: Record<100 | 200, number>;
  /** Each team's gold at the end of the game (the last frame, which Riot's goldEarned equals). */
  gold: Record<100 | 200, number>;
  objectives: Record<100 | 200, { tower: number; dragon: number; baron: number; horde: number; riftHerald: number; inhibitor: number }>;
  players: Array<{ puuid: string; teamId: 100 | 200; position: Position; kills: number; deaths: number; assists: number; gold: number; cs: number; level: number; damage: number }>;
  /** The frames' timestamps (ms), the last one at the end of the game. */
  frames: number[];
}

export interface RiotGameFixture {
  match: Record<string, unknown>;
  timeline: Record<string, unknown>;
  truth: GameTruth;
}

const POSITIONS: Position[] = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
const keyOf = (id: string) => {
  const c = fixture.champions.find((x) => x.id === id);
  if (!c) throw new Error(`no champion ${id} in the fixture`);
  return Number(c.key);
};
/** Riot's experience to reach each level (index = level). */
const XP_TO_LEVEL = [0, 0, 280, 660, 1140, 1720, 2400, 3180, 4060, 5040, 6120, 7300, 8580, 9960, 11440, 13020, 14700, 16480, 18360];
const levelOf = (xp: number) => {
  let level = 1;
  while (level < 18 && xp >= XP_TO_LEVEL[level + 1]!) level++;
  return level;
};

interface KillEvent {
  t: number;
  killer: number; // participant id; 0 = an execution
  victim: number;
  assists: number[];
}

interface ObjectiveEvent {
  t: number;
  type: "ELITE_MONSTER_KILL" | "BUILDING_KILL";
  killer: number;
  team: 100 | 200; // the team that took it
  monsterType?: string;
  monsterSubType?: string;
  buildingType?: string;
  laneType?: string;
  towerType?: string;
}

export function riotGame(options: { matchId: string; players: ScriptPlayer[]; winner: 100 | 200; durationS: number; created: number; queueId?: number; seed?: number }): RiotGameFixture {
  const { matchId, players, winner, durationS, created } = options;
  if (players.length !== 10) throw new Error("a game has ten players");
  let seed = options.seed ?? 20_261_029;
  const rnd = () => ((seed = (seed * 9301 + 49_297) % 233_280), seed / 233_280);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)]!;
  const loser: 100 | 200 = winner === 100 ? 200 : 100;
  const teamOf = (pid: number): 100 | 200 => (pid <= 5 ? 100 : 200);
  const idsOf = (team: 100 | 200) => (team === 100 ? [1, 2, 3, 4, 5] : [6, 7, 8, 9, 10]);
  const positionOf = (pid: number) => POSITIONS[(pid - 1) % 5]!;
  const end = durationS * 1000;

  // Frames about every minute (Riot's are a few milliseconds late), and one at the end of the game.
  const frameTimes: number[] = [0];
  for (let m = 1; m * 60_000 < end - 1_000; m++) frameTimes.push(m * 60_000 + Math.floor(rnd() * 40));
  frameTimes.push(end);

  // Champion kills: the winner makes more of them; nobody kills twice within ten seconds (no multikills to reconcile).
  const kills: KillEvent[] = [];
  const killTimes = new Map<number, number[]>();
  for (let k = 0; k < 48; k++) {
    const t = Math.round((0.08 + 0.9 * Math.sqrt(rnd())) * end);
    const team = rnd() < 0.62 ? winner : loser;
    const weights = [2, 2, 3, 3, 1];
    const pool = idsOf(team).flatMap((pid, i) => Array(weights[i]!).fill(pid) as number[]);
    const killer = pick(pool);
    const before = killTimes.get(killer) ?? [];
    if (before.some((x) => Math.abs(x - t) < 10_000)) continue;
    killTimes.set(killer, [...before, t]);
    const victim = pick(idsOf(team === 100 ? 200 : 100));
    const helpers = idsOf(team).filter((pid) => pid !== killer && rnd() < 0.45);
    kills.push({ t, killer, victim, assists: helpers });
  }
  // One execution: a tower killed a player of the losing side (a death, nobody's kill).
  kills.push({ t: Math.round(end * 0.37), killer: 0, victim: idsOf(loser)[2]!, assists: [] });
  kills.sort((a, b) => a.t - b.t);

  // Epic monsters and buildings.
  const objectives: ObjectiveEvent[] = [];
  const jungler = (team: 100 | 200) => idsOf(team)[1]!;
  const dragonKinds = ["FIRE_DRAGON", "EARTH_DRAGON", "WATER_DRAGON", "AIR_DRAGON", "HEXTECH_DRAGON", "CHEMTECH_DRAGON"];
  for (let t = 330_000; t < end - 60_000; t += 330_000) {
    const team = rnd() < 0.65 ? winner : loser;
    objectives.push({ t, type: "ELITE_MONSTER_KILL", killer: jungler(team), team, monsterType: "DRAGON", monsterSubType: pick(dragonKinds) });
  }
  for (let g = 0; g < 3; g++) objectives.push({ t: 370_000 + g * 15_000, type: "ELITE_MONSTER_KILL", killer: jungler(loser), team: loser, monsterType: "HORDE" });
  objectives.push({ t: 880_000, type: "ELITE_MONSTER_KILL", killer: jungler(winner), team: winner, monsterType: "RIFTHERALD" });
  if (end > 1_560_000) objectives.push({ t: 1_530_000, type: "ELITE_MONSTER_KILL", killer: jungler(winner), team: winner, monsterType: "BARON_NASHOR" });
  const lanes = ["TOP_LANE", "MID_LANE", "BOT_LANE"];
  const tiers = ["OUTER_TURRET", "INNER_TURRET", "BASE_TURRET"];
  const towers = (team: 100 | 200, n: number, from: number) => {
    for (let k = 0; k < n; k++) objectives.push({ t: Math.round(from + ((end - 90_000 - from) * (k + 0.5)) / n), type: "BUILDING_KILL", killer: pick(idsOf(team)), team, buildingType: "TOWER_BUILDING", laneType: lanes[k % 3], towerType: tiers[Math.min(2, Math.floor(k / 3))] });
  };
  towers(winner, 8, 600_000);
  towers(loser, 3, 700_000);
  objectives.push({ t: end - 75_000, type: "BUILDING_KILL", killer: pick(idsOf(winner)), team: winner, buildingType: "INHIBITOR_BUILDING", laneType: "MID_LANE" });
  objectives.push({ t: end - 40_000, type: "BUILDING_KILL", killer: pick(idsOf(winner)), team: winner, buildingType: "TOWER_BUILDING", laneType: "MID_LANE", towerType: "NEXUS_TURRET" });
  objectives.push({ t: end - 25_000, type: "BUILDING_KILL", killer: pick(idsOf(winner)), team: winner, buildingType: "TOWER_BUILDING", laneType: "MID_LANE", towerType: "NEXUS_TURRET" });
  objectives.sort((a, b) => a.t - b.t);

  // Each player's figures at every frame: farm by position, passive gold, kills, assists and towers.
  const csRate: Record<Position, number> = { TOP: 7.1, JUNGLE: 5.6, MIDDLE: 7.6, BOTTOM: 8.2, UTILITY: 1.1 };
  const xpRate: Record<Position, number> = { TOP: 520, JUNGLE: 470, MIDDLE: 540, BOTTOM: 470, UTILITY: 380 };
  const skill = Array.from({ length: 11 }, () => 0.9 + rnd() * 0.2);
  const framesOf = (pid: number) =>
    frameTimes.map((t) => {
      const minutes = t / 60_000;
      const pos = positionOf(pid);
      const farming = Math.max(0, minutes - 1.5) * csRate[pos] * skill[pid]!;
      const lane = pos === "JUNGLE" ? Math.round(farming * 0.15) : Math.round(farming);
      const jungle = pos === "JUNGLE" ? Math.round(farming * 0.85) : 0;
      const made = kills.filter((k) => k.t <= t && k.killer === pid).length;
      const helped = kills.filter((k) => k.t <= t && k.assists.includes(pid)).length;
      const towersTaken = objectives.filter((o) => o.t <= t && o.buildingType === "TOWER_BUILDING" && o.team === teamOf(pid)).length;
      const passive = Math.max(0, minutes - 1.833) * 122.4;
      const totalGold = Math.round(500 + passive + lane * 21 + jungle * 33 + made * 300 + helped * 150 + towersTaken * 50);
      const xp = Math.round(Math.max(0, minutes - 1.2) * xpRate[pos] * skill[pid]! + made * 140 + helped * 70);
      return { totalGold, xp, minionsKilled: lane, jungleMinionsKilled: jungle, level: levelOf(xp) };
    });
  const figures = new Map(Array.from({ length: 10 }, (_, i) => [i + 1, framesOf(i + 1)] as const));

  const kda = (pid: number) => ({
    kills: kills.filter((k) => k.killer === pid).length,
    deaths: kills.filter((k) => k.victim === pid).length,
    assists: kills.filter((k) => k.assists.includes(pid)).length,
  });
  const damageOf = (pid: number) => {
    const { kills: k, assists: a } = kda(pid);
    return Math.round((positionOf(pid) === "UTILITY" ? 520 : 790) * (durationS / 60) * skill[pid]! + k * 900 + a * 350);
  };
  const objectiveCount = (team: 100 | 200) => ({
    tower: objectives.filter((o) => o.team === team && o.buildingType === "TOWER_BUILDING").length,
    dragon: objectives.filter((o) => o.team === team && o.monsterType === "DRAGON").length,
    baron: objectives.filter((o) => o.team === team && o.monsterType === "BARON_NASHOR").length,
    horde: objectives.filter((o) => o.team === team && o.monsterType === "HORDE").length,
    riftHerald: objectives.filter((o) => o.team === team && o.monsterType === "RIFTHERALD").length,
    inhibitor: objectives.filter((o) => o.team === team && o.buildingType === "INHIBITOR_BUILDING").length,
  });
  const teamKills = (team: 100 | 200) => kills.filter((k) => k.killer !== 0 && teamOf(k.killer) === team).length;

  const truthPlayers = players.map((p, i) => {
    const pid = i + 1;
    const last = figures.get(pid)!.at(-1)!;
    return { puuid: p.puuid, teamId: teamOf(pid), position: positionOf(pid), ...kda(pid), gold: last.totalGold, cs: last.minionsKilled + last.jungleMinionsKilled, level: last.level, damage: damageOf(pid) };
  });
  const goldOf = (team: 100 | 200) => truthPlayers.filter((p) => p.teamId === team).reduce((n, p) => n + p.gold, 0);

  const items: Record<Position, number[]> = {
    TOP: [3078, 3047, 6333, 3053, 3065, 1029, 3340],
    JUNGLE: [6692, 3047, 3071, 3036, 1036, 0, 3364],
    MIDDLE: [6655, 3020, 3089, 4645, 3135, 0, 3340],
    BOTTOM: [6672, 3006, 3031, 3036, 3094, 1038, 3363],
    UTILITY: [3190, 3117, 3107, 3222, 2055, 0, 3364],
  };
  const match = {
    metadata: { dataVersion: "2", matchId, participants: players.map((p) => p.puuid) },
    info: {
      endOfGameResult: "GameComplete",
      gameCreation: created,
      gameDuration: durationS,
      gameEndTimestamp: created + 90_000 + end,
      gameMode: "CLASSIC",
      gameVersion: "16.20.712.1934",
      mapId: 11,
      platformId: matchId.split("_")[0],
      queueId: options.queueId ?? 420,
      teams: ([100, 200] as const).map((teamId) => {
        const c = objectiveCount(teamId);
        return {
          teamId,
          win: teamId === winner,
          bans: [0, 1, 2, 3, 4].map((n) => ({ championId: [keyOf("Zed"), keyOf("Yasuo"), keyOf("Darius"), keyOf("Thresh"), keyOf("Jinx")][(n + (teamId === 100 ? 0 : 2)) % 5]!, pickTurn: n + 1 })),
          objectives: {
            atakhan: { first: false, kills: 0 },
            baron: { first: c.baron > 0, kills: c.baron },
            champion: { first: kills.find((k) => k.killer !== 0) ? teamOf(kills.find((k) => k.killer !== 0)!.killer) === teamId : false, kills: teamKills(teamId) },
            dragon: { first: objectives.find((o) => o.monsterType === "DRAGON")?.team === teamId, kills: c.dragon },
            horde: { first: c.horde > 0, kills: c.horde },
            inhibitor: { first: c.inhibitor > 0, kills: c.inhibitor },
            riftHerald: { first: c.riftHerald > 0, kills: c.riftHerald },
            tower: { first: objectives.find((o) => o.buildingType === "TOWER_BUILDING")?.team === teamId, kills: c.tower },
          },
        };
      }),
      participants: players.map((p, i) => {
        const pid = i + 1;
        const truth = truthPlayers[i]!;
        const last = figures.get(pid)!.at(-1)!;
        const pos = positionOf(pid);
        const it = items[pos];
        return {
          participantId: pid,
          puuid: p.puuid,
          riotIdGameName: p.gameName,
          riotIdTagline: p.tagLine,
          summonerName: "",
          teamId: teamOf(pid),
          teamPosition: pos,
          individualPosition: pos,
          championId: keyOf(p.champion),
          championName: p.champion,
          champLevel: truth.level,
          win: teamOf(pid) === winner,
          kills: truth.kills,
          deaths: truth.deaths,
          assists: truth.assists,
          goldEarned: last.totalGold,
          goldSpent: last.totalGold - 400,
          totalMinionsKilled: last.minionsKilled,
          neutralMinionsKilled: last.jungleMinionsKilled,
          totalDamageDealtToChampions: truth.damage,
          totalDamageTaken: Math.round(truth.damage * 1.15),
          visionScore: pos === "UTILITY" ? 64 : pos === "JUNGLE" ? 38 : 21,
          wardsPlaced: pos === "UTILITY" ? 31 : 9,
          wardsKilled: pos === "UTILITY" ? 7 : 3,
          visionWardsBoughtInGame: pos === "UTILITY" ? 6 : 2,
          doubleKills: 0,
          tripleKills: 0,
          quadraKills: 0,
          pentaKills: 0,
          largestMultiKill: truth.kills > 0 ? 1 : 0,
          largestKillingSpree: Math.min(truth.kills, 3),
          firstBloodKill: kills.find((k) => k.killer !== 0)?.killer === pid,
          firstBloodAssist: !!kills.find((k) => k.killer !== 0)?.assists.includes(pid),
          damageDealtToObjectives: pos === "JUNGLE" ? 31_000 : 6_000,
          damageDealtToBuildings: objectives.filter((o) => o.killer === pid && o.type === "BUILDING_KILL").length * 2_500,
          turretTakedowns: objectives.filter((o) => o.buildingType === "TOWER_BUILDING" && o.killer === pid).length,
          timeCCingOthers: 18,
          challenges: { soloKills: Math.max(0, truth.kills - 2), killParticipation: 0 },
          item0: it[0],
          item1: it[1],
          item2: it[2],
          item3: it[3],
          item4: it[4],
          item5: it[5],
          item6: it[6],
          summoner1Id: pos === "JUNGLE" ? 11 : 4,
          summoner2Id: pos === "UTILITY" ? 3 : pos === "TOP" ? 12 : 14,
          perks: {
            statPerks: { defense: 5011, flex: 5008, offense: 5005 },
            styles: [
              { description: "primaryStyle", style: 8100, selections: [{ perk: 8112 }, { perk: 8139 }, { perk: 8138 }, { perk: 8135 }] },
              { description: "subStyle", style: 8200, selections: [{ perk: 8226 }, { perk: 8210 }] },
            ],
          },
        };
      }),
    },
  };

  // The timeline: each event in the frame whose minute it happened in, as Riot files them.
  const frameIndexOf = (t: number) => {
    let f = 0;
    while (f + 1 < frameTimes.length - 1 && frameTimes[f + 1]! <= t) f++;
    return f;
  };
  const frameEvents = frameTimes.map(() => [] as Array<Record<string, unknown>>);
  for (let pid = 1; pid <= 10; pid++) {
    const pos = positionOf(pid);
    frameEvents[0]!.push({ type: "ITEM_PURCHASED", timestamp: 1_500 + pid * 100, participantId: pid, itemId: items[pos][1] === 3020 ? 1056 : 1055 });
    frameEvents[0]!.push({ type: "SKILL_LEVEL_UP", timestamp: 2_000 + pid * 100, participantId: pid, skillSlot: 1, levelUpType: "NORMAL" });
  }
  for (const k of kills) frameEvents[frameIndexOf(k.t)]!.push({ type: "CHAMPION_KILL", timestamp: k.t, killerId: k.killer, victimId: k.victim, assistingParticipantIds: k.assists, bounty: 300, shutdownBounty: 0 });
  for (const o of objectives) {
    if (o.type === "ELITE_MONSTER_KILL") frameEvents[frameIndexOf(o.t)]!.push({ type: o.type, timestamp: o.t, killerId: o.killer, killerTeamId: o.team, monsterType: o.monsterType, ...(o.monsterSubType ? { monsterSubType: o.monsterSubType } : {}) });
    // Riot names the side that lost the building.
    else frameEvents[frameIndexOf(o.t)]!.push({ type: o.type, timestamp: o.t, killerId: o.killer, teamId: o.team === 100 ? 200 : 100, buildingType: o.buildingType, laneType: o.laneType, ...(o.towerType ? { towerType: o.towerType } : {}), assistingParticipantIds: [] });
  }
  frameEvents.at(-1)!.push({ type: "GAME_END", timestamp: end, winningTeam: winner, gameId: Number(matchId.split("_")[1] ?? 0), realTimestamp: created + end });
  for (const events of frameEvents) events.sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
  const timeline = {
    metadata: { dataVersion: "2", matchId, participants: players.map((p) => p.puuid) },
    info: {
      endOfGameResult: "GameComplete",
      frameInterval: 60_000,
      gameId: Number(matchId.split("_")[1] ?? 0),
      participants: players.map((p, i) => ({ participantId: i + 1, puuid: p.puuid })),
      frames: frameTimes.map((timestamp, f) => ({
        timestamp,
        participantFrames: Object.fromEntries(
          Array.from({ length: 10 }, (_, i) => {
            const x = figures.get(i + 1)![f]!;
            return [String(i + 1), { participantId: i + 1, currentGold: Math.round(x.totalGold * 0.12), goldPerSecond: 0, totalGold: x.totalGold, xp: x.xp, level: x.level, minionsKilled: x.minionsKilled, jungleMinionsKilled: x.jungleMinionsKilled, position: { x: 7_000, y: 7_000 }, timeEnemySpentControlled: 0 }];
          }),
        ),
        events: frameEvents[f]!,
      })),
    },
  };

  return {
    match,
    timeline,
    truth: { kills: { 100: teamKills(100), 200: teamKills(200) }, gold: { 100: goldOf(100), 200: goldOf(200) }, objectives: { 100: objectiveCount(100), 200: objectiveCount(200) }, players: truthPlayers, frames: frameTimes },
  };
}
