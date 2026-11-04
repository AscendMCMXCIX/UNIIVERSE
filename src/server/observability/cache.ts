/**
 * Tiny process-local cache for frequently read, rarely changing data (shell facts, champion
 * list, branding, custom formats, pro patterns). Keyed by name; entries expire after their TTL
 * and can be invalidated by the writers that change the underlying rows. Never used for
 * per-user state. On serverless hosts each instance has its own cache, so a TTL bounds how long
 * one instance can lag behind a change made through another.
 */
declare global {
  var __uniiverseCache: Map<string, { value: unknown; expiresAt: number; inflight?: Promise<unknown>; inflightSince?: number }> | undefined;
}

/**
 * How long callers join an in-flight load before starting their own. A load that never settles
 * (a query on a socket the host froze and dropped between invocations) must not wedge every
 * later request behind it; after this window a fresh load replaces it.
 */
export const INFLIGHT_JOIN_MS = 15_000;

function store() {
  if (!globalThis.__uniiverseCache) globalThis.__uniiverseCache = new Map();
  return globalThis.__uniiverseCache;
}

/** Each database handle gets its own namespace, so tests (and tools) that open several databases in one process never share entries. */
const scopes = new WeakMap<object, string>();
let scopeCounter = 0;
function scoped(key: string, scope: object | undefined): string {
  if (!scope) return key;
  let id = scopes.get(scope);
  if (!id) {
    id = `db${++scopeCounter}`;
    scopes.set(scope, id);
  }
  return `${id}/${key}`;
}

export async function cachedFor<T>(rawKey: string, ttlMs: number, load: () => Promise<T>, scope?: object): Promise<T> {
  const s = store();
  const key = scoped(rawKey, scope);
  const hit = s.get(key);
  const now = Date.now();
  if (hit && hit.expiresAt > now) return hit.value as T;
  if (hit?.inflight && now - (hit.inflightSince ?? now) < INFLIGHT_JOIN_MS) return hit.inflight as Promise<T>;
  /*
    A load writes its outcome only while it is still the key's current load. Either an
    invalidation while it ran deleted the entry (the writer changed the rows, perhaps after this
    load read them), or a newer load replaced it after INFLIGHT_JOIN_MS; both times this one's
    result is older than what the cache should hold. The callers waiting on it still get it: they
    asked before the change, so it is what a cache hit would have given them a moment earlier.
  */
  const current = () => s.get(key)?.inflight === inflight;
  const inflight = load()
    .then((value) => {
      if (current()) s.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    })
    .catch((err) => {
      // A failed refresh keeps the stale value usable (last known good) for one more TTL.
      if (hit && hit.expiresAt > 0) {
        if (current()) s.set(key, { value: hit.value, expiresAt: Date.now() + ttlMs });
        return hit.value as T;
      }
      if (current()) s.delete(key);
      throw err;
    });
  s.set(key, { value: hit?.value, expiresAt: hit?.expiresAt ?? 0, inflight, inflightSince: now });
  return inflight;
}

/** Removes every scope's entries whose key equals the prefix or starts with "prefix:". */
export function invalidateCache(prefix: string): void {
  const s = store();
  for (const key of [...s.keys()]) {
    const bare = key.includes("/") ? key.slice(key.indexOf("/") + 1) : key;
    if (bare === prefix || bare.startsWith(`${prefix}:`)) s.delete(key);
  }
}

export function invalidateAllCaches(): void {
  store().clear();
}

declare global {
  var __uniiverseLocalCaches: Set<() => void> | undefined;
}

/**
 * Modules that keep their own short-lived results (possible groups, leaderboards, Played Together…)
 * register how to drop them, so a change that must show everywhere at once (a personal-data
 * erasure) can clear every one of them on this instance. Other instances follow within their TTL.
 */
export function registerLocalCache(clear: () => void): void {
  if (!globalThis.__uniiverseLocalCaches) globalThis.__uniiverseLocalCaches = new Set();
  globalThis.__uniiverseLocalCaches.add(clear);
}

export function clearLocalCaches(): void {
  for (const clear of globalThis.__uniiverseLocalCaches ?? []) clear();
}
