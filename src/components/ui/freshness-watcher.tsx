"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RETURN_CHECK_AFTER_MS, coveredScope, nextCheckMs, scopeKey, type Freshness, type FreshnessScope } from "@/domain/freshness";

/**
 * Scopes another watcher on the page already follows (a Ranked Development page's version includes
 * its player's profile version): their own watcher stays quiet meanwhile, so one page never asks twice.
 */
const covered = new Map<string, number>();

/**
 * Keeps an open page current (domain/freshness.ts). While the tab is on screen it asks the server
 * for the version of the data the page shows: every 10 seconds while a refresh is running, every
 * 30 while an account adds older games, and less and less often while nothing changes (1, 2, 4, 8,
 * then every 10 minutes); at once when the page is shown or focused again. Only a changed version
 * reads the page again, as a server refresh: scroll position, filters and open windows stay as
 * they are. A hidden tab asks nothing. Each render from the server brings the version it was drawn
 * from, so a manual Refresh or an edit never leads to a second read.
 */
export function FreshnessWatcher({ scope, version }: { scope: FreshnessScope; version: Freshness }) {
  const router = useRouter();
  const key = scopeKey(scope);
  const covers = coveredScope(scope);
  React.useEffect(() => {
    if (!covers) return;
    covered.set(covers, (covered.get(covers) ?? 0) + 1);
    return () => {
      const left = (covered.get(covers) ?? 1) - 1;
      if (left > 0) covered.set(covers, left);
      else covered.delete(covers);
    };
  }, [covers]);
  const known = React.useRef(version);
  /** Starts the wait again from the current pace (set by the loop below). */
  const restart = React.useRef<() => void>(() => {});
  React.useEffect(() => {
    known.current = version;
    restart.current();
  }, [version]);

  React.useEffect(() => {
    let timer: number | undefined;
    let quiet = 0;
    let lastAsked = Date.now();
    let asking = false;
    let stopped = false;
    const schedule = () => {
      window.clearTimeout(timer);
      if (!stopped) timer = window.setTimeout(ask, nextCheckMs(known.current.pace, quiet));
    };
    const ask = async () => {
      // A hidden page waits for visibilitychange instead; a scope another watcher follows waits too.
      if (asking || stopped || document.visibilityState !== "visible") return;
      if (covered.has(key)) return schedule();
      asking = true;
      lastAsked = Date.now();
      try {
        const response = await fetch(`/api/freshness?scope=${encodeURIComponent(key)}`, { cache: "no-store" });
        // Signed out, or no longer allowed: nothing more to ask.
        if (response.status === 401 || response.status === 403) stopped = true;
        else if (response.ok) {
          const next = (await response.json()) as Freshness;
          if (next.v !== known.current.v) {
            known.current = next;
            quiet = 0;
            router.refresh();
          } else {
            known.current = { ...known.current, pace: next.pace };
            quiet = next.pace === "idle" ? quiet + 1 : 0;
          }
        }
      } catch {
        // Offline or a failed request: ask again later.
      } finally {
        asking = false;
        schedule();
      }
    };
    const onReturn = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastAsked < RETURN_CHECK_AFTER_MS) return schedule();
      quiet = 0;
      void ask();
    };
    restart.current = () => {
      quiet = 0;
      schedule();
    };
    schedule();
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    window.addEventListener("online", onReturn);
    return () => {
      stopped = true;
      restart.current = () => {};
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
      window.removeEventListener("online", onReturn);
    };
  }, [key, router]);
  return null;
}
