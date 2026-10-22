"use client";

import * as React from "react";

/*
  Browser storage that earlier versions of UNIIVERSE left behind and that must not stay. Clash
  Scout kept the unsaved scout in localStorage (names, ranks and figures read from screenshots),
  and its text recogniser cached its language files in IndexedDB. A new scout now lives in the
  page only and the recogniser caches nothing, so both are deleted the first time any page opens
  in a browser that still holds them. It runs on every page load: once they are gone, each step
  finds nothing to do.
*/

/** The unsaved Clash scout, as earlier versions kept it. */
export const LEGACY_DRAFT_KEY = "uniiverse.clash-scout.draft.v1";
/** idb-keyval's default database, where tesseract.js cached its language files. */
export const LEGACY_OCR_CACHE = "keyval-store";

export function forgetLegacyStorage(): void {
  try {
    window.localStorage.removeItem(LEGACY_DRAFT_KEY);
  } catch {
    // Storage blocked (a private window, site data turned off): nothing can have been kept.
  }
  try {
    const idb = window.indexedDB;
    if (!idb) return;
    const remove = () => void idb.deleteDatabase(LEGACY_OCR_CACHE);
    // Where the browser lists its databases, the cache is deleted only when it is there.
    if (typeof idb.databases === "function") void idb.databases().then((list) => list.some((d) => d.name === LEGACY_OCR_CACHE) && remove(), remove);
    else remove();
  } catch {
    // IndexedDB blocked: nothing can have been kept.
  }
}

export function LegacyStorageCleanup() {
  React.useEffect(() => forgetLegacyStorage(), []);
  return null;
}
