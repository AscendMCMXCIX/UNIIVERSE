"use client";

import * as React from "react";
import { perAccountKey } from "@/components/account-storage";
import { deviceBase } from "@/components/device-storage";

/*
  The champions Champion Lookup showed lately on this device (localStorage), champion ids only,
  never sent to the server: the window of every champion offers them first, so switching between a
  game's champions is one press. Empty on the server and until the page has loaded, then what is
  stored; other tabs follow through the storage event. Kept for each account (perAccountKey), like
  a picker's recent champions, so two people who use one browser in turn keep theirs apart. Every
  storage call is guarded: a private window or a full storage only means nothing is remembered.
*/

/** The most champions kept. */
export const RECENT_MAX = 8;
/** A champion id as Data Dragon writes them ("MonkeyKing", "KSante"): nothing else is kept. */
const ID = /^[A-Za-z0-9]{1,40}$/;

const key = () => perAccountKey(deviceBase("champion-lookup"));

/** What is stored, read back: ids only, at most RECENT_MAX, without repeats; anything else left out. */
export function parseRecent(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && ID.test(x)))].slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

/** The list after a champion is shown: first, without its earlier place. */
export function withRecent(list: readonly string[], id: string): string[] {
  return ID.test(id) ? [id, ...list.filter((x) => x !== id)].slice(0, RECENT_MAX) : [...list];
}

const listeners = new Set<() => void>();
let cache: { raw: string | null; list: string[] } = { raw: null, list: [] };

function read(): string[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key());
  } catch {
    raw = null;
  }
  if (raw !== cache.raw) cache = { raw, list: parseRecent(raw) };
  return cache.list;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = () => listener();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const NONE: string[] = [];

/** The champions shown lately (newest first), and the way to add one. Empty on the server and while the page hydrates. */
export function useRecentLookups(): { recent: string[]; remember: (id: string) => void } {
  const recent = React.useSyncExternalStore(subscribe, read, () => NONE);
  const remember = React.useCallback((id: string) => {
    try {
      window.localStorage.setItem(key(), JSON.stringify(withRecent(read(), id)));
    } catch {
      // Storage unavailable (a private window, a full storage): nothing is remembered.
    }
    for (const l of listeners) l();
  }, []);
  return { recent, remember };
}
