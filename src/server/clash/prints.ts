import type { Db } from "@/server/db/types";
import { listChampions, getCurrentPatch } from "@/server/repositories/champions";
import { cachedFor } from "@/server/observability/cache";
import { decodePng } from "@/server/images/png";
import { encodePrints, printOf, PRINT_FORMAT, REFERENCE_CROP, type ChampionPrints, type EncodedPrints } from "@/domain/clash-scout/champion-print";

/*
  The champion prints Clash Scout matches portraits against (domain/clash-scout/champion-print.ts),
  built here once per Data Dragon version and print format from the same square portraits the app shows: about
  170 small images fetched from Riot's CDN, reduced to ~0.6 KB each. The result (~100 KB) is kept
  per instance for a day and sent with a year-long browser cache under its version, so each member's
  browser downloads it once per patch. No database row and no image are stored. Without a real
  Data Dragon version (the offline fixture) there are no prints, and champions are chosen by hand.
*/

export type { EncodedPrints };

export async function buildChampionPrints(champions: Array<{ id: string; portraitUrl: string }>, version: string, fetchImpl: typeof fetch = fetch): Promise<ChampionPrints> {
  const ids: string[] = [];
  const prints: Float32Array[] = [];
  const list = champions.filter((c) => c.portraitUrl);
  // A few at a time: polite to the CDN, quick enough (a cold build takes a few seconds).
  for (let i = 0; i < list.length; i += 12) {
    const batch = await Promise.all(
      list.slice(i, i + 12).map(async (c) => {
        try {
          const res = await fetchImpl(c.portraitUrl, { signal: AbortSignal.timeout(8_000) });
          if (!res.ok) return null;
          const image = decodePng(new Uint8Array(await res.arrayBuffer()));
          return image ? { id: c.id, print: printOf(image, undefined, REFERENCE_CROP) } : null;
        } catch {
          return null;
        }
      }),
    );
    for (const b of batch) {
      if (!b) continue;
      ids.push(b.id);
      prints.push(b.print);
    }
  }
  return { version, ids, prints };
}

/**
 * The current version's prints in the current format, or null when there is no real Data Dragon
 * version, or `version` or `format` is not the current one.
 */
export async function currentChampionPrints(db: Db, version: string, format: number = PRINT_FORMAT): Promise<EncodedPrints | null> {
  if (format !== PRINT_FORMAT) return null;
  const current = await getCurrentPatch(db);
  if (!current || current.isFixture || current.ddragonVersion !== version) return null;
  return cachedFor(`clash-prints:${version}:${PRINT_FORMAT}`, 24 * 3_600_000, async () => encodePrints(await buildChampionPrints(await listChampions(db), version)));
}
