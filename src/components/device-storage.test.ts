import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEVICE_ITEMS, clearAllOnDevice, clearDeviceItem, deviceKey, readDeviceItem } from "./device-storage";

/*
  Settings' "On this device" (PLAN S8a): Clear empties each stored item, and the panel lists only
  keys the app writes, and every key it writes.
*/

function memoryStorage(entries: Record<string, string>) {
  const m = new Map(Object.entries(entries));
  return { getItem: (k: string) => m.get(k) ?? null, removeItem: (k: string) => void m.delete(k), has: (k: string) => m.has(k), size: () => m.size };
}

const SAMPLES: Record<(typeof DEVICE_ITEMS)[number]["id"], { raw: string; says: string }> = {
  "champion-lookup": { raw: JSON.stringify(["Ahri", "Zed"]), says: "2 champions" },
  "recent-champions": { raw: JSON.stringify(["Ahri", "Zed", "Lux"]), says: "3 champions" },
  "resource-favourites": { raw: JSON.stringify(["d-opgg"]), says: "1 site" },
  "card-preview": { raw: "actual", says: "Actual size" },
};

describe("On this device", () => {
  for (const item of DEVICE_ITEMS) {
    it(`${item.label}: says what is kept, and Clear empties it (and nothing else)`, () => {
      const other = "uniiverse.something-else";
      const storage = memoryStorage({ [deviceKey(item)]: SAMPLES[item.id].raw, [other]: "kept" });
      expect(readDeviceItem(item, storage)).toBe(SAMPLES[item.id].says);
      clearDeviceItem(item, storage);
      expect(storage.has(deviceKey(item))).toBe(false);
      expect(readDeviceItem(item, storage)).toBeNull();
      expect(storage.has(other)).toBe(true);
    });
  }

  it("Clear all removes every item for every account in this browser, and the retired Matchup Intel's, and nothing else", () => {
    const m = new Map<string, string>([["uniiverse_recent_champions:aaaa", "[\"Ahri\"]"], ["uniiverse_recent_champions", "[]"], ["uniiverse.champion-lookup.v1:bbbb", "[]"], ["uniiverse.matchup-intel.v1:bbbb", "{}"], ["uniiverse.studio.preview", "hidden"], ["uniiverse.resources.favourites.v1", "[]"], ["uniiverse_who_else", "kept"], ["uniiverse.matchup-intel.v1x", "kept"]]);
    const storage = { get length() { return m.size; }, key: (i: number) => [...m.keys()][i] ?? null, removeItem: (k: string) => void m.delete(k) };
    clearAllOnDevice(storage);
    expect([...m.keys()].sort()).toEqual(["uniiverse.matchup-intel.v1x", "uniiverse_who_else"]);
  });

  it("reads nothing worth naming as nothing kept", () => {
    const storage = memoryStorage({ uniiverse_recent_champions: "[]", "uniiverse.resources.favourites.v1": "not json" });
    expect(readDeviceItem(DEVICE_ITEMS.find((i) => i.id === "recent-champions")!, storage)).toBeNull();
    expect(readDeviceItem(DEVICE_ITEMS.find((i) => i.id === "resource-favourites")!, storage)).toBeNull();
  });

  it("lists every key the app writes, and only those: each module that writes to localStorage takes its key from here", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f)) files.push(p);
      }
    };
    walk("src");
    const writers = files.filter((f) => /localStorage\.setItem\(/.test(readFileSync(f, "utf8")));
    expect(writers.length).toBeGreaterThan(0);
    for (const f of writers) expect(readFileSync(f, "utf8"), `${f}: its key comes from device-storage`).toMatch(/deviceBase\("(champion-lookup|recent-champions|resource-favourites|card-preview)"\)/);
    // Each listed item has its writer.
    const all = writers.map((f) => readFileSync(f, "utf8")).join("\n");
    for (const item of DEVICE_ITEMS) expect(all, item.id).toContain(`deviceBase("${item.id}")`);
  });
});
