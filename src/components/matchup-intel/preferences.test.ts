import { afterEach, describe, expect, it, vi } from "vitest";
import { NO_PREFERENCES, PREFERENCES_KEY, RECENT_MAX, parsePreferences, preferenceStore, storageKey, withChoice, withRemembered } from "./preferences";

/** A browser window with a localStorage and its storage event, in Node. */
function fakeWindow({ failGet = false, failSet = false }: { failGet?: boolean; failSet?: boolean } = {}) {
  const data = new Map<string, string>();
  const handlers = new Set<(e: { key: string | null }) => void>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => {
        if (failGet) throw new Error("SecurityError");
        return data.get(k) ?? null;
      },
      setItem: (k: string, v: string) => {
        if (failSet) throw new Error("QuotaExceededError");
        data.set(k, v);
      },
    },
    addEventListener: (type: string, h: (e: { key: string | null }) => void) => type === "storage" && handlers.add(h),
    removeEventListener: (type: string, h: (e: { key: string | null }) => void) => handlers.delete(h),
  });
  return { data, storageEvent: (key: string | null) => handlers.forEach((h) => h({ key })), handlers };
}

afterEach(() => vi.unstubAllGlobals());

describe("what is stored on this device", () => {
  it("is champion ids only, read back from this version's shape, and nothing else", () => {
    expect(parsePreferences(JSON.stringify({ you: "Riven", recent: { you: ["Riven", "Garen"], enemy: ["Mordekaiser"] } }))).toEqual({ you: "Riven", recent: { you: ["Riven", "Garen"], enemy: ["Mordekaiser"] } });
    for (const raw of [null, "", "not json", "[]", "3", "null", JSON.stringify({ you: 3 })]) expect(parsePreferences(raw), String(raw)).toMatchObject({ you: null, recent: { you: [], enemy: [] } });
    // Anything that is not an id is left out, duplicates once, at most RECENT_MAX.
    const messy = parsePreferences(JSON.stringify({ you: "<img src=x>", recent: { you: ["Riven", "Riven", 7, "../x", "a b"], enemy: Array.from({ length: 20 }, (_, i) => `Champ${i}`) } }));
    expect(messy.you).toBeNull();
    expect(messy.recent.you).toEqual(["Riven"]);
    expect(messy.recent.enemy).toHaveLength(RECENT_MAX);
  });

  it("puts a choice first in its side's Recent row, and remembers your own champion", () => {
    let p = withChoice(NO_PREFERENCES, "enemy", "Mordekaiser");
    expect(p).toEqual({ you: null, recent: { you: [], enemy: ["Mordekaiser"] } });
    p = withChoice(p, "you", "Riven");
    p = withChoice(p, "enemy", "Renekton");
    p = withChoice(p, "enemy", "Mordekaiser");
    expect(p).toEqual({ you: "Riven", recent: { you: ["Riven"], enemy: ["Mordekaiser", "Renekton"] } });
    for (let i = 0; i < 12; i++) p = withChoice(p, "enemy", `Champ${i}`);
    expect(p.recent.enemy).toHaveLength(RECENT_MAX);
    expect(p.recent.enemy[0]).toBe("Champ11");
    // Never anything but an id.
    expect(withChoice(p, "you", "<script>")).toBe(p);
  });

  it("remembers a champion as yours, or forgets it", () => {
    const p = withChoice(NO_PREFERENCES, "you", "Riven");
    expect(withRemembered(p, "Garen").you).toBe("Garen");
    expect(withRemembered(p, null)).toEqual({ you: null, recent: { you: ["Riven"], enemy: [] } });
    expect(withRemembered(p, "not an id")).toBe(p);
  });
});

describe("the store", () => {
  it("reads what was written, tells the page and follows other tabs", () => {
    const w = fakeWindow();
    const seen = vi.fn();
    const stop = preferenceStore.subscribe(seen);
    expect(preferenceStore.read()).toBe(preferenceStore.read());
    preferenceStore.write(withChoice(NO_PREFERENCES, "you", "Riven"));
    expect(JSON.parse(w.data.get(PREFERENCES_KEY)!)).toEqual({ you: "Riven", recent: { you: ["Riven"], enemy: [] } });
    expect(preferenceStore.read().you).toBe("Riven");
    expect(seen).toHaveBeenCalledTimes(1);
    // Another tab: a change to this key, or the storage cleared; never another key.
    w.data.set(PREFERENCES_KEY, JSON.stringify({ you: "Garen", recent: { you: [], enemy: [] } }));
    w.storageEvent(PREFERENCES_KEY);
    w.storageEvent("uniiverse.resources.favourites.v1");
    w.storageEvent(null);
    expect(seen).toHaveBeenCalledTimes(3);
    expect(preferenceStore.read().you).toBe("Garen");
    stop();
    expect(w.handlers.size).toBe(0);
  });

  it("remembers nothing, without failing, where storage cannot be read, and keeps a choice for the page where it cannot be written", () => {
    fakeWindow({ failGet: true });
    expect(preferenceStore.read()).toEqual(NO_PREFERENCES);
    fakeWindow({ failSet: true });
    preferenceStore.write(withChoice(NO_PREFERENCES, "you", "Riven"));
    expect(preferenceStore.read().you).toBe("Riven");
    // Once storage works again, what is written is what is read.
    const w = fakeWindow();
    preferenceStore.write(NO_PREFERENCES);
    expect(preferenceStore.read().you).toBeNull();
    expect(w.data.has(PREFERENCES_KEY)).toBe(true);
  });
});

describe("for each account", () => {
  const signedIn = (who: string | null) => vi.stubGlobal("document", { cookie: who === null ? "uniiverse_view=player" : `uniiverse_view=player; uniiverse_who=${who}` });

  it("keeps each account's memory apart in one browser, under the base key when no account is signed in", () => {
    const w = fakeWindow();
    signedIn("a1b2c3d4e5f60718");
    expect(storageKey()).toBe(`${PREFERENCES_KEY}:a1b2c3d4e5f60718`);
    preferenceStore.write(withChoice(NO_PREFERENCES, "you", "Riven"));
    expect(JSON.parse(w.data.get(`${PREFERENCES_KEY}:a1b2c3d4e5f60718`)!)).toMatchObject({ you: "Riven" });
    // Another account signs in on this browser: nothing of the first one's is offered, and its Forget forgets only its own.
    signedIn("ffffeeeeddddcccc");
    expect(preferenceStore.read()).toEqual(NO_PREFERENCES);
    preferenceStore.write(withRemembered(preferenceStore.read(), null));
    signedIn("a1b2c3d4e5f60718");
    expect(preferenceStore.read().you).toBe("Riven");
    // No marker, or one that is not a marker: the base key.
    signedIn(null);
    expect(storageKey()).toBe(PREFERENCES_KEY);
    signedIn("<b>");
    expect(storageKey()).toBe(PREFERENCES_KEY);
  });

  it("follows another tab's change to this account's memory only", () => {
    const w = fakeWindow();
    signedIn("a1b2c3d4e5f60718");
    const seen = vi.fn();
    const stop = preferenceStore.subscribe(seen);
    w.storageEvent(`${PREFERENCES_KEY}:ffffeeeeddddcccc`);
    w.storageEvent(PREFERENCES_KEY);
    expect(seen).not.toHaveBeenCalled();
    w.storageEvent(`${PREFERENCES_KEY}:a1b2c3d4e5f60718`);
    expect(seen).toHaveBeenCalledTimes(1);
    stop();
  });
});
