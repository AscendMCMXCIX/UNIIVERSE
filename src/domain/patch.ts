/**
 * Patch helpers. Riot's Data Dragon versions look like "15.19.1"; match data game versions look
 * like "15.19.712.6386". UNIIVERSE groups statistics by the short "major.minor" patch id.
 * Nothing here assumes a particular season or numbering scheme beyond "two leading integers".
 */
export function patchFromVersion(version: string): string | null {
  const m = /^(\d+)\.(\d+)/.exec(version.trim());
  if (!m) return null;
  return `${Number(m[1])}.${Number(m[2])}`;
}

/**
 * Since 2025 Riot names patches after the year ("26.20") while the game client and match data
 * keep the old numbering ("16.20" for the same patch). Patch notes and players use the public
 * name, Riot's APIs the client version. UNIIVERSE stores the client version everywhere, so the two
 * meet: any patch whose major number is 25 or more is a year name and maps to major - 10.
 */
export function canonicalPatch(patch: string): string {
  const known = CANONICAL.get(patch);
  if (known !== undefined) return known;
  const m = /^(\d+)\.(\d+)$/.exec(patch.trim());
  const major = m ? Number(m[1]) : 0;
  const canonical = m ? `${major >= 25 ? major - 10 : major}.${Number(m[2])}` : patch.trim();
  remember(CANONICAL, patch, canonical);
  return canonical;
}

/*
  Season figures read each stored game's patch many times over (once per champion and game mode on
  a profile, for every lineup player on Team Overview), and a season holds a few patch names but
  thousands of games. The answers depend only on the text, so they are kept, up to a bound that
  arbitrary input cannot grow past.
*/
const MEMO_LIMIT = 1024;
const CANONICAL = new Map<string, string>();

/** Keeps a pure function's answer for `key`, starting over once the map reaches its bound. */
export function remember<T>(memo: Map<string, T>, key: string, value: T): void {
  if (memo.size >= MEMO_LIMIT) memo.clear();
  memo.set(key, value);
}

/** The public, year-based name of a patch ("16.20" → "26.20"); older patches keep their number. */
export function publicPatchName(patch: string): string {
  const m = /^(\d+)\.(\d+)$/.exec(patch.trim());
  if (!m) return patch;
  const major = Number(m[1]);
  return major >= 15 && major < 25 ? `${major + 10}.${Number(m[2])}` : patch;
}

/** Numeric sort key so that 15.9 < 15.10 and 14.24 < 15.1; year names sort with their client version. */
export function patchSortKey(patch: string): number {
  const m = /^(\d+)\.(\d+)/.exec(canonicalPatch(patch));
  if (!m) return 0;
  return Number(m[1]) * 1000 + Number(m[2]);
}

export function comparePatches(a: string, b: string): number {
  return patchSortKey(a) - patchSortKey(b);
}

export function isValidPatch(patch: string): boolean {
  return /^\d+\.\d+$/.test(patch);
}

/**
 * Distance in "known patches" between two patches, given the ordered list of patches UNIIVERSE
 * has seen. Using the list rather than arithmetic keeps numbering jumps (e.g. 14.24 → 15.1)
 * harmless.
 */
export function patchDistance(current: string, other: string, knownPatchesDesc: string[]): number {
  const ci = knownPatchesDesc.indexOf(current);
  const oi = knownPatchesDesc.indexOf(other);
  if (ci === -1 || oi === -1) {
    // Fall back to numeric distance when the list is incomplete.
    const diff = patchSortKey(current) - patchSortKey(other);
    return Math.max(0, Math.round(Math.abs(diff) >= 1000 ? Math.abs(diff) / 1000 + 1 : Math.abs(diff)));
  }
  return Math.abs(oi - ci);
}

/**
 * How many patches came after `earlier`, up to and including `later` (16.22 then 16.25: 3), or 0
 * when `later` is not after it or either is not a patch. The patches the app has seen (newest
 * first, as stored) count where they cover the span; never fewer than the numbering itself shows:
 * within one season the difference (16.22 to 16.25: 3), and across seasons the later season's own
 * patches up to `later` plus one for each season between (16.22 to 17.2: at least 2, since how
 * many patches were left in 16 is not known without the list). So a rollover (16.24 to 17.1) never
 * reads as hundreds of patches, and an incomplete list never as fewer than the numbers prove.
 */
export function patchesAfter(earlier: string, later: string, knownDesc: readonly string[] = []): number {
  const a = /^(\d+)\.(\d+)$/.exec(canonicalPatch(earlier));
  const b = /^(\d+)\.(\d+)$/.exec(canonicalPatch(later));
  if (!a || !b || comparePatches(later, earlier) <= 0) return 0;
  const [am, an, bm, bn] = [Number(a[1]), Number(a[2]), Number(b[1]), Number(b[2])];
  const floor = am === bm ? bn - an : bn + (bm - am - 1);
  const known = new Set(knownDesc.filter((p) => isValidPatch(p) && comparePatches(p, earlier) > 0 && comparePatches(p, later) <= 0).map(canonicalPatch)).size;
  return Math.max(known, floor);
}
