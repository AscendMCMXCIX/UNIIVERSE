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
        }),
      )
      .default([]),
    participants: z.array(matchParticipantSchema),
  }),
});

export type LeagueList = z.infer<typeof leagueListSchema>;
export type RiotMatch = z.infer<typeof matchSchema>;
export type RiotParticipant = z.infer<typeof matchParticipantSchema>;
