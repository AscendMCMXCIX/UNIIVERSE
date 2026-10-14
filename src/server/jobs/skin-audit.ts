import { sql } from "drizzle-orm";
import { defineJob } from "./registry";

type Row = Record<string, unknown>;
const rows = (result: unknown): Row[] => ((result as { rows?: Row[] }).rows ?? (result as Row[])) as Row[];
const BASE = (process.env.DDRAGON_BASE_URL ?? "https://ddragon.leagueoflegends.com").replace(/\/$/, "");

/**
 * Read-only check of the champion skin (splash art) data behind the card artwork selector: what is
 * stored, what Data Dragon currently lists for a few champions (with every field it sends), and
 * whether each listed splash image exists and how many distinct images there are (by size and
 * ETag). Changes nothing.
 */
defineJob({
  key: "skin-audit",
  description: "Read-only check of stored champion skins against Data Dragon: duplicates, chroma entries, splash images that do not exist. Changes nothing.",
  defaultIntervalMinutes: null,
  allowConcurrent: true,
  run: async (ctx) => {
    const db = ctx.db;
    const [totals] = rows(await db.execute(sql`SELECT count(*)::int AS skins, count(*) FILTER (WHERE is_active)::int AS active, count(DISTINCT champion_id)::int AS champions, count(DISTINCT (champion_id, lower(name)))::int AS distinct_names FROM champion_skins`));
    // The cleanup's state: chroma entries, splash checks, and what the player cards point at.
    const [cleanup] = rows(
      await db.execute(sql`SELECT
        count(*) FILTER (WHERE kind = 'chroma')::int AS chromas,
        count(*) FILTER (WHERE kind = 'skin')::int AS skins,
        count(*) FILTER (WHERE kind = 'unknown')::int AS unclassified,
        count(*) FILTER (WHERE splash_status = 'ok')::int AS splash_ok,
        count(*) FILTER (WHERE splash_status = 'missing')::int AS splash_missing,
        count(*) FILTER (WHERE splash_status = 'unknown' AND kind <> 'chroma')::int AS splash_unchecked,
        count(*) - count(DISTINCT (champion_id, splash_signature)) FILTER (WHERE splash_signature IS NOT NULL) - count(*) FILTER (WHERE splash_signature IS NULL) AS duplicate_pictures
        FROM champion_skins WHERE is_active`),
    );
    const [cards] = rows(
      await db.execute(sql`SELECT
        count(*) FILTER (WHERE p.featured_champion_id IS NOT NULL)::int AS featured,
        count(*) FILTER (WHERE s.kind = 'chroma')::int AS on_chroma,
        count(*) FILTER (WHERE s.splash_status = 'missing')::int AS on_missing_art
        FROM players p LEFT JOIN champion_skins s ON s.champion_id = p.featured_champion_id AND s.num = p.featured_skin_num`),
    );
    const top = rows(await db.execute(sql`SELECT champion_id, count(*)::int AS n, count(DISTINCT lower(name))::int AS names FROM champion_skins GROUP BY champion_id ORDER BY n DESC LIMIT 5`));
    const sampleChampions = [...new Set([String(top[0]?.champion_id ?? "Ahri"), "Ahri", "Lux"])].slice(0, 3);
    const versions = (await (await fetch(`${BASE}/api/versions.json`)).json()) as string[];
    const version = versions[0]!;
    const live: Record<string, unknown> = {};
    for (const championId of sampleChampions) {
      const stored = rows(await db.execute(sql`SELECT num, skin_id, name, is_active FROM champion_skins WHERE champion_id = ${championId} ORDER BY num`));
      const detail = (await (await fetch(`${BASE}/cdn/${version}/data/en_US/champion/${championId}.json`)).json()) as { data: Record<string, { skins: Array<Record<string, unknown>> }> };
      const skins = detail.data[championId]?.skins ?? [];
      const fieldSet = [...new Set(skins.flatMap((s) => Object.keys(s)))];
      const images = await Promise.all(
        skins.map(async (s) => {
          try {
            const res = await fetch(`${BASE}/cdn/img/champion/splash/${championId}_${s.num}.jpg`, { method: "HEAD" });
            return { num: s.num, status: res.status, bytes: res.headers.get("content-length"), etag: res.headers.get("etag") };
          } catch (err) {
            return { num: s.num, status: 0, error: (err as Error).message };
          }
        }),
      );
      const ok = images.filter((i) => i.status === 200);
      const distinctImages = new Set(ok.map((i) => `${(i as { etag?: string | null }).etag ?? ""}|${(i as { bytes?: string | null }).bytes ?? ""}`)).size;
      live[championId] = {
        stored: stored.length,
        storedSample: stored.slice(0, 60).map((r) => `${r.num}:${r.name}${r.is_active ? "" : " (inactive)"}`),
        listed: skins.length,
        fields: fieldSet,
        listedSample: skins.slice(0, 60).map((s) => ({ num: s.num, id: s.id, name: s.name, chromas: s.chromas, parentSkin: s.parentSkin })),
        images: { ok: ok.length, missing: images.filter((i) => i.status !== 200).map((i) => `${i.num}:${i.status}`), distinctImages },
        duplicateImageGroups: Object.values(
          ok.reduce<Record<string, number[]>>((acc, i) => {
            const k = `${(i as { etag?: string | null }).etag ?? ""}|${(i as { bytes?: string | null }).bytes ?? ""}`;
            (acc[k] ??= []).push(i.num as number);
            return acc;
          }, {}),
        ).filter((g) => g.length > 1),
      };
    }
    return { ok: true, summary: { version, totals, cleanup, cards, top, live } };
  },
});
