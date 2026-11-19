import { z } from "zod";

/** Only the fields UNIIVERSE needs. Extra fields are ignored so minor upstream additions never break a sync. */
export const platformStatusSchema = z.object({ id: z.string().min(1) });

export const matchIdsSchema = z.array(z.string().min(1));

/** An optional extra figure: anything but a number reads as absent. */
const extraNumber = z.number().optional().catch(undefined);

/**
 * Riot's per-game challenge figures that UNIIVERSE keeps (the rest of `challenges` is dropped).
 * soloKills feeds Team Leaderboards; turretPlatesTaken goes with the other figures for supports
 * and tanks; the lane and jungle figures (LANE_CHALLENGE_KEYS) are kept as evidence for Matchup
 * Intel, from the same match request. Each one tolerant: an unexpected value is absent.
 */
export const LANE_CHALLENGE_KEYS = [
  "jungleCsBefore10Minutes",
  "initialCrabCount",
  "scuttleCrabKills",
  "enemyJungleMonsterKills",
  "junglerKillsEarlyJungle",
  "killsOnLanersEarlyJungleAsJungler",
  "maxCsAdvantageOnLaneOpponent",
  "maxLevelLeadLaneOpponent",
  "laningPhaseGoldExpAdvantage",
  "playedChampSelectPosition",
] as const;
export type LaneChallengeKey = (typeof LANE_CHALLENGE_KEYS)[number];

const challengesSchema = z.object({
  soloKills: extraNumber,
  turretPlatesTaken: extraNumber,
  ...(Object.fromEntries(LANE_CHALLENGE_KEYS.map((k) => [k, extraNumber])) as Record<LaneChallengeKey, typeof extraNumber>),
});

export const matchParticipantSchema = z.object({
  puuid: z.string().min(1),
  teamId: z.number(),
  championId: z.number(),
  championName: z.string().optional(),
  teamPosition: z.string().optional().default(""),
  individualPosition: z.string().optional(),
  win: z.boolean(),
  kills: z.number().default(0),
  deaths: z.number().default(0),
  assists: z.number().default(0),
  /** Optional in the schema so a field Riot drops never breaks a sync; absent → not stored. */
  totalMinionsKilled: z.number().optional(),
  neutralMinionsKilled: z.number().optional(),
  totalDamageDealtToChampions: z.number().optional(),
  visionScore: z.number().optional(),
  // Match-history details (all optional: a field Riot drops is simply not shown).
  riotIdGameName: z.string().optional(),
  riotIdTagline: z.string().optional(),
  summonerName: z.string().optional(),
  champLevel: z.number().optional(),
  goldEarned: z.number().optional(),
  totalDamageTaken: z.number().optional(),
  wardsPlaced: z.number().optional(),
  wardsKilled: z.number().optional(),
  // Team Leaderboards (kept from the same match the sync already fetches; never a new request).
  // Tolerant: an unexpected value is dropped, so these extras can never fail a match's parse.
  doubleKills: extraNumber,
  tripleKills: extraNumber,
  quadraKills: extraNumber,
  pentaKills: extraNumber,
  largestMultiKill: extraNumber,
  largestKillingSpree: extraNumber,
  firstBloodKill: z.boolean().optional().catch(undefined),
  firstBloodAssist: z.boolean().optional().catch(undefined),
  visionWardsBoughtInGame: extraNumber,
  damageDealtToObjectives: extraNumber,
  damageDealtToBuildings: extraNumber,
  turretTakedowns: extraNumber,
  timeCCingOthers: extraNumber,
  // Figures that serve supports and tanks, from the same match (kept from 20 Nov 2026 on).
  totalTimeSpentDead: extraNumber,
  totalHealsOnTeammates: extraNumber,
  totalDamageShieldedOnTeammates: extraNumber,
  damageSelfMitigated: extraNumber,
  /** Riot's derived per-game figures; only the ones UNIIVERSE uses are read (the rest are dropped). */
  challenges: challengesSchema.optional().catch(undefined),
  item0: z.number().optional(),
  item1: z.number().optional(),
  item2: z.number().optional(),
  item3: z.number().optional(),
  item4: z.number().optional(),
  item5: z.number().optional(),
  item6: z.number().optional(),
  summoner1Id: z.number().optional(),
  summoner2Id: z.number().optional(),
  perks: z
    .object({
      /** The three stat shards (Riot's PerkStatsDto); tolerant, so a page without them still reads. */
      statPerks: z.object({ offense: z.number(), flex: z.number(), defense: z.number() }).optional().catch(undefined),
      styles: z.array(z.object({ description: z.string().optional(), style: z.number(), selections: z.array(z.object({ perk: z.number() })).default([]) })).default([]),
    })
    .optional(),
});

