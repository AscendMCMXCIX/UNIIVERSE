import { inArray } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { playerTags } from "@/server/db/schema";
import { legalRolesFor, poolFor } from "@/domain/roster";
import { getChampionProfile } from "@/domain/champion-model";
import { strengthTags, tagInputsHash, type PlayerTag, type TagChampion, type TagInput } from "@/domain/player-tags";
import type { PlayerOverviewData } from "@/server/players/overview";
import type { PlayerRecord } from "@/server/repositories/team";
import type { ProficiencyLookup } from "@/domain/proficiency";

/** What a player's tags are built from: their pools, proficiency and this season's pool figures. */
export function tagInputFor(player: PlayerRecord, overview: PlayerOverviewData | null, lookup: ProficiencyLookup, champions: Map<string, { name: string; tags: string[] }>, previous: string[]): TagInput {
  const seen = new Set<string>();
  const list: TagChampion[] = [];
  for (const role of legalRolesFor(player)) {
    for (const championId of poolFor(player, role)) {
      if (seen.has(championId)) continue;
      seen.add(championId);
      const est = lookup(player.id, championId, role);
      const info = champions.get(championId);
      list.push({ championId, name: info?.name ?? championId, role, classes: info?.tags ?? [], traits: getChampionProfile(championId).traits, tier: est?.tier ?? "unknown", games: est?.games ?? 0 });
    }
  }
  const p = overview?.pool;
  return {
    primaryRole: player.primaryRole,
    roles: legalRolesFor(player),
    champions: list,
    performance: p ? { games: p.record.games, winRate: p.record.winRate, detailedGames: p.performance.detailedGames, kdaRatio: p.performance.kdaRatio, csPerMinute: p.performance.csPerMinute, csGames: p.performance.csGames, visionPerGame: p.performance.visionPerGame, visionGames: p.performance.visionGames } : null,
    previous,
  };
}

/**
 * Strength tags for the given players, cached in player_tags: recomputed only when the evidence
 * fingerprint changes (new Riot data, proficiency, pools, roles or a new season move it), so the
 * labels are stable and never rebuilt for nothing. Inputs come from data the caller already has.
 */
export async function strengthTagsFor(db: Db, inputs: Array<{ playerId: string; build: (previous: string[]) => TagInput }>): Promise<Map<string, PlayerTag[]>> {
  const out = new Map<string, PlayerTag[]>();
  if (inputs.length === 0) return out;
  const cached = await db.select().from(playerTags).where(inArray(playerTags.playerId, inputs.map((i) => i.playerId)));
  const byPlayer = new Map(cached.map((c) => [c.playerId, c]));
  for (const { playerId, build } of inputs) {
    const prev = byPlayer.get(playerId);
    const input = build(prev?.tags.map((t) => t.key) ?? []);
    const hash = tagInputsHash(input);
    if (prev && prev.inputsHash === hash) {
      out.set(playerId, prev.tags as PlayerTag[]);
      continue;
    }
    const tags = strengthTags(input);
    out.set(playerId, tags);
    await db
      .insert(playerTags)
      .values({ playerId, tags, inputsHash: hash, computedAt: new Date() })
      .onConflictDoUpdate({ target: playerTags.playerId, set: { tags, inputsHash: hash, computedAt: new Date() } })
      .catch(() => undefined);
  }
  return out;
}
