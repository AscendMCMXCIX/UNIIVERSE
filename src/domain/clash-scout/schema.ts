import { z } from "zod";
import { SCOUT_SLOTS, type ScoutContent } from "./types";

/*
  The one gate for scout data arriving from a browser: lengths, numbers and counts are bounded, so
  a saved scout stays small (a few kilobytes) whatever a client sends. Verification is not trusted
  from here: the server re-checks each "verified" player's proof before keeping it (see
  server/clash/proof.ts).
*/

const certainty = z.enum(["high", "low", "manual"]);
const text = (max: number) => z.string().trim().max(max);
const count = z.number().int().min(0).max(100_000).nullable();
const nameReads = (max: number) => {
  const read = z.object({ text: text(max), confidence: z.number().min(0).max(100) });
  return z.object({ ranked: read.optional(), mastery: read.optional() }).optional();
};

const player = z.object({
  slot: z.number().int().min(0).max(SCOUT_SLOTS - 1),
  name: text(48),
  nameCertainty: certainty,
  nameReads: nameReads(48),
  rank: z
    .object({ tier: z.enum(["UNRANKED", "IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER"]), division: z.enum(["I", "II", "III", "IV"]).nullable(), lp: z.number().int().min(0).max(5000).nullable() })
    .nullable(),
  rankCertainty: certainty.optional(),
  totalMastery: z.number().int().min(0).max(100_000).nullable().optional(),
  ranked: z.array(z.object({ championId: text(40).nullable(), championCertainty: certainty.optional(), games: count, winRate: z.number().min(0).max(100).nullable(), kda: z.number().min(0).max(99).nullable(), certainty })).max(10),
  mastery: z.array(z.object({ championId: text(40).nullable(), championCertainty: certainty.optional(), level: z.number().int().min(0).max(999).nullable(), points: z.number().int().min(0).max(100_000_000).nullable(), certainty })).max(10),
  verification: z.enum(["unverified", "verified"]),
  riotId: text(40).nullable(),
  puuid: text(100).nullable(),
  proof: z.string().max(200).nullable().optional(),
});

/** What a browser sends to look for potential matches: names and the evidence the screenshots show, bounded. */
export const candidateQuerySchema = z.object({
  platform: z.string().trim().toLowerCase().regex(/^[a-z]{2,4}\d?$/),
  players: z
    .array(
      z.object({
        slot: z.number().int().min(0).max(SCOUT_SLOTS - 1),
        name: text(48).min(1),
        evidence: z.object({
          rank: player.shape.rank,
          totalMastery: z.number().int().min(0).max(100_000).nullable(),
          ranked: z.array(z.object({ championId: text(40).nullable(), games: count })).max(10),
          mastery: z.array(z.object({ championId: text(40).nullable(), points: z.number().int().min(0).max(100_000_000).nullable(), level: z.number().int().min(0).max(999).nullable() })).max(10),
        }),
      }),
    )
    .max(SCOUT_SLOTS),
});

export const scoutContentSchema = z.object({
  opponentName: text(60),
  opponentCertainty: certainty,
  opponentReads: nameReads(60),
  platform: z.string().trim().toLowerCase().regex(/^[a-z]{2,4}\d?$/),
  tournament: z.object({ name: text(60).nullable(), day: text(30).nullable() }),
  players: z.array(player).length(SCOUT_SLOTS),
});

export function parseScoutContent(input: unknown): { ok: true; content: ScoutContent } | { ok: false; error: string } {
  const r = scoutContentSchema.safeParse(input);
  if (!r.success) return { ok: false, error: "This scout could not be read. Reload the page and try again." };
  const slots = new Set(r.data.players.map((p) => p.slot));
  if (slots.size !== SCOUT_SLOTS) return { ok: false, error: "This scout could not be read. Reload the page and try again." };
  return { ok: true, content: { ...r.data, players: [...r.data.players].sort((a, b) => a.slot - b.slot) } as ScoutContent };
}
