"use client";

import * as React from "react";

import { perAccountKey } from "@/components/account-storage";
import { ROLES, type Role } from "@/domain/matchup-intel/types";
import { clampHaste } from "@/domain/matchup-intel/haste";

/*
  Matchup Intel's memory on this device (localStorage), champion ids only, never sent to the
  server: the champion you play, so the page can offer it next time (never assume it), and the
  champions chosen lately on each side, for the pickers' Recent rows. Empty on the server and until
  the page has loaded, then what is stored; other tabs follow through the storage event. Built like
  the Resources favourites (resources/favourites.ts): a versioned key, a cap, every storage call
  guarded, so a private window or a full storage only means nothing is remembered. Kept for each
  account, like a picker's recent champions: the key carries the signed-in account's marker
  (perAccountKey), so two people who use one browser in turn never see or forget each other's.
*/

/** The key's base; the key itself adds the account's marker where there is one (storageKey). */
export const PREFERENCES_KEY = "uniiverse.matchup-intel.v1";
/** This account's key, read afresh each time: another account may have signed in since. */
export const storageKey = () => perAccountKey(PREFERENCES_KEY);
/** The most champions a Recent row keeps, per side. */
export const RECENT_MAX = 8;

export type PickerSlot = "you" | "enemy";

export interface MatchupPreferences {
  /** The champion you play, remembered on this device; null when none is. */
  you: string | null;
  /** The champions chosen lately on each side, newest first. */
  recent: Readonly<Record<PickerSlot, readonly string[]>>;
  /** The lane last chosen (an old ?champion=&vs= link opens in it); null when none was. */
  role: Role | null;
  /** The ability haste last chosen for the cooldowns (0: base cooldowns only). */
  haste: number;
}

export const NO_PREFERENCES: MatchupPreferences = Object.freeze({ you: null, recent: Object.freeze({ you: Object.freeze([]), enemy: Object.freeze([]) }), role: null, haste: 0 });

/** A champion id as Data Dragon writes them ("MonkeyKing", "KSante"): nothing else is kept. */
const ID = /^[A-Za-z0-9]{1,40}$/;
const isId = (x: unknown): x is string => typeof x === "string" && ID.test(x);
const idList = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.filter(isId))].slice(0, RECENT_MAX) : []);

/** What is stored, read back: anything this version did not write (another shape, other values) is left out. */
export function parsePreferences(raw: string | null): MatchupPreferences {
  if (!raw) return NO_PREFERENCES;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return NO_PREFERENCES;
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) return NO_PREFERENCES;
  const o = v as { you?: unknown; recent?: unknown; role?: unknown; haste?: unknown };
  const recent = o.recent && typeof o.recent === "object" ? (o.recent as { you?: unknown; enemy?: unknown }) : {};
  const role = typeof o.role === "string" && (ROLES as readonly string[]).includes(o.role) ? (o.role as Role) : null;
  return { you: isId(o.you) ? o.you : null, recent: { you: idList(recent.you), enemy: idList(recent.enemy) }, role, haste: clampHaste(o.haste) };
}

/** After a champion is chosen on one side: first in that side's Recent row; chosen as yours, it is also the one remembered. */
export function withChoice(prefs: MatchupPreferences, slot: PickerSlot, id: string): MatchupPreferences {
  if (!isId(id)) return prefs;
  return { ...prefs, you: slot === "you" ? id : prefs.you, recent: { ...prefs.recent, [slot]: [id, ...prefs.recent[slot].filter((x) => x !== id)].slice(0, RECENT_MAX) } };
}

/** After a lane or a haste is chosen: kept for the next visit. */
export function withSetting(prefs: MatchupPreferences, setting: { role?: Role; haste?: number }): MatchupPreferences {
  return { ...prefs, ...(setting.role && (ROLES as readonly string[]).includes(setting.role) ? { role: setting.role } : {}), ...(setting.haste !== undefined ? { haste: clampHaste(setting.haste) } : {}) };
}

/** Remembers this champion as yours on this device, or forgets the one remembered (null). */
export function withRemembered(prefs: MatchupPreferences, id: string | null): MatchupPreferences {
  if (id !== null && !isId(id)) return prefs;
  return { ...prefs, you: id };
}

const listeners = new Set<() => void>();
let cache: { raw: string | null; prefs: MatchupPreferences } = { raw: null, prefs: NO_PREFERENCES };
/** What could not be stored (storage unavailable or full): kept for as long as this page is open. */
let unsaved: MatchupPreferences | null = null;

function read(): MatchupPreferences {
  if (unsaved) return unsaved;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(storageKey());
  } catch {
    return NO_PREFERENCES;
  }
  if (raw !== cache.raw) cache = { raw, prefs: parsePreferences(raw) };
  return cache.prefs;
}

function write(prefs: MatchupPreferences) {
  try {
    window.localStorage.setItem(storageKey(), JSON.stringify(prefs));
    unsaved = null;
  } catch {
    unsaved = prefs;
  }
  for (const l of listeners) l();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  const onStorage = (e: StorageEvent) => {
    // Another tab changed this account's, or cleared the storage (key null).
    if (e.key === storageKey() || e.key === null) onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** The store itself, for tests: read, write and subscribe as the hook does. */
export const preferenceStore = { read, write, subscribe };

/** This device's Matchup Intel memory, and the ways to change it. */
export function useMatchupPreferences(): { prefs: MatchupPreferences; choose: (slot: PickerSlot, id: string) => void; remember: (id: string | null) => void; set: (setting: { role?: Role; haste?: number }) => void } {
  const prefs = React.useSyncExternalStore(subscribe, read, () => NO_PREFERENCES);
  const choose = React.useCallback((slot: PickerSlot, id: string) => write(withChoice(read(), slot, id)), []);
  const remember = React.useCallback((id: string | null) => write(withRemembered(read(), id)), []);
  const set = React.useCallback((setting: { role?: Role; haste?: number }) => write(withSetting(read(), setting)), []);
  return { prefs, choose, remember, set };
}
