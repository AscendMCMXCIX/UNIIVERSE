import { perAccountKey } from "@/components/account-storage";

/*
  What this browser remembers (localStorage), in one place (PLAN S8a, "On this device"; directive
  §7.2c): every key the app writes, its owner module reading its base from here, so Settings' "On
  this device" lists exactly these and Clear removes exactly these. Nothing here is ever sent to the
  server: it is each device's own convenience, so listing or clearing it needs no notice change.
  Server-side preferences wait for the owner (OD9). A plain module, used by client components.
*/

export interface DeviceItem {
  id: "champion-lookup" | "recent-champions" | "resource-favourites" | "card-preview";
  /** What it is, in a few words. */
  label: string;
  /** Where it is used. */
  where: string;
  /** The key's base. */
  base: string;
  /** Kept per account in this browser (perAccountKey), else one for the browser. */
  perAccount: boolean;
  /** What is stored, in a few words ("3 champions"), from the stored text; null when nothing worth naming is stored. */
  describe: (raw: string) => string | null;
}

const list = (raw: string): unknown[] => {
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};
const count = (n: number, one: string, many: string) => (n ? `${n} ${n === 1 ? one : many}` : null);

export const DEVICE_ITEMS: readonly DeviceItem[] = [
  { id: "champion-lookup", label: "Champions looked up lately", where: "Champion Lookup", base: "uniiverse.champion-lookup.v1", perAccount: true, describe: (raw) => count(list(raw).length, "champion", "champions") },
  { id: "recent-champions", label: "Recent champions", where: "the champion pickers", base: "uniiverse_recent_champions", perAccount: true, describe: (raw) => count(list(raw).length, "champion", "champions") },
  { id: "resource-favourites", label: "Favourite resources", where: "Resources", base: "uniiverse.resources.favourites.v1", perAccount: false, describe: (raw) => count(list(raw).length, "site", "sites") },
  { id: "card-preview", label: "Card Studio's preview", where: "Card Studio: Fit or Actual size", base: "uniiverse.studio.preview", perAccount: false, describe: (raw) => (raw === "actual" ? "Actual size" : raw === "fit" ? "Fit" : null) },
];

/**
 * Keys this app wrote once and no longer reads, removed with everything else by "Clear all on this
 * device": Matchup Intel's champions, role and haste (retired 23 Nov 2026 for Champion Lookup).
 */
export const RETIRED_BASES: readonly string[] = ["uniiverse.matchup-intel.v1"];

/** The key an item lives under in this browser now (the signed-in account's, for a per-account item). */
export function deviceKey(item: DeviceItem): string {
  return item.perAccount ? perAccountKey(item.base) : item.base;
}

/** The base of an item's key, for its owner module. */
export function deviceBase(id: DeviceItem["id"]): string {
  return DEVICE_ITEMS.find((i) => i.id === id)!.base;
}

/** (Storage is read inside each try: a browser that blocks site data throws on `window.localStorage` itself.) */
/** What an item holds in this browser now: its summary, or null (nothing stored, or storage unavailable). */
export function readDeviceItem(item: DeviceItem, storage?: Pick<Storage, "getItem">): string | null {
  try {
    storage ??= window.localStorage;
    const raw = storage.getItem(deviceKey(item));
    return raw === null ? null : item.describe(raw);
  } catch {
    return null;
  }
}

/**
 * "Clear all on this device": every item, for every account that used this browser (each
 * per-account key, "<base>:<marker>", and the base itself), not only the signed-in account's.
 */
export function clearAllOnDevice(storage?: Pick<Storage, "removeItem" | "key" | "length">): void {
  try {
    storage ??= window.localStorage;
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && [...DEVICE_ITEMS.map((item) => item.base), ...RETIRED_BASES].some((base) => k === base || k.startsWith(`${base}:`))) keys.push(k);
    }
    for (const k of keys) storage.removeItem(k);
  } catch {
    // Storage unavailable: nothing is kept to forget.
  }
}

/** Forgets an item in this browser (this account's, for a per-account item). Other tabs hear it through the storage event. */
export function clearDeviceItem(item: DeviceItem, storage?: Pick<Storage, "removeItem">): void {
  try {
    storage ??= window.localStorage;
    storage.removeItem(deviceKey(item));
  } catch {
    // Storage unavailable: nothing is kept to forget.
  }
}
