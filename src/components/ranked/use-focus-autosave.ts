"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { saveRankedFocusAction } from "@/server/actions/ranked";
import type { RankedProfileView } from "@/server/ranked/repository";

export type Patch = Partial<Omit<RankedProfileView, "playerId">>;
export type SaveState = { phase: "idle" } | { phase: "saving" } | { phase: "saved" } | { phase: "error"; message: string };

/** Typing pauses this long before the objective saves (leaving the field or the page saves at once). */
export const TYPING_MS = 700;

/**
 * Saves the focus as it changes: champions at once, the objective after a pause in typing, on
 * leaving the field and on leaving the page. One save runs at a time, in order, so the last
 * change is the one stored; "Saved" shows only once the server confirmed it, and a failed save
 * keeps the change and offers to try again.
 */
export function useFocusAutosave() {
  const router = useRouter();
  const [state, setState] = React.useState<SaveState>({ phase: "idle" });
  const pending = React.useRef<Patch>({});
  const running = React.useRef<Promise<void> | null>(null);
  const timer = React.useRef<number | undefined>(undefined);

  const flush = React.useCallback(async (): Promise<void> => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    // One save at a time, in order; changes made while one runs go in the next.
    for (;;) {
      while (running.current) await running.current;
      const patch = pending.current;
      if (!Object.keys(patch).length) return;
      pending.current = {};
      setState({ phase: "saving" });
      let ok = false;
      const run = (async () => {
        let res: Awaited<ReturnType<typeof saveRankedFocusAction>>;
        try {
          res = await saveRankedFocusAction(patch);
        } catch {
          res = { ok: false, error: "The connection dropped." };
        }
        if (!res.ok) {
          // Keep the change (newer edits win over it) for the next try.
          pending.current = { ...patch, ...pending.current };
          setState({ phase: "error", message: res.error });
          return;
        }
        ok = true;
        if (!Object.keys(pending.current).length) {
          setState({ phase: "saved" });
          // The current block shows the focus it is played with.
          React.startTransition(() => router.refresh());
        }
      })();
      running.current = run;
      await run;
      running.current = null;
      // A failed save waits for "Try again" or the next edit; typing in progress saves on its pause.
      if (!ok || timer.current !== undefined) return;
    }
  }, [router]);

  const queue = React.useCallback(
    (patch: Patch, delay = 0) => {
      pending.current = { ...pending.current, ...patch };
      window.clearTimeout(timer.current);
      timer.current = undefined;
      if (delay) {
        setState((s) => (s.phase === "error" ? s : { phase: "idle" }));
        timer.current = window.setTimeout(() => {
          timer.current = undefined;
          void flush();
        }, delay);
      } else void flush();
    },
    [flush],
  );

  // Leaving the page with an unsaved change: save it, and ask the browser to hold on while it does.
  React.useEffect(() => {
    const hold = (e: BeforeUnloadEvent) => {
      if (!Object.keys(pending.current).length && !running.current) return;
      void flush();
      e.preventDefault();
    };
    const hidden = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    window.addEventListener("beforeunload", hold);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("beforeunload", hold);
      document.removeEventListener("visibilitychange", hidden);
      // Moving to another page inside the app: the save still goes through.
      void flush();
    };
  }, [flush]);

  return { state, queue, flush };
}