export const matchSchema = z.object({
  metadata: z.object({ matchId: z.string().min(1) }),
  info: z.object({
    gameCreation: z.number(),
    gameDuration: z.number(),
    gameVersion: z.string().min(1),
    queueId: z.number(),
    endOfGameResult: z.string().optional(),
    teams: z
      .array(
        z.object({
          teamId: z.number(),
          win: z.boolean(),
          bans: z.array(z.object({ championId: z.number(), pickTurn: z.number() })).default([]),
          objectives: z.record(z.string(), z.object({ first: z.boolean().optional(), kills: z.number().optional() })).optional(),
        }),
      )
      .default([]),
    participants: z.array(matchParticipantSchema),
  }),
});

/**
 * A match timeline (match-v5 /timeline): only the participant order and the events UNIIVERSE reads
 * (item purchases, their undos, sales and items used up; skill and champion level-ups; champion
 * kills; epic monsters, towers, turret plates and inhibitors taken). Riot's minute-by-minute frames
 * carry far more; only each player's gold, experience, CS, place on the map, ability haste and
 * level are read, and the rest is ignored and never stored. The fields read from 20 Nov 2026 on
 * are tolerant: an unexpected value reads as absent, so it can never fail a timeline.
 */
export const matchTimelineSchema = z.object({
  metadata: z.object({ matchId: z.string().min(1), participants: z.array(z.string()).default([]) }),
  info: z.object({
    participants: z.array(z.object({ participantId: z.number(), puuid: z.string() })).default([]),
    frames: z
      .array(
        z.object({
          /** Milliseconds into the game (about every 60 s, not exactly). */
          timestamp: z.number().optional(),
          /** Keyed by participant id ("1".."10"); figures are totals at the frame's timestamp. */
          participantFrames: z
            .record(
              z.string(),
              z.object({
                totalGold: z.number().optional(),
                xp: z.number().optional(),
                minionsKilled: z.number().optional(),
                jungleMinionsKilled: z.number().optional(),
                /** The champion's level at the frame. */
                level: extraNumber,
                /** Where the champion stood at the frame, in map units (Riot's PositionDto). */
                position: z.object({ x: z.number(), y: z.number() }).optional().catch(undefined),
                /** Riot's ChampionStatsDto: only the ability haste is read. */
                championStats: z.object({ abilityHaste: extraNumber }).optional().catch(undefined),
              }),
            )
            .optional(),
          events: z
            .array(
              z.object({
                type: z.string(),
                timestamp: z.number(),
                participantId: z.number().optional(),
                itemId: z.number().optional(),
                beforeId: z.number().optional(),
                afterId: z.number().optional(),
                skillSlot: z.number().optional(),
                levelUpType: z.string().optional(),
                /** LEVEL_UP: the champion level reached. */
                level: extraNumber,
                /** CHAMPION_KILL, ELITE_MONSTER_KILL, BUILDING_KILL: 0 when no player made it (an execution). */
                killerId: z.number().optional(),
                /** CHAMPION_KILL */
                victimId: z.number().optional(),
                assistingParticipantIds: z.array(z.number()).optional(),
                /** ELITE_MONSTER_KILL: DRAGON, BARON_NASHOR, RIFTHERALD, HORDE (voidgrubs), ATAKHAN. */
                monsterType: z.string().optional(),
                /** ELITE_MONSTER_KILL on a dragon: FIRE_DRAGON, …, ELDER_DRAGON. */
                monsterSubType: z.string().optional(),
                killerTeamId: z.number().optional(),
                /**
                 * BUILDING_KILL: TOWER_BUILDING or INHIBITOR_BUILDING, its lane and tier; teamId is the side that lost it.
                 * TURRET_PLATE_DESTROYED: the plate's lane, and teamId the side that lost it, likewise.
                 */
                buildingType: z.string().optional(),
                laneType: z.string().optional(),
                towerType: z.string().optional(),
                teamId: z.number().optional(),
              }),
            )
            .default([]),
        }),
      )
      .default([]),
  }),
});

export type RiotMatchTimeline = z.infer<typeof matchTimelineSchema>;
export type RiotMatch = z.infer<typeof matchSchema>;
export type RiotParticipant = z.infer<typeof matchParticipantSchema>;

export const accountSchema = z.object({ puuid: z.string().min(1), gameName: z.string().optional(), tagLine: z.string().optional() });

export const championMasterySchema = z.array(
  z.object({
    championId: z.number(),
    championLevel: z.number().default(0),
    championPoints: z.number().default(0),
    lastPlayTime: z.number().optional(),
  }),
);

export const leagueEntriesSchema = z.array(
  z.object({
    queueType: z.string(),
    tier: z.string().optional(),
    rank: z.string().optional(),
    leaguePoints: z.number().default(0),
    wins: z.number().default(0),
    losses: z.number().default(0),
  }),
);

export type RiotAccount = z.infer<typeof accountSchema>;
export type ChampionMastery = z.infer<typeof championMasterySchema>[number];
export type LeagueEntry = z.infer<typeof leagueEntriesSchema>[number];

/** account-v1 "active region" (also called active shard) answer: the platform the account plays LoL on. */
export const activeRegionSchema = z.object({ puuid: z.string().min(1), game: z.string().optional(), region: z.string().optional() });
