import { createHash } from "node:crypto";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { patchFromVersion, patchSortKey } from "@/domain/patch";
import type { Db } from "@/server/db/types";
import { championChangePoints, champions, patches } from "@/server/db/schema";
import type { DdragonChampion, StaticDataProvider } from "./provider";
import { FIXTURE_VERSION } from "./fixture";

export interface StaticSyncOptions {
  /** Re-sync even when the stored version already matches the latest. */
  force?: boolean;
  /** Fallback used only when the database has never been populated and the provider fails. */
  fixture?: StaticDataProvider;
  /** Fetch per-champion detail to fingerprint kits for rework detection (default true). */
  fingerprint?: boolean;
  concurrency?: number;
  now?: () => Date;
  log?: (message: string) => void;
}

export interface StaticSyncResult {
  ok: boolean;
  degraded: boolean;
  usedFixture: boolean;
  version: string | null;
  patch: string | null;
  newPatch: boolean;
  changed: boolean;
  championsUpserted: number;
  newChampions: string[];
  suspectedReworks: string[];
  error?: string;
}

/**
 * Synchronises patches and champions from the static data provider.
 *
 * Guarantees:
 *   - Never deletes or overwrites good data when the provider fails (last-known-good wins).
 *   - New champions are inserted automatically with the version they first appeared in.
 *   - Patch history is preserved; only `isCurrent` moves.
 *   - Suspected reworks (kit fingerprint change) create unconfirmed change points.
 */
export async function syncStaticData(db: Db, provider: StaticDataProvider, options: StaticSyncOptions = {}): Promise<StaticSyncResult> {
  const log = options.log ?? (() => {});
  const existingCount = await countChampions(db);
  const base: StaticSyncResult = {
    ok: false,
    degraded: false,
    usedFixture: false,
    version: null,
    patch: null,
    newPatch: false,
    changed: false,
    championsUpserted: 0,
    newChampions: [],
    suspectedReworks: [],
  };

  let versions: string[];
  try {
    versions = await provider.fetchVersions();
  } catch (err) {
    const message = (err as Error).message;
    if (existingCount === 0 && options.fixture) {
      log(`Static provider unavailable (${message}); seeding from offline fixture.`);
      const fixtureResult = await syncStaticData(db, options.fixture, { ...options, fixture: undefined, fingerprint: false });
      return { ...fixtureResult, usedFixture: true, degraded: true, error: `Provider unavailable: ${message}. Using offline fixture until the next successful sync.` };
    }
    return { ...base, ok: existingCount > 0, degraded: true, error: `Provider unavailable: ${message}. Existing data preserved.` };
  }

  const latest = versions[0];
  if (!latest) return { ...base, ok: existingCount > 0, degraded: true, error: "Provider returned no versions. Existing data preserved." };
  const patch = latest === FIXTURE_VERSION ? "0.0" : patchFromVersion(latest);
  if (!patch) return { ...base, ok: existingCount > 0, degraded: true, error: `Unrecognised version "${latest}". Existing data preserved.` };

  const current = await getCurrentPatchRow(db);
  const fixtureOnly = current?.ddragonVersion === FIXTURE_VERSION && latest !== FIXTURE_VERSION;
  const versionChanged = current?.ddragonVersion !== latest;
  if (!versionChanged && !options.force && existingCount > 0) {
    return { ...base, ok: true, version: latest, patch, changed: false };
  }

  let list: { version: string; champions: DdragonChampion[] };
  try {
    list = await provider.fetchChampionList(latest);
  } catch (err) {
    const message = (err as Error).message;
    if (existingCount === 0 && options.fixture) {
      const fixtureResult = await syncStaticData(db, options.fixture, { ...options, fixture: undefined, fingerprint: false });
      return { ...fixtureResult, usedFixture: true, degraded: true, error: `Champion list unavailable: ${message}. Using offline fixture.` };
    }
    return { ...base, ok: existingCount > 0, degraded: true, version: latest, patch, error: `Champion list unavailable: ${message}. Existing data preserved.` };
  }
  if (list.champions.length === 0) {
    return { ...base, ok: existingCount > 0, degraded: true, version: latest, patch, error: "Champion list was empty; refusing to wipe existing champions." };
  }

  const existing = await db.select().from(champions);
  const existingById = new Map(existing.map((c) => [c.id, c] as const));
  const now = (options.now ?? (() => new Date()))();
  const newChampions: string[] = [];
  const suspectedReworks: string[] = [];
  const source = provider.name === "fixture" ? "fixture" : "ddragon";

  // Optional kit fingerprints for rework detection (only when the version changed).
  const fingerprints = new Map<string, string>();
  if (options.fingerprint !== false && provider.fetchChampionDetail && latest !== FIXTURE_VERSION) {
    const ids = list.champions.map((c) => c.id);
    await mapWithConcurrency(ids, options.concurrency ?? 6, async (id) => {
      try {
        const detail = await provider.fetchChampionDetail!(latest, id);
        if (detail) fingerprints.set(id, fingerprintOf(detail));
      } catch (err) {
        log(`Fingerprint fetch failed for ${id}: ${(err as Error).message}`);
      }
    });
  }

  await db.transaction(async (tx) => {
    for (const c of list.champions) {
      const key = Number(c.key);
      const prev = existingById.get(c.id);
      const fingerprint = fingerprints.get(c.id) ?? prev?.fingerprint ?? "";
      const values = {
        id: c.id,
        key,
        name: c.name,
        title: c.title,
        tags: c.tags,
        attackRange: Math.round(c.stats.attackrange ?? prev?.attackRange ?? 125),
        info: c.info,
        partype: c.partype,
        imageFull: c.image.full,
        lastSeenVersion: latest,
        fingerprint,
        source,
        isActive: true,
        updatedAt: now,
      };
      if (!prev) {
        await tx.insert(champions).values({ ...values, firstSeenVersion: latest, createdAt: now });
        newChampions.push(c.id);
      } else {
        await tx
          .update(champions)
          .set({ ...values, firstSeenVersion: prev.source === "fixture" && source !== "fixture" ? latest : prev.firstSeenVersion })
          .where(eq(champions.id, c.id));
        const prevFp = prev.fingerprint;
        const nextFp = fingerprints.get(c.id);
        if (prevFp && nextFp && prevFp !== nextFp && looksLikeRework(prevFp, nextFp)) {
          suspectedReworks.push(c.id);
          const already = await tx
            .select({ id: championChangePoints.id })
            .from(championChangePoints)
            .where(and(eq(championChangePoints.championId, c.id), eq(championChangePoints.patch, patch)));
          if (already.length === 0) {
            await tx.insert(championChangePoints).values({
              championId: c.id,
              patch,
              discount: 0.25,
              reason: "Kit fingerprint changed between versions (auto-detected). Confirm or dismiss in Settings.",
              source: "auto",
              confirmed: false,
            });
          }
        }
      }
    }

    // Champions that vanished from the list are deactivated, never deleted (pools may reference them).
    const seen = list.champions.map((c) => c.id);
    if (seen.length > 0) {
      await tx.update(champions).set({ isActive: false, updatedAt: now }).where(sql`${champions.id} NOT IN ${seen}`);
    }

    // Patch bookkeeping: insert if new, then move the "current" flag.
    const [existingPatch] = await tx.select().from(patches).where(eq(patches.id, patch));
    if (!existingPatch) {
      await tx.insert(patches).values({ id: patch, ddragonVersion: latest, isCurrent: false, sortKey: patchSortKey(patch), firstSeenAt: now });
    } else if (existingPatch.ddragonVersion !== latest) {
      await tx.update(patches).set({ ddragonVersion: latest }).where(eq(patches.id, patch));
    }
    await tx.update(patches).set({ isCurrent: false }).where(ne(patches.id, patch));
    await tx.update(patches).set({ isCurrent: true }).where(eq(patches.id, patch));
    if (fixtureOnly) {
      // The placeholder fixture patch is no longer meaningful once real data arrives.
      await tx.delete(patches).where(inArray(patches.id, ["0.0"]));
    }
  });

  return {
    ok: true,
    degraded: false,
    usedFixture: provider.name === "fixture",
    version: latest,
    patch,
    newPatch: !current || current.id !== patch,
    changed: true,
    championsUpserted: list.champions.length,
    newChampions,
    suspectedReworks,
  };
}

