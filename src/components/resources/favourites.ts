"use client";

import * as React from "react";

/*
  Favourite resources, kept in this browser only (localStorage): nothing is sent to the server, so
  a favourite costs no database request, and each device has its own. Empty on the server and
  until the page has loaded, then the stored list; other tabs follow through the storage event.
*/

const KEY = "uniiverse.resources.favourites.v1";
const MAX = 50;
const listeners = new Set<() => void>();
let cache: { raw: string | null; ids: readonly string[] } = { raw: null, ids: [] };
const NONE: readonly string[] = [];

function read(): readonly string[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return NONE;
  }
  if (raw === cache.raw) return cache.ids;
  let ids: string[] = [];
  try {
    const v = JSON.parse(raw ?? "[]");
    ids = Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, MAX) : [];
  } catch {
    ids = [];
  }
  cache = { raw, ids };
  return ids;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function write(ids: readonly string[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(ids.slice(0, MAX)));
  } catch {
    // Storage unavailable (private mode, full): the favourite lasts until the page is left.
    cache = { raw: cache.raw, ids: ids.slice(0, MAX) };
  }
  for (const l of listeners) l();
}

/** The favourite ids, and a toggle. */
export function useFavourites(): { ids: readonly string[]; toggle: (id: string) => void } {
  const ids = React.useSyncExternalStore(subscribe, read, () => NONE);
  const toggle = React.useCallback((id: string) => {
    const current = read();
    write(current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
  }, []);
  return { ids, toggle };
}
