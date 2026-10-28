import { z } from "zod";

/** Only the fields UNIIVERSE needs. Extra fields are ignored so minor upstream additions never break a sync. */
export const platformStatusSchema = z.object({ id: z.string().min(1) });

export const summonerSchema = z.object({ puuid: z.string().min(1) });

export const matchIdsSchema = z.array(z.string().min(1));

/** An optional extra figure: anything but a number reads as absent. */
const extraNumber = z.number().optional().catch(undefined);

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
  /** Riot's derived per-game figures; only the ones UNIIVERSE uses are read (the rest are dropped). */
  challenges: z.object({ soloKills: extraNumber }).optional().catch(undefined),
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
 * (item purchases, their undos, skill level-ups and who died when). Riot's minute-by-minute frames carry far more;
 * the rest is ignored and never stored.
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
                /** CHAMPION_KILL: the participant who died. */
                victimId: z.number().optional(),
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
