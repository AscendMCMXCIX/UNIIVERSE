/**
 * Best-effort login throttling: a sliding window of failed attempts per key (email + IP) kept in
 * process memory. Serverless hosts run several instances, so this is a brake, not a wall; the
 * scrypt hash and the fixed delay on failure remain the real cost of guessing.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 8;
const failures = new Map<string, number[]>();

function prune(key: string, now: number): number[] {
  const list = (failures.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length) failures.set(key, list);
  else failures.delete(key);
  return list;
}

export function throttleKey(email: string, ip: string | null | undefined): string {
  return `${email.trim().toLowerCase()}|${ip ?? "?"}`;
}

/** Seconds to wait before another attempt is allowed, or 0 when the key is not blocked. */
export function blockedFor(key: string, now = Date.now()): number {
  const list = prune(key, now);
  if (list.length < MAX_FAILURES) return 0;
  const oldest = list[list.length - MAX_FAILURES]!;
  return Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000));
}

export function recordFailure(key: string, now = Date.now()): void {
  failures.set(key, [...prune(key, now), now]);
}

export function clearFailures(key: string): void {
  failures.delete(key);
}

/** Test hook. */
export function resetThrottle(): void {
  failures.clear();
}