async function countChampions(db: Db): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(champions);
  return Number(row?.n ?? 0);
}

export async function getCurrentPatchRow(db: Db) {
  const [row] = await db.select().from(patches).where(eq(patches.isCurrent, true)).limit(1);
  return row ?? null;
}

/** Kit-identifying fingerprint: passive + spell names + a few base stats. */
export function fingerprintOf(detail: { passive?: { name: string }; spells: Array<{ id: string; name: string }>; stats: Record<string, number> }): string {
  const payload = {
    passive: detail.passive?.name ?? "",
    spells: detail.spells.map((s) => `${s.id}:${s.name}`),
    stats: {
      hp: detail.stats.hp,
      attackrange: detail.stats.attackrange,
      movespeed: detail.stats.movespeed,
      attackdamage: detail.stats.attackdamage,
    },
  };
  return `v1:${createHash("sha256").update(JSON.stringify(payload)).digest("hex")}:${payload.passive}|${payload.spells.join(",")}`;
}

/**
 * A fingerprint change is treated as a rework when the passive or at least two spell names
 * changed. Base-stat tweaks alone are ordinary balance changes and do not qualify.
 */
export function looksLikeRework(prev: string, next: string): boolean {
  const parse = (fp: string) => {
    const idx = fp.indexOf(":", 3);
    const tail = idx === -1 ? "" : fp.slice(idx + 1);
    const [passive = "", spells = ""] = tail.split("|");
    return { passive, spells: new Set(spells.split(",").filter(Boolean)) };
  };
  const a = parse(prev);
  const b = parse(next);
  if (a.passive !== b.passive && a.passive && b.passive) return true;
  let changed = 0;
  for (const s of b.spells) if (!a.spells.has(s)) changed += 1;
  return changed >= 2;
}

async function mapWithConcurrency<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
  let index = 0;
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (index < items.length) {
      const item = items[index++]!;
      await fn(item);
    }
  });
  await Promise.all(workers);
}
