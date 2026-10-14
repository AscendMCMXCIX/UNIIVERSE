import { inArray } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { playerTags } from "@/server/db/schema";
import { poolFor } from "@/domain/roster";
import type { Role } from "@/domain/roles";
import { getChampionProfile } from "@/domain/champion-model";
import { tagInputsHash, teamStrengthTags, type PlayerTag, type TagChampion, type TagInput } from "@/domain/player-tags";
import type { PlayerOverviewData } from "@/server/players/overview";
import type { PlayerRecord } from "@/server/repositories/team";
import type { ProficiencyLookup } from "@/domain/proficiency";

/**
 * What a player's tags are built from, for the role they hold in the lineup: their pool for that
 * role with role-specific proficiency, and this season's games in that role (`overview` must be
 * filtered to the role).
 */
export function tagInputFor(player: PlayerRecord, role: Role, overview: PlayerOverviewData | null, lookup: ProficiencyLookup, champions: Map<string, { name: string; tags: string[] }>, previous: string[]): TagInput {
  const list: TagChampion[] = poolFor(player, role).map((championId) => {
    const est = lookup(player.id, championId, role);
    const info = champions.get(championId);
    // Games whose position Riot did not record are shared out like the known ones.
    const roleGames = est ? Math.max(est.roleGames, Math.round(est.games * est.roleShare)) : 0;
    return { championId, name: info?.name ?? championId, classes: info?.tags ?? [], traits: getChampionProfile(championId).traits, tier: est?.tier ?? "unknown", roleGames, games: est?.games ?? 0 };
  });
  const s = overview?.summary;
  return {
    role,
    primaryRole: player.primaryRole,
    champions: list,
    performance: s ? { games: s.record.games, winRate: s.record.winRate, detailedGames: s.performance.detailedGames, kdaRatio: s.performance.kdaRatio, csPerMinute: s.performance.csPerMinute, csGames: s.performance.csMinuteGames, visionPerGame: s.performance.visionPerGame, visionGames: s.performance.visionGames } : null,
    previous,
  };
}

/**
 * Strength tags for the lineup, chosen together (so teammates are told apart) and cached in
 * player_tags. A player's stored fingerprint covers their own evidence and the lineup's, so tags
 * are recomputed only when new Riot data, proficiency, pools, roles, a new season or a lineup
 * change moves it; otherwise the stored tags are served unchanged (stable, and no work).
 */
export async function strengthTagsFor(db: Db, inputs: Array<{ playerId: string; build: (previous: string[]) => TagInput }>): Promise<Map<string, PlayerTag[]>> {
  const out = new Map<string, PlayerTag[]>();
  if (inputs.length === 0) return out;
  const cached = await db.select().from(playerTags).where(inArray(playerTags.playerId, inputs.map((i) => i.playerId)));
  const byPlayer = new Map(cached.map((c) => [c.playerId, c]));
  const built = inputs.map(({ playerId, build }) => ({ playerId, input: build(byPlayer.get(playerId)?.tags.map((t) => t.key) ?? []) }));
  const own = built.map((b) => tagInputsHash(b.input));
  // The lineup's fingerprint: every player's evidence (in any order) and who is in it.
  let h = 2166136261;
  for (const ch of built.map((b, i) => `${b.playerId}:${own[i]}`).sort().join("|")) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const team = h.toString(36);
  const hashes = own.map((h) => `${h}.${team}`);
  if (built.every((b, i) => byPlayer.get(b.playerId)?.inputsHash === hashes[i])) {
    for (const b of built) out.set(b.playerId, byPlayer.get(b.playerId)!.tags as PlayerTag[]);
    return out;
  }
  const tags = teamStrengthTags(built.map((b) => b.input));
  const now = new Date();
  await Promise.all(
    built.map(async (b, i) => {
      out.set(b.playerId, tags[i]!);
      await db
        .insert(playerTags)
        .values({ playerId: b.playerId, tags: tags[i]!, inputsHash: hashes[i]!, computedAt: now })
        .onConflictDoUpdate({ target: playerTags.playerId, set: { tags: tags[i]!, inputsHash: hashes[i]!, computedAt: now } })
        .catch(() => undefined);
    }),
  );
  return out;
}
