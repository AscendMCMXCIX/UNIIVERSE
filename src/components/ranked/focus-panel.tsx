"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import { saveRankedFocusAction } from "@/server/actions/ranked";
import type { RankedProfileView } from "@/server/ranked/repository";
import { ChampionSlot } from "@/components/champion-slot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Info } from "@/components/ui/metric";
import { metricTooltip } from "@/domain/metrics";
import { FOCUS_NONE, FOCUS_SLOTS, followsPool, resolveFocusChampions, type FocusSlot } from "@/domain/ranked-focus";
import { cn } from "@/lib/cn";
import type { JournalLookups } from "./types";

const EXTRA = [
  { key: "champion2", label: "Also playing" },
  { key: "champion3", label: "Also playing" },
  { key: "counterPick", label: "Counter pick" },
] as const;

type Patch = Partial<Omit<RankedProfileView, "playerId">>;
type SaveState = { phase: "idle" } | { phase: "saving" } | { phase: "saved" } | { phase: "error"; message: string };

/** Typing pauses this long before the objective saves (leaving the field or the page saves at once). */
const TYPING_MS = 700;

/**
 * Saves the focus as it changes: champions at once, the objective after a pause in typing, on
 * leaving the field and on leaving the page. One save runs at a time, in order, so the last
 * change is the one stored; "Saved" shows only once the server confirmed it, and a failed save
 * keeps the change and offers to try again.
 */
