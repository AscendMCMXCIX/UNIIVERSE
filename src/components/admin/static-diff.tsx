import { formatCount } from "@/lib/format";
import { patchFromVersion, publicPatchName } from "@/domain/patch";

/** Admin's view of the per-version diff of Riot's static data (staticDiffHealth, server/riot/static/digests.ts): counts and patch names only. */
export type StaticDiff = {
  digests: { patch: string; recorded: Record<"champion" | "item" | "rune", number>; previous: string | null; changed: Record<"champion" | "item" | "rune", number> | null } | null;
  failedPatch: string | null;
};

const NOUNS = { champion: ["champion", "champions"], item: ["item", "items"], rune: ["rune", "runes"] } as const;

/** "4 champions, 11 items, 0 runes" (one champion, one item, one rune in the singular). */
function counts(c: Record<"champion" | "item" | "rune", number>): string {
  return (["champion", "item", "rune"] as const).map((k) => `${formatCount(c[k])} ${NOUNS[k][c[k] === 1 ? 0 : 1]}`).join(", ");
}

/**
 * The lines Admin's data health shows for the diff, in order: what the newest patch recorded; what
 * changed against the patch before it, or why nothing is compared; and a newer patch whose attempt
 * failed. Patches by their public names ("26.23").
 */
export function staticDiffLines(d: StaticDiff): { text: string; warn: boolean }[] {
  const out: { text: string; warn: boolean }[] = [];
  const g = d.digests;
  if (!g) out.push({ text: "No patch recorded yet.", warn: false });
  else {
    const at = publicPatchName(g.patch);
    out.push({ text: `${at} recorded: ${counts(g.recorded)}.`, warn: false });
    if (!g.previous) out.push({ text: "No earlier patch recorded to compare with.", warn: false });
    else if (!g.changed) out.push({ text: `${at} against ${publicPatchName(g.previous)}: nothing recorded in both to compare.`, warn: false });
    else out.push({ text: `${at} against ${publicPatchName(g.previous)}: ${counts(g.changed)} changed.`, warn: false });
  }
  if (d.failedPatch) out.push({ text: `The attempt to record ${publicPatchName(d.failedPatch)} failed; it is tried again after a day.`, warn: true });
  return out;
}

/** How Champion Intel's reviewed ability ranges stand against the stored abilities (the version-check's counts, server/riot/static/range-review.ts): counts and a version only. */
export type RangeReviewSummary = {
  version: string | null;
  shown: number;
  global: number;
  /** Reviewed abilities Riot changed since their review: each needs reviewing again. */
  changedSinceReview: number;
  /** Of those, the ones that showed a range (reach or Global), hidden until reviewed again. */
  hiddenSinceReview: number;
  notReviewed: number;
  noRangeYet: number;
};

/** The warning's words: how many reviewed abilities Riot changed (each to review again), and how many of them showed a range the page now hides. */
function changedWords(changed: number, hidden: number): string {
  const one = changed === 1;
  const head = `Riot changed ${formatCount(changed)} reviewed ${one ? "ability" : "abilities"} since ${one ? "its" : "their"} review: review ${one ? "it" : "them"} again`;
  if (hidden === 0) return `${head}. ${one ? "It showed no range" : "None of them showed a range"}, so none is hidden.`;
  if (one) return `${head}. Its range is hidden until then.`;
  return `${head}. ${hidden === changed ? `Their ${formatCount(hidden)} ranges are` : `${formatCount(hidden)} of their ranges ${hidden === 1 ? "is" : "are"}`} hidden until then.`;
}

/**
 * The ability ranges' line, and a warning when Riot changed reviewed abilities: each needs reviewing
 * again, and those that showed a range (reach or Global) hide it until then; a changed ability
 * reviewed as cast on the champion or not the reach showed nothing either way (docs/CHAMPION_INTEL.md,
 * "Ranges", the per-patch steps).
 */
export function rangeReviewLines(r: RangeReviewSummary): { text: string; warn: boolean }[] {
  const patch = r.version ? patchFromVersion(r.version) : null;
  const at = patch ? publicPatchName(patch) : null;
  const out = [{ text: `Ability ranges${at ? ` at ${at}` : ""}: ${formatCount(r.shown)} shown, ${formatCount(r.global)} Global, ${formatCount(r.notReviewed)} not reviewed yet.`, warn: false }];
  if (r.changedSinceReview > 0) out.push({ text: changedWords(r.changedSinceReview, Math.min(r.hiddenSinceReview, r.changedSinceReview)), warn: true });
  if (r.noRangeYet > 0) out.push({ text: `${formatCount(r.noRangeYet)} abilities were stored before ranges were read; the next game-data update reads them.`, warn: false });
  return out;
}

/** The diff as a card beside the datasets: how Riot's static data (champions, items, runes) moved between the last two patches recorded, and how the reviewed ability ranges stand. */
export function StaticDiffCard({ diff, ranges }: { diff: StaticDiff; ranges?: RangeReviewSummary | null }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm [overflow-wrap:anywhere]" data-testid="static-diff">
      <div className="font-semibold text-fg">Riot&apos;s static data between patches</div>
      {staticDiffLines(diff).map((l) => (
        <div key={l.text} className={l.warn ? "text-warn" : "text-fg-muted"} data-testid={l.warn ? "static-diff-failed" : "static-diff-line"}>
          {l.warn ? "⚠ " : null}
          {l.text}
        </div>
      ))}
      {ranges
        ? rangeReviewLines(ranges).map((l) => (
            <div key={l.text} className={l.warn ? "text-warn" : "text-fg-muted"} data-testid={l.warn ? "static-diff-ranges-hidden" : "static-diff-ranges"}>
              {l.warn ? "⚠ " : null}
              {l.text}
            </div>
          ))
        : null}
      <div className="text-xs text-fg-subtle">Source: Riot Data Dragon, compared patch by patch</div>
    </div>
  );
}
