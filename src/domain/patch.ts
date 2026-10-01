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

/** Numeric sort key so that 15.9 < 15.10 and 14.24 < 15.1. */
export function patchSortKey(patch: string): number {
  const m = /^(\d+)\.(\d+)/.exec(patch);
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
