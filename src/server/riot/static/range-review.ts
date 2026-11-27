import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { appSettings } from "@/server/db/schema";
import { compareDdragonVersions } from "@/domain/champion-lookup/cooldown";
import { rangeDisplay, type RangeReview, type SpellSlot } from "@/domain/champion-lookup/range";
import type { DdragonChampionAbilities } from "@/domain/champion-lookup/types";
import type { ChampionAbilitiesIndex } from "./abilities";
import { RANGE_TABLE_HASH, rangeReviewRows, rangeReviewsFor } from "./ability-ranges";

/*
  How the reviewed ability ranges stand against the abilities stored for the current game version
  (docs/CHAMPION_INTEL.md, "Ranges"; docs/DATA_PIPELINES.md, "Champion abilities"): how many ranges
  the page shows, how many are "Global", cast on the champion or not the reach, how many reviewed
  abilities Riot changed since their review (and how many of those were shown ranges, now hidden
  until reviewed again), and how many spells have no review yet. Counted
  by the version-check job once per game version (and again after a deploy that changes the table),
  stored in app_settings "ability_range_review" (a few hundred bytes), read by Admin's Data &
  Integrations. Counts and versions only: no champion is named in a job's output.
*/

const KEY = "ability_range_review";
const ABILITIES_KEY = "champion_abilities";

export interface RangeReviewCounts {
  /** The game version the version-check synced the abilities to when it counted (each champion's record may be older where it could not be read). */
  version: string | null;
  /** The committed table's hash when counted (RANGE_TABLE_HASH): a deploy that changes the table counts again. */
  tableHash: string;
  /** Rows in the committed table. */
  rows: number;
  /** The Data Dragon versions the table's rows were reviewed at, newest first. */
  reviewedVersions: string[];
  /** Spells counted (Q, W, E, R of every stored champion). */
  spells: number;
  /** Ranges the page shows as numbers. */
  shown: number;
  /** Shown as "Global". */
  global: number;
  /** Reviewed as cast on the champion: not shown (the owner's decision). */
  self: number;
  /** Reviewed as not the reach, or failing the rule's validation: not shown. */
  none: number;
  /** Reviewed rows Riot changed since (the spell id, its range or its text): each needs reviewing again, and the page shows nothing for it until then. */
  changedSinceReview: number;
  /** Of those, the rows reviewed as a reach or "Global": ranges the page showed and now hides until reviewed again (a changed self or none row showed nothing before either). */
  hiddenSinceReview: number;
  /** Spells with no row yet: nothing shown. */
  notReviewed: number;
  /** Spells stored before rules format 5 (no range yet): nothing shown until the next read. */
  noRangeYet: number;
  /** ISO time of the count. */
  at: string;
}

/** The counts for a set of stored records against the table's rows (by champion and slot). Pure. */
export function countRangeReviews(champions: Readonly<Record<string, DdragonChampionAbilities>>, version: string | null, reviewsFor: (championId: string) => Partial<Record<SpellSlot, RangeReview>> = rangeReviewsFor, now: Date = new Date()): RangeReviewCounts {
  const rows = rangeReviewRows();
  const counts: RangeReviewCounts = {
    version,
    tableHash: RANGE_TABLE_HASH,
    rows: rows.length,
    reviewedVersions: [...new Set(rows.map((r) => r.version))].sort((a, b) => compareDdragonVersions(b, a) ?? 0),
    spells: 0,
    shown: 0,
    global: 0,
    self: 0,
    none: 0,
    changedSinceReview: 0,
    hiddenSinceReview: 0,
    notReviewed: 0,
    noRangeYet: 0,
    at: now.toISOString(),
  };
  for (const [id, record] of Object.entries(champions)) {
    const reviews = reviewsFor(id);
    for (const a of record?.abilities ?? []) {
      if (a.slot === "P") continue;
      counts.spells += 1;
      if (!Array.isArray(a.range)) {
        counts.noRangeYet += 1;
        continue;
      }
      const review = reviews[a.slot];
      if (!review) {
        counts.notReviewed += 1;
        continue;
      }
      const display = rangeDisplay(a, review);
      if (!display) counts.none += 1;
      else if (display.kind === "reach") counts.shown += 1;
      else if (display.kind === "global") counts.global += 1;
      else if (display.kind === "self") counts.self += 1;
      else {
        counts.changedSinceReview += 1;
        if (display.reviewedKind === "reach" || display.reviewedKind === "global") counts.hiddenSinceReview += 1;
      }
    }
  }
  return counts;
}

/** The stored counts, or null when none are stored or they are not in this shape (counts stored before `hiddenSinceReview` read as none, so the next version-check counts again). */
export async function readRangeReviewCounts(db: Db): Promise<RangeReviewCounts | null> {
  const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, KEY));
  const v = row?.value as Partial<RangeReviewCounts> | undefined;
  return v && typeof v === "object" && typeof v.tableHash === "string" && typeof v.shown === "number" && typeof v.changedSinceReview === "number" && typeof v.hiddenSinceReview === "number" && typeof v.notReviewed === "number" ? (v as RangeReviewCounts) : null;
}

/**
 * Counts again when the stored abilities were written this run (`changed`), or the stored counts are
 * for another version or another table, or none are stored; otherwise nothing (one small read).
 * Reading the stored abilities costs what ensureStaticDigests does (the index, about 310 KB, once a
 * version). Returns the counts written, or null when nothing was counted.
 */
export async function ensureRangeReviewCounts(db: Db, version: string, options: { changed?: boolean; now?: () => Date; log?: (message: string) => void } = {}): Promise<RangeReviewCounts | null> {
  const held = await readRangeReviewCounts(db);
  if (!options.changed && held && held.version === version && held.tableHash === RANGE_TABLE_HASH) return null;
  const [stored] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, ABILITIES_KEY));
  const index = (stored?.value as ChampionAbilitiesIndex | undefined) ?? null;
  if (!index || typeof index !== "object" || !index.champions || typeof index.champions !== "object") return null;
  const now = (options.now ?? (() => new Date()))();
  // Counted for the version the job synced to (the comparison above), so a run that wrote nothing at a new version does not count again every hour.
  const counts = countRangeReviews(index.champions, version, rangeReviewsFor, now);
  await db.insert(appSettings).values({ key: KEY, value: counts, updatedAt: now }).onConflictDoUpdate({ target: appSettings.key, set: { value: counts, updatedAt: now } });
  options.log?.(
    `Ability ranges ${counts.version ?? "(no version)"}: ${counts.shown} shown, ${counts.global} global, ${counts.self} cast on the champion (not shown), ${counts.none} not the reach; ${counts.changedSinceReview} changed since their review (${counts.hiddenSinceReview} ${counts.hiddenSinceReview === 1 ? "range" : "ranges"} hidden until reviewed again); ${counts.notReviewed} not reviewed${counts.noRangeYet ? `; ${counts.noRangeYet} stored before ranges were read` : ""} (${counts.rows} rows).`,
  );
  return counts;
}
