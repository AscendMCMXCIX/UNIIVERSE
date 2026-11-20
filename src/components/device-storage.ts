import { perAccountKey } from "@/components/account-storage";

/*
  What this browser remembers (localStorage), in one place (PLAN S8a, "On this device"; directive
  §7.2c): every key the app writes, its owner module reading its base from here, so Settings' "On
  this device" lists exactly these and Clear removes exactly these. Nothing here is ever sent to the
  server: it is each device's own convenience, so listing or clearing it needs no notice change.
  Server-side preferences wait for the owner (OD9). A plain module, used by client components.
*/

export interface DeviceItem {
  id: "matchup-intel" | "recent-champions" | "resource-favourites" | "card-preview";
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
  {
    id: "matchup-intel",
    label: "Matchup Intel's champions and role",
    where: "Matchup Intel",
    base: "uniiverse.matchup-intel.v1",
    perAccount: true,
    describe: (raw) => {
      try {
        const v = JSON.parse(raw) as Record<string, unknown> | null;
        return v && typeof v === "object" && Object.values(v).some((x) => x !== null && x !== undefined && x !== "" && !(Array.isArray(x) && x.length === 0)) ? "Remembered" : null;
      } catch {
        return null;
      }
    },
  },
  { id: "recent-champions", label: "Recent champions", where: "the champion pickers", base: "uniiverse_recent_champions", perAccount: true, describe: (raw) => count(list(raw).length, "champion", "champions") },
  { id: "resource-favourites", label: "Favourite resources", where: "Resources", base: "uniiverse.resources.favourites.v1", perAccount: false, describe: (raw) => count(list(raw).length, "site", "sites") },
  { id: "card-preview", label: "Card Studio's preview", where: "Card Studio on phones and tablets", base: "uniiverse.studio.preview", perAccount: false, describe: (raw) => (raw === "hidden" ? "Put away" : raw === "shown" ? "Shown" : null) },
];

/** The key an item lives under in this browser now (the signed-in account's, for a per-account item). */
export function deviceKey(item: DeviceItem): string {
  return item.perAccount ? perAccountKey(item.base) : item.base;
}

/** The base of an item's key, for its owner module. */
export function deviceBase(id: DeviceItem["id"]): string {
  return DEVICE_ITEMS.find((i) => i.id === id)!.base;
}

/** What an item holds in this browser now: its summary, or null (nothing stored, or storage unavailable). */
export function readDeviceItem(item: DeviceItem, storage: Pick<Storage, "getItem"> = window.localStorage): string | null {
  try {
    const raw = storage.getItem(deviceKey(item));
    return raw === null ? null : item.describe(raw);
  } catch {
    return null;
  }
}

/** Forgets an item in this browser (this account's, for a per-account item). Other tabs hear it through the storage event. */
export function clearDeviceItem(item: DeviceItem, storage: Pick<Storage, "removeItem"> = window.localStorage): void {
  try {
    storage.removeItem(deviceKey(item));
  } catch {
    // Storage unavailable: nothing is kept to forget.
  }
}
