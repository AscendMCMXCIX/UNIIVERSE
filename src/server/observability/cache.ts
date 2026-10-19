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
  const inflight = load()
    .then((value) => {
      s.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    })
    .catch((err) => {
      // A failed refresh keeps the stale value usable (last known good) for one more TTL.
      if (hit && hit.expiresAt > 0) {
        s.set(key, { value: hit.value, expiresAt: Date.now() + ttlMs });
        return hit.value as T;
      }
      if (s.get(key)?.inflight === inflight) s.delete(key);
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

/*
  Cached until the rows change: for larger per-player reads (every stored game of a player) that
  are read on every profile page but change only when their account syncs. Each read first asks
  the database for a one-row fingerprint of the rows (a count and a hash, computed there); only a
  new fingerprint loads the rows again. So nothing is ever stale, and a warm instance sends one
  small row instead of thousands. At most MAX_CHANGE_TRACKED entries per database handle.
*/
const MAX_CHANGE_TRACKED = 200;
const tracked = new WeakMap<object, Map<string, { fingerprint: string; value: unknown }>>();

export async function cachedUntilChanged<T>(scope: object, key: string, fingerprint: () => Promise<string>, load: () => Promise<T>): Promise<T> {
  let entries = tracked.get(scope);
  if (!entries) tracked.set(scope, (entries = new Map()));
  const now = await fingerprint();
  const hit = entries.get(key);
  if (hit && hit.fingerprint === now) {
    // Most recently used last, so the oldest is the first to go.
    entries.delete(key);
    entries.set(key, hit);
    return hit.value as T;
  }
  const value = await load();
  entries.delete(key);
  entries.set(key, { fingerprint: now, value });
  while (entries.size > MAX_CHANGE_TRACKED) entries.delete(entries.keys().next().value!);
  return value;
}
