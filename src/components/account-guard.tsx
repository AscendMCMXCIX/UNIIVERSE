"use client";

import * as React from "react";

const COOKIE = "uniiverse_who";
const CHANNEL = "uniiverse-account";

function currentMarker(): string | null {
  const hit = document.cookie.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  return hit ? decodeURIComponent(hit.slice(COOKIE.length + 1)) || null : null;
}

/** Set while this tab itself is changing account (it navigates away on its own). */
let leaving = false;

/** This tab is about to change account: its guard stands aside (false when that failed). */
export function markAccountChange(on: boolean): void {
  leaving = on;
}

/** Tells this browser's other tabs that the account changed (they check and reload). */
export function announceAccountChange(): void {
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage("changed");
    channel.close();
  } catch {
    // Older browsers: the other tabs still check when they are next used.
  }
}

function sendsToServer(input: RequestInfo | URL, init?: RequestInit): boolean {
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  return headers.has("next-action") || headers.has("rsc");
}

let installed = false;

/**
 * One browser, several accounts (see account-jar.ts): a tab rendered for one account must never
 * act as another. Each page knows the account it was rendered for (`identity`); the browser's
 * active account is in the readable `uniiverse_who` cookie (a fingerprint, not a credential). When
 * they differ (another tab switched or signed out) this tab reloads before it sends anything:
 *   - on a server action or a page-data request (checked inside fetch, before the request leaves);
 *   - when the tab is shown again, focused, or restored from the back/forward cache;
 *   - when another tab announces a switch.
 * The server still authorises every request by its own cookie, as before; this only stops a stale
 * page from sending an action meant for the account it shows.
 */
export function AccountGuard({ identity }: { identity: string | null }) {
  React.useEffect(() => {
    if (!identity) return;
    const stale = () => {
      if (leaving) return false;
      const now = currentMarker();
      return now !== null && now !== identity;
    };
    const reloadIfStale = () => {
      if (stale()) window.location.reload();
    };
    if (!installed) {
      installed = true;
      const original = window.fetch.bind(window);
      window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        if (sendsToServer(input, init) && stale()) {
          window.location.reload();
          // Never resolves: the page is going away, and nothing may act on a stale answer.
          return new Promise<Response>(() => {});
        }
        return original(input, init);
      };
    }
    reloadIfStale();
    const onVisible = () => {
      if (document.visibilityState === "visible") reloadIfStale();
    };
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) reloadIfStale();
    };
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(CHANNEL);
      channel.onmessage = reloadIfStale;
    } catch {
      channel = null;
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", reloadIfStale);
    window.addEventListener("pageshow", onShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", reloadIfStale);
      window.removeEventListener("pageshow", onShow);
      channel?.close();
    };
  }, [identity]);
  return null;
}
