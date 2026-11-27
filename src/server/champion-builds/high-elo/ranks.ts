import { sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import type { SkillRanks } from "@/domain/champion-builds";
import { skillRanksOf } from "@/server/champion-builds/load";

/*
  The ability ranks the sampler's skill orders need: each champion's Q, W, E and R maxrank, read
  from the stored abilities (app_settings "champion_abilities", server/riot/static/abilities.ts)
  inside the database, so only about 40 bytes a champion leave it where its whole record (names,
  descriptions, cooldowns, costs, ranges, tips: about 3 KB) did: about 7 KB a slice for the roster
  instead of about 0.6 MB (docs/HIGH_ELO_EVIDENCE.md, "Budgets"). The page's own rule turns them
  into a skill order's ranks (skillRanksOf); tests/db/high-elo.test.ts holds them equal to what
  loadChampionAbilities gives over the committed copy.
*/

const rowsOf = <T,>(result: unknown): T[] => ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];
const parsed = (value: unknown): unknown => (typeof value === "string" ? JSON.parse(value) : value);

/** Every stored champion's Q, W, E and R ranks (its skill order's), by champion id; a champion missing one is left out. */
export async function abilityRanks(db: Db): Promise<Map<string, SkillRanks>> {
  const [row] = rowsOf<{ ranks: unknown }>(
    await db.execute(sql`
      SELECT coalesce(jsonb_object_agg(c.id, r.ranks) FILTER (WHERE r.ranks IS NOT NULL), '{}'::jsonb) AS ranks
        FROM app_settings s
       CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(s.value->'champions') = 'object' THEN s.value->'champions' ELSE '{}'::jsonb END) AS c(id, record)
       CROSS JOIN LATERAL (
         SELECT jsonb_object_agg(a->>'slot', a->'maxRank') AS ranks
           FROM jsonb_array_elements(CASE WHEN jsonb_typeof(c.record->'abilities') = 'array' THEN c.record->'abilities' ELSE '[]'::jsonb END) AS a
          WHERE a->>'slot' IN ('Q', 'W', 'E', 'R')
       ) AS r
       WHERE s.key = 'champion_abilities'`),
  );
  const found = (parsed(row?.ranks) ?? {}) as Record<string, Record<string, unknown>>;
  const out = new Map<string, SkillRanks>();
  for (const [id, slots] of Object.entries(found)) {
    const of = (slot: "Q" | "W" | "E" | "R") => {
      const v = slots?.[slot];
      return typeof v === "number" && Number.isInteger(v) && v >= 1 ? v : 0;
    };
    const ranks = skillRanksOf((["Q", "W", "E", "R"] as const).map((slot) => ({ slot, ranks: of(slot) })));
    if (ranks) out.set(id, ranks);
  }
  return out;
}
