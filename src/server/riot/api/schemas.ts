import { z } from "zod";

/** Only the fields UNIIVERSE needs. Extra fields are ignored so minor upstream additions never break ingestion. */
export const leagueEntrySchema = z.object({
  summonerId: z.string().optional(),
  puuid: z.string().optional(),
  leaguePoints: z.number().default(0),
});

export const leagueListSchema = z.object({
  tier: z.string().optional(),
  entries: z.array(leagueEntrySchema),
});

/** Entries of a non-apex tier/division page; Riot returns the player's puuid directly. */
export const leaguePageSchema = z.array(
  z.object({
    puuid: z.string().optional(),
    summonerId: z.string().optional(),
    tier: z.string().optional(),
    rank: z.string().optional(),
    leaguePoints: z.number().default(0),
  }),
);
export type LeaguePageEntry = z.infer<typeof leaguePageSchema>[number];

export const platformStatusSchema = z.object({ id: z.string().min(1) });

export const summonerSchema = z.object({ puuid: z.string().min(1) });

export const matchIdsSchema = z.array(z.string().min(1));

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
  /** Optional in the schema so a field Riot drops never breaks ingestion; absent → not stored. */
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
 * (item purchases, their undos and skill level-ups). Riot's minute-by-minute frames carry far more;
 * the rest is ignored and never stored.
 */
export const matchTimelineSchema = z.object({
  metadata: z.object({ matchId: z.string().min(1), participants: z.array(z.string()).default([]) }),
  info: z.object({
    participants: z.array(z.object({ participantId: z.number(), puuid: z.string() })).default([]),
    frames: z
      .array(
        z.object({
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
              }),
            )
            .default([]),
        }),
      )
      .default([]),
  }),
});

export type LeagueList = z.infer<typeof leagueListSchema>;
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
