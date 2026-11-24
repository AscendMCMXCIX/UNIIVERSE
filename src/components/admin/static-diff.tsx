import { formatCount } from "@/lib/format";
import { publicPatchName } from "@/domain/patch";

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

/** The diff as a card beside the datasets: how Riot's static data (champions, items, runes) moved between the last two patches recorded. */
export function StaticDiffCard({ diff }: { diff: StaticDiff }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm [overflow-wrap:anywhere]" data-testid="static-diff">
      <div className="font-semibold text-fg">Riot&apos;s static data between patches</div>
      {staticDiffLines(diff).map((l) => (
        <div key={l.text} className={l.warn ? "text-warn" : "text-fg-muted"} data-testid={l.warn ? "static-diff-failed" : "static-diff-line"}>
          {l.warn ? "⚠ " : null}
          {l.text}
        </div>
      ))}
      <div className="text-xs text-fg-subtle">Source: Riot Data Dragon, compared patch by patch</div>
    </div>
  );
}
