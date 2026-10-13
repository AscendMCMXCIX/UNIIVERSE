/**
 * Tiny process-local cache for frequently read, rarely changing data (shell facts, champion
 * list, branding, custom formats, pro patterns). Keyed by name; entries expire after their TTL
 * and can be invalidated by the writers that change the underlying rows. Never used for
 * per-user state. On serverless hosts each instance has its own cache, so a TTL bounds how long
 * one instance can lag behind a change made through another.
 */
declare global {
  var __uniiverseCache: Map<string, { value: unknown; expiresAt: number; inflight?: Promise<unknown> }> | undefined;
}

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
  if (hit?.inflight) return hit.inflight as Promise<T>;
  const inflight = load()
    .then((value) => {
      s.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    })
    .catch((err) => {
      // A failed refresh keeps the stale value usable (last known good) for one more TTL.
      if (hit) {
        s.set(key, { value: hit.value, expiresAt: Date.now() + ttlMs });
        return hit.value as T;
      }
      s.delete(key);
      throw err;
    });
  s.set(key, { value: hit?.value, expiresAt: hit?.expiresAt ?? 0, inflight });
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