function useFocusAutosave() {
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
          res = { ok: false, error: "The connection dropped. Your change is kept here." };
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

function SaveStatus({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  return (
    <span role="status" aria-live="polite" className="inline-flex min-h-6 items-center gap-1 text-xs" data-testid="focus-save-status" data-state={state.phase}>
      {state.phase === "saving" ? (
        <span className="inline-flex items-center gap-1 text-fg-muted">
          <Loader2 className="h-3 w-3 motion-safe:animate-spin" aria-hidden /> Saving…
        </span>
      ) : state.phase === "saved" ? (
        <span className="inline-flex items-center gap-1 text-good">
          <Check className="h-3 w-3" aria-hidden /> Saved
        </span>
      ) : state.phase === "error" ? (
        <span className="inline-flex flex-wrap items-center gap-1 text-bad">
          <AlertCircle className="h-3 w-3" aria-hidden /> Couldn&apos;t save{state.message ? `: ${state.message}` : ""}
          <button type="button" onClick={onRetry} className="font-medium text-accent hover:underline" data-testid="focus-retry">
            Try again
          </button>
        </span>
      ) : null}
    </span>
  );
}

/**
 * Ranked Focus, one card: the featured champion you are committing to, the one thing you are
 * working on, and the champions around it. Until you choose them, the champions are your Primary
 * Role pool in your order (and follow it when it changes); a champion you choose is yours and
 * stays. Everything saves as you go; the block in progress follows it, and finished blocks keep
 * the focus they were played with.
 */
export function FocusPanel({ profile, lookups }: { profile: RankedProfileView; lookups: JournalLookups }) {
  const [draft, setDraft] = React.useState(profile);
  const { state, queue, flush } = useFocusAutosave();
  const championsById = React.useMemo(() => new Map(Object.entries(lookups.championsById)), [lookups.championsById]);
  const pool = lookups.mainPool;
  const poolLabel = pool.roleLabel ? `in your ${pool.roleLabel} pool` : "in your pool";
  const resolved = resolveFocusChampions(draft, pool.ids);
  const shown = (k: FocusSlot | "counterPick") => (k === "counterPick" ? draft.counterPick : resolved[k].id);
  const chosen = new Set([...FOCUS_SLOTS.map((k) => resolved[k].id), draft.counterPick].filter((id): id is string => !!id));
  const others = (k: FocusSlot | "counterPick") => new Set([...chosen].filter((id) => id !== shown(k)));
  const featured = resolved.champion1.id ? (lookups.championsById[resolved.champion1.id]?.name ?? resolved.champion1.id) : null;
  const following = followsPool(draft);
  const customised = FOCUS_SLOTS.some((k) => draft[k] !== null);

  const setSlot = (k: FocusSlot | "counterPick", id: string | null) => {
    // Clearing a champion slot empties it on purpose (it does not refill from the pool).
    const value = k === "counterPick" ? id : (id ?? FOCUS_NONE);
    setDraft((d) => ({ ...d, [k]: value }));
    queue({ [k]: value });
  };
  const usePoolOrder = () => {
    setDraft((d) => ({ ...d, champion1: null, champion2: null, champion3: null }));
    queue({ champion1: null, champion2: null, champion3: null });
  };
  const caption = (k: FocusSlot) => {
    const r = resolved[k];
    return r.source === "pool" ? `${pool.roleLabel ?? "Pool"} pool #${r.poolIndex}` : r.source === "chosen" ? "Your choice" : null;
  };

  return (
    <section className="@container rounded-card border border-border bg-surface p-3 sm:p-4" aria-labelledby="ranked-focus-title" data-testid="ranked-focus" data-follows-pool={following || undefined}>
      <div className="flex flex-col gap-3 @4xl:flex-row @4xl:items-center @4xl:gap-4">
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-center gap-0.5" data-testid="focus-slot-champion1" data-champion={resolved.champion1.id ?? undefined} data-source={resolved.champion1.source}>
            <ChampionSlot championId={resolved.champion1.id} champions={lookups.champions} championsById={championsById} disabledIds={others("champion1")} onChange={(id) => setSlot("champion1", id)} label="Choose your featured champion" preferredIds={pool.ids} preferredLabel={poolLabel} />
            {caption("champion1") ? <span className={cn("text-[0.6875rem]", resolved.champion1.source === "pool" ? "text-fg-subtle" : "text-accent")}>{caption("champion1")}</span> : null}
          </div>
          <div className="min-w-0 @4xl:hidden">
            <h2 id="ranked-focus-title" className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
              Focus for your blocks
            </h2>
            <p className="truncate text-sm font-semibold text-fg">{featured ?? "Choose a featured champion"}</p>
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="hidden items-baseline gap-2 @4xl:flex">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle" aria-hidden>
              Focus for your blocks
            </h2>
            <span className="truncate text-sm font-semibold text-fg">{featured ?? "Choose a featured champion"}</span>
          </div>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted" data-testid="focus-pool-note">
            {pool.ids.length === 0 ? (
              <span>Add champions to your Primary Role pool and they appear here in your order.</span>
            ) : following ? (
              <span>
                Following your {pool.roleLabel ?? "Primary Role"} pool, in your order. Choose a champion to set your own.
              </span>
            ) : (
              <>
                <span>Champions you chose stay as they are; empty slots follow your {pool.roleLabel ?? "Primary Role"} pool.</span>
                {customised ? (
                  <Button size="sm" variant="ghost" onClick={usePoolOrder} className="-my-1 text-accent" data-testid="focus-use-pool">
                    Use my pool order
                  </Button>
                ) : null}
              </>
            )}
          </p>
          <div className="flex items-center gap-2">
            <label htmlFor="ranked-focus-input" className="sr-only">
              Current improvement focus
            </label>
            <Input
              id="ranked-focus-input"
              value={draft.focus}
              onChange={(e) => {
                const focus = e.target.value;
                setDraft((d) => ({ ...d, focus }));
                queue({ focus }, TYPING_MS);
              }}
              onBlur={() => void flush()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void flush();
                }
              }}
              maxLength={200}
              placeholder="What are you working on? e.g. “Track the enemy jungler before every trade.”"
              className="min-w-0 flex-1"
              aria-describedby="focus-save-hint"
              data-testid="focus-objective"
            />
            <Info text={metricTooltip("journal-focus")} />
          </div>
          <div className="flex min-h-6 flex-wrap items-center gap-x-2" id="focus-save-hint">
            <SaveStatus state={state} onRetry={() => void flush()} />
            {state.phase === "idle" ? <span className="text-xs text-fg-subtle">Saves as you type.</span> : null}
          </div>
        </div>
        <div className="flex items-start gap-2" aria-label="Other champions">
          {EXTRA.map((s) => {
            const r = s.key === "counterPick" ? null : resolved[s.key];
            return (
              <div key={s.key} className="flex flex-col items-center gap-0.5" data-testid={`focus-slot-${s.key}`} data-champion={shown(s.key) ?? undefined} data-source={r?.source}>
                <ChampionSlot size="md" championId={shown(s.key)} champions={lookups.champions} championsById={championsById} disabledIds={others(s.key)} onChange={(id) => setSlot(s.key, id)} label={`Choose ${s.label.toLowerCase()}`} preferredIds={s.key === "counterPick" ? undefined : pool.ids} preferredLabel={poolLabel} />
                <span className="text-xs text-fg-subtle">{s.label}</span>
                {r?.source === "pool" ? <span className="text-[0.6875rem] text-fg-subtle">Pool #{r.poolIndex}</span> : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
