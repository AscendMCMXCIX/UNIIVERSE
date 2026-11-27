import { createHash } from "node:crypto";
import table from "./ability-ranges.reviewed.json";
import type { RangeKind, RangeReview, RangeReviewer, SpellSlot } from "@/domain/champion-lookup/range";

/*
  The reviewed table of ability ranges (docs/CHAMPION_INTEL.md, "Ranges"): for each spell, what Data
  Dragon's `range` measures, and the key it was decided on (Riot's spell id, its range array and the
  hash of its description and tooltip). Drafted and re-checked per patch by
  scripts/static/review-ability-ranges.mjs, changed through pull requests (git history is the review
  log), read here on the server only: the page receives each ability's computed range, never the
  table (src/app/client-imports.test.ts keeps it out of browser code). A row in another shape is left
  out, so it shows nothing; ability-ranges.test.ts holds every committed row to the shape.
*/

const KINDS: readonly RangeKind[] = ["reach", "global", "self", "none"];
const REVIEWERS: readonly RangeReviewer[] = ["automated draft", "automated review", "owner"];
const SLOTS: readonly SpellSlot[] = ["Q", "W", "E", "R"];

/** Whether a value is a row of the table (the shape the rule reads). */
export function isRangeReview(row: unknown): row is RangeReview {
  const r = row as Partial<RangeReview> | null;
  return (
    !!r &&
    typeof r === "object" &&
    typeof r.champion === "string" &&
    /^[A-Za-z0-9]{1,40}$/.test(r.champion) &&
    SLOTS.includes(r.slot as SpellSlot) &&
    typeof r.spell === "string" &&
    /^[A-Za-z0-9_]{1,80}$/.test(r.spell) &&
    KINDS.includes(r.kind as RangeKind) &&
    Array.isArray(r.range) &&
    r.range.length >= 1 &&
    r.range.length <= 10 &&
    r.range.every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0) &&
    typeof r.textHash === "string" &&
    /^[0-9a-f]{16}$/.test(r.textHash) &&
    typeof r.version === "string" &&
    /^\d{1,4}(?:\.\d{1,4}){1,3}$/.test(r.version) &&
    typeof r.reviewed === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(r.reviewed) &&
    REVIEWERS.includes(r.reviewer as RangeReviewer)
  );
}

const ROWS: readonly RangeReview[] = ((table as { rows?: unknown[] }).rows ?? []).filter(isRangeReview);
const BY_CHAMPION = new Map<string, Partial<Record<SpellSlot, RangeReview>>>();
for (const row of ROWS) {
  const rows = BY_CHAMPION.get(row.champion) ?? {};
  // The first row for a slot is the one read (the table's test refuses duplicates).
  rows[row.slot] ??= row;
  BY_CHAMPION.set(row.champion, rows);
}

/** Every row of the committed table (in its shape). */
export function rangeReviewRows(): readonly RangeReview[] {
  return ROWS;
}

/** The table's rows for one champion, by slot (none: an empty object). */
export function rangeReviewsFor(championId: string): Partial<Record<SpellSlot, RangeReview>> {
  return BY_CHAMPION.get(championId) ?? {};
}

/** A short hash of the committed rows, so the version-check counts again after a deploy that changes the table. */
export const RANGE_TABLE_HASH = createHash("sha256").update(JSON.stringify(ROWS)).digest("hex").slice(0, 16);
