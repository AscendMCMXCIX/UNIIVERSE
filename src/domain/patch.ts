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
 * keep the old numbering ("16.20" for the same patch). Professional sources use the public name,
 * Riot's APIs the client version. UNIIVERSE stores the client version everywhere, so the two
 * meet: any patch whose major number is 25 or more is a year name and maps to major - 10.
 */
export function canonicalPatch(patch: string): string {
  const m = /^(\d+)\.(\d+)$/.exec(patch.trim());
  if (!m) return patch.trim();
  const major = Number(m[1]);
  return `${major >= 25 ? major - 10 : major}.${Number(m[2])}`;
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
